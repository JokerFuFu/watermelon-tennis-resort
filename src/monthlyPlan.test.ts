import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject } from './model.ts'
import { estimateProject } from './pricing.ts'
import { createMaterialPiece } from './materials.ts'
import { calendarDays, createFacilityBusinessItem, estimateMonthlyPlan, getMonthlyPlan, setMonthlyStartMonth, validateMonthlyPlanSettings } from './monthlyPlan.ts'
import type { Facility, MonthlyPlanSettings, OperatingItem, Project } from './types'

const hotel: Facility = { id: 'hotel', name: '酒店', type: 'hotel', x: 0, y: 0, width: 10, depth: 20, floors: 1, rooms: 6, roomMix: { standard: 2, deluxe: 2, suite: 2 }, unitCost: 100, rotation: 0 }
const court: Facility = { ...hotel, id: 'court', name: '网球场', type: 'court', rooms: 0, roomMix: undefined }
function cost(id: string, basis: OperatingItem['basis'], unitPrice: number | null): OperatingItem {
  return { id, label: id, included: true, basis, quantity: 1, unit: '项', unitPrice, taxMode: 'included', evidence: { kind: 'assumption', name: '测试', scope: '仅测试' } }
}
function project(): Project {
  const p = createProject('月度测试', 'blank')
  p.facilities = [structuredClone(hotel), structuredClone(court)]
  p.earnings = { roomRates: { standard: 100, deluxe: 200, suite: 400 }, unavailableRooms: { standard: 0, deluxe: 0, suite: 1 }, occupancyRate: 50, guestsPerRoom: 2, extraDailyRevenue: 10, extraMonthlyCost: 20, revenueDeductionRate: 10, investmentMode: 'manual', manualInvestment: 10000 }
  p.operating = { enabled: true, days: 30, guestMode: 'manual', occupancyRate: 1, guestsPerRoom: 9, dailyGuests: 999, staffCount: 2, items: [cost('guest', 'guestDay', 10), cost('staff', 'staffDay', 5), cost('room', 'roomDay', 2), cost('wages', 'period', 3000), cost('utilities', 'manual', 900)] }
  p.monthlyPlan = setMonthlyStartMonth(getMonthlyPlan(p), '2028-01')
  for (const entry of p.monthlyPlan.months) entry.openDays = calendarDays(entry.month)
  p.monthlyPlan.enabled = true; p.monthlyPlan.horizonYears = 2
  return p
}
function noCosts(p: Project) { p.operating!.items = []; p.earnings!.revenueDeductionRate = 0; for (const entry of p.monthlyPlan!.months) entry.extraFixedCost = 0 }

