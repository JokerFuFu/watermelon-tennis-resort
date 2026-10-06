import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Isolated UI imports protect the user's actual project. Expectations below
// compute geometry and money independently, without importing app functions.
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const passed = [], failures = [], skipped = [], runtimeErrors = []
const consoleErrors = []
page.on('pageerror', error => runtimeErrors.push(error.message))
page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })
mkdirSync('test-results', { recursive: true })
const button = (name, root = page) => root.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog', { name: '方案检查', exact: true })
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function check(name, action) {
  try { await action(); passed.push(name); console.log('PASS ' + name); return true }
  catch (error) {
    const trace = String(error.stack || error).split('\n')
    const position = trace.find(line => line.includes('verify-polish.mjs:'))?.trim() || 'scripts/verify-polish.mjs'
    failures.push({ name, assertion: String(error.message || error), position, keyLines: trace.slice(0, 20) })
    console.error('FAIL ' + name + '\n' + trace.slice(0, 20).join('\n'))
    await page.screenshot({ path: `test-results/polish-failure-${failures.length}.png`, fullPage: false }).catch(() => {})
    return false
  }
}
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function checkModalSettled() {
  await dialog().waitFor()
  await page.waitForFunction(() => {
    const modal = document.querySelector('.pc-modal-host .modal')
    return modal && [modal, modal.parentElement].every(node => Number(getComputedStyle(node).opacity) >= .99)
  })
}
async function openChecks() { await nav('方案总览'); await button('方案检查').click(); await checkModalSettled() }
async function assertPageFits(label) {
  const size = await page.evaluate(() => ({
    viewport: innerWidth, scroll: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll('h1,h2,h3,.dialog-footer,.page-heading,.pc-center,.modal')).filter(node => node.getBoundingClientRect().right > innerWidth + 1).map(node => ({ tag: node.tagName, class: node.className, right: node.getBoundingClientRect().right, text: node.textContent.slice(0, 120) })),
  }))
  assert.ok(size.scroll <= size.viewport, `${label} overflow: ${JSON.stringify(size)}`)
}
async function importFixture(project) {
  await page.locator('input[type=file]').setInputFiles({ name: 'polish-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(project)) })
  await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled(); await nav('方案总览')
}
async function download(action, filename) {
  let result
  try { [result] = await Promise.all([page.waitForEvent('download'), action()]) }
  catch (error) {
    const statuses = await page.getByRole('status').allTextContents().catch(() => [])
    throw new Error(`${error.message}\nVisible status: ${JSON.stringify(statuses)}\nConsole errors: ${JSON.stringify(consoleErrors.slice(-4))}`, { cause: error })
  }
  const path = resolve('test-results', filename); await result.saveAs(path)
  return { path, content: readFileSync(path, 'utf8'), filename: result.suggestedFilename() }
}
const f = (id, type, x, y, width, depth, extra = {}) => ({ id, type, name: '验收设施 ' + id, x, y, width, depth, floors: 1, rooms: 0, unitCost: 100, rotation: 0, ...extra })
const maliciousName = '<script>window.__reportInjected=1</script> "西瓜报价"'
const longName = '西瓜度假设施名称需要完整保留且可以正常换行'.repeat(5)
const fixture = {
  version: 1, id: 'polish-isolated', name: '西瓜验收 "北京" <script>window.__reportInjected=1</script>', location: '北京 · 隔离验收',
  siteWidth: 100, siteDepth: 100, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [
    f('hotel-hidden', 'hotel', 0, 0, 10, 10, { name: '隐藏客房楼', visible: false, rooms: 20, roomMix: { standard: 20, deluxe: 0, suite: 0 } }),
    f('restaurant', 'restaurant', 5, 0, 10, 10, { name: maliciousName, floors: 2 }),
    f('green', 'landscape', 0, 0, 20, 20, { name: '重叠景观草坪', unitCost: 10 }),
    f('pool', 'pool', 15, 15, 10, 10, { name: '越过草坪的泳池' }),
    f('quote', 'court', 90, 90, 20, 30, { name: '旧报价球场', rotation: 90, surface: 'hard', pricing: { mode: 'quotation', items: [], quote: { amount: 123456.78, taxMode: 'excluded', supplier: '供应商 "A" <测试>', date: '2020-01-01', scope: '含基础、排水及照明，税率待核实；<script>window.__reportInjected=1</script>' } } }),
    f('far', 'court', 1000, 1000, 20, 40, { name: '远界外球场', surface: 'hard', unitCost: 200000 }),
    ...Array.from({ length: 28 }, (_, i) => f('row-' + i, 'parking', 25 + i * 2, 60, 1, 1, { name: i === 0 ? longName : `停车节点 ${i + 1}`, unitCost: 10 + i })),
  ],
  budget: { construction: 'new', grade: 'standard', designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: null, siteAmount: null, connectionAmount: 3000, openingAmount: null },
}
function rect(facility) {
  const [width, depth] = facility.rotation === 90 ? [facility.depth, facility.width] : [facility.width, facility.depth]
  return { x1: facility.x, y1: facility.y, x2: facility.x + width, y2: facility.y + depth, type: facility.type }
}
function regions(project) {
  const rects = project.facilities.map(rect), xs = [...new Set([0, project.siteWidth, ...rects.flatMap(r => [r.x1, r.x2])])].sort((a, b) => a - b)
  const ys = [...new Set([0, project.siteDepth, ...rects.flatMap(r => [r.y1, r.y2])])].sort((a, b) => a - b)
  let occupied = 0, overlap = 0, outside = 0, green = 0, building = 0
  for (let x = 1; x < xs.length; x++) for (let y = 1; y < ys.length; y++) {
    const mx = (xs[x] + xs[x - 1]) / 2, my = (ys[y] + ys[y - 1]) / 2
    const hits = rects.filter(r => mx > r.x1 && mx < r.x2 && my > r.y1 && my < r.y2)
    if (!hits.length) continue
    const area = (xs[x] - xs[x - 1]) * (ys[y] - ys[y - 1])
    const inside = mx > 0 && mx < project.siteWidth && my > 0 && my < project.siteDepth
    if (!inside) { outside += area; continue }
    occupied += area; if (hits.length >= 2) overlap += area
    if (hits.some(r => r.type === 'hotel' || r.type === 'restaurant')) building += area
    if (hits.every(r => r.type === 'landscape')) green += area
  }
  return { site: project.siteWidth * project.siteDepth, occupied, unallocated: project.siteWidth * project.siteDepth - occupied, overlap, outside, green, footprint: building, raw: project.facilities.reduce((s, f) => s + f.width * f.depth, 0), gross: project.facilities.filter(f => f.type === 'hotel' || f.type === 'restaurant').reduce((s, f) => s + f.width * f.depth * f.floors, 0) }
}
function engineeringAmount(facility) {
  if (facility.pricing?.mode === 'quotation') {
    const q = facility.pricing.quote
    return cents(q.amount * (q.taxMode === 'excluded' && q.taxRate !== undefined ? 1 + q.taxRate / 100 : 1))
  }
  return facility.type === 'court' ? facility.unitCost : facility.width * facility.depth * (['hotel', 'restaurant'].includes(facility.type) ? facility.floors : 1) * facility.unitCost
}
function money(project) {
  const engineering = project.facilities.reduce((s, f) => s + engineeringAmount(f), 0), b = project.budget
  const design = cents(engineering * b.designRate / 100), supervision = cents(engineering * b.supervisionRate / 100)
  const reserve = cents((engineering + design + supervision + (b.siteAmount || 0) + (b.connectionAmount || 0)) * b.reserveRate / 100)
  return { engineering, design, supervision, reserve, total: cents(engineering + design + supervision + reserve + (b.landAmount || 0) + (b.siteAmount || 0) + (b.connectionAmount || 0) + (b.openingAmount || 0)) }
}
const expectedAreas = regions(fixture), expectedMoney = money(fixture)
let imported, beforeReport, report, offline

async function makeShowcase() {
  const demo = structuredClone(fixture)
  demo.id = 'polish-showcase-isolated'
  demo.name = '西瓜网球度假酒店 · 方案示例'
  demo.location = '北京 · 演示方案'
  const names = { 'hotel-hidden': '客房楼 A', restaurant: '西瓜主题餐厅', green: '景观花园', pool: '度假泳池', quote: '训练球场 A', far: '界外网球场 B' }
  demo.facilities.forEach(f => {
    f.name = names[f.id] || `配套停车位 ${Number(f.id.replace('row-', '')) + 1}`
    if (f.pricing?.quote) { f.pricing.quote.supplier = '演示供应商'; f.pricing.quote.scope = '基础、面层、围网及照明；税率待复核' }
  })
  const showcaseContext = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
  const showcase = await showcaseContext.newPage()
  await showcase.goto(url)
  await showcase.getByRole('button', { name: '更多设施', exact: true }).waitFor()
  await showcase.locator('input[type=file]').setInputFiles({ name: '方案示例.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(demo)) })
  await showcase.getByRole('status').filter({ hasText: '已导入' }).waitFor()
  await showcase.locator('.desktop-nav').getByRole('button', { name: '方案总览', exact: true }).click()
  await showcase.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await showcase.getByRole('button', { name: '方案检查', exact: true }).click()
  const modal = showcase.getByRole('dialog', { name: '方案检查', exact: true })
  await modal.waitFor()
  await showcase.waitForFunction(() => {
    const node = document.querySelector('.pc-modal-host .modal')
    return node && [node, node.parentElement].every(element => Number(getComputedStyle(element).opacity) >= .99)
  })
  // Let the import toast dismiss before capturing a clean demonstration.
  await showcase.getByRole('status').filter({ hasText: '已导入' }).waitFor({ state: 'hidden' })
  await modal.screenshot({ path: 'test-results/polish-showcase.png' })
  await modal.getByRole('button', { name: '返回设计', exact: true }).click()
  const [downloaded] = await Promise.all([showcase.waitForEvent('download'), showcase.getByRole('button', { name: '导出方案报告', exact: true }).click()])
  const path = resolve('test-results/polish-report-showcase.html')
  await downloaded.saveAs(path)
  const reportPage = await showcaseContext.newPage()
  await reportPage.goto(pathToFileURL(path).href)
  await reportPage.getByRole('heading', { name: '方案总览', exact: true }).waitFor()
  assert.equal(await reportPage.locator('script').count(), 0)
  assert.equal(Number(await reportPage.locator('[data-report-metric="knownBudget"]').getAttribute('data-value')), expectedMoney.total)
  await reportPage.screenshot({ path: 'test-results/polish-report-showcase.png', fullPage: false })
  await showcaseContext.close()
  console.log('Clean isolated showcase screenshots and HTML saved; verified fixture quantities preserved.')
}

if (process.argv.includes('--showcase')) {
  try { await makeShowcase() } finally { await browser.close() }
  process.exit(0)
}

try {
  await page.goto(url); await button('更多设施').waitFor()
  const setup = await check('isolated import preserves hidden, far-outside, capacity, uncertain tax and stale-quote fixtures', async () => {
    await importFixture(fixture); imported = await active()
    assert.deepEqual(imported.facilities, fixture.facilities); assert.deepEqual(imported.budget, fixture.budget)
    assert.notEqual(imported.id, fixture.id)
    const numeric = key => page.locator(`.area-summary:not(.area-summary-compact) [data-testid="area-${key}"]`).getAttribute('data-area-value')
    const names = { site: 'site', occupied: 'occupied', unallocated: 'unallocated', overlap: 'overlap', outside: 'outside', green: 'green', footprint: 'building-footprint', raw: 'raw', gross: 'building-gross' }
    for (const [key, id] of Object.entries(names)) assert.ok(Math.abs(Number(await numeric(id)) - expectedAreas[key]) < 1e-8, `${key} disagrees with independent rectangle integration`)
  })
  if (!setup) throw new Error('Fixture setup failed; dependent polish checks cannot run.')

  await check('check centre has exact layout, room and budget category counts without mutating the project', async () => {
    const before = await active(); await openChecks()
    const categories = { '全部事项': 14, '场地布局': 7, '客房容量': 1, '预算与来源': 6 }
    for (const [label, count] of Object.entries(categories)) {
      const filter = dialog().getByRole('group', { name: '检查分类' }).getByRole('button', { name: new RegExp('^' + label) })
      assert.equal(Number(await filter.locator('span').textContent()), count, label + ' count')
    }
    assert.equal(await dialog().locator('[data-check-id]').count(), 14)
    assert.deepEqual(await active(), before)
    await dialog().screenshot({ path: 'test-results/polish-modal.png' })
  })
  await check('category filters display only matching tasks and search handles empty and literal-text results', async () => {
    const counts = { '场地布局': ['layout', 7], '客房容量': ['rooms', 1], '预算与来源': ['budget', 6] }
    for (const [label, [category, count]] of Object.entries(counts)) {
      await dialog().getByRole('group', { name: '检查分类' }).getByRole('button', { name: new RegExp('^' + label) }).click()
      assert.equal(await dialog().locator('[data-check-category]').count(), count)
      assert.equal(await dialog().locator(`[data-check-category="${category}"]`).count(), count)
    }
    await dialog().getByRole('group', { name: '检查分类' }).getByRole('button', { name: /^全部事项/ }).click()
    const search = dialog().getByRole('textbox', { name: '搜索检查事项', exact: true })
    await search.fill('不存在的设施 91732'); assert.equal(await dialog().locator('[data-check-id]').count(), 0)
    await dialog().getByText('没有匹配的检查事项', { exact: true }).waitFor()
    await button('查看全部事项', dialog()).click(); assert.equal(await search.inputValue(), '')
    assert.equal(await dialog().locator('[data-check-id]').count(), 14)
    await search.fill('<script>'); assert.ok(await dialog().locator('[data-check-id]').count() > 0)
    assert.equal(await page.evaluate(() => window.__reportInjected), undefined)
    await button('清空检查搜索', dialog()).click(); await button('返回设计', dialog()).click()
  })
  await check('large intersection lists paginate by 30 and searching still finds tasks beyond the first page', async () => {
    const dense = { ...fixture, id: 'polish-dense-isolated', facilities: Array.from({ length: 60 }, (_, i) => f('dense-' + i, 'parking', 0, 0, 1, 1, { name: '密集验收 ' + i })), budget: { ...fixture.budget, landAmount: 0, siteAmount: 0, connectionAmount: 0, openingAmount: 0 } }
    try {
      await importFixture(dense); const before = await active(); await openChecks()
      assert.equal(await dialog().locator('[data-check-id]').count(), 30)
      await button('再显示 30 项', dialog()).click(); assert.equal(await dialog().locator('[data-check-id]').count(), 60)
      await button('再显示 30 项', dialog()).click(); assert.equal(await dialog().locator('[data-check-id]').count(), 62)
      assert.equal(await button('再显示 30 项', dialog()).count(), 0)
      await dialog().getByRole('textbox', { name: '搜索检查事项', exact: true }).fill('密集验收 59')
      // Every dense task involves every facility: 60 layout tasks and two
      // aggregated budget tasks match. Search deliberately resets its page.
      await dialog().getByRole('status').filter({ hasText: '62 项匹配' }).waitFor()
      assert.equal(await dialog().locator('[data-check-id]').count(), 30)
      await button('再显示 30 项', dialog()).click()
      await dialog().locator('[data-check-id="intersections-dense-59"]').waitFor()
      assert.equal(await dialog().locator('[data-check-id="intersections-dense-59"]').count(), 1)
      assert.deepEqual(await active(), before)
    } finally {
      if (await dialog().isVisible()) await button('返回设计', dialog()).click()
      await importFixture(fixture)
    }
  })
  await check('layout action locates the correct far-outside facility ID without changing geometry', async () => {
    const before = await active(); await openChecks()
    const issue = dialog().locator('[data-check-id="bounds-far"]')
    assert.equal(await issue.getAttribute('data-check-facility-id'), 'far')
    await button('定位设施', issue).click(); await dialog().waitFor({ state: 'hidden' })
    assert.equal(await page.locator('.properties-panel .selected-heading h3').textContent(), '远界外球场')
    assert.equal(Number(await page.getByRole('spinbutton', { name: '宽度', exact: true }).inputValue()), 20)
    assert.deepEqual(await active(), before)
  })
  await check('room action opens the hotel configuration with the independently calculated 460 sqm shortfall', async () => {
    const before = await active(); await openChecks()
    const issue = dialog().locator('[data-check-id="room-capacity-hotel-hidden"]')
    assert.match(await issue.textContent(), /460\.00/)
    await button('调整客房', issue).click(); await dialog().waitFor({ state: 'hidden' })
    await page.locator('.rp-page').waitFor()
    const hotel = page.locator('.rp-hotel-card').filter({ has: page.getByRole('heading', { name: '隐藏客房楼', exact: true }) })
    assert.equal(await hotel.getByRole('spinbutton', { name: '隐藏客房楼客房数量', exact: true }).inputValue(), '20')
    assert.match(await hotel.locator('.rp-shortage-message').textContent(), /460\.00/)
    assert.deepEqual(await active(), before)
  })
  await check('missing-fee action opens budgeting and retains every prior rate, missing field and amount', async () => {
    const before = await active(); await openChecks()
    await button('补充预算', dialog().locator('[data-check-id="missing-landAmount"]')).click()
    await dialog().waitFor({ state: 'hidden' }); await page.locator('[data-budget-total]').waitFor()
    assert.ok(Math.abs(Number(await page.locator('[data-budget-total]').getAttribute('data-budget-total')) - expectedMoney.total) < .011)
    assert.deepEqual(await active(), before)
  })
  await check('stale-quote action opens only the correct facility editor and cancellation retains quote data', async () => {
    const before = await active(); await openChecks()
    await button('复核报价', dialog().locator('[data-check-id="quote-recheck"]')).click()
    await dialog().waitFor({ state: 'hidden' })
    const editor = page.getByRole('dialog')
    await editor.waitFor(); assert.match(await editor.textContent(), /旧报价球场/)
    assert.equal(await editor.getByRole('spinbutton', { name: '供应商报价总额', exact: true }).inputValue(), '123456.78')
    await button('取消', editor).click(); assert.deepEqual(await active(), before)
  })
  await check('show-and-locate action explicitly restores only the hidden facility visibility, then save and reload preserve it', async () => {
    const before = await active(); await openChecks()
    const issue = dialog().locator('[data-check-id="intersections-hotel-hidden"]')
    await button('显示并定位', issue).click(); await dialog().waitFor({ state: 'hidden' }); await settled()
    assert.equal(await page.locator('.properties-panel .selected-heading h3').textContent(), '隐藏客房楼')
    const after = await active(), expected = structuredClone(before)
    expected.facilities.find(f => f.id === 'hotel-hidden').visible = true; expected.updatedAt = after.updatedAt
    assert.deepEqual(after, expected)
    await button('保存方案').click(); await page.reload(); await button('更多设施').waitFor(); assert.deepEqual(await active(), after)
    // Return to an imported hidden fixture for report coverage via visible UI.
    await importFixture(fixture); beforeReport = await active()
  })
  await check('overview exports an HTML report without changing the saved design or its prices', async () => {
    report = await download(() => button('导出方案报告').click(), 'polish-report.html')
    assert.match(report.filename, /\.html$/); assert.match(report.content, /^<!doctype html>/i)
    assert.deepEqual(await active(), beforeReport)
    assert.match(report.content, /&lt;script&gt;/)
  })
  await check('downloaded report opens offline without scripts, external resource requests or runtime errors', async () => {
    assert.ok(report, 'HTML download is prerequisite to offline report checks')
    offline = await context.newPage()
    offline.setDefaultTimeout(10000)
    offline.on('pageerror', error => runtimeErrors.push('report: ' + error.message))
    const external = []
    offline.on('request', request => { if (/^https?:/.test(request.url())) external.push(request.url()) })
    try {
      await context.setOffline(true); await offline.goto(pathToFileURL(report.path).href)
      await offline.getByRole('heading', { name: '方案总览', exact: true }).waitFor()
      assert.deepEqual(external, []); assert.equal(await offline.locator('script').count(), 0)
      assert.equal(await offline.getByRole('button').count(), 0)
      assert.equal(await offline.evaluate(() => window.__reportInjected), undefined)
      assert.ok((await offline.getByRole('heading', { level: 1 }).textContent()).includes(fixture.name))
      assert.ok((await offline.locator('[data-report-facility="restaurant"]').textContent()).includes(maliciousName))
      assert.ok((await offline.locator('[data-report-facility="row-0"]').textContent()).includes(longName))
      await offline.screenshot({ path: 'test-results/polish-report.png', fullPage: false })
    } finally { await context.setOffline(false) }
  })
  await check('HTML totals and all facility rows equal independent geometry and monetary calculations', async () => {
    const metrics = { siteArea: expectedAreas.site, occupiedArea: expectedAreas.occupied, buildingArea: expectedAreas.gross, knownBudget: expectedMoney.total }
    for (const [key, value] of Object.entries(metrics)) assert.ok(Math.abs(Number(await offline.locator(`[data-report-metric="${key}"]`).getAttribute('data-value')) - value) < .00001, `Report ${key} differs`)
    const areaSection = offline.locator('section').filter({ has: offline.getByRole('heading', { name: '面积核算', exact: true }) })
    const labels = { '完整设施占地合计': expectedAreas.raw, '未配置用地': expectedAreas.unallocated, '界内重叠区域': expectedAreas.overlap, '界外去重占地': expectedAreas.outside, '建筑基底（界内去重）': expectedAreas.footprint, '界内可用绿地': expectedAreas.green }
    for (const [label, value] of Object.entries(labels)) {
      const row = areaSection.getByRole('row').filter({ has: offline.getByRole('cell', { name: label, exact: true }) })
      assert.equal(Number((await row.getByRole('cell').nth(1).textContent()).replaceAll(',', '').replace(/\s*㎡$/, '')), value)
    }
    assert.equal(await offline.locator('[data-report-facility]').count(), fixture.facilities.length)
    for (const f of fixture.facilities) {
      const row = offline.locator(`[data-report-facility="${f.id}"]`)
      assert.equal(Number((await row.getByRole('cell').nth(2).textContent()).replaceAll(',', '')), f.width * f.depth)
      const moneyText = (await row.getByRole('cell').nth(6).textContent()).split('¥')[1]
      const parsed = Number(moneyText.match(/^[\d,.]+/)[0].replaceAll(',', ''))
      assert.ok(Math.abs(parsed - engineeringAmount(f)) < .011, `Report facility ${f.id} cost differs`)
    }
    assert.match(await offline.locator('body').textContent(), /税率待核实/)
    assert.match(await offline.locator('body').textContent(), /90 天/)
    assert.match(await offline.locator('body').textContent(), /未报价（未计入）/)
  })
  await check('offline full SVG includes hidden and distant facilities with every rectangle inside its viewBox', async () => {
    const svg = offline.locator('svg#report-site-plan')
    assert.equal(await svg.count(), 1)
    const [vx, vy, vw, vh] = (await svg.getAttribute('viewBox')).split(/\s+/).map(Number)
    assert.ok(vx <= 0 && vy <= 0 && vx + vw >= 1020 * 4 && vy + vh >= 1040 * 4)
    for (const f of fixture.facilities) {
      assert.ok(await svg.locator(`[data-facility-id="${f.id}"]`).count() > 0, `Missing SVG facility ${f.id}`)
      const r = rect(f); assert.ok(r.x1 * 4 >= vx && r.y1 * 4 >= vy && r.x2 * 4 <= vx + vw && r.y2 * 4 <= vy + vh)
    }
    assert.match(await offline.locator('[data-report-facility="hotel-hidden"]').textContent(), /隐藏（计入核算）/)
  })
  await check('offline print styling repeats table headers and retains long rows, titles and readable columns', async () => {
    await offline.emulateMedia({ media: 'print' })
    const styles = await offline.evaluate(() => ({
      title: getComputedStyle(document.querySelector('h1')).display,
      help: getComputedStyle(document.querySelector('.print-help')).display,
      tables: Array.from(document.querySelectorAll('table')).map(table => ({
        header: getComputedStyle(table.querySelector('thead')).display,
        rowBreak: getComputedStyle(table.querySelector('tbody tr')).breakInside,
        headerSize: Number.parseFloat(getComputedStyle(table.querySelector('th')).fontSize),
        headerWrap: getComputedStyle(table.querySelector('th')).whiteSpace,
        width: table.getBoundingClientRect().width,
        container: document.querySelector('main').getBoundingClientRect().width,
      })),
    }))
    assert.notEqual(styles.title, 'none'); assert.equal(styles.help, 'none')
    for (const table of styles.tables) {
      assert.equal(table.header, 'table-header-group'); assert.match(table.rowBreak, /^avoid/)
      assert.ok(table.headerSize >= 9); assert.equal(table.headerWrap, 'normal'); assert.ok(table.width <= table.container + 1)
    }
    await offline.pdf({ path: 'test-results/polish-report-print.pdf', preferCSSPageSize: true, printBackground: true })
    await offline.emulateMedia({ media: 'screen' }); await context.setOffline(false)
  })
  await check('desktop exports report through the existing menu and saved project survives two reloads', async () => {
    await button('导出方案').click()
    const second = await download(() => button('方案报告 (.html)').click(), 'polish-menu-report.html')
    assert.match(second.content, /data-report-metric="knownBudget"/)
    assert.deepEqual(await active(), beforeReport)
    for (let i = 0; i < 2; i++) { await page.reload(); await page.locator('.overview').waitFor(); assert.deepEqual(await active(), beforeReport) }
    await nav('方案总览')
  })
  await check('desktop overview and check modal fit at 1100, 1280 and 1512 pixels without horizontal page overflow', async () => {
    for (const width of [1100, 1280, 1512]) {
      await page.setViewportSize({ width, height: 982 }); await nav('方案总览')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Overview overflows at ' + width)
      await button('方案检查').click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Check modal overflows at ' + width)
      const box = await dialog().boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= width + 1)
      await button('返回设计', dialog()).click()
    }
    await page.screenshot({ path: 'test-results/polish-desktop.png', fullPage: false })
  })
  await check('390px mobile check centre and offline report remain readable without document overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(new URL('/mobile', url).href); await button('更多设施').waitFor()
    if (await button('返回项目导航').isVisible()) await button('返回项目导航').click()
    await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name: '方案总览', exact: true }).click()
    await button('方案检查').click(); await checkModalSettled()
    try {
      await assertPageFits('Mobile check centre')
      const bounds = await dialog().boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391)
      await page.screenshot({ path: 'test-results/polish-mobile.png', fullPage: false })
    } finally { if (await dialog().isVisible()) await button('返回设计', dialog()).click() }
    // Normal mobile navigation exposes the ordinary topbar export menu.
    await button('导出方案').click(); const mobileReport = await download(() => button('方案报告 (.html)').click(), 'polish-mobile-report.html')
    assert.match(mobileReport.content, /data-report-facility="hotel-hidden"/)
    await offline.setViewportSize({ width: 390, height: 844 })
    assert.equal(await offline.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await offline.locator('[data-report-facility]').count(), 34)
    await offline.screenshot({ path: 'test-results/polish-report-mobile.png', fullPage: false })
    assert.deepEqual(await active(), beforeReport)
  })
  await check('fullscreen workbench export menu offers the same self-contained report', async () => {
    // The compact mobile layout intentionally hides its expand control. Exercise
    // the legacy fullscreen workbench at desktop width through its visible UI.
    await page.setViewportSize({ width: 1280, height: 982 })
    if (await button('打开菜单').isVisible()) await button('打开菜单').click()
    await page.locator('.main-nav').getByRole('button', { name: '场地设计', exact: true }).click()
    if (await button('全屏工作台').isVisible()) await button('全屏工作台').click()
    const actions = page.locator('.fullscreen-actions')
    await button('导出方案', actions).click()
    const full = await download(() => button('方案报告 (.html)', actions).click(), 'polish-fullscreen-report.html')
    assert.match(full.content, /完整场地平面图/); assert.deepEqual(await active(), beforeReport)
    await page.setViewportSize({ width: 1512, height: 982 }); await page.goto(url); await button('更多设施').waitFor(); await nav('方案总览')
  })
  await check('no runtime errors across check actions, HTML exports, reloads and offline print', async () => { assert.deepEqual(runtimeErrors, []) })
} catch (error) {
  await check('polish acceptance setup', async () => { throw error })
} finally {
  const result = { total: passed.length + failures.length + skipped.length, passed: passed.length, failed: failures.length, skipped: skipped.length, checks: passed, failures, runtimeErrors, consoleErrors, exitCode: failures.length ? 1 : 0 }
  writeFileSync('test-results/polish-results.json', JSON.stringify(result, null, 2))
  console.log(`Polish acceptance: total ${result.total}, passed ${result.passed}, failed ${result.failed}, skipped ${result.skipped}; exit ${result.exitCode}`)
  await browser.close(); process.exitCode = result.exitCode
}
