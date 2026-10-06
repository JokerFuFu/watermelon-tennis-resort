import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// Independent browser storage: controls create/edit plans; evaluation only reads
// the resulting DOM and persisted state. Never connects to the user's native tab.
const PRESETS = [
  ['card-room', '棋牌室', 12, 10, 4200, 'card-table'],
  ['mahjong-room', '麻将包厢', 8, 7, 4800, 'mahjong-table'],
  ['billiards-room', '台球室', 18, 12, 4800, 'billiards-table'],
  ['board-game-room', '桌游活动室', 14, 10, 4200, 'board-game-table'],
  ['reading-lounge', '阅读休息室', 16, 10, 4600, 'bookshelves-and-seating'],
  ['tea-lounge', '茶艺休闲室', 14, 10, 4500, 'tea-table'],
]
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const checks = [], failures = [], runtimeErrors = [], added = []
let currentCheck = 'setup', archive, areaCSV, budgetCSV, report
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = name => page.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const number = (name, root = page) => root.getByRole('spinbutton', { name, exact: true })
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const facility = async id => (await active()).facilities.find(f => f.id === id)
const svg = id => page.locator(`#site-plan-svg [data-facility-id="${id}"]`)
const row = id => page.locator(`[data-manager-id="${id}"]`)
const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
function engineeringAmount(f) {
  if (!f.pricing) return f.width * f.depth * f.floors * f.unitCost
  if (f.pricing.mode === 'quotation') {
    const q = f.pricing.quote
    return cents(q.amount * (q.taxMode === 'excluded' && q.taxRate !== undefined ? 1 + q.taxRate / 100 : 1))
  }
  return cents(f.pricing.items.reduce((sum, i) => {
    const quantity = { grossArea: f.width * f.depth * f.floors, footprint: f.width * f.depth, perimeter: 2 * (f.width + f.depth), rooms: f.rooms, count: 1, manual: i.quantity }[i.basis]
    return sum + cents(quantity * i.unitPrice * (i.taxMode === 'excluded' && i.taxRate !== undefined ? 1 + i.taxRate / 100 : 1))
  }, 0))
}
function knownTotal(p) {
  const e = cents(p.facilities.reduce((sum, f) => sum + engineeringAmount(f), 0))
  const b = p.budget || { designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: null, siteAmount: null, connectionAmount: null, openingAmount: null }
  const design = cents(e * b.designRate / 100), supervision = cents(e * b.supervisionRate / 100)
  const reserve = cents((e + design + supervision + (b.siteAmount || 0) + (b.connectionAmount || 0)) * b.reserveRate / 100)
  return cents(e + design + supervision + reserve + (b.landAmount || 0) + (b.siteAmount || 0) + (b.connectionAmount || 0) + (b.openingAmount || 0))
}
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function check(label, run) { currentCheck = label; await run(); checks.push(label); console.log('PASS ' + label) }
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function openLibrary(shortcut = '更多设施') {
  await button(shortcut).click(); await dialog().waitFor()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-modal-host .modal-backdrop')).opacity === '1')
}
async function assertCount(count) {
  await settled(); assert.equal((await active()).facilities.length, count)
  assert.equal(await page.locator('#site-plan-svg [data-facility-preset]').count(), count)
}
async function locate(id) {
  await nav('场地设计'); await button('设施管理').click(); await row(id).locator('.fm-location').click(); await settled()
  assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).inputValue(), (await facility(id)).name)
}
async function download(run, file) {
  const pending = page.waitForEvent('download'); await run(); const d = await pending
  await d.saveAs('test-results/' + file); return readFileSync('test-results/' + file, 'utf8')
}
async function screenshot(path) {
  if (await button('关闭提示').isVisible()) await button('关闭提示').click()
  await page.evaluate(() => Promise.all([...document.getAnimations()].map(a => a.finished.catch(() => {}))))
  await page.screenshot({ path, fullPage: false })
}
async function assertBudget(p) {
  for (const f of p.facilities) {
    assert.ok(Math.abs(Number(await page.locator(`[data-cost-facility="${f.id}"]`).getAttribute('data-cost-point')) - engineeringAmount(f)) < .011, f.name + ' engineering cost differs')
  }
  assert.ok(Math.abs(Number(await page.locator('[data-budget-total]').getAttribute('data-budget-total')) - knownTotal(p)) < .011)
}
try {
  await page.goto(url); await button('更多设施').waitFor()
  await check('isolated UI creates a clearly labeled leisure example without changing native user projects', async () => {
    await button('切换项目').click(); await button('新建项目').click()
    await dialog().getByRole('textbox', { name: '项目名称' }).fill('棋牌休闲设施验收示例')
    await dialog().getByRole('button', { name: /空白场地/ }).click(); await button('创建方案').click()
    await button('编辑项目设置').click()
    await number('用地宽度', dialog()).fill('100'); await number('用地进深', dialog()).fill('90')
    await button('保存设置').click(); await assertCount(0)
    assert.equal((await active()).siteWidth, 100); assert.equal((await active()).siteDepth, 90)
  })
  await check('51 cards retain category totals; the dedicated leisure subset includes all six spaces across categories', async () => {
    await openLibrary(); assert.equal(await dialog().locator('.fl-card').count(), 51)
    await dialog().getByRole('button', { name: '娱乐与游玩', exact: true }).click(); assert.equal(await dialog().locator('.fl-card').count(), 17)
    await dialog().getByRole('button', { name: '餐饮与社交', exact: true }).click(); assert.equal(await dialog().locator('.fl-card').count(), 7)
    await dialog().getByRole('button', { name: '棋牌休闲分类', exact: true }).click()
    assert.deepEqual(await dialog().locator('.fl-card h3').allTextContents(), PRESETS.map(p => p[1]))
    assert.equal(await dialog().locator('[data-library-preset="tea-lounge"] .fl-card-category').textContent(), '餐饮与社交')
    await screenshot('test-results/leisure-library-desktop.png'); await page.keyboard.press('Escape')
    await openLibrary('棋牌休闲'); assert.equal(await dialog().locator('.fl-card').count(), 6)
    assert.equal(await dialog().getByRole('button', { name: '棋牌休闲分类', exact: true }).getAttribute('aria-pressed'), 'true')
  })
  await check('search finds mahjong and card play; clearing an empty leisure search returns all 51 presets', async () => {
    const search = dialog().getByRole('textbox', { name: '搜索设施', exact: true })
    await search.fill('麻将'); assert.equal(await dialog().locator('.fl-card').count(), 1)
    assert.equal(await dialog().locator('.fl-card h3').textContent(), '麻将包厢')
    await search.fill('打牌'); assert.equal(await dialog().locator('.fl-card').count(), 1)
    assert.equal(await dialog().locator('.fl-card h3').textContent(), '棋牌室')
    await search.fill('不存在的休闲空间'); assert.equal(await dialog().locator('.fl-card').count(), 0)
    await dialog().getByRole('button', { name: '清空筛选，查看全部', exact: true }).click()
    assert.equal(await dialog().locator('.fl-card').count(), 51); await page.keyboard.press('Escape')
  })
  await check('six actual add buttons create unique editable facilities with their exact dimensions and rates', async () => {
    for (const [index, [presetId, label, width, depth, rate]] of PRESETS.entries()) {
      await openLibrary('棋牌休闲'); await dialog().getByRole('button', { name: '添加' + label, exact: true }).click(); await assertCount(index + 1)
      const f = (await active()).facilities.at(-1)
      assert.equal(f.presetId, presetId); assert.equal(f.name, label + ' 1'); assert.equal(f.type, 'restaurant')
      assert.equal(f.width, width); assert.equal(f.depth, depth); assert.equal(f.unitCost, rate)
      assert.equal(f.floors, 1); assert.equal(f.rooms, 0); assert.equal(f.roomMix, undefined)
      assert.equal(await svg(f.id).getAttribute('data-facility-preset'), presetId)
      added.push({ presetId, label, id: f.id })
    }
    assert.equal(new Set(added.map(f => f.id)).size, 6)
  })
  await check('every leisure preset renders recognizable distinct furniture in both 2D and 3D', async () => {
    for (const view of ['2D 平面', '3D 总览']) {
      await button(view).click(); await settled()
      const furnitureKinds = []
      for (const [index, f] of added.entries()) {
        const art = svg(f.id).locator(`[data-leisure-preset="${f.presetId}"]`)
        assert.equal(await art.count(), 1, view + ': ' + f.presetId)
        const details = art.locator('[data-leisure-furniture]')
        assert.equal(await details.count(), 1)
        assert.equal(await details.getAttribute('data-leisure-furniture'), PRESETS[index][5])
        assert.ok(await details.locator('polygon,polyline,path,ellipse,circle,rect').count() >= 10)
        furnitureKinds.push(await details.getAttribute('data-leisure-furniture'))
      }
      assert.equal(new Set(furnitureKinds).size, 6)
    }
    await button('2D 平面').click()
  })
  await check('leisure contributes building area and engineered cost without inflating rooms, tennis courts or green area', async () => {
    const metric = label => page.locator('.metric-block').filter({ has: page.locator('span', { hasText: label }) })
    assert.equal(await metric('网球场配置').locator('strong').textContent(), '0片')
    assert.equal(await metric('规划客房').locator('strong').textContent(), '0间')
    const p = await active(), area = p.facilities.reduce((sum, f) => sum + f.width * f.depth, 0)
    assert.equal(Number((await metric('总建筑面积').locator('strong').textContent()).replace(/[^0-9.]/g, '')), area)
    await button('场地信息').click()
    const green = page.locator('.site-indicators > div').filter({ has: page.locator('span', { hasText: /^已配置绿地$/ }) })
    assert.equal(await green.locator('strong').textContent(), '0.00 m²')
    await nav('投资估算'); await assertBudget(p)
    assert.equal(await page.locator('.budget-table tbody tr').count(), 6)
    for (const f of p.facilities) assert.equal(await number(f.name + '参考单价').inputValue(), String(f.unitCost))
  })
  await check('decimal dimensions, floors and per-square-meter rates use full engineering quantity and survive rotation', async () => {
    const f = added[0]; await locate(f.id)
    await number('宽度').fill('12.25'); await number('进深').fill('10.5'); await button('增加建筑层数').click()
    await number('参考单价（每平方米）').fill('4300'); await button('旋转设施').click(); await settled()
    const after = await facility(f.id)
    assert.equal(after.width, 12.25); assert.equal(after.depth, 10.5); assert.equal(after.floors, 2); assert.equal(after.rotation, 90); assert.equal(after.unitCost, 4300)
    await nav('投资估算'); await assertBudget(await active())
    assert.equal(engineeringAmount(after), 1106175)
  })
  await check('lock/unlock, hide/undo and duplicate/delete retain leisure identities and pricing', async () => {
    const f = added[0]; await locate(f.id); const before = await facility(f.id)
    await button('锁定' + before.name).click(); await settled(); assert.equal((await facility(f.id)).locked, true)
    assert.equal(await number('宽度').isDisabled(), true); assert.equal(await button('删除选中设施').isDisabled(), true)
    await button('解锁' + before.name).click(); await settled()
    await button('设施管理').click(); await row(f.id).getByRole('button', { name: '隐藏' + before.name, exact: true }).click(); await settled()
    assert.equal(await svg(f.id).count(), 0); const hidden = await active()
    await nav('投资估算'); await assertBudget(hidden)
    await nav('场地设计'); await button('撤销').click(); await settled(); assert.notEqual((await facility(f.id)).visible, false)
    await locate(f.id); const original = await facility(f.id); await button('复制设施').click(); await assertCount(7)
    const clone = (await active()).facilities.at(-1)
    assert.equal(clone.presetId, original.presetId); assert.notEqual(clone.id, original.id)
    for (const key of ['width', 'depth', 'floors', 'unitCost', 'rotation']) assert.equal(clone[key], original[key])
    await button('删除选中设施').click(); await assertCount(6); assert.deepEqual(await facility(f.id), original)
  })
  await check('leisure accepts component estimates, supplier totals and project fees with no double counting', async () => {
    await nav('投资估算'); const card = await facility(added[0].id), mahjong = await facility(added[1].id)
    await button('编辑' + card.name + '计价明细').click()
    await dialog().getByRole('button', { name: '从原综合价生成分项草案', exact: true }).click()
    assert.equal(await dialog().locator('.ce-price-item').count(), 4)
    await dialog().getByRole('button', { name: '保存计价明细', exact: true }).click(); await settled()
    const detailed = await facility(card.id); assert.equal(detailed.pricing.mode, 'items')
    assert.ok(Math.abs(engineeringAmount(detailed) - engineeringAmount(card)) < .011)
    await button('编辑' + mahjong.name + '计价明细').click(); await dialog().getByRole('button', { name: '供应商总报价', exact: true }).click()
    await number('供应商报价总额', dialog()).fill('250000')
    await dialog().getByRole('textbox', { name: '供应商名称', exact: true }).fill('验收示例供应商')
    await dialog().locator('input[aria-label="报价日期"]').fill('2026-10-03')
    await dialog().getByRole('textbox', { name: '报价包含范围', exact: true }).fill('验收示例：装修、麻将桌、座椅；非实际供应商报价')
    await dialog().getByRole('combobox', { name: '报价税口径', exact: true }).selectOption('included')
    await dialog().getByRole('button', { name: '保存计价明细', exact: true }).click(); await settled()
    assert.equal(engineeringAmount(await facility(mahjong.id)), 250000)
    for (const [name, value] of [['设计费率', 2], ['监理费率', 1], ['预备费率', 5], ['土地费用', 0], ['场地工程费用', 1000], ['市政接入费用', 2000], ['开办费用', 3000]]) {
      await number(name).fill(String(value)); await number(name).press('Tab')
    }
    await settled(); await assertBudget(await active())
    assert.equal((await active()).budget.openingAmount, 3000)
  })
  await check('scene placement produces a readable six-space example without changing the saved financial data', async () => {
    const before = await active()
    for (const [index, f] of added.entries()) {
      await locate(f.id); await button('位置与方向').click()
      await number('横向位置').fill(String(15 + index % 3 * 26)); await number('纵向位置').fill(String(20 + Math.floor(index / 3) * 27)); await settled()
      await button('位置与方向').click()
    }
    const after = await active(); assert.deepEqual(after.budget, before.budget)
    for (const f of after.facilities) assert.deepEqual(f.pricing, before.facilities.find(old => old.id === f.id).pricing)
    await nav('场地设计'); await button('2D 平面').click(); await button('适应画布').click(); await settled()
    await screenshot('test-results/leisure-showcase.png'); await nav('方案总览')
  })
  await check('area and budget CSV include every new type and preserve the actual dimensions and quotation', async () => {
    const before = await active()
    areaCSV = await download(() => button('导出面积明细').click(), 'leisure-area.csv')
    for (const f of added) assert.ok(areaCSV.includes('"' + f.label + '"'))
    assert.ok(areaCSV.includes('"12.25","10.5","90","2"'))
    await button('导出方案').click(); budgetCSV = await download(() => button('投资估算表 (.csv)').click(), 'leisure-budget.csv')
    for (const f of added) assert.ok(budgetCSV.includes(f.label))
    assert.ok(budgetCSV.includes('250000')); assert.ok(budgetCSV.includes('验收示例供应商'))
    assert.deepEqual(await active(), before)
  })
  await check('offline HTML report includes all six furniture plans, exact totals and unchanged source data', async () => {
    const before = await active()
    report = await download(() => button('导出方案报告').click(), 'leisure-report.html')
    for (const f of added) { assert.ok(report.includes(f.label)); assert.ok(report.includes(`data-leisure-preset="${f.presetId}"`)) }
    const offline = await context.newPage(); await context.setOffline(true)
    try {
      await offline.setContent(report)
      assert.equal(await offline.locator('[data-report-facility]').count(), 6)
      assert.equal(await offline.locator('[data-leisure-preset]').count(), 6)
      assert.ok(Math.abs(Number(await offline.locator('[data-report-metric="knownBudget"]').getAttribute('data-value')) - knownTotal(before)) < .011)
      assert.equal(Number(await offline.locator('[data-report-metric="buildingArea"]').getAttribute('data-value')), before.facilities.reduce((sum, f) => sum + f.width * f.depth * f.floors, 0))
    } finally { await context.setOffline(false); await offline.close() }
    assert.deepEqual(await active(), before)
  })
  await check('JSON download/import and two reloads preserve all six IDs, geometry, components, quote and project fees', async () => {
    await nav('场地设计'); await button('保存方案').click(); await settled(); const before = await active()
    await button('导出方案').click(); archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'leisure-project.json'))
    assert.deepEqual(archive, before); assert.deepEqual(archive.facilities.map(f => f.presetId), PRESETS.map(p => p[0]))
    await page.locator('input[type=file]').setInputFiles({ name: 'leisure.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) })
    await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await assertCount(6)
    assert.notEqual((await active()).id, archive.id); assert.deepEqual((await active()).facilities, archive.facilities); assert.deepEqual((await active()).budget, archive.budget)
    for (let i = 0; i < 2; i++) {
      await page.reload(); await button('更多设施').waitFor(); await assertCount(6)
      assert.deepEqual((await active()).facilities, archive.facilities); assert.deepEqual((await active()).budget, archive.budget)
      await nav('投资估算'); await assertBudget(await active()); await nav('场地设计')
    }
  })
  await check('390px mobile leisure shortcut and six-card layout stay within the viewport and retain the saved plan', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url.replace(/\/web\/?$/, '/mobile'))
    await button('棋牌休闲').waitFor(); await assertCount(6)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await openLibrary('棋牌休闲'); assert.equal(await dialog().locator('.fl-card').count(), 6)
    assert.equal(await dialog().locator('.fl-cards').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2)
    const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await screenshot('test-results/leisure-mobile.png')
    await page.keyboard.press('Delete'); assert.equal((await active()).facilities.length, 6)
    await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 0)
    assert.deepEqual((await active()).facilities, archive.facilities); assert.deepEqual((await active()).budget, archive.budget)
  })
  await check('desktop and mobile complete without JavaScript errors or startup recovery screens', async () => {
    assert.deepEqual(runtimeErrors, [])
    assert.equal(await page.getByRole('button', { name: '重新加载此页', exact: true }).count(), 0)
  })
} catch (error) {
  const trace = String(error.stack || error).split('\n')
  failures.push({ name: currentCheck, assertion: String(error.message || error), position: trace.find(line => line.includes('verify-leisure.mjs:'))?.trim() || 'scripts/verify-leisure.mjs', keyLines: trace.slice(0, 20) })
  console.error('FAIL ' + currentCheck + '\n' + trace.slice(0, 20).join('\n'))
  await page.screenshot({ path: 'test-results/leisure-failure.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  const skipped = Math.max(0, 15 - checks.length - failures.length)
  const result = { total: 15, passed: checks.length, failed: failures.length, skipped, exitCode: process.exitCode || 0, checks, failures, runtimeErrors, added }
  writeFileSync('test-results/leisure-results.json', JSON.stringify(result, null, 2))
  console.log(`Leisure verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`)
  await browser.close()
}
