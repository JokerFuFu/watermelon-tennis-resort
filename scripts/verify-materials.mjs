import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// All mutations use a fresh, independent Chromium context. No connection to
// the native user tab, no calculator imports, no injected localStorage writes.
// Independent maths checks procurement length/area/volume and the tax once.
const TOTAL = 18
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const passed = [], failures = [], runtimeErrors = []
let currentCheck = 'setup', ids = {}, original, group, archive
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = (name, root = page) => root.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const field = (name, root = dialog()) => root.locator(`input[aria-label="${name}"]`)
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const piece = async id => (await active()).materials.find(p => p.id === id)
const shape = (id, root = dialog()) => root.locator(`[data-material-preset="${id}"]`)
const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
const evidence = { kind: 'assumption', name: '隔离验收示例价', scope: '仅验证计算，不是采购报价' }
const fixture = {
  version: 1, id: 'materials-old-project-example', name: '建材拼搭隔离验收示例', location: '北京', siteWidth: 100, siteDepth: 100, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [{ id: 'materials-old-hotel', type: 'hotel', presetId: 'hotel', name: '原客房楼', x: 10, y: 10, width: 10, depth: 10, floors: 1, rooms: 10, roomMix: { standard: 10, deluxe: 0, suite: 0 }, unitCost: 100, rotation: 0 }],
  budget: { construction: 'simulation', grade: 'standard', designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: 0, siteAmount: 0, connectionAmount: 0, openingAmount: 0 },
  operating: { enabled: true, days: 30, guestMode: 'manual', occupancyRate: 70, guestsPerRoom: 2, dailyGuests: 10, staffCount: 1, items: [
    { id: 'water', label: '饮用水', included: true, basis: 'personDay', quantity: 2, unit: '瓶', unitPrice: 2, taxMode: 'included', evidence },
    { id: 'food', label: '早餐', included: true, basis: 'guestDay', quantity: 1, unit: '餐', unitPrice: 20, taxMode: 'included', evidence },
    { id: 'utilities', label: '水电', included: true, basis: 'period', quantity: 1, unit: '项', unitPrice: null, taxMode: 'unknown', evidence },
  ] },
}
function purchase(p) {
  const rows = (p.materials ?? []).map(i => {
    const d = [i.width, i.depth, i.height].sort((a, b) => b - a)
    const q = i.priceBasis === 'piece' ? 1 : i.priceBasis === 'length' ? d[0] : i.priceBasis === 'area' ? d[0] * d[1] : d[0] * d[1] * d[2]
    const base = i.unitPrice === null ? null : cents(q * i.unitPrice)
    const tax = base !== null && i.taxMode === 'excluded' && i.taxRate !== undefined ? cents(base * i.taxRate / 100) : 0
    return { id: i.id, quantity: q, amount: base === null ? null : cents(base + tax), tax }
  })
  return { rows, total: cents(rows.reduce((s, r) => s + (r.amount ?? 0), 0)) }
}
function csvRows(csv) { return csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""', '"'))) }
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function check(name, run) { currentCheck = name; await run(); passed.push(name); console.log('PASS ' + name) }
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function open() { await button('建材区').click(); await dialog().getByRole('heading', { name: '建材拼搭工作台' }).waitFor() }
async function close() { await button('关闭建材工作台', dialog()).click(); await dialog().waitFor({ state: 'hidden' }); await settled() }
async function set(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); await settled() }
async function select(id) {
  const p = await piece(id)
  await button('查看' + p.name, dialog()).click(); await settled()
  assert.equal(await field('材料名称').inputValue(), p.name)
}
async function preserved() {
  const p = await active(); assert.deepEqual(p.facilities, original.facilities); assert.deepEqual(p.operating, original.operating); assert.deepEqual(p.budget, original.budget)
}
async function importProject(p) {
  await page.locator('input[type=file]').setInputFiles({ name: 'materials-example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) })
  await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled()
}
async function download(action, filename) {
  const pending = page.waitForEvent('download'); await action(); const d = await pending
  await d.saveAs(resolve('test-results', filename)); return readFileSync(resolve('test-results', filename), 'utf8')
}
async function screenshot(filename) {
  if (await dialog().count() === 0 && await button('关闭提示').isVisible()) await button('关闭提示').click()
  await page.evaluate(() => Promise.all([...document.getAnimations()].map(a => a.finished.catch(() => {}))))
  await page.screenshot({ path: resolve('test-results', filename), fullPage: false })
}
async function selectMany(selectedIds) {
  for (const checkbox of await dialog().locator('.mw-pieces input[type=checkbox]').all()) if (await checkbox.isChecked()) await checkbox.uncheck()
  for (const id of selectedIds) await dialog().getByRole('checkbox', { name: '勾选' + (await piece(id)).name, exact: true }).check()
}
async function budget(expectedIncluded) {
  const p = await active(), m = purchase(p)
  assert.equal(Number(await page.locator('[data-material-list-total]').getAttribute('data-material-list-total')), m.total)
  assert.equal(Number(await page.locator('[data-material-budget-total]').getAttribute('data-material-budget-total')), expectedIncluded ? m.total : 0)
  assert.equal(Number(await page.locator('[data-engineering-total]').getAttribute('data-engineering-total')), 10000)
  assert.equal(Number(await page.locator('[data-budget-total]').getAttribute('data-budget-total')), cents(11440 + (expectedIncluded ? m.total : 0)), 'Materials must not gain another 3%/1%/10% fee')
  assert.equal(Number(await page.locator('[data-operating-total]').getAttribute('data-operating-total')), 7320)
  assert.equal(Number(await page.locator('[data-combined-total]').getAttribute('data-combined-total')), cents(18760 + (expectedIncluded ? m.total : 0)))
  await preserved()
}
try {
  await page.goto(url); await button('更多设施').waitFor()
  await check('legacy project opens an empty material workspace without injecting materials, undoing old edits or changing daily expenses', async () => {
    await importProject(fixture); original = await active()
    await open(); assert.equal(await dialog().locator('[data-material-piece]').count(), 0)
    assert.equal(await button('撤销建材编辑', dialog()).isDisabled(), true)
    await close(); const after = await active()
    for (const key of ['materials', 'materialAssemblies', 'materialBudgetIncluded']) assert.equal(Object.hasOwn(after, key), false)
    assert.deepEqual(after, original)
    await nav('投资估算'); await budget(false); await nav('场地设计')
  })
  await check('33 SVG material cards show common physical forms and millimetre sizes with no remote images', async () => {
    await open(); const cards = dialog().locator('[data-material-library-id]'); assert.equal(await cards.count(), 33)
    assert.equal(await cards.locator('svg').count(), 33); assert.equal(await cards.locator('img,image').count(), 0)
    for (const id of ['red-brick', 'wood-plank', 'steel-i-beam', 'glass-panel', 'water-pipe', 'cement-bag', 'roof-tile', 'door-panel', 'custom-block']) {
      assert.equal(await cards.locator(`[data-material-preset="${id}"]`).count(), 1, id)
    }
    assert.match(await dialog().locator('[data-material-library-id="red-brick"]').textContent(), /240 × 115 × 53 mm/)
    assert.equal(await shape('steel-i-beam').getAttribute('data-material-shape'), 'iBeam')
    assert.equal(await shape('water-pipe').getAttribute('data-material-shape'), 'tube')
    assert.equal(await shape('cement-bag').getAttribute('data-material-shape'), 'bag')
    assert.equal(await shape('door-panel').getAttribute('data-material-shape'), 'door')
    await screenshot('materials-library-desktop.png')
  })
  await check('material category and search filters expose steel sections, empty-state and custom component', async () => {
    await dialog().getByRole('combobox', { name: '建材分类' }).selectOption('metal')
    assert.equal(await dialog().locator('[data-material-library-id]').count(), 6)
    await dialog().getByRole('textbox', { name: '搜索建材' }).fill('工字'); assert.equal(await dialog().locator('[data-material-library-id]').count(), 1)
    await dialog().getByRole('textbox', { name: '搜索建材' }).fill('不存在的建材'); assert.equal(await dialog().locator('[data-material-library-id]').count(), 0)
    assert.match(await dialog().textContent(), /没有找到匹配建材/)
    await dialog().getByRole('combobox', { name: '建材分类' }).selectOption('all'); await dialog().getByRole('textbox', { name: '搜索建材' }).fill('')
  })
  await check('ten real material pieces preserve common dimensions and do not add facilities, rooms or operating consumption', async () => {
    for (const id of ['red-brick', 'wood-plank', 'steel-i-beam', 'glass-panel', 'water-pipe', 'cement-bag', 'roof-tile', 'ceramic-tile', 'door-panel', 'custom-block']) {
      await dialog().locator(`[data-material-library-id="${id}"]`).click(); await settled()
      const p = (await active()).materials.at(-1); ids[id] = p.id
      assert.equal(p.materialId, id); assert.equal(p.unitPrice, null); assert.equal(p.z, 0)
      assert.equal(await dialog().locator(`[data-material-piece="${p.id}"] [data-material-preset="${id}"]`).count(), 1)
    }
    assert.equal((await active()).materials.length, 10)
    const brick = await piece(ids['red-brick']); assert.deepEqual([brick.width, brick.depth, brick.height], [.24, .115, .053])
    const beam = await piece(ids['steel-i-beam']); assert.deepEqual([beam.width, beam.depth, beam.height], [3, .15, .25])
    await preserved()
  })
  await check('both main site modes render all material IDs while hotel floor area and room count stay unchanged', async () => {
    await close()
    for (const mode of ['2D 平面', '3D 总览']) {
      await button(mode).click(); await settled()
      assert.equal(await page.locator('#site-plan-svg [data-material-piece-id]').count(), 10)
      assert.equal(await page.locator('#site-plan-svg [data-facility-id]').count(), 1)
    }
    const metric = label => page.locator('.metric-block').filter({ has: page.locator('span', { hasText: label }) }).locator('strong')
    assert.equal(Number((await metric('总建筑面积').textContent()).replace(/[^0-9.]/g, '')), 100)
    assert.equal(await metric('规划客房').textContent(), '10间')
    await open()
  })
  await check('pointer dragging a material changes X/Y only and updates the saved project after pointer release', async () => {
    await select(ids['wood-plank']); await button('平面', dialog()).click(); await settled(); const before = await piece(ids['wood-plank'])
    const box = await dialog().locator(`[data-material-hitbox="${before.id}"]`).boundingBox(); assert.ok(box && box.width > 10)
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 38, box.y + box.height / 2 + 22, { steps: 8 }); await page.mouse.up(); await settled()
    const after = await piece(before.id); assert.ok(after.x > before.x + .01); assert.ok(after.y > before.y + .01); assert.equal(after.z, before.z)
    await preserved()
  })
  await check('millimetre geometry and the last focused field commit without inflating a brick into a hotel-sized block', async () => {
    await select(ids['red-brick']); await set('材料宽度', .2401); await set('材料深度', .1152)
    await field('材料高度').fill('.0534'); await close()
    const p = await piece(ids['red-brick']); assert.deepEqual([p.width, p.depth, p.height], [.2401, .1152, .0534])
    await open(); await select(p.id); assert.equal(Number(await field('材料高度').inputValue()), .0534)
    await set('材料宽度', .24); await set('材料深度', .115); await set('材料高度', .053)
  })
  await check('standing and side-standing preserve six-axis orientation and fit a three-metre upright I beam inside the 3D canvas', async () => {
    await select(ids['steel-i-beam']); await button('立体', dialog()).click(); await button('立放', dialog()).click(); await settled()
    const p = await piece(ids['steel-i-beam']); assert.deepEqual([p.width, p.depth, p.height, p.axisOrder], [.25, .15, 3, 'zyx'])
    await button('适应全部建材', dialog()).click()
    const art = dialog().locator(`[data-material-piece="${p.id}"]`), svg = dialog().locator('#material-builder-svg')
    const a = await art.boundingBox(), s = await svg.boundingBox(); assert.ok(a.x >= s.x - 1 && a.y >= s.y - 1 && a.x + a.width <= s.x + s.width + 1 && a.y + a.height <= s.y + s.height + 1, 'Tall geometry clipped after fit')
    assert.ok(await art.locator('polygon').count() >= 13, 'I-beam must expose its real 12-edge section and front face')
    await button('侧立', dialog()).click(); await settled(); const side = await piece(p.id)
    assert.deepEqual([side.width, side.depth, side.height, side.axisOrder], [.25, 3, .15, 'zxy'])
    await button('侧立', dialog()).click(); await button('立放', dialog()).click(); await settled()
    assert.deepEqual([(await piece(p.id)).width, (await piece(p.id)).height, (await piece(p.id)).axisOrder], [3, .25, 'xyz'])
  })
  await check('copy and vertical stacking use new IDs and precise Z; workspace undo/redo retain the original operating data', async () => {
    await select(ids['red-brick']); const before = await piece(ids['red-brick'])
    await button('复制叠放', dialog()).click(); await settled(); const clone = (await active()).materials.at(-1)
    assert.notEqual(clone.id, before.id); assert.equal(clone.x, before.x); assert.equal(clone.y, before.y); assert.equal(clone.z, before.z + before.height)
    await button('撤销建材编辑', dialog()).click(); await settled(); assert.equal((await active()).materials.length, 10)
    await button('重做建材编辑', dialog()).click(); await settled(); assert.deepEqual(await piece(clone.id), clone)
    await select(clone.id); await button('删除', dialog()).click(); await settled(); assert.equal((await active()).materials.length, 10)
    await select(ids['red-brick']); await button('复制', dialog()).click(); await settled(); const offset = (await active()).materials.at(-1)
    assert.equal(offset.x, before.x + .5); assert.equal(offset.y, before.y + .5); assert.equal(offset.z, before.z)
    await button('删除', dialog()).click(); await settled(); await preserved()
  })
  await check('checkbox multi-selection creates a named self-built object with two original component IDs', async () => {
    await selectMany([ids['steel-i-beam'], ids['wood-plank']])
    await dialog().getByRole('textbox', { name: '自建作品名称' }).fill('钢木廊架验收示例')
    await button('组合所选 2 件', dialog()).click(); await settled(); group = (await active()).materialAssemblies[0]
    assert.equal(group.name, '钢木廊架验收示例'); assert.deepEqual(new Set(group.pieceIds), new Set([ids['steel-i-beam'], ids['wood-plank']]))
    await button('选择作品' + group.name, dialog()).click()
    assert.equal(await dialog().locator('[data-selected-piece]').count(), 2)
  })
  await check('moving and rotating a group moves every member rigidly; locking prevents moving, sizing, copying and deleting it', async () => {
    const before = await active(), primaryId = await dialog().locator('[data-selected-piece]').first().getAttribute('data-selected-piece')
    const name = await field('材料名称').inputValue(); const primary = before.materials.find(i => i.name === name)
    assert.ok(primaryId && primary)
    await set('材料X坐标', primary.x + 1.25); await set('材料Z高度', primary.z + .4)
    for (const id of group.pieceIds) { const a = before.materials.find(i => i.id === id), b = await piece(id); assert.equal(b.x, a.x + 1.25); assert.equal(b.y, a.y); assert.equal(b.z, a.z + .4) }
    const rotatedBefore = await active(); await button('旋转90°', dialog()).click(); await settled()
    for (const id of group.pieceIds) assert.equal((await piece(id)).rotation, rotatedBefore.materials.find(i => i.id === id).rotation === 90 ? 0 : 90)
    await button('锁定', dialog()).click(); await settled()
    for (const id of group.pieceIds) assert.equal((await piece(id)).locked, true)
    assert.equal(await field('材料X坐标').isDisabled(), true)
    for (const name of ['复制', '删除', '旋转90°']) assert.equal(await button(name, dialog()).isDisabled(), true)
    assert.equal(await button('立放', dialog()).isDisabled(), true)
    await button('解锁', dialog()).click(); await settled(); await preserved()
  })
  await check('group copies receive new assembly and piece IDs; deleting a copy cleans membership and dissolving preserves source pieces', async () => {
    const before = await active(); await button('复制', dialog()).click(); await settled(); const after = await active(), copy = after.materialAssemblies.at(-1)
    assert.notEqual(copy.id, group.id); assert.equal(copy.pieceIds.length, 2); assert.ok(copy.pieceIds.every(id => !before.materials.some(p => p.id === id)))
    await button('删除', dialog()).click(); await settled(); assert.equal((await active()).materialAssemblies.length, 1); assert.equal((await active()).materials.length, 10)
    await button('解散作品' + group.name, dialog()).click(); await settled()
    assert.equal((await active()).materialAssemblies.length, 0); assert.equal((await active()).materials.length, 10)
    for (const id of group.pieceIds) assert.deepEqual(await piece(id), before.materials.find(p => p.id === id))
  })
  await check('procurement distinguishes unknown and explicit zero, and prices piece/length/largest-panel/volume with tax added once', async () => {
    for (const [preset, basis, price, tax, rate] of [
      ['red-brick', 'piece', .8, 'included'], ['wood-plank', 'area', 50, 'included'], ['steel-i-beam', 'length', 80, 'excluded', 13],
      ['glass-panel', 'area', 100, 'included'], ['water-pipe', 'length', 12, 'included'], ['custom-block', 'volume', 0, 'included'],
    ]) {
      await select(ids[preset]); await dialog().getByRole('combobox', { name: '建材计价单位' }).selectOption(basis); await set('建材采购单价', price)
      await dialog().getByRole('combobox', { name: '建材税口径' }).selectOption(tax)
      if (rate !== undefined) await set('建材税率', rate)
      await settled()
    }
    const p = await active(), estimate = purchase(p)
    assert.equal(estimate.rows.find(i => i.id === ids['steel-i-beam']).amount, 271.2)
    assert.equal(estimate.rows.find(i => i.id === ids['glass-panel']).amount, 240)
    assert.equal(estimate.rows.find(i => i.id === ids['custom-block']).amount, 0)
    assert.equal(estimate.rows.find(i => i.id === ids['cement-bag']).amount, null)
    assert.equal(p.materialBudgetIncluded, undefined)
    await close(); await nav('投资估算'); await budget(false)
    assert.match(await page.locator('.material-purchase-panel').textContent(), /待报价/)
    assert.equal(await page.locator('[data-material-budget-row]').count(), 10)
  })
  await check('opt-in procurement adds known material costs once without extra fees, operating changes or hidden-piece price loss', async () => {
    await page.getByRole('checkbox', { name: '计入建材采购预算' }).check(); await settled(); await budget(true)
    await page.getByRole('checkbox', { name: '计入建材采购预算' }).uncheck(); await settled(); await budget(false)
    await page.getByRole('checkbox', { name: '计入建材采购预算' }).check(); await button('打开建材区').click()
    await select(ids['red-brick']); await button('隐藏', dialog()).click(); await settled()
    assert.equal((await piece(ids['red-brick'])).visible, false); assert.equal(await dialog().locator(`[data-material-piece="${ids['red-brick']}"]`).count(), 0)
    await close(); await budget(true)
    await button('打开建材区').click(); await select(ids['red-brick']); await button('显示', dialog()).click(); await settled()
    await selectMany([ids['steel-i-beam'], ids['wood-plank']]); await dialog().getByRole('textbox', { name: '自建作品名称' }).fill('钢木廊架验收示例')
    await button('组合所选 2 件', dialog()).click(); await settled(); group = (await active()).materialAssemblies[0]
    await close()
  })
  await check('budget CSV and offline report contain matching procurement, geometry, source scopes and unchanged operating totals', async () => {
    const p = await active(), m = purchase(p)
    const csv = await download(() => button('导出估算表').click(), 'materials-budget.csv'), rows = csvRows(csv)
    assert.match(csv, /建材/); assert.match(csv, /工字钢/); assert.match(csv, /玻璃板/); assert.match(csv, /未报价|待报价/)
    const construction = rows.find(r => r[0] === '建设已计预算合计'), combined = rows.find(r => r[0] === '建设加期间运营已计合计'), opex = rows.find(r => r[0] === '期间运营已计合计')
    assert.equal(Number(construction[6]), cents(11440 + m.total)); assert.equal(Number(combined[6]), cents(18760 + m.total)); assert.equal(Number(opex[6]), 7320)
    await nav('方案总览'); const report = await download(() => button('导出方案报告').click(), 'materials-report.html')
    assert.match(report, /建材/); assert.match(report, /工字钢/); assert.match(report, /用户录入单价/); assert.match(report, /外包/)
    const offline = await context.newPage(); await context.setOffline(true)
    try {
      await offline.setContent(report); assert.equal(await offline.locator('[data-report-facility]').count(), 1)
      assert.equal(Number(await offline.locator('[data-report-metric="buildingArea"]').getAttribute('data-value')), 100)
      assert.equal(Number(await offline.locator('[data-report-metric="operatingBudget"]').getAttribute('data-value')), 7320)
      assert.equal(Number(await offline.locator('[data-report-metric="knownBudget"]').getAttribute('data-value')), cents(11440 + m.total))
      assert.equal(await offline.locator('[data-material-piece-id]').count(), 10)
      assert.equal(await offline.locator(`[data-material-assembly-label="${group.id}"]`).count(), 1)
      assert.equal(await offline.locator('[data-report-material]').count(), 10)
    } finally { await context.setOffline(false); await offline.close() }
    await preserved(); await nav('场地设计')
  })
  await check('saving, JSON re-import and save-as retain optional materials, procurement, assemblies and operating scope with new project identity', async () => {
    await button('保存方案').click(); await settled(); const before = await active()
    await button('导出方案').click(); archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'materials-project.json'))
    assert.deepEqual(archive, before)
    await importProject(archive); const imported = await active(); assert.notEqual(imported.id, archive.id)
    for (const key of ['materials', 'materialAssemblies', 'materialBudgetIncluded', 'facilities', 'operating']) assert.deepEqual(imported[key], archive[key])
    await button('另存为新方案').click(); await dialog().getByRole('textbox', { name: '新方案名称' }).fill('自建作品验收副本')
    await button('保存副本', dialog()).click(); await settled(); const copied = await active()
    assert.notEqual(copied.id, imported.id)
    for (const key of ['materials', 'materialAssemblies', 'materialBudgetIncluded', 'facilities', 'operating']) assert.deepEqual(copied[key], archive[key])
  })
  await check('two actual reloads preserve exact material geometry and prices, and a new workspace cannot undo older operations', async () => {
    const before = await active()
    for (let i = 0; i < 2; i++) {
      await page.reload(); await button('建材区').waitFor(); await settled()
      for (const key of ['materials', 'materialAssemblies', 'materialBudgetIncluded', 'facilities', 'operating']) assert.deepEqual((await active())[key], before[key])
      await nav('投资估算'); await budget(true); await nav('场地设计')
    }
    await open(); assert.equal(await button('撤销建材编辑', dialog()).isDisabled(), true)
    await button('适应全部建材', dialog()).click(); await screenshot('materials-showcase.png'); await close()
  })
  await check('390px mobile exposes all four material work regions without document overflow, data loss or runtime errors', async () => {
    const before = await active(); await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url.replace(/\/web\/?$/, '/mobile')); await button('建材区').waitFor(); await open()
    for (const [label, panel] of [['建材库', 'library'], ['拼搭', 'scene'], ['属性', 'properties'], ['作品', 'assemblies']]) {
      await button(label, dialog()).click(); assert.equal(await dialog().locator(`[data-mw-panel="${panel}"]`).isVisible(), true)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, label)
      const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
    }
    await button('建材库', dialog()).click(); assert.equal(await dialog().locator('[data-material-library-id]').count(), 33); await screenshot('materials-mobile.png')
    await close(); for (const key of ['materials', 'materialAssemblies', 'materialBudgetIncluded', 'facilities', 'operating']) assert.deepEqual((await active())[key], before[key])
    assert.deepEqual(runtimeErrors, []); assert.equal(await button('重新加载此页').count(), 0)
  })
} catch (error) {
  const trace = String(error.stack || error).split('\n')
  failures.push({ name: currentCheck, assertion: String(error.message || error), position: trace.find(line => line.includes('verify-materials.mjs:'))?.trim() || 'scripts/verify-materials.mjs', keyLines: trace.slice(0, 20) })
  console.error('FAIL ' + currentCheck + '\n' + trace.slice(0, 20).join('\n'))
  await page.screenshot({ path: 'test-results/materials-failure.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  const result = { total: TOTAL, passed: passed.length, failed: failures.length, skipped: Math.max(0, TOTAL - passed.length - failures.length), exitCode: process.exitCode || 0, checks: passed, failures, runtimeErrors }
  writeFileSync('test-results/materials-results.json', JSON.stringify(result, null, 2))
  console.log(`Materials verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`)
  await browser.close()
}
