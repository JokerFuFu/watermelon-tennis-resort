import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, parseProject } from './model.ts'
import { estimateProject } from './pricing.ts'
import { getOperatingSettings } from './operating.ts'
import { estimateEarnings, getEarningsSettings, validateEarningsSettings } from './earnings.ts'
import { buildEarningsCSV } from './earningsExport.ts'
import { createMaterialPiece } from './materials.ts'
import type { EarningsSettings, Facility, OperatingItem, Project } from './types'

function item(id: string, basis: OperatingItem['basis'], quantity: number, unitPrice: number | null): OperatingItem {
  return { id, label: id, included: true, basis, quantity, unit: '项', unitPrice, taxMode: 'included', evidence: { kind: 'quotation', name: '测试费用', date: '2026-10-03', scope: '仅单元测试费用' } }
}
function settings(overrides: Partial<EarningsSettings> = {}): EarningsSettings {
  return { roomRates: { standard: 100, deluxe: 200, suite: 500 }, unavailableRooms: { standard: 2, deluxe: 1, suite: 1 }, occupancyRate: 50, guestsPerRoom: 2, extraDailyRevenue: 50, extraMonthlyCost: 365, revenueDeductionRate: 10, investmentMode: 'manual', manualInvestment: 310980, ...overrides }
}
function hotel(overrides: Partial<Facility> = {}): Facility {
  return { id: 'hotel', name: '测试酒店', type: 'hotel', x: 0, y: 0, width: 10, depth: 20, floors: 2, rooms: 16, roomMix: { standard: 10, deluxe: 4, suite: 2 }, unitCost: 100, rotation: 0, ...overrides }
}
function project(overrides: Partial<Project> = {}): Project {
  return { ...createProject('收益测试', 'blank'), facilities: [hotel()], earnings: settings(), operating: { enabled: true, days: 30, guestMode: 'manual', dailyGuests: 999, occupancyRate: 95, guestsPerRoom: 1, staffCount: 2,
    items: [item('water', 'personDay', 2, 2), item('breakfast', 'guestDay', 1, 20), item('linen', 'roomDay', 1, 6), item('wages', 'period', 1, 3000), item('utilities', 'manual', 1, 900)] }, ...overrides }
}
const annual = (p: Project) => estimateEarnings(p).periods.find(row => row.id === 'year')!

test('old project defaults are previews with explicit unknown extras and deductions', () => {
  const p = project(); delete p.earnings; delete p.operating
  const before = JSON.stringify(p), initial = getEarningsSettings(p)
  assert.deepEqual(initial.roomRates, { standard: 500, deluxe: 700, suite: 1000 })
  assert.equal(initial.occupancyRate, 70); assert.equal(initial.guestsPerRoom, 2)
  assert.equal(initial.extraMonthlyCost, null); assert.equal(initial.revenueDeductionRate, null)
  assert.equal(initial.extraDailyRevenue, 0); assert.equal(initial.manualInvestment, null)
  initial.roomRates.standard = 0
  assert.equal(getEarningsSettings(p).roomRates.standard, 500)
  const result = estimateEarnings(p)
  assert.ok(result.missingItems.includes('日常运营预算尚未启用'))
  assert.equal(result.periods[0].cashSurplus, null)
  assert.equal(JSON.stringify(p), before)
})

test('saved settings clone deeply and inherit operating occupancy only before first save', () => {
  const p = project(); const copy = getEarningsSettings(p)
  copy.unavailableRooms.standard = 999; copy.roomRates.standard = 0
  assert.equal(p.earnings!.unavailableRooms.standard, 2)
  assert.equal(p.earnings!.roomRates.standard, 100)
  delete p.earnings
  assert.equal(getEarningsSettings(p).occupancyRate, 95)
  assert.equal(getEarningsSettings(p).guestsPerRoom, 1)
})