test('preview copies annual assumptions and calendar dates without injecting or mutating fields', () => {
  const p = project(); delete p.monthlyPlan
  const before = JSON.stringify(p), plan = getMonthlyPlan(p)
  assert.equal(plan.enabled, false); assert.equal(plan.horizonYears, 30); assert.equal(plan.facilityItems.length, 0)
  assert.equal(plan.months.length, 12); assert.deepEqual(plan.months[0].roomRates, p.earnings!.roomRates)
  assert.equal(plan.months[0].extraFixedCost, 20); assert.equal(plan.months[0].extraDailyRevenue, 10)
  plan.months[0].roomRates.standard = 999
  assert.equal(p.earnings!.roomRates.standard, 100); assert.equal(JSON.stringify(p), before)
  p.monthlyPlan = getMonthlyPlan(p)
  const copy = getMonthlyPlan(p); copy.months[0].openDays = 0
  assert.notEqual(p.monthlyPlan.months[0].openDays, 0)
})
test('calendar handles century rules and shifting preserves relative parameters with clamps', () => {
  assert.equal(calendarDays('2028-02'), 29); assert.equal(calendarDays('2100-02'), 28); assert.equal(calendarDays('2000-02'), 29)
  assert.equal(calendarDays('2027-04'), 30); assert.throws(() => calendarDays('2027-13'))
  const source = project().monthlyPlan!, before = JSON.stringify(source)
  source.months[0].occupancyRate = 71; source.months[0].extraFixedCost = 456
  const moved = setMonthlyStartMonth(source, '2029-02')
  assert.equal(moved.months[0].openDays, 28); assert.equal(moved.months[0].occupancyRate, 71); assert.equal(moved.months[0].extraFixedCost, 456)
  assert.equal(moved.months[11].month, '2030-01'); assert.equal(source.startMonth, '2028-01')
  assert.equal(before.includes('2028-01'), true)
})
test('month room mix, closed days and natural fixed costs reconcile by hand', () => {
  const p = project(), before = JSON.stringify(p), result = estimateMonthlyPlan(p), jan = result.months[0], feb = result.months[1]
  // Available 2 standard, 2 deluxe, 1 suite at 50% => 500 daily room revenue.
  // 5 guests/day, 2 staff/day, 2.5 room nights/day => variable costs 65/day.
  // Fixed wages+utilities = 3900/30 = 130/calendar day.
  assert.equal(jan.roomRevenue, 15500); assert.equal(jan.otherRevenue, 310); assert.equal(jan.totalRevenue, 15810)
  assert.equal(jan.operatingCost, 6045); assert.equal(jan.extraCost, 20); assert.equal(jan.deductions, 1581)
  assert.equal(jan.cashSurplus, 8164); assert.equal(jan.cumulativeCash, 8164)
  assert.equal(feb.calendarDays, 29); assert.equal(feb.roomRevenue, 14500); assert.equal(feb.cashSurplus, 7636)
  assert.equal(result.paybackMonth, '2028-02'); assert.equal(result.paybackYears, (1 + 1836 / 7636) / 12)
  assert.equal(JSON.stringify(p), before)
  p.monthlyPlan!.months[0].openDays = 0
  const closed = estimateMonthlyPlan(p).months[0]
  assert.equal(closed.totalRevenue, 0); assert.equal(closed.operatingCost, 4030); assert.equal(closed.cashSurplus, -4050)
})
test('own month rates replace yearly prices, own extras do not duplicate annual revenue', () => {
  const p = project(); noCosts(p)
  p.monthlyPlan!.months[0].roomRates = { standard: 10, deluxe: 20, suite: 40 }; p.monthlyPlan!.months[0].extraDailyRevenue = 1
  const result = estimateMonthlyPlan(p)
  assert.equal(result.months[0].roomRevenue, 1550); assert.equal(result.months[0].otherRevenue, 31)
  assert.equal(result.months[1].roomRevenue, 14500); assert.equal(result.annualRevenue, 1581 + (366 - 31) * 510)
  assert.equal(result.annualKnownRevenue, result.annualRevenue)
})
test('nonhotel factory units and prices are explicit drafts; duplicates and hotel billing rejected', () => {
  const p = project(), before = JSON.stringify(p), item = createFacilityBusinessItem(p, 'court')
  assert.equal(item.unit, 'hour'); assert.equal(item.capacityPerDay, 8); assert.equal(item.unitPrice, null); assert.equal(item.directUnitCost, null); assert.equal(item.fixedMonthlyCost, null)
  assert.deepEqual(item.utilizationRates, Array(12).fill(50)); assert.equal(item.label, '网球场'); assert.equal(JSON.stringify(p), before)
  p.monthlyPlan!.facilityItems.push(item)
  assert.throws(() => createFacilityBusinessItem(p, 'court'), /已有收费/); assert.throws(() => createFacilityBusinessItem(p, 'hotel'), /非客房/)
  p.facilities.push({ ...court, id: 'mahjong', type: 'restaurant', presetId: 'mahjong-room' })
  assert.equal(createFacilityBusinessItem(p, 'mahjong').unit, 'roomHour')
  p.facilities.push({ ...court, id: 'parking', type: 'parking' }, { ...court, id: 'pool', type: 'pool' })
  assert.equal(createFacilityBusinessItem(p, 'parking').unit, 'parkingDay'); assert.equal(createFacilityBusinessItem(p, 'pool').unit, 'ticket')
})
test('facility quantity and direct/fixed costs follow monthly utilization including zero or excluded months', () => {
  const p = project(); noCosts(p)
  const item = createFacilityBusinessItem(p, 'court')
  Object.assign(item, { unitPrice: 100, directUnitCost: 20, fixedMonthlyCost: 300 })
  item.utilizationRates[1] = 0; p.monthlyPlan!.facilityItems = [item]
  const result = estimateMonthlyPlan(p), jan = result.months[0], feb = result.months[1]
  assert.equal(jan.facilityRows[0].quantity, 124); assert.equal(jan.facilityRevenue, 12400); assert.equal(jan.facilityCost, 2780)
  assert.equal(feb.facilityRevenue, 0); assert.equal(feb.facilityCost, 300)
  item.unitPrice = null; item.directUnitCost = null
  assert.notEqual(estimateMonthlyPlan(p).months[1].cashSurplus, null)
  item.included = false
  const excluded = estimateMonthlyPlan(p).months[0]
  assert.equal(excluded.facilityCost, 0); assert.equal(excluded.facilityRevenue, 0); assert.equal(excluded.facilityRows.length, 0); assert.notEqual(excluded.cashSurplus, null)
})
test('null operating, facility or month costs prevent complete cash while preserving known amounts and zero', () => {
  for (const key of ['unitPrice', 'directUnitCost', 'fixedMonthlyCost'] as const) {
    const p = project(); noCosts(p); const item = createFacilityBusinessItem(p, 'court')
    Object.assign(item, { unitPrice: 100, directUnitCost: 20, fixedMonthlyCost: 300 }); item[key] = null
    p.monthlyPlan!.facilityItems = [item]
    assert.equal(estimateMonthlyPlan(p).paybackStatus, 'incomplete'); assert.equal(estimateMonthlyPlan(p).months[0].cashSurplus, null)
    item[key] = 0; assert.notEqual(estimateMonthlyPlan(p).months[0].cashSurplus, null)
  }
  const p = project(); p.operating!.items[0].unitPrice = null
  assert.equal(estimateMonthlyPlan(p).annualCash, null); p.monthlyPlan!.months[0].occupancyRate = 0
  assert.notEqual(estimateMonthlyPlan(p).months[0].cashSurplus, null)
  p.monthlyPlan!.months[1].roomRates.suite = null
  assert.equal(estimateMonthlyPlan(p).months[1].roomRevenue, null); assert.equal(estimateMonthlyPlan(p).months[1].knownRevenue, 8990)
})
test('closed months permit unknown inactive sales but fixed cost remains required', () => {
  const p = project(); noCosts(p); const entry = p.monthlyPlan!.months[0]
  entry.openDays = 0; entry.roomRates = { standard: null, deluxe: null, suite: null }; entry.extraDailyRevenue = null
  assert.equal(estimateMonthlyPlan(p).months[0].cashSurplus, 0)
  entry.extraFixedCost = null; assert.equal(estimateMonthlyPlan(p).months[0].cashSurplus, null)
  entry.extraFixedCost = 0; p.operating!.items = [cost('fixed', 'period', null)]
  assert.equal(estimateMonthlyPlan(p).months[0].cashSurplus, null)
})
test('missing future input blocks payback even if first filled month crosses, cumulative remains unknown thereafter', () => {
  const p = project(); noCosts(p); p.earnings!.manualInvestment = 10
  p.monthlyPlan!.months[11].extraFixedCost = null
  const result = estimateMonthlyPlan(p)
  assert.equal(result.paybackStatus, 'incomplete'); assert.equal(result.paybackMonth, null); assert.equal(result.paybackYears, null)
  assert.notEqual(result.months[10].cumulativeCash, null); assert.equal(result.months[11].cumulativeCash, null); assert.equal(result.forecast[12].cumulativeCash, null)
})
test('early first recovery is retained despite negative annual cash and later fall below capital', () => {
  const p = project(); noCosts(p); p.earnings!.manualInvestment = 10000
  for (let i = 1; i < 12; i++) p.monthlyPlan!.months[i].extraFixedCost = 20000
  const result = estimateMonthlyPlan(p)
  assert.ok(result.annualCash! < 0); assert.equal(result.paybackStatus, 'ready'); assert.equal(result.paybackMonth, '2028-01')
  assert.equal(result.paybackYears, (10000 / 15810) / 12); assert.ok(result.reviewItems.some(item => item.includes('再次低于')))
  assert.ok(result.forecast[2].cumulativeCash! < 10000)
})
test('horizon not recovered and unknown or zero investment have distinct statuses', () => {
  const p = project(); noCosts(p); p.earnings!.manualInvestment = 1e12
  const result = estimateMonthlyPlan(p)
  assert.equal(result.paybackStatus, 'not-recovered'); assert.equal(result.paybackMonth, null); assert.equal(result.forecast.length, 24)
  for (const value of [0, null]) { p.earnings!.manualInvestment = value; assert.equal(estimateMonthlyPlan(p).paybackStatus, 'no-investment') }
})
test('construction capital uses selected materials without old operating total and marks missing amounts', () => {
  const p = project(); p.earnings!.investmentMode = 'construction'
  const base = estimateMonthlyPlan(p); assert.equal(base.investment, estimateProject(p).total.point); assert.equal(base.investmentIncomplete, true)
  assert.equal(base.paybackStatus, 'ready'); assert.ok(base.reviewItems.some(item => item.includes('尚缺')))
  const brick = createMaterialPiece('red-brick', p); brick.unitPrice = 10; brick.taxMode = 'included'
  p.materials = [brick]; p.materialBudgetIncluded = true
  assert.equal(estimateMonthlyPlan(p).investment, base.investment! + 10)
  p.operating!.days = 300; assert.equal(estimateMonthlyPlan(p).investment, base.investment! + 10)
})
test('cycling reuses relative months and recomputes natural days and future fixed costs across leap years', () => {
  const p = project(); p.monthlyPlan!.horizonYears = 5
  p.monthlyPlan!.months[1].openDays = 29
  const result = estimateMonthlyPlan(p), leap = result.forecast[1], normal = result.forecast[13], nextLeap = result.forecast[49]
  assert.equal(leap.month, '2028-02'); assert.equal(leap.openDays, 29); assert.equal(leap.operatingCost, 5655)
  assert.equal(normal.month, '2029-02'); assert.equal(normal.openDays, 28); assert.equal(normal.operatingCost, 5460)
  assert.equal(nextLeap.month, '2032-02'); assert.equal(nextLeap.openDays, 29); assert.equal(nextLeap.operatingCost, 5655)
  assert.equal(p.monthlyPlan!.months[1].openDays, 29)
})
test('dangling or hotel binding cannot earn ghost revenue and can remain importable for correction', () => {
  const p = project(), item = createFacilityBusinessItem(p, 'court'); Object.assign(item, { unitPrice: 100, directUnitCost: 0, fixedMonthlyCost: 0 })
  p.monthlyPlan!.facilityItems = [item]; p.facilities = p.facilities.filter(item => item.id !== 'court')
  assert.deepEqual(validateMonthlyPlanSettings(p.monthlyPlan), p.monthlyPlan)
  let result = estimateMonthlyPlan(p); assert.equal(result.months[0].facilityRevenue, 0); assert.equal(result.paybackStatus, 'incomplete'); assert.ok(result.missingItems.some(item => item.includes('不存在')))
  item.facilityId = 'hotel'; result = estimateMonthlyPlan(p); assert.equal(result.months[0].facilityRevenue, 0); assert.equal(result.months[0].facilityRows[0].quantity, 0)
  item.included = false; assert.notEqual(estimateMonthlyPlan(p).months[0].cashSurplus, null)
})
test('disabled original operating settings stay unchanged while known monthly cost previews remain', () => {
  const p = project(); p.operating!.enabled = false
  const before = JSON.stringify(p), result = estimateMonthlyPlan(p)
  assert.equal(result.months[0].operatingCost, 6045); assert.equal(result.paybackStatus, 'incomplete'); assert.equal(JSON.stringify(p), before)
})
test('strict schemas reject nonconsecutive dates, unknowns, duplicate bindings, invalid rates and caps', () => {
  const p = project(); p.monthlyPlan!.facilityItems = [createFacilityBusinessItem(p, 'court')]
  const plan = p.monthlyPlan!, mutate = (edit: (p: MonthlyPlanSettings) => void) => { const copy = structuredClone(plan); edit(copy); return copy }
  assert.deepEqual(validateMonthlyPlanSettings(plan), plan)
  const invalid: unknown[] = [null, [], { ...plan, unknown: 1 }, { ...plan, enabled: 1 }, { ...plan, startMonth: '1999-12' }, { ...plan, startMonth: '2201-01' }, { ...plan, horizonYears: 61 }, { ...plan, horizonYears: 0 }, { ...plan, horizonYears: 1.5 }, { ...plan, months: [] },
    mutate(p => { p.months[1].month = p.months[0].month }), mutate(p => { p.months[1].openDays = 30 }), mutate(p => { p.months[0].openDays = -1 }), mutate(p => { p.months[0].occupancyRate = 101 }), mutate(p => { p.months[0].roomRates.standard = NaN }), mutate(p => { p.months[0].extraFixedCost = 1000001 }), mutate(p => { p.facilityItems.push(structuredClone(p.facilityItems[0])) }), mutate(p => { p.facilityItems.push({ ...p.facilityItems[0], id: 'second' }) }), mutate(p => { p.facilityItems[0].utilizationRates = [50] }), mutate(p => { p.facilityItems[0].utilizationRates[0] = 101 }), mutate(p => { p.facilityItems[0].capacityPerDay = 1e6 + 1 }), mutate(p => { p.facilityItems[0].label = '' }), mutate(p => { p.facilityItems[0].directUnitCost = Infinity }), mutate(p => { p.facilityItems[0].evidence = { kind: 'quotation', name: 'bad', scope: 'missing date' } }), mutate(p => { p.facilityItems[0].evidence.url = 'javascript:alert(1)' }), { ...plan, facilityItems: Array(201).fill(plan.facilityItems[0]) }]
  for (const value of invalid) assert.throws(() => validateMonthlyPlanSettings(value), /方案文件无效/)
  const maximum = structuredClone(plan); maximum.horizonYears = 60; maximum.months[0].extraFixedCost = 1e6; maximum.facilityItems[0].capacityPerDay = 1e6; maximum.facilityItems[0].unitPrice = 0
  assert.deepEqual(validateMonthlyPlanSettings(maximum), maximum)
})
test('rounding is per revenue and cost item, rather than rounded daily totals reused across months', () => {
  const p = project(); noCosts(p); p.earnings!.unavailableRooms = { standard: 1, deluxe: 2, suite: 2 }
  p.monthlyPlan!.months[0].roomRates.standard = 0.335; p.monthlyPlan!.months[0].occupancyRate = 100; p.monthlyPlan!.months[0].extraDailyRevenue = 0
  assert.equal(estimateMonthlyPlan(p).months[0].roomRevenue, 10.39)
  p.monthlyPlan!.months[0].openDays = 1; assert.equal(estimateMonthlyPlan(p).months[0].roomRevenue, 0.34)
  p.monthlyPlan!.months[0].extraFixedCost = 0.335; assert.equal(estimateMonthlyPlan(p).months[0].extraCost, 0.34)
})
test('included/excluded operating tax is counted once while review-only source flags do not block cash', () => {
  const p = project(); noCosts(p); p.operating!.items = [cost('taxed', 'day', 100)]
  p.operating!.items[0].taxMode = 'excluded'; p.operating!.items[0].taxRate = 9
  let result = estimateMonthlyPlan(p)
  assert.equal(result.months[0].operatingCost, 3379); assert.notEqual(result.months[0].cashSurplus, null)
  p.operating!.items[0].taxMode = 'unknown'; result = estimateMonthlyPlan(p)
  assert.equal(result.months[0].operatingCost, 3100); assert.ok(result.reviewItems.some(item => item.includes('税口径')))
  assert.ok(result.reviewItems.some(item => item.includes('内部示例'))); assert.notEqual(result.months[0].cashSurplus, null)
})
