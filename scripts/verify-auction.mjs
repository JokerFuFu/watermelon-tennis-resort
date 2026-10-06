import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// QA inventory: catalogue/search/add, building quantities and assumptions,
// 2D/3D auction furniture, rotation, lock/hide/undo/duplicate, CSV/report,
// JSON/save/two reloads, mobile search/add/viewport and runtime recovery.
// Off-happy paths: hidden facilities retain costs; a locked hall cannot edit.
// UI writes occur ONLY in a fresh, independent browser context.
const TOTAL = 9
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const checks = [], failures = [], runtimeErrors = []
let currentCheck = 'setup', hallId, archive
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = name => page.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const number = (name, root = page) => root.getByRole('spinbutton', { name, exact: true })
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const hall = async () => (await active()).facilities.find(f => f.id === hallId)
const art = () => page.locator(`#site-plan-svg [data-facility-id="${hallId}"] [data-auction-preset="auction-hall"]`)
const row = () => page.locator(`[data-manager-id="${hallId}"]`)
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function check(label, run) { currentCheck = label; await run(); checks.push(label); console.log('PASS ' + label) }
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function library() {
  await button('更多设施').click(); await dialog().waitFor()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-modal-host .modal-backdrop')).opacity === '1')
}
async function locate() {
  await nav('场地设计'); await button('设施管理').click(); await row().locator('.fm-location').click(); await settled()
  assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).inputValue(), (await hall()).name)
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
async function cost(expected) {
  await nav('投资估算')
  assert.equal(Number(await page.locator(`[data-cost-facility="${hallId}"]`).getAttribute('data-cost-point')), expected)
  assert.equal(Number(await page.locator('[data-engineering-total]').getAttribute('data-engineering-total')), expected)
  assert.ok((await page.locator('[data-testid="budget-missing-items"]').textContent()).includes('土地'))
  assert.ok((await page.locator(`[data-cost-facility="${hallId}"]`).textContent()).includes('内部假设'))
}
try {
  await page.goto(url); await button('更多设施').waitFor()
  await check('isolated UI creates an empty auction example without touching the native user project', async () => {
    await button('切换项目').click(); await button('新建项目').click()
    await dialog().getByRole('textbox', { name: '项目名称' }).fill('拍卖厅设施验收示例')
    await dialog().getByRole('button', { name: /空白场地/ }).click(); await button('创建方案').click()
    await button('编辑项目设置').click()
    await number('用地宽度', dialog()).fill('100'); await number('用地进深', dialog()).fill('90')
    await button('保存设置').click(); await settled()
    assert.equal((await active()).facilities.length, 0)
  })
  await check('51 cards expose auction search and seven dining spaces while preserving six leisure spaces', async () => {
    await library(); assert.equal(await dialog().locator('.fl-card').count(), 51)
    await dialog().getByRole('button', { name: '餐饮与社交', exact: true }).click()
    assert.equal(await dialog().locator('.fl-card').count(), 7)
    assert.equal(await dialog().locator('[data-library-preset="auction-hall"] h3').textContent(), '拍卖厅')
    await dialog().getByRole('button', { name: '娱乐与游玩', exact: true }).click()
    assert.equal(await dialog().locator('.fl-card').count(), 17)
    await dialog().getByRole('button', { name: '棋牌休闲分类', exact: true }).click()
    assert.equal(await dialog().locator('.fl-card').count(), 6)
    await dialog().getByRole('button', { name: '全部', exact: true }).click()
    await dialog().getByRole('textbox', { name: '搜索设施', exact: true }).fill('拍卖')
    assert.equal(await dialog().locator('.fl-card').count(), 1)
    assert.equal(await dialog().getByRole('button', { name: '添加拍卖厅', exact: true }).count(), 1)
    await screenshot('test-results/auction-library-desktop.png')
    await dialog().getByRole('button', { name: '添加拍卖厅', exact: true }).click(); await settled()
    assert.equal((await active()).facilities.length, 1)
    const f = (await active()).facilities[0]; hallId = f.id
    assert.equal(f.presetId, 'auction-hall'); assert.equal(f.type, 'restaurant'); assert.equal(f.name, '拍卖厅 1')
    assert.deepEqual([f.width, f.depth, f.floors, f.rooms, f.unitCost], [30, 20, 1, 0, 5600])
    assert.equal(f.roomMix, undefined)
  })
  await check('auction contributes exactly 600 square metres and 3360000 yuan with no rooms, courts or green area', async () => {
    const metric = label => page.locator('.metric-block').filter({ has: page.locator('span', { hasText: label }) })
    assert.equal(await metric('网球场配置').locator('strong').textContent(), '0片')
    assert.equal(await metric('规划客房').locator('strong').textContent(), '0间')
    assert.equal(Number((await metric('总建筑面积').locator('strong').textContent()).replace(/[^0-9.]/g, '')), 600)
    await button('场地信息').click()
    const green = page.locator('.site-indicators > div').filter({ has: page.locator('span', { hasText: /^已配置绿地$/ }) })
    assert.equal(await green.locator('strong').textContent(), '0.00 m²')
    await cost(3360000)
  })
  await check('both 2D and 3D show auction stage and bidder seats; floors and rotation preserve exact engineering quantities', async () => {
    await locate()
    for (const view of ['2D 平面', '3D 总览']) {
      await button(view).click(); await settled(); assert.equal(await art().count(), 1, view)
      const furniture = art().locator('[data-auction-furniture="stage-and-bidder-seating"]')
      assert.equal(await furniture.count(), 1, view)
      assert.ok(await furniture.locator('polygon,polyline,path,ellipse,circle,rect').count() >= 10, view + ' lacks furniture')
    }
    await screenshot('test-results/auction-3d.png'); await button('2D 平面').click()
    await button('增加建筑层数').click(); await button('旋转设施').click(); await settled()
    assert.deepEqual([(await hall()).width, (await hall()).depth, (await hall()).floors, (await hall()).rotation], [30, 20, 2, 90])
    await cost(6720000)
    await nav('场地设计')
    const text = await page.locator('.metric-block').filter({ has: page.locator('span', { hasText: '总建筑面积' }) }).locator('strong').textContent()
    assert.equal(Number(text.replace(/[^0-9.]/g, '')), 1200)
    await screenshot('test-results/auction-showcase.png')
  })
  await check('locked hall blocks edits; hidden hall retains budget; undo, clone and delete retain auction identity', async () => {
    await locate(); const before = await hall()
    await button('锁定' + before.name).click(); await settled()
    assert.equal((await hall()).locked, true); assert.equal(await number('宽度').isDisabled(), true)
    assert.equal(await button('删除选中设施').isDisabled(), true)
    await button('解锁' + before.name).click(); await button('设施管理').click()
    await row().getByRole('button', { name: '隐藏' + before.name, exact: true }).click(); await settled()
    assert.equal(await art().count(), 0); assert.equal((await hall()).visible, false); await cost(6720000)
    await nav('场地设计'); await button('撤销').click(); await settled(); assert.notEqual((await hall()).visible, false)
    await locate(); const original = await hall(); await button('复制设施').click(); await settled()
    const clone = (await active()).facilities.at(-1)
    assert.equal((await active()).facilities.length, 2); assert.notEqual(clone.id, original.id)
    assert.equal(clone.presetId, 'auction-hall')
    for (const key of ['width', 'depth', 'floors', 'unitCost', 'rotation']) assert.equal(clone[key], original[key])
    await button('删除选中设施').click(); await settled()
    assert.equal((await active()).facilities.length, 1); assert.deepEqual(await hall(), original)
  })
  await check('area and budget CSV identify the hall, while offline report contains matching auction furniture and quantity', async () => {
    await nav('方案总览'); const before = await active()
    const areaCSV = await download(() => button('导出面积明细').click(), 'auction-area.csv')
    assert.ok(areaCSV.includes('拍卖厅')); assert.ok(areaCSV.includes('"30","20","90","2"'))
    await button('导出方案').click()
    const budgetCSV = await download(() => button('投资估算表 (.csv)').click(), 'auction-budget.csv')
    assert.ok(budgetCSV.includes('拍卖厅')); assert.ok(budgetCSV.includes('6720000')); assert.ok(budgetCSV.includes('假设'))
    const report = await download(() => button('导出方案报告').click(), 'auction-report.html')
    assert.ok(report.includes('拍卖厅')); assert.ok(report.includes('data-auction-preset="auction-hall"'))
    assert.ok(report.includes('stage-and-bidder-seating')); assert.ok(report.includes('尚未核定')); assert.ok(report.includes('不自动转换为本酒店的供应商报价'))
    const offline = await context.newPage(); await context.setOffline(true)
    try {
      await offline.setContent(report)
      assert.equal(await offline.locator('[data-report-facility]').count(), 1)
      assert.equal(Number(await offline.locator('[data-report-metric="buildingArea"]').getAttribute('data-value')), 1200)
      assert.equal(await offline.locator('[data-auction-preset="auction-hall"]').count(), 1)
    } finally { await context.setOffline(false); await offline.close() }
    assert.deepEqual(await active(), before)
  })
  await check('save, JSON export/import and two actual reloads preserve the hall and its exact geometry and price', async () => {
    await nav('场地设计'); await button('保存方案').click(); await settled(); const before = await active()
    await button('导出方案').click()
    archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'auction-project.json'))
    assert.deepEqual(archive, before)
    await page.locator('input[type=file]').setInputFiles({ name: 'auction.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) })
    await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled()
    assert.notEqual((await active()).id, archive.id); assert.deepEqual((await active()).facilities, archive.facilities)
    for (let i = 0; i < 2; i++) {
      await page.reload(); await button('更多设施').waitFor(); await settled()
      assert.deepEqual((await active()).facilities, archive.facilities); await cost(6720000); await nav('场地设计')
    }
  })
  await check('390px mobile finds and adds a second auction hall without horizontal overflow or altering the saved first hall', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url.replace(/\/web\/?$/, '/mobile'))
    await button('更多设施').waitFor(); assert.deepEqual((await active()).facilities, archive.facilities)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await library(); await dialog().getByRole('textbox', { name: '搜索设施', exact: true }).fill('拍卖')
    assert.equal(await dialog().locator('.fl-card').count(), 1)
    const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 390)
    await screenshot('test-results/auction-mobile.png')
    await dialog().getByRole('button', { name: '添加拍卖厅', exact: true }).click(); await settled()
    const p = await active(); assert.equal(p.facilities.length, 2)
    assert.deepEqual(p.facilities[0], archive.facilities[0]); assert.equal(p.facilities[1].presetId, 'auction-hall')
    assert.equal(p.facilities[1].name, '拍卖厅 2'); assert.equal(p.facilities[1].floors, 1)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  })
  await check('desktop and mobile complete without JavaScript errors or startup recovery screens', async () => {
    assert.deepEqual(runtimeErrors, [])
    assert.equal(await page.getByRole('button', { name: '重新加载此页', exact: true }).count(), 0)
  })
} catch (error) {
  const trace = String(error.stack || error).split('\n')
  failures.push({ name: currentCheck, assertion: String(error.message || error), position: trace.find(line => line.includes('verify-auction.mjs:'))?.trim() || 'scripts/verify-auction.mjs', keyLines: trace.slice(0, 20) })
  console.error('FAIL ' + currentCheck + '\n' + trace.slice(0, 20).join('\n'))
  await page.screenshot({ path: 'test-results/auction-failure.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  const result = { total: TOTAL, passed: checks.length, failed: failures.length, skipped: Math.max(0, TOTAL - checks.length - failures.length), exitCode: process.exitCode || 0, checks, failures, runtimeErrors, hallId }
  writeFileSync('test-results/auction-results.json', JSON.stringify(result, null, 2))
  console.log(`Auction verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`)
  await browser.close()
}
