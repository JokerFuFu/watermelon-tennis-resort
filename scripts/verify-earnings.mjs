import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Isolated context only. No native-tab access, no source calculator imports,
// no storage writes: fixtures enter through the normal JSON import interface.
const TOTAL = 19
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
  version: 1, id: 'earnings-old-project-example', name: '收益与回本隔离验收示例', location: '北京', siteWidth: 100, siteDepth: 100, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [{ id: 'earnings-old-hotel', type: 'hotel', presetId: 'hotel', name: '原客房楼', x: 10, y: 10, width: 20, depth: 20, floors: 1, rooms: 7, roomMix: { standard: 4, deluxe: 2, suite: 1 }, unitCost: 100, rotation: 0 }],
  budget: { construction: 'simulation', grade: 'standard', designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: 0, siteAmount: 0, connectionAmount: 0, openingAmount: 0 },
  operating: { enabled: true, days: 30, guestMode: 'rooms', occupancyRate: 50, guestsPerRoom: 2, dailyGuests: 0, staffCount: 0, items: [
    { id: 'water', label: '饮用水', included: true, basis: 'personDay', quantity: 2, unit: '瓶', unitPrice: 2, taxMode: 'included', evidence },
    { id: 'wages', label: '工资', included: true, basis: 'period', quantity: 1, unit: '期间', unitPrice: 30000, taxMode: 'included', evidence },
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
async function totals(expectedAnnual) {
  const p = await active(), expected = independent(p), s = p.earnings ?? defaultSettings
  const incomeIncomplete = s.extraDailyRevenue === null || Object.keys(expected.available).some(k => expected.available[k] > 0 && s.roomRates[k] === null)
  for (const item of expected.periods) {
    const row = page.locator(`[data-earnings-period="${item.id}"]`), cells = row.locator('td')
    assert.equal(await cells.nth(0).getAttribute('data-earnings-revenue'), incomeIncomplete ? null : String(item.knownRevenue), item.id + ' revenue')
    assert.equal(Number(await cells.nth(1).getAttribute('data-earnings-cost')), item.knownCosts, item.id + ' known costs')
    assert.equal(await cells.nth(2).getAttribute('data-earnings-cash'), item.cashSurplus === null ? null : String(item.cashSurplus), item.id + ' complete cash')
    if (item.cashSurplus === null) assert.match(await cells.nth(2).textContent(), /待补齐/)
  }
  const investment = page.locator('.earnings-investment-value')
  assert.equal(await investment.getAttribute('data-earnings-investment'), expected.investment === null ? null : String(expected.investment))
  const status = expected.investment === null || expected.investment <= 0 ? 'no-investment' : expected.periods.find(i => i.id === 'year').cashSurplus === null ? 'incomplete' : expected.periods.find(i => i.id === 'year').cashSurplus <= 0 ? 'nonpositive' : 'ready'
  assert.equal(await page.locator('[data-payback-status]').getAttribute('data-payback-status'), status)
  const attr = await page.locator('[data-payback-status]').getAttribute('data-payback-years')
  if (expected.payback === null) assert.equal(attr, null)
  else assert.ok(Math.abs(Number(attr) - expected.payback) < 1e-10, 'Payback must divide by cash surplus, not revenue')
  if (expectedAnnual !== undefined) assert.equal(expected.periods.find(i => i.id === 'year').cashSurplus, expectedAnnual)
  return expected
}
async function knownSettings() {
  await set('其他每日营业收入', 100); await set('其他每月运营支出', 1200); await set('营业额费用预留比例', 5)
}
async function rebase(p) { await importProject(p); original = await active(); await nav('收益与回本') }
try {
  await check('direct earnings query opens the page, survives reload and keeps preview settings unsaved while the base URL opens design', async () => {
    const direct = new URL(url); direct.searchParams.set('section', 'earnings')
    await page.goto(direct.href); await page.getByTestId('earnings-page').waitFor(); await settled()
    const before = await active(); assert.equal(Object.hasOwn(before, 'earnings'), false)
    await page.reload(); await page.getByTestId('earnings-page').waitFor(); await settled()
    assert.deepEqual(await active(), before); assert.equal(Object.hasOwn(await active(), 'earnings'), false)
    await page.goto(url); await button('更多设施').waitFor(); await settled()
    assert.equal(await page.getByTestId('earnings-page').count(), 0)
    assert.deepEqual(await active(), before)
  })
  await check('legacy project previews earnings without injecting settings or changing saved rooms, construction or consumption', async () => {
    await importProject(fixture); original = await active(); await nav('收益与回本'); await page.getByTestId('earnings-page').waitFor()
    assert.equal(Object.hasOwn(await active(), 'earnings'), false)
    assert.deepEqual(await active(), original)
    assert.equal(await field('收益测算入住率').inputValue(), '50'); assert.equal(await field('收益测算每间宾客数').inputValue(), '2')
    for (const [label, amount] of [['标准间每晚房价', 500], ['景观房每晚房价', 700], ['套房每晚房价', 1000]]) assert.equal(Number(await field(label).inputValue()), amount)
    await preserved()
  })
  await check('incomplete preview distinguishes turnover from complete cash and suppresses numeric payback and recovery curve', async () => {
    await totals(); assert.match(await page.locator('.earnings-missing').textContent(), /额外月支出/)
    assert.match(await page.locator('.earnings-missing').textContent(), /比例/)
    assert.equal(await page.getByTestId('earnings-payback-chart').count(), 0)
    assert.match(await page.getByTestId('earnings-page').textContent(), /不是北京市场报价/)
    assert.match(await page.getByTestId('earnings-page').textContent(), /不等同于会计净利润/)
    assert.equal(Object.hasOwn(await active(), 'earnings'), false)
  })
  await check('complete seven-room fixture yields 2200 daily room revenue, 2300 turnover and 371405 annual operating cash', async () => {
    await knownSettings(); const expected = await totals(371405)
    assert.equal(expected.occupied, 3.5); assert.equal(expected.periods.find(i => i.id === 'day').roomRevenue, 2200)
    assert.equal(expected.periods.find(i => i.id === 'day').knownRevenue, 2300)
    assert.equal(Number(await page.locator('[data-earnings-period="year"] [data-earnings-cash]').getAttribute('data-earnings-cash')), 371405)
    assert.equal(await page.getByTestId('earnings-payback-chart').count(), 1)
    assert.equal((await active()).earnings.occupancyRate, 50); await preserved()
  })
  await check('day, week, mean-month and year tabs display independent period maths with no month-times-thirty shortcut', async () => {
    const expected = await totals(371405)
    for (const [id, label] of [['day', '日'], ['week', '周'], ['month', '月'], ['year', '年']]) {
      await button('查看' + label + '收益').click(); const selected = page.locator(`[data-selected-earnings-period="${id}"]`), p = expected.periods.find(i => i.id === id)
      assert.equal(Number(await selected.locator('[data-earnings-revenue]').getAttribute('data-earnings-revenue')), p.knownRevenue)
      assert.equal(Number(await selected.locator('[data-earnings-cost]').getAttribute('data-earnings-cost')), p.knownCosts)
      assert.equal(Number(await selected.locator('[data-earnings-cash]').getAttribute('data-earnings-cash')), p.cashSurplus)
      assert.equal(await button('查看' + label + '收益').getAttribute('aria-pressed'), 'true')
    }
    assert.equal(expected.periods.find(i => i.id === 'month').days, 365 / 12)
    // Independently rounded monthly components yield 30,950.41; multiplying
    // by twelve gives 371,404.92 versus the separately calculated 371,405 year.
    assert.equal(cents(expected.periods.find(i => i.id === 'month').cashSurplus * 12 - 371405), -.08)
  })
  await check('water follows guest person-days while wages and utilities divide the original thirty-day period exactly once', async () => {
    const annual = { water: 10220, wages: 365000, utilities: 36500, 'earnings-extra-cost': 14400, 'earnings-deductions': 41975 }
    for (const [id, amount] of Object.entries(annual)) {
      const costRow = page.locator(`[data-earnings-cost-item="${id}"]`)
      const amountCell = id.startsWith('earnings-') ? costRow.locator('td').nth(2) : costRow.locator('[data-quick-annual-cost]')
      const text = await amountCell.textContent()
      assert.equal(Number(text.replace(/[^0-9.-]/g, '')), amount, id)
    }
    assert.match(await page.locator('[data-earnings-cost-item="wages"]').textContent(), /原 30 天期间用量 .*按天数均摊/)
    const expected = await totals(); assert.equal(expected.periods.find(i => i.id === 'day').operatingCost, 1128)
    assert.equal(expected.periods.find(i => i.id === 'year').knownCosts, 468095); await preserved()
  })
  await check('unavailable standard rooms reduce sellable inventory and guest consumption without rewriting hotel room mix', async () => {
    await set('标准间停用房数', 1); const expected = await totals()
    assert.equal(expected.available.standard, 3); assert.equal(expected.occupied, 3)
    assert.equal(expected.periods.find(i => i.id === 'day').roomRevenue, 1950); assert.equal(expected.periods.find(i => i.id === 'day').operatingCost, 1124)
    assert.match(await page.locator('.earnings-assumptions .section-heading').textContent(), /可售 6 间/)
    await preserved(); await set('标准间停用房数', 0); await totals(371405)
  })
  await check('invalid negative, excessive and fractional inventory values show errors and retain the last valid saved settings', async () => {
    const before = (await active()).earnings
    for (const [label, value] of [['标准间停用房数', 5], ['景观房停用房数', .5], ['收益测算入住率', 101], ['标准间每晚房价', -1]]) {
      await set(label, value); assert.equal(await field(label).getAttribute('aria-invalid'), 'true', label)
      assert.deepEqual((await active()).earnings, before)
      await set(label, label === '收益测算入住率' ? 50 : label === '标准间每晚房价' ? 500 : 0)
    }
    await totals(371405); await preserved()
  })
  await check('unknown room price keeps known-revenue breakdown visible but blocks full cash and numeric payback', async () => {
    await set('标准间每晚房价', ''); assert.equal((await active()).earnings.roomRates.standard, null)
    await totals(); assert.match(await page.locator('.earnings-missing').textContent(), /标准间每晚房价/)
    assert.match(await page.locator('[data-earnings-period="year"]').textContent(), /已填/)
    assert.equal(await page.getByTestId('earnings-payback-chart').count(), 0)
    await set('标准间每晚房价', 500); await totals(371405)
  })
  await check('explicit zero room price is a real zero rate, while only active sellable inventory requires its missing price', async () => {
    await set('标准间每晚房价', 0); const expected = await totals()
    assert.equal((await active()).earnings.roomRates.standard, 0); assert.equal(expected.periods.find(i => i.id === 'day').roomRevenue, 1200)
    assert.equal(await page.locator('.earnings-missing').count(), 0)
    await set('标准间每晚房价', ''); await set('标准间停用房数', 4); await totals()
    assert.doesNotMatch(await page.locator('.earnings-checks').textContent(), /标准间每晚房价尚未填写/)
    await set('标准间每晚房价', 500); await set('标准间停用房数', 0); await totals(371405)
  })
  await check('editing an unknown operating price blocks complete earnings without disguising it as zero; restoring price recovers results', async () => {
    await button('编辑日常运营成本').click(); await page.getByTestId('operating-panel').waitFor()
    await set('水电单价', ''); assert.equal((await active()).operating.items.find(i => i.id === 'utilities').unitPrice, null)
    original = await active(); await nav('收益与回本'); await totals(); assert.match(await page.locator('.earnings-missing').textContent(), /水电运营单价/)
    await preserved(); await button('编辑日常运营成本').click(); await set('水电单价', 3000)
    original = await active(); await nav('收益与回本'); await totals(371405)
    assert.deepEqual(original.operating, fixture.operating)
  })
  await check('unknown other revenue, monthly expense and revenue reserve remain null instead of complete zero-cost profit', async () => {
    for (const [label, key, restored] of [['其他每日营业收入', 'extraDailyRevenue', 100], ['其他每月运营支出', 'extraMonthlyCost', 1200], ['营业额费用预留比例', 'revenueDeductionRate', 5]]) {
      await set(label, ''); assert.equal((await active()).earnings[key], null); await totals()
      assert.equal(await page.locator('[data-payback-status]').getAttribute('data-payback-status'), 'incomplete')
      assert.equal(await page.getByTestId('earnings-payback-chart').count(), 0)
      await set(label, restored); await totals(371405)
    }
    await preserved()
  })
  await check('negative and zero annual cash show no finite payback rather than dividing investment by turnover', async () => {
    await set('收益测算入住率', 0); await set('其他每日营业收入', 0); await totals()
    assert.equal(await page.locator('[data-payback-status]').getAttribute('data-payback-status'), 'nonpositive')
    assert.match(await page.locator('[data-payback-status]').textContent(), /无法回本/)
    assert.equal(await page.getByTestId('earnings-payback-chart').count(), 0)
    const zero = await active(); zero.operating.items.forEach(i => { i.unitPrice = 0 }); zero.earnings.extraMonthlyCost = 0
    await rebase(zero); const expected = await totals(0); assert.equal(expected.periods.find(i => i.id === 'year').knownRevenue, 0)
    assert.equal(await page.locator('[data-payback-status]').getAttribute('data-payback-status'), 'nonpositive')
    const restored = { ...structuredClone(fixture), earnings: { ...structuredClone(defaultSettings), extraDailyRevenue: 100, extraMonthlyCost: 1200, revenueDeductionRate: 5 } }
    await rebase(restored); await totals(371405)
  })
  await check('manual investment computes static cash payback while blank/zero investment and missing construction scope are explicitly flagged', async () => {
    await page.getByRole('combobox', { name: '回本投资口径' }).selectOption('manual'); await set('完整初始投资', 3000000)
    const expected = await totals(371405); assert.equal(expected.payback, 3000000 / 371405)
    await set('完整初始投资', ''); await totals(); assert.equal(await page.locator('[data-payback-status]').getAttribute('data-payback-status'), 'no-investment')
    await set('完整初始投资', 0); await totals(); assert.equal(await page.getByTestId('earnings-payback-chart').count(), 0)
    await page.getByRole('combobox', { name: '回本投资口径' }).selectOption('construction'); await totals(371405)
    const incomplete = await active(); incomplete.budget.landAmount = null; await rebase(incomplete); await totals(371405)
    assert.match(await page.locator('[data-payback-status]').textContent(), /暂估/)
    const restored = await active(); restored.budget.landAmount = 0; await rebase(restored); await totals(371405)
  })
  await check('initial capital includes opted-in material procurement once and excludes original operating-period consumption', async () => {
    const p = await active(); p.materials = [{ id: 'earnings-material-example', materialId: 'custom-block', name: '收益资本验收构件', x: 50, y: 50, z: 0, width: 1, depth: 1, height: 1, rotation: 0, color: '#b9b29e', unitPrice: 500, priceBasis: 'piece', taxMode: 'included', evidence }]; p.materialBudgetIncluded = true
    await rebase(p); const expected = await totals(371405)
    assert.equal(expected.investment, 46260)
    assert.notEqual(expected.investment, 46260 + 33840, 'Initial capital must not include the original 30-day operating total')
    await button('编辑日常运营成本').click(); await page.getByRole('checkbox', { name: '计入建材采购预算' }).uncheck(); await settled()
    original = await active(); await nav('收益与回本'); assert.equal((await totals(371405)).investment, 45760)
    await button('编辑日常运营成本').click(); await page.getByRole('checkbox', { name: '计入建材采购预算' }).check(); await settled(); original = await active()
    await nav('收益与回本'); assert.equal((await totals(371405)).investment, 46260); await preserved()
  })
  await check('earnings CSV and offline report agree with the screen for all four periods, capital, payback and source scopes', async () => {
    const expected = await totals(371405), p = await active()
    const csv = await download(() => button('导出收益测算').click(), 'earnings-results.csv'), rows = csvRows(csv)
    for (const period of expected.periods) {
      const label = { day: '日', week: '周', month: '平均月', year: '年' }[period.id], row = rows.find(r => r[0] === label)
      assert.ok(row, label); assert.equal(Number(row[1]), period.days); assert.equal(Number(row[4]), period.knownRevenue); assert.equal(Number(row[8]), period.knownCosts); assert.equal(Number(row[10]), period.cashSurplus)
    }
    assert.equal(Number(rows.find(r => r[0] === '初始投资元')[1]), 46260)
    assert.equal(Number(rows.find(r => r[0] === '静态回本年数')[1]), 46260 / 371405)
    assert.match(csv, /不是会计净利润/); assert.match(csv, /原 30 天期间费用均摊/)
    await nav('方案总览'); const report = await download(() => button('导出方案报告').click(), 'earnings-report.html')
    const offline = await context.newPage(); await context.setOffline(true)
    try {
      await offline.setContent(report); assert.equal(await offline.locator('[data-report-earnings="true"]').count(), 1)
      for (const period of expected.periods) {
        const row = offline.locator(`[data-report-earnings-period="${period.id}"]`)
        assert.equal(Number(await row.locator('[data-report-earnings-revenue]').getAttribute('data-report-earnings-revenue')), period.knownRevenue)
        assert.equal(Number(await row.locator('[data-report-earnings-cost]').getAttribute('data-report-earnings-cost')), period.knownCosts)
        assert.equal(Number(await row.locator('[data-report-earnings-cash]').getAttribute('data-report-earnings-cash')), period.cashSurplus)
      }
      assert.equal(Number(await offline.locator('[data-report-earnings-investment]').getAttribute('data-report-earnings-investment')), 46260)
      assert.equal(Number(await offline.locator('[data-report-payback-years]').getAttribute('data-report-payback-years')), 46260 / 371405)
      assert.match(await offline.locator('[data-report-earnings]').textContent(), /经营结余不再重复扣建设投入/)
    } finally { await context.setOffline(false); await offline.close() }
    assert.deepEqual(await active(), p); await nav('收益与回本')
  })
  await check('save, JSON export/import and save-as preserve earnings and source budgets with independent project identities', async () => {
    await button('保存方案').click(); await settled(); const p = await active(); await button('导出方案').click()
    const archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'earnings-project.json')); assert.deepEqual(archive, p)
    await importProject(archive); const imported = await active(); assert.notEqual(imported.id, archive.id)
    for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual(imported[key], archive[key])
    await button('另存为新方案').click(); await dialog().getByRole('textbox', { name: '新方案名称' }).fill('收益与回本验收副本'); await button('保存副本', dialog()).click(); await settled()
    saved = await active(); assert.notEqual(saved.id, imported.id)
    for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual(saved[key], archive[key])
    original = saved; await nav('收益与回本'); await totals(371405)
  })
  await check('two actual reloads restore exact earnings, room inventory, operating quantities and positive cash payback', async () => {
    for (let i = 0; i < 2; i++) {
      await page.reload(); await page.getByTestId('earnings-page').waitFor(); await settled()
      for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual((await active())[key], saved[key])
      await nav('收益与回本'); await totals(371405)
    }
    await button('查看年收益').click(); await page.getByTestId('earnings-page').scrollIntoViewIfNeeded(); await screenshot('earnings-desktop.png')
  })
  await check('390px mobile reaches five planning navigation pages and earnings controls without horizontal document overflow or runtime errors', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url.replace(/\/web\/?$/, '/mobile')); await button('更多设施').waitFor()
    for (const name of ['场地设计', '客房规划', '投资估算', '收益与回本', '方案总览']) {
      if (await button('返回项目导航').isVisible()) await button('返回项目导航').click()
      await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name, exact: true }).click(); await settled()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name + ' document overflows')
      if (name === '收益与回本') {
        await page.getByTestId('earnings-page').waitFor(); await totals(371405)
        for (const label of ['日', '周', '月', '年']) { await button('查看' + label + '收益').click(); assert.equal(await button('查看' + label + '收益').getAttribute('aria-pressed'), 'true') }
        await page.getByTestId('earnings-page').scrollIntoViewIfNeeded(); await screenshot('earnings-mobile.png')
      }
    }
    for (const key of ['earnings', 'facilities', 'operating', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual((await active())[key], saved[key])
    assert.deepEqual(runtimeErrors, []); assert.equal(await button('重新加载此页').count(), 0)
  })
} catch (error) {
  const trace = String(error.stack || error).split('\n')
  failures.push({ name: currentCheck, assertion: String(error.message || error), position: trace.find(line => line.includes('verify-earnings.mjs:'))?.trim() || 'scripts/verify-earnings.mjs', keyLines: trace.slice(0, 20) })
  console.error('FAIL ' + currentCheck + '\n' + trace.slice(0, 20).join('\n'))
  await page.screenshot({ path: 'test-results/earnings-failure.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  const result = { total: TOTAL, passed: passed.length, failed: failures.length, skipped: Math.max(0, TOTAL - passed.length - failures.length), exitCode: process.exitCode || 0, checks: passed, failures, runtimeErrors }
  writeFileSync('test-results/earnings-results.json', JSON.stringify(result, null, 2))
  console.log(`Earnings verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`)
  await browser.close()
}
