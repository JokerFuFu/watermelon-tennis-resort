import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// A fresh browser context owns these fixtures. Writes use import and visible
// controls only; evaluate inspects DOM or persisted state without changing it.
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const passed = [], failures = [], runtimeErrors = []
page.on('pageerror', error => runtimeErrors.push(error.message))
mkdirSync('test-results', { recursive: true })
const button = name => page.getByRole('button', { name, exact: true })
const input = (name, root = page) => root.getByRole('spinbutton', { name, exact: true })
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(project => project.id === localStorage.getItem('courtside-active-v1')))
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function check(name, action) {
  try { await action(); passed.push(name); console.log('PASS ' + name); return true }
  catch (error) {
    const trace = String(error.stack || error).split('\n')
    const position = trace.find(line => line.includes('verify-area.mjs:'))?.trim() || 'scripts/verify-area.mjs'
    failures.push({ name, assertion: String(error.message || error), position, keyLines: trace.slice(0, 20) })
    console.error('FAIL ' + name + '\n' + trace.slice(0, 20).join('\n'))
    await page.screenshot({ path: `test-results/area-failure-${failures.length}.png`, fullPage: false }).catch(() => {})
    return false
  }
}
async function download(action, filename) {
  const pending = page.waitForEvent('download'); await action(); const result = await pending
  const path = `test-results/${filename}`; await result.saveAs(path); return readFileSync(path, 'utf8')
}
async function importFixture(project) {
  await page.locator('input[type=file]').setInputFiles({ name: 'area-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled(); await nav('方案总览')
}
const f = (id, type, x, y, width, depth, extra = {}) => ({ id, type, name: '精算' + id, x, y, width, depth, floors: 1, rooms: 0, unitCost: 100, rotation: 0, ...extra })
const base = {
  version: 1, id: 'area-fixture', name: '西瓜面积隔离验收', location: '北京 · 面积验收', siteWidth: 100, siteDepth: 100,
  updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [
    f('hotel', 'hotel', 0, 0, 10, 10, { floors: 2, rooms: 5, pricing: { mode: 'items', items: [{ id: 'gfa', label: '按完整建筑工程量计价', basis: 'grossArea', unitPrice: 100, lowUnitPrice: 100, highUnitPrice: 100, taxMode: 'included', evidence: { kind: 'assumption', name: '验收假设', scope: '完整建筑面积' } }] } }),
    f('restaurant', 'restaurant', 5, 0, 10, 10, { floors: 2 }),
    f('green', 'landscape', 0, 0, 20, 20, { unitCost: 10 }),
  ],
}
const baseExpected = { siteArea: 10000, buildingArea: 400, footprint: 150, rawFacilityArea: 600, occupiedArea: 400, unallocatedArea: 9600, overlapArea: 150, outOfBoundsArea: 0, landscapeArea: 250 }
const complex = { ...base, id: 'area-complex', facilities: [...base.facilities, f('pool', 'pool', 15, 15, 10, 10), f('parking', 'parking', 10, 10, 10, 10), f('court', 'court', 90, 90, 10, 20, { rotation: 90, surface: 'hard', unitCost: 500 })] }
const complexExpected = { siteArea: 10000, buildingArea: 400, footprint: 150, rawFacilityArea: 1000, occupiedArea: 575, unallocatedArea: 9425, overlapArea: 250, outOfBoundsArea: 100, landscapeArea: 150 }
const areaIds = { siteArea: 'site', buildingArea: 'building-gross', footprint: 'building-footprint', rawFacilityArea: 'raw', occupiedArea: 'occupied', unallocatedArea: 'unallocated', overlapArea: 'overlap', outOfBoundsArea: 'outside', landscapeArea: 'green' }
async function area(key) {
  const node = page.locator(`.area-summary:not(.area-summary-compact) [data-testid="area-${areaIds[key]}"]`)
  const value = await node.getAttribute('data-area-value')
  assert.notEqual(value, null, `Missing unrounded data-area-value for ${key}`)
  return Number(value)
}
async function assertAreas(expected) {
  for (const [key, value] of Object.entries(expected)) {
    const actual = await area(key)
    assert.ok(Math.abs(actual - value) < 1e-8, `${key}: expected ${value}, got ${actual}`)
  }
}
function csvRows(csv) {
  const rows = [], row = []; let value = '', quoted = false
  const source = csv.replace(/^\uFEFF/, '')
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (char === '"') { if (quoted && source[i + 1] === '"') { value += '"'; i++ } else quoted = !quoted }
    else if (!quoted && char === ',') { row.push(value); value = '' }
    else if (!quoted && (char === '\n' || char === '\r')) { if (char === '\r' && source[i + 1] === '\n') i++; row.push(value); rows.push(row.splice(0)); value = '' }
    else value += char
  }
  if (value || row.length) { row.push(value); rows.push(row) }
  return rows
}
let persisted
try {
  await page.goto(url); await button('更多设施').waitFor()
  const setup = await check('overlapping hotel, restaurant and green union is exact; triple overlap counts once', async () => {
    await importFixture(base); await assertAreas(baseExpected)
    assert.equal(await area('occupiedArea') + await area('unallocatedArea'), await area('siteArea'))
  })
  if (!setup) throw new Error('Area fixture setup failed; dependent checks cannot run.')
  await check('pool and parking subtract green; rotated out-of-bounds court is clipped only for site totals', async () => {
    await importFixture(complex); await assertAreas(complexExpected)
    assert.equal(await area('occupiedArea') + await area('unallocatedArea'), 10000)
    assert.equal((await active()).facilities.find(facility => facility.id === 'court').rotation, 90)
  })
  await check('three identical building rectangles have one union and one overlap, but retain all gross floor areas', async () => {
    await importFixture({ ...base, id: 'area-triple', facilities: [f('one', 'hotel', 0, 0, 10, 10), f('two', 'restaurant', 0, 0, 10, 10), f('three', 'hotel', 0, 0, 10, 10)] })
    await assertAreas({ siteArea: 10000, buildingArea: 300, footprint: 100, rawFacilityArea: 300, occupiedArea: 100, unallocatedArea: 9900, overlapArea: 100, outOfBoundsArea: 0, landscapeArea: 0 })
    await importFixture(complex)
  })
  await check('hide changes visibility only and keeps site, green, gross-area and budget quantities', async () => {
    const before = await active(); await nav('场地设计'); await button('设施管理').click(); await button('隐藏精算hotel').click(); await settled()
    const after = await active(); assert.equal(after.facilities.find(facility => facility.id === 'hotel').visible, false)
    assert.deepEqual(after.facilities.map(({ visible, ...rest }) => rest), before.facilities.map(({ visible, ...rest }) => rest))
    await nav('方案总览'); await assertAreas(complexExpected)
    await nav('投资估算'); assert.equal(Number(await page.locator('[data-cost-facility="hotel"]').getAttribute('data-cost-point')), 20000)
    const csv = await download(() => button('导出估算表').click(), 'area-budget.csv')
    const engineering = csvRows(csv).find(row => row[0] === '精算hotel' && row[2] === '按完整建筑工程量计价')
    assert.ok(engineering); assert.equal(Number(engineering[3]), 200); assert.equal(Number(engineering[6]), 20000)
    await nav('方案总览')
  })
  await check('fractional site dimensions edit through controls and retain square-metre precision', async () => {
    await button('编辑项目设置').click(); const modal = page.getByRole('dialog')
    assert.equal(await input('用地宽度', modal).getAttribute('step'), '0.01')
    assert.equal(await input('用地进深', modal).getAttribute('step'), '0.01')
    await input('用地宽度', modal).fill('100.25'); await input('用地进深', modal).fill('90.75'); await button('保存设置').click(); await settled()
    const project = await active(); assert.equal(project.siteWidth, 100.25); assert.equal(project.siteDepth, 90.75)
    await assertAreas({ siteArea: 9097.6875, occupiedArea: 482.6875, unallocatedArea: 8615, outOfBoundsArea: 192.3125, landscapeArea: 150, footprint: 150, buildingArea: 400 })
    const rendered = await page.locator('.area-summary:not(.area-summary-compact) [data-testid="area-site"]').textContent()
    assert.match(rendered, /9,097\.69|9097\.69/)
  })
  await check('facility dimensions and coordinates support hundredths without rounding stored geometry', async () => {
    await nav('场地设计'); await button('设施管理').click(); await button('定位精算pool').click()
    assert.equal(await input('宽度').getAttribute('step'), '0.01'); assert.equal(await input('进深').getAttribute('step'), '0.01')
    await input('宽度').fill('10.25'); await input('进深').fill('10.75')
    await button('位置与方向').click()
    assert.equal(await input('横向位置').getAttribute('step'), '0.01'); assert.equal(await input('纵向位置').getAttribute('step'), '0.01')
    await input('横向位置').fill('15.25'); await input('纵向位置').fill('15.75'); await settled()
    const pool = (await active()).facilities.find(facility => facility.id === 'pool')
    assert.deepEqual([pool.width, pool.depth, pool.x, pool.y], [10.25, 10.75, 15.25, 15.75])
    await nav('方案总览')
    // New pool 110.1875; intersection with original green/parking 4.75 × 4.25.
    await assertAreas({ siteArea: 9097.6875, occupiedArea: 497.6875, unallocatedArea: 8600, overlapArea: 250, outOfBoundsArea: 192.3125, landscapeArea: 150 })
  })
  await check('compact site area summary matches overview totals after decimal edits', async () => {
    const keys = ['siteArea', 'occupiedArea', 'unallocatedArea', 'footprint', 'landscapeArea', 'overlapArea', 'outOfBoundsArea']
    const expected = Object.fromEntries(await Promise.all(keys.map(async key => [key, await area(key)])))
    await nav('场地设计'); await button('场地信息').click()
    assert.equal(await input('用地宽度').getAttribute('step'), '0.01'); assert.equal(await input('用地进深').getAttribute('step'), '0.01')
    const labels = { siteArea: '总用地面积', occupiedArea: '界内设施占地（去重）', unallocatedArea: '未配置面积', footprint: '建筑基底面积', landscapeArea: '已配置绿地', overlapArea: '界内重叠区域', outOfBoundsArea: '界外占地（去重）' }
    for (const [key, value] of Object.entries(expected)) {
      const row = page.locator('.site-indicators > div').filter({ has: page.locator('span').getByText(labels[key], { exact: true }) })
      const rendered = Number((await row.locator('strong').textContent()).replaceAll(',', '').replace(/\s*m²$/, ''))
      assert.equal(rendered, Math.round(value * 100) / 100, `Compact ${key} disagrees with overview`)
    }
    await nav('方案总览')
  })
  await check('save and actual reload preserve decimal geometry and prior pricing', async () => {
    persisted = await active(); await button('保存方案').click(); await page.reload(); await page.locator('.overview').waitFor()
    assert.deepEqual(await active(), persisted); await nav('方案总览')
    await assertAreas({ siteArea: 9097.6875, occupiedArea: 497.6875, unallocatedArea: 8600, outOfBoundsArea: 192.3125, landscapeArea: 150 })
  })
  await check('JSON download and actual UI import roundtrip preserve dimensions, visibility and pricing', async () => {
    await button('导出方案').click(); const archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'area-project.json'))
    assert.deepEqual(archive.facilities, persisted.facilities); assert.equal(archive.siteWidth, 100.25); assert.equal(archive.siteDepth, 90.75)
    await importFixture(archive); const imported = await active(); assert.notEqual(imported.id, persisted.id)
    assert.deepEqual(imported.facilities, persisted.facilities)
    await assertAreas({ siteArea: 9097.6875, occupiedArea: 497.6875, unallocatedArea: 8600, landscapeArea: 150 })
  })
  await check('area CSV metric totals match unrounded DOM values and decimal display', async () => {
    const csv = await download(() => button('导出面积明细').click(), 'area-details.csv')
    const rows = csvRows(csv)
    const expected = { '总用地面积': 'siteArea', '界内设施占地': 'occupiedArea', '未配置用地': 'unallocatedArea', '界内建筑基底': 'footprint', '界内可用绿地': 'landscapeArea', '界内重叠区域': 'overlapArea', '界外去重占地': 'outOfBoundsArea', '建筑各层面积': 'buildingArea' }
    for (const [label, key] of Object.entries(expected)) {
      const row = rows.find(row => row[0] === label); assert.ok(row, `Missing CSV metric ${label}`)
      assert.equal(Number(row[1]), Math.round((await area(key)) * 100) / 100, `CSV ${label} disagrees with DOM`)
      assert.match(row[1], /^\d+\.\d{2}$/, `${label} must retain two decimal places in CSV`)
    }
    assert.match(csv, /精算hotel/); assert.match(csv, /精算court/)
  })
  await check('390px area overview and compact summary fit without horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(new URL('/mobile', url).href); await button('更多设施').waitFor()
    if (await button('返回项目导航').count()) await button('返回项目导航').click()
    await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name: '方案总览', exact: true }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(Number(await page.locator('.area-summary:not(.area-summary-compact) [data-testid="area-site"]').getAttribute('data-area-value')), 9097.6875)
    await page.screenshot({ path: 'test-results/area-mobile.png', fullPage: true })
    await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name: '场地设计', exact: true }).click(); await button('场地信息').click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.setViewportSize({ width: 1512, height: 982 }); await page.goto(url); await button('更多设施').waitFor(); await nav('方案总览')
    await page.screenshot({ path: 'test-results/area-desktop.png', fullPage: true })
  })
  await check('no runtime errors across area controls, union metrics, save, import and export', async () => { assert.deepEqual(runtimeErrors, []) })
} catch (error) {
  await check('area acceptance setup', async () => { throw error })
} finally {
  const report = { total: passed.length + failures.length, passed: passed.length, failed: failures.length, skipped: 0, checks: passed, failures, runtimeErrors, exitCode: failures.length ? 1 : 0 }
  writeFileSync('test-results/area-results.json', JSON.stringify(report, null, 2))
  console.log(`Area acceptance: total ${report.total}, passed ${report.passed}, failed ${report.failed}, skipped 0; exit ${report.exitCode}`)
  await browser.close(); process.exitCode = report.exitCode
}
