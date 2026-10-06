import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Isolated context only. No native-tab access, no source calculator imports,
// no storage writes: fixtures enter through the normal JSON import interface.
const TOTAL = 20
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(10000)
const passed = [], failures = [], runtimeErrors = []
let currentCheck = 'setup', original, saved, known, courtItemId
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = (name, root = page) => root.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const field = name => page.locator(`input[aria-label="${name}"]`)
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const cents = n => Math.round((n + Number.EPSILON) * 100) / 100
const evidence = { kind: 'assumption', name: '隔离验收示例价', scope: '仅验证计算，不是北京市场房价或采购报价' }
const fixture = {
  version: 1, id: 'version-3-old-project', name: '3.1月度经营隔离验收示例', location: '北京', siteWidth: 100, siteDepth: 100, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [
    { id: 'monthly-hotel', type: 'hotel', presetId: 'hotel', name: '原客房楼', x: 10, y: 10, width: 20, depth: 20, floors: 1, rooms: 7, roomMix: { standard: 4, deluxe: 2, suite: 1 }, unitCost: 100, rotation: 0 },
    { id: 'monthly-court', type: 'court', presetId: 'hard-court', name: '验收网球场', x: 40, y: 10, width: 18.29, depth: 36.58, floors: 1, rooms: 0, unitCost: 1000, rotation: 0, surface: 'hard' },
    { id: 'monthly-mahjong', type: 'restaurant', presetId: 'mahjong-room', name: '验收麻将包厢', x: 70, y: 10, width: 8, depth: 7, floors: 1, rooms: 0, unitCost: 0, rotation: 0 },
    { id: 'monthly-auction', type: 'restaurant', presetId: 'auction-hall', name: '验收拍卖厅', x: 10, y: 50, width: 30, depth: 20, floors: 1, rooms: 0, unitCost: 0, rotation: 0 },
    { id: 'monthly-parking', type: 'parking', presetId: 'parking', name: '验收停车区', x: 70, y: 60, width: 15, depth: 20, floors: 1, rooms: 0, unitCost: 0, rotation: 0 },
  ],
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
function csvRows(csv) { return csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""', '"'))) }
async function settled() { await page.waitForFunction(() => !document.querySelector('.save-status.pending')); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
async function check(name, action) { currentCheck = name; await action(); passed.push(name); console.log('PASS ' + name) }
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click(); await settled() }
async function set(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); await settled() }
async function importProject(p) { await page.locator('input[type=file]').setInputFiles({ name: 'earnings-example.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) }); await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled() }
async function download(action, filename) { const pending = page.waitForEvent('download'); await action(); const d = await pending; await d.saveAs(resolve('test-results', filename)); return readFileSync(resolve('test-results', filename), 'utf8') }
async function preserved() { const p = await active(); for (const key of ['facilities', 'operating', 'budget']) assert.deepEqual(p[key], original[key], key + ' source changed through earnings preview') }
async function screenshot(name) { if (await dialog().count() === 0 && await button('关闭提示').isVisible()) await button('关闭提示').click(); await page.evaluate(() => Promise.all([...document.getAnimations()].map(a => a.finished.catch(() => {})))); await page.screenshot({ path: resolve('test-results', name), fullPage: false }) }
const monthAt = (start, offset) => { const [y, m] = start.split('-').map(Number); return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0, 7) }
const daysIn = month => { const [y, m] = month.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate() }
function completeFixture() {
  const p = structuredClone(fixture)
  p.earnings = { ...structuredClone(defaultSettings), extraDailyRevenue: 100, extraMonthlyCost: 1200, revenueDeductionRate: 5 }
  p.materials = [{ id: 'monthly-material', materialId: 'custom-block', name: '月度资本验收构件', x: 50, y: 50, z: 0, width: 1, depth: 1, height: 1, rotation: 0, color: '#b9b29e', unitPrice: 500, priceBasis: 'piece', taxMode: 'included', evidence }]
  p.materialBudgetIncluded = true
  p.monthlyPlan = { enabled: false, startMonth: '2027-01', horizonYears: 2, facilityItems: [{ id: 'monthly-court-charge', facilityId: 'monthly-court', label: '网球场时租', included: true, unit: 'hour', capacityPerDay: 4, utilizationRates: Array(12).fill(50), unitPrice: 100, directUnitCost: 10, fixedMonthlyCost: 200, evidence }], months: Array.from({ length: 12 }, (_, i) => {
    const month = monthAt('2027-01', i)
    return { month, openDays: daysIn(month), occupancyRate: 50, roomRates: { standard: 500, deluxe: 700, suite: 1000 }, extraDailyRevenue: 100, extraFixedCost: 1200 }
  }) }
  return p
}
function independent(p) {
  const s = p.monthlyPlan, e = p.earnings, o = p.operating
  const counts = { standard: 0, deluxe: 0, suite: 0 }
  for (const f of p.facilities.filter(i => i.type === 'hotel')) for (const key of Object.keys(counts)) counts[key] += (f.roomMix ?? { standard: f.rooms, deluxe: 0, suite: 0 })[key]
  const available = Object.fromEntries(Object.keys(counts).map(k => [k, Math.max(0, counts[k] - e.unavailableRooms[k])]))
  const roomCount = Object.values(available).reduce((a, b) => a + b, 0)
  const engineering = p.facilities.reduce((a, f) => a + (f.type === 'court' ? f.unitCost : f.width * f.depth * (f.type === 'hotel' || f.type === 'restaurant' ? f.floors : 1) * f.unitCost), 0)
  const b = p.budget, design = cents(engineering * b.designRate / 100), supervisor = cents(engineering * b.supervisionRate / 100)
  const reserve = cents((engineering + design + supervisor + (b.siteAmount || 0) + (b.connectionAmount || 0)) * b.reserveRate / 100)
  const capital = cents(engineering + design + supervisor + reserve + (b.landAmount || 0) + (b.siteAmount || 0) + (b.connectionAmount || 0) + (b.openingAmount || 0) + (p.materialBudgetIncluded ? (p.materials ?? []).reduce((a, m) => a + (m.unitPrice ?? 0), 0) : 0))
  const investment = e.investmentMode === 'manual' ? e.manualInvestment : capital
  const investmentIncomplete = e.investmentMode === 'construction' && ['landAmount', 'siteAmount', 'connectionAmount', 'openingAmount'].some(k => b[k] === null)
  let cumulative = 0, paybackMonth = null, paybackYears = null
  const forecast = Array.from({ length: s.horizonYears * 12 }, (_, index) => {
    const m = s.months[index % 12], month = monthAt(s.startMonth, index), calendarDays = daysIn(month), openDays = Math.min(m.openDays, calendarDays)
    let missing = !o.enabled || e.revenueDeductionRate === null || Object.keys(counts).some(k => e.unavailableRooms[k] > counts[k])
    let knownRoom = 0, roomMissing = false
    for (const key of Object.keys(counts)) {
      const q = available[key] * m.occupancyRate / 100 * openDays
      if (q > 0 && m.roomRates[key] === null) roomMissing = true
      knownRoom += cents(q * (m.roomRates[key] ?? 0))
    }
    const roomRevenue = roomMissing ? null : cents(knownRoom)
    const otherRevenue = openDays === 0 ? 0 : m.extraDailyRevenue === null ? null : cents(m.extraDailyRevenue * openDays)
    const facilityRows = s.facilityItems.filter(i => i.included).map(i => {
      const bound = p.facilities.find(f => f.id === i.facilityId), valid = bound && bound.type !== 'hotel'
      const quantity = valid ? i.capacityPerDay * i.utilizationRates[index % 12] / 100 * openDays : 0
      const revenue = !valid || quantity === 0 ? 0 : i.unitPrice === null ? null : cents(quantity * i.unitPrice)
      const direct = !valid || quantity === 0 ? 0 : i.directUnitCost === null ? null : cents(quantity * i.directUnitCost)
      const fixed = valid ? i.fixedMonthlyCost : 0
      if (!valid || revenue === null || direct === null || fixed === null) missing = true
      return { id: i.id, quantity, revenue, knownRevenue: revenue ?? 0, knownCost: cents((direct ?? 0) + (fixed ?? 0)) }
    })
    const facilityRevenue = facilityRows.some(i => i.revenue === null) ? null : cents(facilityRows.reduce((a, i) => a + i.knownRevenue, 0))
    const knownRevenue = cents(knownRoom + facilityRows.reduce((a, i) => a + i.knownRevenue, 0) + (otherRevenue ?? 0))
    const revenue = roomRevenue === null || facilityRevenue === null || otherRevenue === null ? null : knownRevenue
    const occupied = roomCount * m.occupancyRate / 100, guests = occupied * e.guestsPerRoom
    const bases = { guestDay: guests * openDays, staffDay: o.staffCount * openDays, personDay: (guests + o.staffCount) * openDays, roomDay: occupied * openDays, day: openDays, period: calendarDays / o.days, manual: calendarDays / o.days }
    const operatingCost = cents(o.items.reduce((a, i) => {
      const q = bases[i.basis] * i.quantity
      if (!i.included || q === 0) return a
      if (i.unitPrice === null) { missing = true; return a }
      return a + cents(q * i.unitPrice * (i.taxMode === 'excluded' && i.taxRate !== undefined ? 1 + i.taxRate / 100 : 1))
    }, 0))
    const facilityCost = cents(facilityRows.reduce((a, i) => a + i.knownCost, 0)), extraCost = m.extraFixedCost
    const deduction = e.revenueDeductionRate === null || revenue === null ? null : cents(revenue * e.revenueDeductionRate / 100)
    if (roomMissing || otherRevenue === null || extraCost === null) missing = true
    const knownDeduction = e.revenueDeductionRate === null ? 0 : cents(knownRevenue * e.revenueDeductionRate / 100)
    const cost = cents(operatingCost + facilityCost + (extraCost ?? 0) + knownDeduction), cash = missing ? null : cents(knownRevenue - cost), previous = cumulative
    cumulative = cumulative === null || cash === null ? null : cents(cumulative + cash)
    const remaining = cumulative === null || investment === null ? null : cents(Math.max(0, investment - cumulative))
    if (!paybackMonth && investment > 0 && previous !== null && cumulative !== null && cumulative >= investment && cash > 0) { paybackMonth = month; paybackYears = (index + (investment - previous) / cash) / 12 }
    return { month, calendarDays, openDays, roomRevenue, facilityRevenue, otherRevenue, revenue, knownRevenue, operatingCost, facilityCost, extraCost, deduction, cost, cash, cumulative, remaining, facilityRows }
  })
  // Incomplete capital is a disclosed estimate, not an unknown operating cost.
  const incomplete = forecast.some(i => i.cash === null)
  const paybackStatus = investment === null || investment <= 0 ? 'no-investment' : incomplete ? 'incomplete' : paybackMonth ? 'ready' : 'not-recovered'
  if (paybackStatus !== 'ready') { paybackMonth = null; paybackYears = null }
  const months = forecast.slice(0, 12), annualRevenue = months.some(i => i.revenue === null) ? null : cents(months.reduce((a, i) => a + i.revenue, 0)), annualCash = months.some(i => i.cash === null) ? null : cents(months.reduce((a, i) => a + i.cash, 0)), annualCost = cents(months.reduce((a, i) => a + i.cost, 0))
  return { months, forecast, annualRevenue, annualCash, annualCost, investment, paybackStatus, paybackMonth, paybackYears }
}
const panel = () => page.getByTestId('monthly-planner')
const item = id => panel().locator(`[data-facility-business="${id}"]`)
const numberText = text => Number(text.replace(/[¥,\s]/g, ''))
async function setMonthly(name, value, root = panel()) { const f = root.locator(`input[aria-label="${name}"]`); await f.fill(String(value)); await f.press('Tab'); await settled() }
async function month(index) { await panel().getByRole('combobox', { name: '编辑经营月份' }).selectOption(String(index)); await settled() }
async function monthly() { await button('月度经营').click(); await panel().waitFor(); await settled() }
async function rebase(p) { await importProject(p); original = await active(); await nav('收益与回本'); await monthly() }
async function totals() {
  const p = await active(), expected = independent(p)
  for (const m of expected.months) {
    const row = panel().locator(`[data-monthly-row="${m.month}"]`), td = row.locator('td')
    assert.equal(await td.nth(0).textContent(), `${m.calendarDays} / ${m.openDays} 天`)
    for (const [index, value] of [[2, m.roomRevenue], [3, m.facilityRevenue], [4, m.otherRevenue]]) assert.equal(await td.nth(index).textContent(), value === null ? '待补齐' : `¥ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
    for (const [index, key, value] of [[5, 'revenue', m.revenue], [6, 'cost', m.cost], [7, 'cash', m.cash], [8, 'cumulative', m.cumulative], [9, 'remaining', m.remaining]]) assert.equal(await td.nth(index).getAttribute('data-monthly-' + key), value === null ? null : String(value), m.month + ' ' + key)
  }
  const summary = panel().locator('.monthly-summary-grid article strong')
  for (const [index, key, value] of [[0, 'revenue', expected.annualRevenue], [1, 'cost', expected.annualCost], [2, 'cash', expected.annualCash]]) assert.equal(await summary.nth(index).getAttribute('data-monthly-annual-' + key), value === null ? null : String(value))
  const payback = panel().locator('[data-monthly-payback-status]')
  assert.equal(await payback.getAttribute('data-monthly-payback-status'), expected.paybackStatus)
  assert.equal(await payback.getAttribute('data-monthly-payback-month'), expected.paybackMonth)
  const years = await payback.getAttribute('data-monthly-payback-years')
  if (expected.paybackYears === null) assert.equal(years, null); else assert.ok(Math.abs(Number(years) - expected.paybackYears) < 1e-10)
  assert.equal(Number(await panel().locator('[data-monthly-investment]').getAttribute('data-monthly-investment')), expected.investment)
  return expected
}
async function sources() { const p = await active(); for (const key of ['operating', 'earnings']) assert.deepEqual(p[key], original[key], key + ' overwritten by monthly simulation') }
try {
  await page.goto(url); await button('更多设施').waitFor(); await importProject(fixture)
  await check('monthly direct link and real reload show a detached draft without injecting monthly or annual settings into a legacy project', async () => {
    const before = await active(), direct = new URL(url); direct.searchParams.set('section', 'earnings'); direct.searchParams.set('earningsView', 'monthly')
    await page.goto(direct.href); await panel().waitFor(); await settled()
    assert.equal(Object.hasOwn(await active(), 'monthlyPlan'), false); assert.equal(Object.hasOwn(await active(), 'earnings'), false)
    await page.reload(); await panel().waitFor(); await settled(); assert.deepEqual(await active(), before)
    assert.match(await panel().textContent(), /北京时间当前月/)
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
    const nowMonth = parts.find(p => p.type === 'year').value + '-' + parts.find(p => p.type === 'month').value
    assert.equal(await panel().locator('input[aria-label="经营起始月份"]').inputValue(), nowMonth)
  })
  await check('annual and monthly modes remain independent; viewing either draft does not implicitly enable operations or a plan', async () => {
    const before = await active(); await button('年度简算').click(); await page.getByTestId('earnings-page').waitFor()
    await monthly(); assert.deepEqual(await active(), before)
    assert.equal(await button('启用月度经营计划', panel()).count(), 1)
    assert.equal(await panel().locator('[data-monthly-payback-status]').getAttribute('data-monthly-payback-status'), 'incomplete')
    const enabled = completeFixture(); enabled.monthlyPlan.enabled = true; await rebase(enabled)
    await button('年度简算').click(); await page.getByTestId('earnings-page').waitFor(); const current = await active()
    assert.equal(new URL(page.url()).searchParams.get('earningsView'), 'annual')
    await page.reload(); await page.getByTestId('earnings-page').waitFor(); assert.equal(await panel().count(), 0); assert.deepEqual(await active(), current)
    await monthly(); await page.reload(); await panel().waitFor(); assert.deepEqual(await active(), current)
  })
  await check('known twelve-month fixture matches independent calendar, room, facility, operating, tax and cumulative-money calculations', async () => {
    await rebase(completeFixture()); courtItemId = (await active()).monthlyPlan.facilityItems[0].id
    const e = await totals(); assert.equal(e.investment, 47404)
    assert.equal(e.months[0].roomRevenue, 68200); assert.equal(e.months[0].facilityRevenue, 6200)
    assert.equal(e.months[0].otherRevenue, 3100); assert.equal(e.months[0].cash, 64289)
    assert.equal(e.annualCash, 756635); assert.equal((await active()).monthlyPlan.enabled, false)
    await sources()
  })
  await check('editing January opening days and occupancy changes only its own plan and yields exactly 20999 cash and February first recovery', async () => {
    await month(0); await setMonthly('月度营业天数', 15); await setMonthly('月度入住率', 40)
    const e = await totals(), january = e.months[0]
    assert.deepEqual([january.roomRevenue, january.facilityRevenue, january.otherRevenue, january.operatingCost, january.facilityCost, january.extraCost, january.deduction, january.cash], [26400, 3000, 1500, 6656, 500, 1200, 1545, 20999])
    assert.equal(e.months[1].cash, 57932); assert.equal(e.annualCash, 713345)
    assert.equal(e.paybackMonth, '2027-02'); assert.equal(e.paybackYears, (1 + (47404 - 20999) / 57932) / 12)
    await sources(); known = await active()
  })
  await check('a closed month stops guest and venue variable consumption but retains natural-month wages, utilities and fixed venue costs', async () => {
    await setMonthly('月度营业天数', 0); const e = await totals(), closed = e.months[0]
    assert.equal(closed.roomRevenue, 0); assert.equal(closed.facilityRevenue, 0); assert.equal(closed.otherRevenue, 0)
    assert.equal(closed.operatingCost, 6200); assert.equal(closed.facilityCost, 200); assert.equal(closed.cash, -7600)
    assert.equal(closed.cumulative, -7600); await sources(); await setMonthly('月度营业天数', 15); await totals()
  })
  await check('2028 February has twenty-nine real days, validates opening-day bounds and recomputes future non-leap cycles', async () => {
    await setMonthly('经营起始月份', '2028-01'); await month(1); await setMonthly('月度营业天数', 29)
    const before = await active(), e = await totals(); assert.equal(e.months[1].calendarDays, 29); assert.equal(e.months[1].cash, 60051)
    assert.equal(e.forecast[13].month, '2029-02'); assert.equal(e.forecast[13].calendarDays, 28); assert.equal(e.forecast[13].openDays, 28)
    await setMonthly('月度营业天数', 30); assert.equal(await panel().locator('input[aria-label="月度营业天数"]').getAttribute('aria-invalid'), 'true')
    assert.deepEqual((await active()).monthlyPlan, before.monthlyPlan)
    await setMonthly('月度营业天数', 29); await sources(); await rebase(known)
  })
  await check('a missing monthly room rate blocks complete cash and payback while explicit zero remains a real zero rate', async () => {
    await setMonthly('月度标准间房价', ''); assert.equal((await active()).monthlyPlan.months[0].roomRates.standard, null)
    await totals(); assert.equal(await panel().locator('[data-monthly-payback-status]').getAttribute('data-monthly-payback-status'), 'incomplete')
    assert.equal(await page.getByTestId('monthly-payback-chart').count(), 0)
    await setMonthly('月度标准间房价', 0); const e = await totals(); assert.equal(e.months[0].roomRevenue, 14400); assert.equal(e.months[0].cash, 9599)
    await setMonthly('月度标准间房价', 500); await totals(); await sources()
  })
  await check('factory fees bind one non-hotel venue at a time, expose common billing units and keep all initial prices and costs unknown', async () => {
    const select = panel().getByRole('combobox', { name: '选择收费设施' })
    assert.equal(await select.locator('option[value="monthly-hotel"]').count(), 0); assert.equal(await select.locator('option[value="monthly-court"]').count(), 0)
    for (const [facilityId, unit] of [['monthly-mahjong', 'roomHour'], ['monthly-auction', 'session'], ['monthly-parking', 'parkingDay']]) {
      await select.selectOption(facilityId); await button('添加设施收费', panel()).click(); await settled()
      const charge = (await active()).monthlyPlan.facilityItems.at(-1)
      assert.equal(charge.facilityId, facilityId); assert.equal(charge.unit, unit)
      assert.deepEqual([charge.unitPrice, charge.directUnitCost, charge.fixedMonthlyCost], [null, null, null])
      assert.equal((await active()).monthlyPlan.enabled, false)
      await item(charge.id).getByRole('checkbox', { name: '计入设施收费' }).uncheck(); await settled()
      assert.equal(await select.locator(`option[value="${facilityId}"]`).count(), 0)
    }
    assert.equal(await select.isDisabled(), true); assert.equal(await button('添加设施收费', panel()).isDisabled(), true)
    assert.equal((await active()).monthlyPlan.facilityItems.length, 4); await totals(); await sources()
    await rebase(known)
  })
  await check('venue hourly capacity, utilization and direct costs apply once without duplicating annual or other daily income', async () => {
    await setMonthly('设施每日可售量', 8, item(courtItemId)); await setMonthly('设施本月利用率', 25, item(courtItemId))
    const e = await totals(), jan = e.months[0]
    assert.equal(jan.facilityRows[0].quantity, 30); assert.equal(jan.facilityRevenue, 3000); assert.equal(jan.facilityCost, 500); assert.equal(jan.otherRevenue, 1500)
    assert.equal(numberText(await item(courtItemId).locator('[data-facility-month-revenue]').textContent()), 3000)
    assert.equal((await active()).earnings.extraDailyRevenue, 100); assert.equal(jan.cash, 20999)
    await setMonthly('设施每日可售量', 4, item(courtItemId)); await setMonthly('设施本月利用率', 50, item(courtItemId)); await totals()
  })
  await check('zero utilization produces no venue sales but retains fixed costs; excluded fees preserve unknown values without charging them', async () => {
    const p = structuredClone(known), charge = p.monthlyPlan.facilityItems[0]
    charge.utilizationRates.fill(0); charge.unitPrice = null; charge.directUnitCost = null
    await rebase(p); const zero = await totals(); assert.equal(zero.months[0].facilityRevenue, 0); assert.equal(zero.months[0].facilityCost, 200)
    await setMonthly('设施每月固定成本', ''); await totals(); assert.equal(await panel().locator('[data-monthly-payback-status]').getAttribute('data-monthly-payback-status'), 'incomplete')
    await item(courtItemId).getByRole('checkbox', { name: '计入设施收费' }).uncheck(); await settled(); const excluded = await totals()
    assert.equal(excluded.months[0].facilityCost, 0); assert.equal(excluded.months[0].facilityRevenue, 0)
    assert.deepEqual([(await active()).monthlyPlan.facilityItems[0].unitPrice, (await active()).monthlyPlan.facilityItems[0].directUnitCost, (await active()).monthlyPlan.facilityItems[0].fixedMonthlyCost], [null, null, null])
    await rebase(known)
  })
  await check('unknown monthly extra income or fixed expense stays null, blocks cumulative recovery and differs from an explicit zero', async () => {
    for (const [label, key, restored] of [['月度其他每日收入', 'extraDailyRevenue', 100], ['月度额外固定支出', 'extraFixedCost', 1200]]) {
      await setMonthly(label, ''); assert.equal((await active()).monthlyPlan.months[0][key], null); await totals()
      assert.equal(await panel().locator('[data-monthly-payback-status]').getAttribute('data-monthly-payback-status'), 'incomplete')
      assert.equal(await panel().locator('[data-monthly-row="2027-01"] td').nth(8).getAttribute('data-monthly-cumulative'), null)
      await setMonthly(label, 0); assert.equal((await active()).monthlyPlan.months[0][key], 0); await totals()
      await setMonthly(label, restored); await totals()
    }
    await sources()
  })
  await check('monthly plan activation is explicit and drives overview without turning on disabled operating budgets', async () => {
    await nav('方案总览'); assert.equal(Number(await page.locator('[data-overview-revenue]').getAttribute('data-overview-revenue')), 839500)
    await nav('收益与回本'); await monthly(); await button('启用月度经营计划', panel()).click(); await settled()
    assert.equal((await active()).monthlyPlan.enabled, true); await nav('方案总览')
    assert.equal(Number(await page.locator('[data-overview-revenue]').getAttribute('data-overview-revenue')), 865900)
    assert.equal(Number(await page.locator('[data-overview-cash]').getAttribute('data-overview-cash')), 713345)
    await nav('收益与回本'); await monthly(); const disabled = await active(); disabled.operating.enabled = false; await rebase(disabled)
    await totals(); assert.equal((await active()).operating.enabled, false); assert.equal((await active()).monthlyPlan.enabled, true)
    const restored = await active(); restored.operating.enabled = true; await rebase(restored); known = await active(); await totals()
  })
  await check('an early recovered month is retained even when later losses make annual cash negative and cumulative cash drops below investment', async () => {
    const p = structuredClone(known); p.earnings.investmentMode = 'manual'; p.earnings.manualInvestment = 5000; p.earnings.revenueDeductionRate = 0
    p.operating.items.forEach(i => { i.unitPrice = 0 }); p.monthlyPlan.facilityItems = []
    p.monthlyPlan.months.forEach((m, i) => { m.openDays = i === 0 ? 1 : 0; m.occupancyRate = 0; m.extraDailyRevenue = i === 0 ? 10000 : 0; m.extraFixedCost = i === 0 ? 0 : 11000 })
    await rebase(p); const e = await totals()
    assert.equal(e.annualCash, -111000); assert.equal(e.paybackMonth, '2027-01'); assert.equal(e.paybackYears, .5 / 12)
    assert.equal(e.months[1].cumulative, -1000); assert.equal(e.months[11].cumulative, -111000)
    assert.equal(await page.getByTestId('monthly-payback-chart').count(), 1)
    assert.match(await panel().locator('.monthly-checks').textContent(), /首次回本后累计现金可能再次低于初始投资/)
    await sources(); await rebase(known)
  })
  await check('unrecovered predictions are limited to the selected horizon, with sixty-year bounds and no permanent-loss claim', async () => {
    const p = structuredClone(known); p.earnings.investmentMode = 'manual'; p.earnings.manualInvestment = 1000; p.earnings.revenueDeductionRate = 0
    p.operating.items.forEach(i => { i.unitPrice = 0 }); p.monthlyPlan.facilityItems = []; p.monthlyPlan.horizonYears = 1
    p.monthlyPlan.months.forEach(m => { m.openDays = 0; m.extraDailyRevenue = 0; m.extraFixedCost = 0 })
    await rebase(p); const e = await totals(); assert.equal(e.annualCash, 0); assert.equal(e.paybackStatus, 'not-recovered')
    assert.match(await panel().locator('[data-monthly-payback-status]').textContent(), /1 年情景范围尚未回收/)
    await setMonthly('回本预测年数', 60); assert.equal((await active()).monthlyPlan.horizonYears, 60); await totals()
    const curve = page.getByTestId('monthly-payback-chart').locator('path'); assert.equal((await curve.getAttribute('d')).match(/\bL\b/g).length, 720)
    const before = await active(); await setMonthly('回本预测年数', 61); assert.equal(await panel().locator('input[aria-label="回本预测年数"]').getAttribute('aria-invalid'), 'true'); assert.deepEqual((await active()).monthlyPlan, before.monthlyPlan)
    await setMonthly('回本预测年数', 60); await rebase(known)
    const incompleteCapital = structuredClone(known); incompleteCapital.budget.landAmount = null; await rebase(incompleteCapital)
    const estimate = await totals(); assert.equal(estimate.paybackStatus, 'ready'); assert.equal(estimate.paybackMonth, '2027-02')
    assert.match(await panel().locator('[data-monthly-payback-status]').textContent(), /暂估/); await rebase(known)
  })
  await check('copying venues does not create additional charges and deleting a billed venue removes its reference', async () => {
    await nav('场地设计'); await button('设施管理').click(); const row = page.locator('[data-manager-id="monthly-court"]')
    await row.getByRole('button', { name: /复制/ }).click(); await settled(); const p = await active()
    assert.equal(p.facilities.length, fixture.facilities.length + 1); assert.equal(p.monthlyPlan.facilityItems.length, 1)
    await button('设施管理').click()
    await row.getByRole('button', { name: /删除/ }).click(); await settled(); const deleted = await active()
    assert.equal(deleted.facilities.some(f => f.id === 'monthly-court'), false); assert.equal(deleted.monthlyPlan.facilityItems.length, 0)
    await nav('收益与回本'); await monthly(); await totals(); await rebase(known)
  })
  await check('a dangling imported facility reference cannot create ghost revenue and is removable with a visible warning', async () => {
    const p = structuredClone(known); p.monthlyPlan.facilityItems[0].facilityId = 'missing-venue-id'
    await rebase(p); const e = await totals(); assert.equal(e.months[0].facilityRevenue, 0); assert.equal(e.months[0].facilityCost, 0)
    assert.equal(e.paybackStatus, 'incomplete'); assert.match(await item(courtItemId).textContent(), /原设施已删除|无法产生收费/)
    await button('移除设施收费', item(courtItemId)).click(); await settled(); assert.equal((await active()).monthlyPlan.facilityItems.length, 0); await totals()
    await rebase(known)
  })
  await check('active monthly overview and check actions use the same forecast, while CSV and offline report reproduce all twelve exact rows', async () => {
    await setMonthly('月度额外固定支出', ''); await nav('方案总览')
    assert.equal(await page.locator('.fo-metrics article').nth(2).locator('strong').getAttribute('data-overview-cash'), null)
    await button('方案检查').click(); const issue = dialog().locator('[data-check-id="earnings-incomplete"]')
    assert.match(await issue.textContent(), /2027-01|额外固定/); await issue.locator('.pc-action').click(); await panel().waitFor()
    await setMonthly('月度额外固定支出', 1200); const p = await active(), e = await totals()
    const csv = await download(() => button('导出月度测算', panel()).click(), 'monthly-plan.csv'), rows = csvRows(csv)
    for (const m of e.months) {
      const row = rows.find(r => r[0] === m.month)
      assert.equal(Number(row[1]), m.calendarDays); assert.equal(Number(row[2]), m.openDays)
      assert.equal(Number(row[4]), m.roomRevenue); assert.equal(Number(row[5]), m.facilityRevenue); assert.equal(Number(row[6]), m.otherRevenue)
      assert.equal(Number(row[7]), m.revenue); assert.equal(Number(row[8]), m.operatingCost); assert.equal(Number(row[9]), m.facilityCost)
      assert.equal(Number(row[12]), m.cost); assert.equal(Number(row[14]), m.cash); assert.equal(Number(row[15]), m.cumulative); assert.equal(Number(row[16]), m.remaining)
    }
    assert.equal(Number(rows.find(r => r[0] === '初始投资元')[1]), 47404)
    assert.equal(rows.find(r => r[0] === '预计首次回本年月')[1], '2027-02')
    assert.equal(Number(rows.find(r => r[0] === '近似回本年数')[1]), e.paybackYears)
    const forecastStart = rows.findIndex(r => r[0] === '逐月回收预测')
    for (const [index, m] of e.forecast.entries()) { const row = rows[forecastStart + index + 1]; assert.equal(row[0], m.month); assert.equal(Number(row[1]), m.cash); assert.equal(Number(row[2]), m.cumulative); assert.equal(Number(row[3]), m.remaining) }
    await nav('方案总览'); assert.equal(Number(await page.locator('[data-overview-cash]').getAttribute('data-overview-cash')), e.annualCash)
    assert.equal(await page.locator('[data-overview-payback-month]').getAttribute('data-overview-payback-month'), e.paybackMonth)
    const report = await download(() => button('导出方案报告').click(), 'monthly-plan-report.html'), offline = await context.newPage()
    await context.setOffline(true)
    try {
      await offline.setContent(report); assert.equal(await offline.locator('[data-report-monthly-plan]').count(), 1)
      assert.equal(Number(await offline.locator('[data-report-monthly-revenue]').getAttribute('data-report-monthly-revenue')), e.annualRevenue)
      assert.equal(Number(await offline.locator('[data-report-monthly-cash]').getAttribute('data-report-monthly-cash')), e.annualCash)
      assert.equal(await offline.locator('[data-report-monthly-payback-status]').getAttribute('data-report-monthly-payback-month'), e.paybackMonth)
      for (const m of e.months) {
        const row = offline.locator(`[data-report-monthly-row="${m.month}"]`)
        assert.equal(Number(await row.locator('[data-report-monthly-row-revenue]').getAttribute('data-report-monthly-row-revenue')), m.revenue)
        assert.equal(Number(await row.locator('[data-report-monthly-row-cash]').getAttribute('data-report-monthly-row-cash')), m.cash)
        assert.equal(numberText(await row.locator('td').nth(6).textContent()), m.cost)
        assert.equal(numberText(await row.locator('td').nth(8).textContent()), m.cumulative)
      }
    } finally { await context.setOffline(false); await offline.close() }
    assert.deepEqual(await active(), p); await nav('收益与回本'); await monthly()
  })
  await check('JSON import with a focused old monthly expense saves the old value without contaminating the new plan; copies and two reloads retain version-one schema', async () => {
    await button('保存方案').click(); await settled(); const before = await active(); await button('导出方案').click()
    const archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'monthly-plan-project.json'))
    assert.deepEqual(archive, before); assert.equal(archive.version, 1)
    await panel().locator('input[aria-label="月度额外固定支出"]').fill('777')
    assert.equal((await active()).monthlyPlan.months[0].extraFixedCost, 777)
    await importProject(archive); const imported = await active(); assert.notEqual(imported.id, archive.id); assert.deepEqual(imported.monthlyPlan, archive.monthlyPlan)
    const old = await page.evaluate(id => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === id), before.id)
    assert.equal(old.monthlyPlan.months[0].extraFixedCost, 777)
    await button('另存为新方案').click(); await dialog().getByRole('textbox', { name: '新方案名称' }).fill('3.1月度经营验收副本'); await button('保存副本', dialog()).click(); await settled()
    saved = await active(); assert.notEqual(saved.id, imported.id)
    for (const key of ['monthlyPlan', 'earnings', 'operating', 'facilities', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual(saved[key], archive[key])
    await nav('收益与回本'); await monthly()
    for (let i = 0; i < 2; i++) { await page.reload(); await panel().waitFor(); await settled(); for (const key of ['monthlyPlan', 'earnings', 'operating', 'facilities', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual((await active())[key], saved[key]); await totals() }
  })
  await check('1100px desktop keeps twelve-month details internally scrollable and main save/export controls visible', async () => {
    await page.setViewportSize({ width: 1100, height: 850 }); await panel().locator('.monthly-heading').scrollIntoViewIfNeeded()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.equal(await panel().locator('[data-monthly-row]').count(), 12)
    for (const label of ['保存方案', '导出方案', '进入屏幕全屏']) { const b = await page.locator('.desktop-header').getByRole('button', { name: label, exact: true }).boundingBox(); assert.ok(b && b.x >= 0 && b.x + b.width <= 1100 && b.y >= 0 && b.y + b.height <= 850) }
    const table = panel().locator('.monthly-calendar .monthly-table-scroll')
    assert.equal(await table.evaluate(el => el.scrollWidth > el.clientWidth && getComputedStyle(el).overflowX === 'auto'), true)
    await totals(); await screenshot('monthly-plan-desktop.png')
  })
  await check('390px mobile monthly deep link, editing controls and the five planning navigation pages preserve the complete plan with no unexpected runtime errors', async () => {
    const before = await active(); await page.setViewportSize({ width: 390, height: 844 })
    const mobile = new URL(url); mobile.pathname = '/mobile'; mobile.searchParams.set('section', 'earnings'); mobile.searchParams.set('earningsView', 'monthly')
    await page.goto(mobile.href); await panel().waitFor(); await settled(); await totals()
    await panel().locator('.monthly-heading').scrollIntoViewIfNeeded(); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const fieldBox = await panel().getByRole('combobox', { name: '编辑经营月份' }).boundingBox(); assert.ok(fieldBox.x >= 0 && fieldBox.x + fieldBox.width <= 390)
    await month(1); assert.equal(await panel().locator('input[aria-label="月度营业天数"]').inputValue(), '28'); await month(0)
    await panel().locator('.monthly-heading').scrollIntoViewIfNeeded(); await screenshot('monthly-plan-mobile.png')
    for (const name of ['方案总览', '客房规划', '投资估算', '收益与回本', '场地设计']) {
      if (await button('返回项目导航').isVisible()) await button('返回项目导航').click()
      await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name, exact: true }).click(); await settled()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, name)
    }
    for (const key of ['monthlyPlan', 'earnings', 'operating', 'facilities', 'budget', 'materials', 'materialBudgetIncluded']) assert.deepEqual((await active())[key], before[key])
    assert.deepEqual(runtimeErrors, []); assert.equal(await button('重新加载此页').count(), 0)
  })
} catch (error) {
  const trace = String(error.stack || error).split('\n')
  failures.push({ name: currentCheck, assertion: String(error.message || error), position: trace.find(line => line.includes('verify-monthly-plan.mjs:'))?.trim() || 'scripts/verify-monthly-plan.mjs', keyLines: trace.slice(0, 20) })
  console.error('FAIL ' + currentCheck + '\n' + trace.slice(0, 20).join('\n'))
  await page.screenshot({ path: 'test-results/monthly-plan-failure.png', fullPage: true }).catch(() => {})
  process.exitCode = 1
} finally {
  const result = { total: TOTAL, passed: passed.length, failed: failures.length, skipped: Math.max(0, TOTAL - passed.length - failures.length), exitCode: process.exitCode || 0, checks: passed, failures, runtimeErrors }
  writeFileSync('test-results/monthly-plan-results.json', JSON.stringify(result, null, 2))
  console.log(`Monthly plan verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`)
  await browser.close()
}