test('distinct room inventory, exclusions, rates and operating bases reconcile by hand', () => {
  const p = project(), before = JSON.stringify(p), result = estimateEarnings(p), day = result.periods[0], year = result.periods[3]
  assert.deepEqual(result.availableRooms, { standard: 8, deluxe: 3, suite: 1 }); assert.equal(result.occupiedRooms, 6)
  // Room revenue: 8×0.5×100 + 3×0.5×200 + 1×0.5×500 = 950.
  assert.equal(day.roomRevenue, 950); assert.equal(day.otherRevenue, 50); assert.equal(day.totalRevenue, 1000)
  // Water56 + breakfast240 + linen36 + wages100 + utilities30 = 462.
  assert.equal(day.operatingCost, 462); assert.equal(day.extraCost, 12); assert.equal(day.deductions, 100)
  assert.equal(day.cashSurplus, 426); assert.equal(year.cashSurplus, 155490)
  assert.equal(result.paybackStatus, 'ready'); assert.equal(result.paybackYears, 2)
  assert.equal(year.operatingCost, 168630)
  assert.equal(result.costItems.find(row => row.id === 'wages')!.annualAmount, 36500)
  assert.equal(result.costItems.find(row => row.id === 'utilities')!.annualAmount, 10950)
  assert.match(result.costItems.find(row => row.id === 'utilities')!.basis, /30 天手填总量均摊/)
  assert.equal(JSON.stringify(p), before)
})

test('week is seven days and average month reconciles with year independently of day rounding', () => {
  const result = estimateEarnings(project())
  assert.equal(result.periods[1].cashSurplus, 2982)
  assert.equal(result.periods[2].days, 365 / 12)
  // Independent monthly arithmetic: room950×365/12=28895.83,
  // other50×365/12=1520.83; gross30416.66, fees3041.67.
  // Cost rows: 1703.33 + 7300 + 1095 + 3041.67 + 912.50 = 14052.50.
  const month = result.periods[2]
  assert.equal(month.roomRevenue, 28895.83); assert.equal(month.otherRevenue, 1520.83)
  assert.equal(month.totalRevenue, 30416.66); assert.equal(month.operatingCost, 14052.5)
  assert.equal(month.extraCost, 365); assert.equal(month.deductions, 3041.67)
  assert.equal(month.cashSurplus, 12957.49)
  assert.equal(month.cashSurplus! * 12, 155489.88)
  // Each monthly room/other subtotal can differ by at most half a cent.
  // A difference bound comes from these money-rounding operations, not a
  // tolerance chosen from observed output: five cost rows + extra expense +
  // two revenue subtotals + deduction, plus the deduction's revenue propagation.
  const periodErrorBound = (5 + 1 + 2 + 1) * 0.005 + 2 * 0.005 * 0.1
  assert.ok(Math.abs(month.cashSurplus! * 12 - result.periods[3].cashSurplus!) <= 13 * periodErrorBound)
  const p = project({ operating: { ...getOperatingSettings(project()), items: [] }, earnings: settings({ roomRates: { standard: 0.335, deluxe: 0, suite: 0 }, unavailableRooms: { standard: 9, deluxe: 4, suite: 2 }, occupancyRate: 100, extraDailyRevenue: 0, extraMonthlyCost: 0, revenueDeductionRate: 0 }) })
  const rows = estimateEarnings(p).periods
  assert.equal(rows[0].totalRevenue, 0.34)
  assert.equal(rows[3].totalRevenue, 122.28)
  assert.notEqual(rows[3].totalRevenue, rows[0].totalRevenue! * 365)
  assert.equal(rows[2].totalRevenue, 10.19)
  assert.equal(rows[2].totalRevenue! * 12, rows[3].totalRevenue)
})

test('fixed period and manual costs scale from original days; staff costs retain existing headcount', () => {
  const p = project()
  p.operating!.items = [item('staff', 'staffDay', 2, 20), item('fixed', 'period', 1, 3000), item('manual', 'manual', 2, 450)]
  const rows = estimateEarnings(p).periods
  assert.equal(rows[0].operatingCost, 80 + 100 + 30)
  assert.equal(rows[3].operatingCost, 210 * 365)
  p.operating!.days = 60
  assert.equal(estimateEarnings(p).periods[0].operatingCost, 80 + 50 + 15)
})

test('hotel room mix is accumulated including hidden hotels; nonhotel room counts do not earn', () => {
  const p = project({ facilities: [hotel({ visible: false, locked: true }), hotel({ id: 'legacy', rooms: 2, roomMix: undefined }), hotel({ id: 'restaurant', type: 'restaurant', rooms: 1000 })] })
  assert.deepEqual(estimateEarnings(p).roomCounts, { standard: 12, deluxe: 4, suite: 2 })
  assert.equal(estimateEarnings(p).occupiedRooms, 7)
})

