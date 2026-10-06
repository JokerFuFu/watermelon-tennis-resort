import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Isolated context only. No native-tab access, no source calculator imports,
// no storage writes: fixtures enter through the normal JSON import interface.
const TOTAL = 16
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const passed = [], failures = [], runtimeErrors = []
let currentCheck = 'setup', original, saved
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = (name, root = page) => root.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const field = name => page.locator(`input[aria-label="${name}"]`)
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
const evidence = { kind: 'assumption', name: '隔离验收示例价', scope: '仅验证计算，不是北京市场房价或采购报价' }
const fixture = {
  version: 1, id: 'version-3-old-project', name: '3.0工作台隔离验收示例', location: '北京', siteWidth: 100, siteDepth: 100, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [{ id: 'earnings-old-hotel', type: 'hotel', presetId: 'hotel', name: '原客房楼', x: 10, y: 10, width: 20, depth: 20, floors: 1, rooms: 7, roomMix: { standard: 4, deluxe: 2, suite: 1 }, unitCost: 100, rotation: 0 }],
  budget: { construction: 'simulation', grade: 'standard', designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: 0, siteAmount: 0, connectionAmount: 0, openingAmount: 0 },
  operating: { enabled: true, days: 30, guestMode: 'rooms', occupancyRate: 50, guestsPerRoom: 2, dailyGuests: 0, staffCount: 2, items: [
    { id: 'water', label: '饮用水', included: true, basis: 'personDay', quantity: 2, unit: '瓶', unitPrice: 2, taxMode: 'included', evidence },
    { id: 'wages', label: '工资', included: true, basis: 'period', quantity: 1, unit: '期间', unitPrice: 3000, taxMode: 'included', evidence: { kind: 'reference', name: '原工资预算记录', date: '2026-09-01', url: 'https://example.com/wages', scope: '原30天期间固定工资预算，验证保留原来源及口径' } },
    { id: 'utilities', label: '水电', included: true, basis: 'period', quantity: 1, unit: '期间', unitPrice: 3000, taxMode: 'included', evidence },
  ] },
}
const defaultSettings = {
  roomRates: { standard: 500, deluxe: 700, suite: 1000 }, unavailableRooms: { standard: 0, deluxe: 0, suite: 0 }, occupancyRate: 50, guestsPerRoom: 2,
  extraDailyRevenue: 0, extraMonthlyCost: null, revenueDeductionRate: null, investmentMode: 'construction', manualInvestment: null,
}
function independent(p) {
  const s = p.earnings ?? defaultSettings, o = p.operating
  const counts = { standard: 0, deluxe: 0, suite: 0 }
  for (const f of p.facilities.filter(i => i.type === 'hotel')) for (const key of Object.keys(counts)) counts[key] += (f.roomMix ?? { standard: f.rooms, deluxe: 0, suite: 0 })[key]
  const available = Object.fromEntries(Object.keys(counts).map(key => [key, Math.max(0, counts[key] - s.unavailableRooms[key])]))
  const occupied = Object.values(available).reduce((a, b) => a + b, 0) * s.occupancyRate / 100
  const rooms = Object.keys(counts).reduce((sum, key) => sum + available[key] * s.occupancyRate / 100 * (s.roomRates[key] ?? 0), 0)
  const complete = o.enabled && !Object.keys(counts).some(k => s.unavailableRooms[k] > counts[k] || available[k] > 0 && s.roomRates[k] === null) && [s.extraDailyRevenue, s.extraMonthlyCost, s.revenueDeductionRate].every(v => v !== null) && !o.items.some(i => i.included && i.unitPrice === null)
  const periods = Object.entries({ day: 1, week: 7, month: 365 / 12, year: 365 }).map(([id, days]) => {
    const roomRevenue = cents(rooms * days), otherRevenue = s.extraDailyRevenue === null ? 0 : cents(s.extraDailyRevenue * days), knownRevenue = cents(roomRevenue + otherRevenue)
    const bases = { guestDay: occupied * s.guestsPerRoom * days, staffDay: o.staffCount * days, personDay: (occupied * s.guestsPerRoom + o.staffCount) * days, roomDay: occupied * days, day: days, period: days / o.days, manual: days / o.days }
    const costs = o.items.map(i => !i.included || i.unitPrice === null ? 0 : cents(bases[i.basis] * i.quantity * i.unitPrice * (i.taxMode === 'excluded' && i.taxRate !== undefined ? 1 + i.taxRate / 100 : 1)))
    const operatingCost = cents(costs.reduce((a, b) => a + b, 0)), extraCost = s.extraMonthlyCost === null ? 0 : cents(s.extraMonthlyCost * 12 / 365 * days)
    const deductions = s.revenueDeductionRate === null ? 0 : cents(knownRevenue * s.revenueDeductionRate / 100), knownCosts = cents(operatingCost + extraCost + deductions), knownSurplus = cents(knownRevenue - knownCosts)
    return { id, days, roomRevenue, otherRevenue, knownRevenue, operatingCost, extraCost, deductions, knownCosts, knownSurplus, cashSurplus: complete ? knownSurplus : null }
  })
  const b = p.budget, engineering = p.facilities.reduce((a, f) => a + f.width * f.depth * f.floors * f.unitCost, 0)
  const design = cents(engineering * b.designRate / 100), supervision = cents(engineering * b.supervisionRate / 100)
  const reserve = cents((engineering + design + supervision + (b.siteAmount || 0) + (b.connectionAmount || 0)) * b.reserveRate / 100)
  const capital = cents(engineering + design + supervision + reserve + (b.landAmount || 0) + (b.siteAmount || 0) + (b.connectionAmount || 0) + (b.openingAmount || 0) + (p.materialBudgetIncluded ? (p.materials ?? []).reduce((a, m) => a + (m.unitPrice ?? 0), 0) : 0))
  const investment = s.investmentMode === 'construction' ? capital : s.manualInvestment
  const annualCash = periods.find(i => i.id === 'year').cashSurplus
  return { counts, available, occupied, periods, investment, payback: investment > 0 && annualCash > 0 ? investment / annualCash : null }
}
function csvRows(csv) { return csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""', '"'))) }
async function settled() { await page.waitForFunction(() => !document.querySelector('.save-status.pending')); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
async function check(name, action) { currentCheck = name; await action(); passed.push(name); console.log('PASS ' + name) }
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click(); await settled() }
async function set(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); await settled() }
async function importProject(p) { await page.locator('input[type=file]').setInputFiles({ name: 'earnings-example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) }); await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled() }
async function download(action, filename) { const pending = page.waitForEvent('download'); await action(); const d = await pending; await d.saveAs(resolve('test-results', filename)); return readFileSync(resolve('test-results', filename), 'utf8') }
async function preserved() { const p = await active(); for (const key of ['facilities', 'operating', 'budget']) assert.deepEqual(p[key], original[key], key + ' source changed through earnings preview') }
async function screenshot(name) { if (await dialog().count() === 0 && await button('关闭提示').isVisible()) await button('关闭提示').click(); await page.evaluate(() => Promise.all([...document.getAnimations()].map(a => a.finished.catch(() => {})))); await page.screenshot({ path: resolve('test-results', name), fullPage: false }) }
const pages = { design: '场地设计', rooms: '客房规划', budget: '投资估算', earnings: '收益与回本', overview: '方案总览' }
function sectionUrl(section) { const target = new URL(url); target.searchParams.set('section', section); return target.href }
async function view(section) {
  if (section === 'design') await button('更多设施').waitFor()
  else if (section === 'earnings') await page.getByTestId('earnings-page').waitFor()
  else if (section === 'rooms') await button('导出客房配置').waitFor()
  else if (section === 'budget') await page.getByTestId('project-estimate-total').waitFor()
  else await button('导出方案报告').waitFor()
  await settled()
}
async function sectionIs(section) { assert.equal(new URL(page.url()).searchParams.get('section'), section); await view(section) }
async function quickPatch(before, id, key, value) {
  const p = await active(), expected = structuredClone(before.operating)
  expected.items.find(i => i.id === id)[key] = value
  assert.deepEqual(p.operating, expected, 'Shortcut changed original timing, quantity, tax, evidence or staff')
  for (const k of ['facilities', 'budget', 'earnings', 'materials', 'materialBudgetIncluded']) assert.deepEqual(p[k], before[k])
}
async function annual() {
  const p = await active(), e = independent(p), y = e.periods.find(i => i.id === 'year'), row = page.locator('[data-earnings-period="year"]')
  assert.equal(Number(await row.locator('td').nth(0).getAttribute('data-earnings-revenue')), y.knownRevenue)
  assert.equal(Number(await row.locator('td').nth(1).getAttribute('data-earnings-cost')), y.knownCosts)
  assert.equal(await row.locator('td').nth(2).getAttribute('data-earnings-cash'), y.cashSurplus === null ? null : String(y.cashSurplus))
  return e
}
async function overview() {
  const p = await active(), expected = independent(p), y = expected.periods.find(i => i.id === 'year')
  assert.equal(await page.locator('.fo-metrics article').count(), 4)
  assert.equal(Number(await page.locator('.fo-metrics article').nth(0).locator('strong').getAttribute('data-overview-construction')), expected.investment)
  assert.equal(Number(await page.locator('.fo-metrics article').nth(1).locator('strong').getAttribute('data-overview-revenue')), y.knownRevenue)
  assert.equal(await page.locator('.fo-metrics article').nth(2).locator('strong').getAttribute('data-overview-cash'), y.cashSurplus === null ? null : String(y.cashSurplus))
  assert.equal(await page.locator('.fo-metrics article').nth(3).locator('strong').getAttribute('data-overview-payback-years'), expected.payback === null ? null : String(expected.payback))
  return expected
}
async function rebase(p) { await importProject(p); original = await active(); await nav('收益与回本') }
async function openSaved(id) {
  const index = await page.evaluate(id => JSON.parse(localStorage.getItem('courtside-projects-v1')).findIndex(p => p.id === id), id)
  assert.ok(index >= 0)
  await button('切换项目').click(); await page.locator('.desktop-project-dropdown').getByRole('button').nth(index).click()
  await view('design'); assert.equal((await active()).id, id)
}
try {
  await page.goto(url); await button('更多设施').waitFor(); await importProject(fixture); original = await active()
  await check('the five planning section URLs reload into their own page without injecting optional settings or changing old data', async () => {
    const before = await active()
    for (const section of Object.keys(pages)) {
      await page.goto(sectionUrl(section)); await sectionIs(section)
      await page.reload(); await sectionIs(section)
      assert.deepEqual(await active(), before)
      assert.equal(Object.hasOwn(await active(), 'earnings'), false)
    }
    await button('方案检查').click(); assert.equal(await dialog().locator('[data-check-category="earnings"]').count(), 0)
    await button('返回设计', dialog()).click()
  })
  await check('navigation pushes matching sections and browser back/forward restore page and data', async () => {
    const before = await active(); await nav('场地设计'); await sectionIs('design')
    await nav('客房规划'); await sectionIs('rooms'); await nav('投资估算'); await sectionIs('budget')
    await page.goBack(); await sectionIs('rooms'); await page.goBack(); await sectionIs('design')
    await page.goForward(); await sectionIs('rooms'); await page.goForward(); await sectionIs('budget')
    await nav('收益与回本'); await sectionIs('earnings'); await page.reload(); await sectionIs('earnings')
    assert.deepEqual(await active(), before)
    await page.goto(url); await button('更多设施').waitFor(); assert.equal(await page.getByTestId('earnings-page').count(), 0)
  })
  await check('complete reference-source wage fixture produces exactly 696985 annual cash and four matching overview financial summaries', async () => {
    const p = structuredClone(fixture)
    p.earnings = { ...structuredClone(defaultSettings), extraDailyRevenue: 100, extraMonthlyCost: 1200, revenueDeductionRate: 5 }
    p.materials = [{ id: 'v3-material', materialId: 'custom-block', name: '3.0验收构件', x: 50, y: 50, z: 0, width: 1, depth: 1, height: 1, rotation: 0, color: '#b9b29e', unitPrice: 500, priceBasis: 'piece', taxMode: 'included', evidence }]
    p.materialBudgetIncluded = true
    await rebase(p); const e = await annual()
    assert.equal(e.periods.find(i => i.id === 'year').cashSurplus, 696985); assert.equal(e.investment, 46260)
    await nav('方案总览'); await overview(); await preserved(); await nav('收益与回本')
  })
  await check('quick wage null, zero and edited prices preserve original thirty-day quantities, tax, reference and staffing exactly', async () => {
    for (const price of [null, 0, 6000, 3000]) {
      const before = await active(); await set('工资快捷单价', price === null ? '' : price); await quickPatch(before, 'wages', 'unitPrice', price)
      const e = await annual()
      assert.equal((await active()).operating.days, 30); assert.equal((await active()).operating.staffCount, 2)
      if (price === null) { assert.equal(e.periods.find(i => i.id === 'year').cashSurplus, null); assert.match(await page.locator('.earnings-missing').textContent(), /工资运营单价/); assert.equal(await page.getByTestId('earnings-payback-chart').count(), 0) }
      else assert.equal(Number(await page.locator('[data-earnings-quick-cost="wages"] [data-quick-annual-cost]').getAttribute('data-quick-annual-cost')), cents(price * 365 / 30))
      if (price === 6000) assert.equal(e.periods.find(i => i.id === 'year').cashSurplus, 660485)
    }
    assert.deepEqual((await active()).operating, fixture.operating)
  })
  await check('quick included checkbox removes and restores only its cost while keeping the source and other settings', async () => {
    const before = await active(); await page.getByRole('checkbox', { name: '快捷计入工资' }).uncheck(); await settled(); await quickPatch(before, 'wages', 'included', false)
    assert.equal((await annual()).periods.find(i => i.id === 'year').cashSurplus, 733485)
    assert.match(await page.locator('[data-earnings-quick-cost="wages"]').textContent(), /未计入/)
    const unchecked = await active(); await page.getByRole('checkbox', { name: '快捷计入工资' }).check(); await settled(); await quickPatch(unchecked, 'wages', 'included', true)
    assert.equal((await annual()).periods.find(i => i.id === 'year').cashSurplus, 696985)
    assert.deepEqual((await active()).operating, fixture.operating)
  })
  await check('disabled operations remain disabled when quick prices change; only explicit enable calculates full cash', async () => {
    const p = await active(); p.operating.enabled = false; await rebase(p)
    const before = await active(); await set('工资快捷单价', 3500); await quickPatch(before, 'wages', 'unitPrice', 3500)
    assert.equal((await active()).operating.enabled, false); assert.equal((await annual()).periods.find(i => i.id === 'year').cashSurplus, null)
    await button('启用日常运营预算').click(); await settled(); assert.equal((await active()).operating.enabled, true)
    assert.notEqual((await annual()).periods.find(i => i.id === 'year').cashSurplus, null)
    await page.getByRole('checkbox', { name: '收益页计入运营预算' }).uncheck(); await settled(); assert.equal((await annual()).periods.find(i => i.id === 'year').cashSurplus, null)
    await page.getByRole('checkbox', { name: '收益页计入运营预算' }).check(); await set('工资快捷单价', 3000); original = await active(); await annual()
  })
  await check('three occupancy scenarios calculate independent temporary results and never overwrite source assumptions', async () => {
    const before = await active()
    for (const [id, rate] of [['low', 40], ['base', 50], ['high', 60]]) {
      const e = independent({ ...before, earnings: { ...before.earnings, occupancyRate: rate } }), y = e.periods.find(i => i.id === 'year'), row = page.locator(`[data-earnings-scenario="${id}"]`)
      assert.equal(Number(await row.getAttribute('data-scenario-occupancy')), rate)
      assert.equal(Number(await row.locator('[data-scenario-revenue]').getAttribute('data-scenario-revenue')), y.knownRevenue)
      assert.equal(Number(await row.locator('[data-scenario-cash]').getAttribute('data-scenario-cash')), y.cashSurplus)
      assert.equal(Number(await row.locator('[data-scenario-payback]').getAttribute('data-scenario-payback')), e.payback)
    }
    assert.deepEqual(await active(), before)
  })
  await check('scenario edges clamp at zero and one hundred while preserving the saved base occupancy', async () => {
    for (const [rate, low, high] of [[5, 0, 15], [95, 85, 100]]) {
      await set('收益测算入住率', rate); const before = await active()
      for (const [id, occ] of [['low', low], ['base', rate], ['high', high]]) assert.equal(Number(await page.locator(`[data-earnings-scenario="${id}"]`).getAttribute('data-scenario-occupancy')), occ)
      assert.deepEqual(await active(), before)
    }
    await set('收益测算入住率', 50); await annual()
  })
  await check('unknown operating costs propagate to scenario, overview and earnings checks; check action opens the earnings page', async () => {
    await set('水电快捷单价', ''); await annual()
    for (const row of await page.locator('[data-earnings-scenario]').all()) { assert.equal(await row.locator('[data-scenario-cash]').count(), 0); assert.equal(await row.locator('[data-scenario-payback]').count(), 0); assert.match(await row.textContent(), /待补齐收入与成本/) }
    await nav('方案总览'); await overview()
    assert.match(await page.locator('.fo-metrics article').nth(2).textContent(), /待补齐|待填写/)
    assert.match(await page.locator('.fo-metrics article').nth(3).textContent(), /待补齐|待填写/)
    await button('方案检查').click(); const tasks = dialog().locator('[data-check-category="earnings"]'); assert.ok(await tasks.count() > 0)
    assert.match(await tasks.first().textContent(), /水电|收益|成本/)
    await tasks.first().locator('.pc-action').click(); await sectionIs('earnings'); assert.equal(await dialog().count(), 0)
    await set('水电快捷单价', 3000); original = await active(); assert.equal((await annual()).periods.find(i => i.id === 'year').cashSurplus, 696985)
  })
  await check('1100px Web keeps save, export and fullscreen buttons reachable without document overflow on each planning page', async () => {
    await page.setViewportSize({ width: 1100, height: 850 })
    for (const [section, name] of Object.entries(pages)) {
      await nav(name); await sectionIs(section)
      for (const label of ['保存方案', '导出方案', '进入屏幕全屏']) {
        const control = page.locator('.desktop-header').getByRole('button', { name: label, exact: true }), box = await control.boundingBox()
        assert.ok(await control.isVisible() && box && box.x >= 0 && box.y >= 0 && box.x + box.width <= 1100 && box.y + box.height <= 850, label + ' outside viewport')
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' overflow')
    }
    await screenshot('version-3-web-1100.png'); await page.setViewportSize({ width: 1512, height: 982 }); await nav('场地设计')
  })
  await check('H-tool left dragging and select-tool middle dragging over material pan the canvas without opening an editor or changing geometry', async () => {
    await button('2D 平面').click(); const before = await active()
    const material = page.locator('[data-site-material="v3-material"]'), scene = page.locator('#site-plan-svg > g[transform]')
    for (const [key, mouseButton] of [['h', 'left'], ['v', 'middle']]) {
      await button('适应画布').click(); await page.keyboard.press(key)
      const start = await scene.getAttribute('transform'), box = await material.locator('rect').first().boundingBox()
      assert.ok(box); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down({ button: mouseButton })
      await page.mouse.move(box.x + box.width / 2 + 48, box.y + box.height / 2 + 24, { steps: 8 }); await page.mouse.up({ button: mouseButton }); await settled()
      assert.notEqual(await scene.getAttribute('transform'), start); assert.equal(await dialog().count(), 0); assert.deepEqual(await active(), before)
    }
  })
  await check('select-tool left click and Enter still open the material editor with the intended piece selected', async () => {
    await button('适应画布').click(); await page.keyboard.press('v')
    const material = page.locator('[data-site-material="v3-material"]'), before = await active()
    await material.locator('rect').first().click(); await dialog().getByRole('heading', { name: '建材拼搭工作台' }).waitFor()
    assert.equal(await dialog().locator('input[aria-label="材料名称"]').inputValue(), '3.0验收构件')
    await button('关闭建材工作台', dialog()).click(); await material.focus(); await material.press('Enter'); await dialog().waitFor()
    assert.equal(await dialog().locator('input[aria-label="材料名称"]').inputValue(), '3.0验收构件')
    await button('关闭建材工作台', dialog()).click(); assert.deepEqual(await active(), before)
  })
  await check('numeric draft range feedback explains invalid input and clamp-on-blur while valid decimals and Escape remain compatible', async () => {
    await button('场地信息').click(); const f = field('用地宽度')
    await f.fill('12'); assert.equal(await f.getAttribute('aria-invalid'), 'true'); assert.equal((await active()).siteWidth, 100)
    await f.press('Tab'); await settled(); assert.equal(Number(await f.inputValue()), 30)
    assert.match(await f.locator('xpath=../..').textContent(), /已调整为允许范围/)
    await f.fill('100.25'); await f.press('Tab'); await settled(); assert.equal((await active()).siteWidth, 100.25)
    await f.focus(); await f.fill('44.25'); await f.press('Escape'); await settled(); assert.equal((await active()).siteWidth, 100.25)
    await f.fill(''); assert.equal(await f.getAttribute('aria-invalid'), 'true'); await f.press('Tab'); assert.equal(Number(await f.inputValue()), 100.25)
    assert.match(await f.locator('xpath=../..').textContent(), /输入无效，已恢复/)
  })
  await check('exports read the latest committed pending field and match current overview, earnings CSV and offline report amounts', async () => {
    await field('用地宽度').fill('1400'); await button('导出方案').click()
    const json = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'version-3-fresh-snapshot.json'))
    assert.equal(json.siteWidth, 1000); assert.equal((await active()).siteWidth, 1000)
    await field('用地宽度').fill('100'); await field('用地宽度').press('Tab'); await settled(); await nav('收益与回本')
    await field('其他每日营业收入').fill('123.45')
    const csv = await download(() => button('导出收益测算').click(), 'version-3-earnings.csv'), rows = csvRows(csv), expected = independent(await active()), y = expected.periods.find(i => i.id === 'year')
    assert.equal((await active()).earnings.extraDailyRevenue, 123.45)
    assert.equal(Number(rows.find(r => r[0] === '年')[4]), y.knownRevenue); assert.equal(Number(rows.find(r => r[0] === '年')[10]), y.cashSurplus)
    await nav('方案总览'); await overview(); const report = await download(() => button('导出方案报告').click(), 'version-3-report.html')
    const offline = await context.newPage(); await context.setOffline(true)
    try { await offline.setContent(report); assert.equal(Number(await offline.locator('[data-report-earnings-period="year"] [data-report-earnings-cash]').getAttribute('data-report-earnings-cash')), y.cashSurplus); assert.equal(Number(await offline.locator('[data-report-earnings-investment]').getAttribute('data-report-earnings-investment')), 46260) }
    finally { await context.setOffline(false); await offline.close() }
    await nav('收益与回本'); await set('其他每日营业收入', 100); await annual()
  })
  await check('save-as, exported JSON re-import and two reloads preserve complete source structures and current section', async () => {
    await button('保存方案').click(); await settled(); const before = await active(); await button('导出方案').click()
    const archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'version-3-project.json')); assert.deepEqual(archive, before)
    // Import a different saved monthly cost while the old page input still has
    // focus. Its blur must never overwrite the newly imported project.
    await field('其他每月运营支出').fill('900')
    assert.equal((await active()).earnings.extraMonthlyCost, 900)
    await importProject(archive); const imported = await active(); assert.notEqual(imported.id, archive.id)
    for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual(imported[key], archive[key])
    const oldSaved = await page.evaluate(id => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === id), before.id)
    assert.equal(oldSaved.earnings.extraMonthlyCost, 900)
    await openSaved(before.id); await page.reload(); await view('design'); assert.equal((await active()).earnings.extraMonthlyCost, 900)
    await openSaved(imported.id); await page.reload(); await view('design'); assert.deepEqual((await active()).earnings, archive.earnings)
    await button('另存为新方案').click(); await dialog().getByRole('textbox', { name: '新方案名称' }).fill('3.0隔离验收副本'); await button('保存副本', dialog()).click(); await settled()
    saved = await active(); assert.notEqual(saved.id, imported.id); await nav('收益与回本')
    for (let i = 0; i < 2; i++) { await page.reload(); await sectionIs('earnings'); for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual((await active())[key], saved[key]); await annual() }
    await page.getByTestId('earnings-page').scrollIntoViewIfNeeded(); await screenshot('version-3-earnings.png')
  })
  await check('390px mobile supports the five planning routes, temporary comparisons and quick costs without overflow, data loss or runtime errors', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); const mobile = new URL(url); mobile.pathname = '/mobile'; mobile.search = ''; await page.goto(mobile.href); await button('更多设施').waitFor()
    for (const [section, name] of Object.entries(pages)) {
      if (await button('返回项目导航').isVisible()) await button('返回项目导航').click()
      await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name, exact: true }).click(); await sectionIs(section)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' mobile overflow')
      if (section === 'earnings') { await annual(); assert.equal(await page.locator('[data-earnings-scenario]').count(), 3); assert.equal(await field('工资快捷单价').isVisible(), true); await screenshot('version-3-mobile.png') }
    }
    for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual((await active())[key], saved[key])
    assert.deepEqual(runtimeErrors, []); assert.equal(await button('重新加载此页').count(), 0)
  })
} catch (error) {
  const trace = String(error.stack || error).split('\n')
  failures.push({ name: currentCheck, assertion: String(error.message || error), position: trace.find(line => line.includes('verify-version-3.mjs:'))?.trim() || 'scripts/verify-version-3.mjs', keyLines: trace.slice(0, 20) })
  console.error('FAIL ' + currentCheck + '\n' + trace.slice(0, 20).join('\n'))
  await page.screenshot({ path: 'test-results/version-3-failure.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  const result = { total: TOTAL, passed: passed.length, failed: failures.length, skipped: Math.max(0, TOTAL - passed.length - failures.length), exitCode: process.exitCode || 0, checks: passed, failures, runtimeErrors }
  writeFileSync('test-results/version-3-results.json', JSON.stringify(result, null, 2))
  console.log(`Version 3 verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`)
  await browser.close()
}