test('null price blocks only when room type has available inventory; explicit zero is complete', () => {
  const p = project(); p.earnings!.roomRates.suite = null
  let result = estimateEarnings(p)
  assert.equal(result.periods[0].roomRevenue, null); assert.equal(result.periods[0].knownRevenue, 750)
  assert.equal(result.periods[0].cashSurplus, null); assert.equal(result.paybackStatus, 'incomplete')
  p.earnings!.unavailableRooms.suite = 2
  result = estimateEarnings(p)
  assert.equal(result.periods[0].roomRevenue, 700); assert.equal(result.paybackStatus, 'ready')
  p.earnings!.roomRates.standard = 0
  assert.equal(estimateEarnings(p).periods[0].roomRevenue, 300)
})

test('null revenue, extra costs and deduction rate remain missing instead of silently zero', () => {
  for (const key of ['extraDailyRevenue', 'extraMonthlyCost', 'revenueDeductionRate'] as const) {
    const p = project(); p.earnings![key] = null
    const result = estimateEarnings(p)
    assert.equal(result.periods[0].cashSurplus, null); assert.equal(result.paybackStatus, 'incomplete')
    assert.ok(Number.isFinite(result.periods[0].knownSurplus)); assert.ok(result.missingItems.length > 0)
    p.earnings![key] = 0
    assert.notEqual(estimateEarnings(p).periods[0].cashSurplus, null)
  }
})

test('active unpriced operating costs block completeness; excluded or zero-volume costs do not', () => {
  const p = project(); p.operating!.items = [item('missing', 'period', 1, null)]
  assert.equal(annual(p).cashSurplus, null)
  p.operating!.items[0].included = false
  assert.notEqual(annual(p).cashSurplus, null)
  p.operating!.items[0].included = true; p.operating!.items[0].quantity = 0
  assert.notEqual(annual(p).cashSurplus, null)
  p.operating!.items = [item('guest-missing', 'guestDay', 1, null)]; p.earnings!.occupancyRate = 0
  assert.notEqual(annual(p).cashSurplus, null)
  p.operating!.items[0].unitPrice = 0
  assert.notEqual(annual(p).cashSurplus, null)
})

test('disabled original operating settings preview known costs without enabling or pretending completeness', () => {
  const p = project(); p.operating!.enabled = false
  const before = JSON.stringify(p), result = estimateEarnings(p)
  assert.equal(result.periods[0].operatingCost, 462)
  assert.equal(result.periods[0].cashSurplus, null); assert.equal(result.paybackStatus, 'incomplete')
  assert.equal(JSON.stringify(p), before)
})

test('unknown tax and sample costs are reviews; known excluded tax is added exactly once', () => {
  const p = project(); p.operating!.items = [item('taxed', 'day', 1, 100)]
  p.operating!.items[0].taxMode = 'excluded'; p.operating!.items[0].taxRate = 9
  assert.equal(estimateEarnings(p).periods[0].operatingCost, 109)
  p.operating!.items[0].taxMode = 'unknown'; p.operating!.items[0].evidence = { kind: 'assumption', name: '内部示例', scope: '待核实' }
  const result = estimateEarnings(p)
  assert.equal(result.periods[0].operatingCost, 100); assert.equal(result.paybackStatus, 'ready')
  assert.ok(result.reviewItems.some(item => item.includes('运营税费')))
  assert.ok(result.reviewItems.some(item => item.includes('内部示例')))
})

test('construction investment excludes operating duration total and includes selected material procurement', () => {
  const p = project(); p.earnings!.investmentMode = 'construction'
  const base = estimateEarnings(p)
  assert.equal(base.investment, estimateProject(p).total.point)
  assert.equal(base.investmentIncomplete, true)
  assert.ok(base.reviewItems.some(item => item.includes('土地费用')))
  p.operating!.days = 300
  assert.equal(estimateEarnings(p).investment, base.investment)
  const material = createMaterialPiece('red-brick', p); material.unitPrice = 10; material.taxMode = 'included'
  p.materials = [material]
  assert.equal(estimateEarnings(p).investment, base.investment)
  p.materialBudgetIncluded = true
  assert.equal(estimateEarnings(p).investment, base.investment! + 10)
  p.materials[0].unitPrice = null
  assert.equal(estimateEarnings(p).investmentIncomplete, true)
  assert.ok(estimateEarnings(p).reviewItems.some(item => item.includes('建材采购')))
})

test('zero or null investment has no fabricated instant payback and losses have no finite years', () => {
  for (const amount of [null, 0]) {
    const result = estimateEarnings(project({ earnings: settings({ manualInvestment: amount }) }))
    assert.equal(result.paybackStatus, 'no-investment'); assert.equal(result.paybackYears, null)
  }
  for (const extraMonthlyCost of [13322.5, 20000]) {
    const result = estimateEarnings(project({ earnings: settings({ extraMonthlyCost }) }))
    assert.equal(result.paybackStatus, 'nonpositive'); assert.equal(result.paybackYears, null)
  }
})

test('out-of-stock exclusions preserve user setting, clamp availability and require correction', () => {
  const p = project(); p.earnings!.unavailableRooms.standard = 20
  const result = estimateEarnings(p)
  assert.equal(result.availableRooms.standard, 0); assert.equal(result.settings.unavailableRooms.standard, 20)
  assert.ok(result.missingItems.some(item => item.includes('超过房型库存')))
  assert.equal(result.paybackStatus, 'incomplete')
})

test('payback retains full precision rather than dividing rounded display values', () => {
  const p = project(); p.earnings!.manualInvestment = 123456.78
  const result = estimateEarnings(p)
  assert.equal(result.paybackYears, 123456.78 / 155490)
  assert.notEqual(result.paybackYears, Math.round(result.paybackYears! * 100) / 100)
})

test('strict settings roundtrip accepts null and zero while rejecting unknown or missing fields and caps', () => {
  assert.deepEqual(validateEarningsSettings(settings()), settings())
  assert.deepEqual(validateEarningsSettings(settings({ roomRates: { standard: null, deluxe: 0, suite: 1000000 }, unavailableRooms: { standard: 100000, deluxe: 0, suite: 0 }, manualInvestment: 1e12 })), settings({ roomRates: { standard: null, deluxe: 0, suite: 1000000 }, unavailableRooms: { standard: 100000, deluxe: 0, suite: 0 }, manualInvestment: 1e12 }))
  const invalid: unknown[] = [null, [], { ...settings(), unknown: 1 }, { ...settings(), roomRates: { ...settings().roomRates, penthouse: 2 } }, { ...settings(), roomRates: { standard: 100, deluxe: 200 } }, { ...settings(), unavailableRooms: { standard: 0, deluxe: 0, suite: 0.5 } }, { ...settings(), unavailableRooms: { standard: 100001, deluxe: 0, suite: 0 } }, { ...settings(), roomRates: { standard: Infinity, deluxe: 0, suite: 0 } }, { ...settings(), roomRates: { standard: 1000001, deluxe: 0, suite: 0 } }, { ...settings(), occupancyRate: 101 }, { ...settings(), guestsPerRoom: 11 }, { ...settings(), extraDailyRevenue: -1 }, { ...settings(), extraMonthlyCost: NaN }, { ...settings(), revenueDeductionRate: 101 }, { ...settings(), investmentMode: 'operating' }, { ...settings(), manualInvestment: 1e12 + 1 }, { ...settings(), extraMonthlyCost: undefined }]
  for (const value of invalid) assert.throws(() => validateEarningsSettings(value), /方案文件无效/)
})

test('CSV separates complete from filled-range cash flow, keeps null explicit and escapes formula text', () => {
  const p = project({ name: '=HYPERLINK("bad")' }); p.operating!.items[0].label = '@bad'
  const before = JSON.stringify(p), csv = buildEarningsCSV(p)
  assert.ok(csv.startsWith('\uFEFF')); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes("'@bad"))
  assert.ok(csv.includes('完整经营现金结余')); assert.ok(csv.includes('155490')); assert.ok(csv.includes('365/12'))
  assert.ok(csv.includes('原运营预算期间天数')); assert.ok(csv.includes('用量系数或原期间总量'))
  assert.equal(JSON.stringify(p), before)
  p.earnings!.extraMonthlyCost = null
  assert.ok(buildEarningsCSV(p).includes('经营数据待补齐')); assert.ok(buildEarningsCSV(p).includes('待填写'))
  p.name = ' \n=FORMULA()'
  assert.ok(buildEarningsCSV(p).includes("' \n=FORMULA()"))
})

test('project strict JSON roundtrip preserves saved earnings while old projects get no implicit fields', () => {
  const p = project(), result = parseProject(JSON.stringify(p))
  assert.deepEqual(result, p); assert.deepEqual(estimateEarnings(result), estimateEarnings(p))
  const old = project(); delete old.earnings
  assert.equal(Object.hasOwn(parseProject(JSON.stringify(old)), 'earnings'), false)
  assert.throws(() => parseProject(JSON.stringify({ ...p, earnings: { ...p.earnings, occupancyRate: -1 } })), /方案文件无效/)
})
