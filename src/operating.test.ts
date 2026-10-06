import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, parseProject } from './model.ts'
import { estimateProject } from './pricing.ts'
import { estimateCombinedBudget, estimateOperating, getOperatingSettings, validateOperatingSettings } from './operating.ts'
import type { Facility, OperatingItem, OperatingSettings, Project } from './types'

function facility(overrides: Partial<Facility> = {}): Facility {
  return { id: 'hotel', type: 'hotel', name: '测试酒店', x: 0, y: 0, width: 10, depth: 20, floors: 2, rooms: 10, unitCost: 100, rotation: 0, ...overrides }
}
function item(overrides: Partial<OperatingItem> = {}): OperatingItem {
  return { id: 'water', label: '饮用水', included: true, basis: 'personDay', quantity: 2, unit: '瓶', unitPrice: 2, taxMode: 'included', evidence: { kind: 'assumption', name: '内部测试', scope: '仅测试采购成本' }, ...overrides }
}
function settings(overrides: Partial<OperatingSettings> = {}): OperatingSettings {
  return { enabled: true, days: 3, guestMode: 'rooms', occupancyRate: 50, guestsPerRoom: 2, dailyGuests: 100, staffCount: 2, items: [item()], ...overrides }
}
function project(overrides: Partial<Project> = {}): Project {
  return { ...createProject('运营测试', 'blank'), facilities: [facility()], operating: settings(), ...overrides }
}

test('old project preview is disabled and has 12 independent editable assumption rows', () => {
  const old = project({ operating: undefined })
  delete old.operating
  const first = getOperatingSettings(old), second = getOperatingSettings(old)
  assert.equal(first.enabled, false)
  assert.equal(first.items.length, 12)
  assert.equal(first.days, 30)
  assert.equal(first.occupancyRate, 70)
  assert.equal(first.guestsPerRoom, 2)
  assert.equal(first.staffCount, 0)
  assert.ok(first.items.every(row => row.evidence.kind === 'assumption'))
  assert.deepEqual(first, second)
  first.items[0].unitPrice = 100
  assert.equal(second.items[0].unitPrice, 2)
  assert.equal(Object.hasOwn(old, 'operating'), false)
})

test('existing settings are returned as a deep copy', () => {
  const p = project(), copy = getOperatingSettings(p)
  copy.items[0].evidence.name = '改动'
  assert.equal(p.operating!.items[0].evidence.name, '内部测试')
})

test('room occupancy, guest days and staff days reconcile drinking water by hand', () => {
  const result = estimateOperating(project())
  assert.equal(result.occupiedRooms, 5)
  assert.equal(result.averageGuests, 10)
  assert.equal(result.averageStaff, 2)
  assert.equal(result.averagePeople, 12)
  assert.equal(result.guestDays, 30)
  assert.equal(result.staffDays, 6)
  assert.equal(result.personDays, 36)
  assert.equal(result.roomNights, 15)
  assert.equal(result.rows[0].baseQuantity, 36)
  assert.equal(result.rows[0].quantity, 72)
  assert.equal(result.total, 144)
  assert.equal(result.perDay, 48)
})

test('manual guests replace inferred guests while room nights remain occupancy based', () => {
  const result = estimateOperating(project({ operating: settings({ guestMode: 'manual', dailyGuests: 4.5 }) }))
  assert.equal(result.averageGuests, 4.5)
  assert.equal(result.averagePeople, 6.5)
  assert.equal(result.guestDays, 13.5)
  assert.equal(result.roomNights, 15)
  assert.equal(result.total, 78)
})

test('hidden and locked hotels contribute rooms; floors and non-hotel rooms do not', () => {
  const p = project({ facilities: [facility({ locked: true, visible: false, floors: 30 }), facility({ id: 'annex', rooms: 5 }), facility({ id: 'restaurant', type: 'restaurant', rooms: 999 })] })
  const result = estimateOperating(p)
  assert.equal(result.occupiedRooms, 7.5)
  assert.equal(result.roomNights, 22.5)
  assert.equal(result.averageGuests, 15)
  p.facilities[0].floors = 1
  assert.equal(estimateOperating(p).roomNights, 22.5)
  p.facilities[0].rooms = 20
  assert.equal(estimateOperating(p).roomNights, 37.5)
})

test('guest meals and employee meals use separate bases without double charging', () => {
  const result = estimateOperating(project({ operating: settings({ items: [item({ id: 'guest', label: '宾客早餐', basis: 'guestDay', quantity: 1, unitPrice: 20 }), item({ id: 'staff', label: '员工餐', basis: 'staffDay', quantity: 2, unitPrice: 20 })] }) }))
  assert.equal(result.rows[0].quantity, 30)
  assert.equal(result.rows[0].amount, 600)
  assert.equal(result.rows[1].quantity, 12)
  assert.equal(result.rows[1].amount, 240)
  assert.equal(result.total, 840)
})

test('day, period and manual quantities remain distinct across durations', () => {
  const p = project({ operating: settings({ days: 10, items: [item({ id: 'day', basis: 'day', quantity: 2, unitPrice: 3 }), item({ id: 'period', basis: 'period', quantity: 2, unitPrice: 5 }), item({ id: 'manual', basis: 'manual', quantity: 4.5, unitPrice: 10 })] }) })
  const result = estimateOperating(p)
  assert.deepEqual(result.rows.map(row => row.quantity), [20, 2, 4.5])
  assert.deepEqual(result.rows.map(row => row.amount), [60, 10, 45])
  assert.equal(result.total, 115)
  p.operating!.days = 20
  assert.deepEqual(estimateOperating(p).rows.map(row => row.amount), [120, 10, 45])
})

test('room-day supplies use occupied room nights rather than guest days or floors', () => {
  const result = estimateOperating(project({ operating: settings({ items: [item({ basis: 'roomDay', quantity: 1, unitPrice: 8 })] }) }))
  assert.equal(result.rows[0].quantity, 15)
  assert.equal(result.total, 120)
})

test('zero guests and zero quantity turn null prices into zero rather than missing costs', () => {
  const result = estimateOperating(project({ operating: settings({ occupancyRate: 0, staffCount: 0, items: [item({ unitPrice: null }), item({ id: 'period', basis: 'period', quantity: 0, unitPrice: null })] }) }))
  assert.deepEqual(result.rows.map(row => row.amount), [0, 0])
  assert.equal(result.total, 0)
  assert.deepEqual(result.unpricedItems, [])
  assert.deepEqual(result.taxUnresolvedItems, [])
})

test('null missing price, confirmed zero and excluded rows are handled independently', () => {
  const result = estimateOperating(project({ operating: settings({ items: [item({ id: 'missing', label: '缺报价', unitPrice: null }), item({ id: 'free', label: '免费', unitPrice: 0 }), item({ id: 'omitted', label: '不计入', included: false, unitPrice: null, taxMode: 'unknown' })] }) }))
  assert.deepEqual(result.rows.map(row => row.amount), [null, 0, 0])
  assert.deepEqual(result.unpricedItems, ['缺报价'])
  assert.deepEqual(result.taxUnresolvedItems, [])
  assert.equal(result.assumedRows, 2)
})

test('disabled operating budget contributes no total, missing items or tax warnings', () => {
  const result = estimateOperating(project({ operating: settings({ enabled: false, items: [item({ taxMode: 'unknown' }), item({ id: 'missing', unitPrice: null })] }) }))
  assert.equal(result.rows[0].amount, 144)
  assert.equal(result.rows[1].amount, null)
  assert.equal(result.total, 0)
  assert.equal(result.perDay, 0)
  assert.equal(result.assumedRows, 0)
  assert.deepEqual(result.unpricedItems, [])
  assert.deepEqual(result.taxUnresolvedItems, [])
  assert.equal(result.rows[0].taxUnresolved, false)
})

test('known excluded tax is added once; inclusive and unknown tax do not change price', () => {
  const p = project({ operating: settings({ items: [item({ taxMode: 'excluded', taxRate: 9 })] }) })
  let result = estimateOperating(p)
  assert.equal(result.total, 156.96)
  assert.equal(result.rows[0].taxAmount, 12.96)
  assert.deepEqual(result.taxUnresolvedItems, [])
  p.operating!.items[0].taxMode = 'included'
  result = estimateOperating(p)
  assert.equal(result.total, 144)
  assert.equal(result.rows[0].taxAmount, 0)
  p.operating!.items[0].taxMode = 'unknown'
  result = estimateOperating(p)
  assert.equal(result.total, 144)
  assert.deepEqual(result.taxUnresolvedItems, ['饮用水'])
  p.operating!.items[0].taxMode = 'excluded'
  delete p.operating!.items[0].taxRate
  assert.deepEqual(estimateOperating(p).taxUnresolvedItems, ['饮用水'])
  p.operating!.items[0].taxRate = 0
  assert.deepEqual(estimateOperating(p).taxUnresolvedItems, [])
})

test('money rounds each item then sums and per-day rounds separately', () => {
  const result = estimateOperating(project({ operating: settings({ items: [item({ id: 'a', basis: 'manual', quantity: 1, unitPrice: 0.335 }), item({ id: 'b', basis: 'manual', quantity: 1, unitPrice: 0.335 })] }) }))
  assert.equal(result.rows[0].amount, 0.34)
  assert.equal(result.rows[1].amount, 0.34)
  assert.equal(result.total, 0.68)
  assert.equal(result.perDay, 0.23)
})

test('empty items and no hotel facilities are supported with explicit zero consumption', () => {
  const p = project({ facilities: [], operating: settings({ staffCount: 0, items: [] }) })
  assert.deepEqual(validateOperatingSettings(p.operating), p.operating)
  const result = estimateOperating(p)
  assert.equal(result.averageGuests, 0)
  assert.equal(result.roomNights, 0)
  assert.equal(result.total, 0)
  assert.deepEqual(result.rows, [])
})

test('combined funds sum construction and consumption without altering construction reserve', () => {
  const p = project()
  const before = estimateProject(p), combined = estimateCombinedBudget(p)
  assert.deepEqual(combined.construction, before.total)
  assert.equal(combined.total.point, before.total.point + 144)
  assert.equal(combined.total.low, before.total.low + 144)
  assert.equal(combined.total.high, before.total.high + 144)
  p.operating!.items[0].unitPrice = 10000
  assert.deepEqual(estimateProject(p), before)
  assert.equal(estimateCombinedBudget(p).total.point, before.total.point + 720000)
})

test('old JSON parsing does not inject new operating defaults', () => {
  const old = project()
  delete old.operating
  const result = parseProject(JSON.stringify(old))
  assert.equal(Object.hasOwn(result, 'operating'), false)
  assert.deepEqual(estimateCombinedBudget(result).total, estimateProject(old).total)
})

test('operating JSON roundtrip retains schema, quotations, decimals and disabled rows', () => {
  const p = project({ operating: settings({ occupancyRate: 77.5, guestsPerRoom: 1.5, dailyGuests: 4.5, items: [item({ basis: 'manual', quantity: 12.5, unitPrice: null, included: false, evidence: { kind: 'quotation', name: '用户输入', date: '2026-10-03', scope: '瓶装水', url: 'https://example.com/quote' } })] }) })
  assert.deepEqual(parseProject(JSON.stringify(p)), p)
  assert.deepEqual(estimateOperating(parseProject(JSON.stringify(p))), estimateOperating(p))
})

test('settings reject unknown fields, missing booleans and invalid numerical limits', () => {
  const invalid: unknown[] = [null, [], { ...settings(), unexpected: 1 }, { ...settings(), enabled: 'true' }, { ...settings(), days: 0 }, { ...settings(), days: 3651 }, { ...settings(), days: 1.5 }, { ...settings(), occupancyRate: 101 }, { ...settings(), guestsPerRoom: 10.01 }, { ...settings(), dailyGuests: 1000001 }, { ...settings(), staffCount: 1.5 }, { ...settings(), staffCount: 100001 }, { ...settings(), guestMode: 'both' }]
  for (const value of invalid) assert.throws(() => validateOperatingSettings(value), /方案文件无效/)
})

test('items reject duplicates, oversized list, unknown fields and invalid unit prices', () => {
  const invalid = [
    settings({ items: [item(), item()] }),
    settings({ items: Array.from({ length: 31 }, (_, index) => item({ id: String(index) })) }),
    settings({ items: [{ ...item(), extra: true } as OperatingItem] }),
    settings({ items: [item({ label: ' ' })] }), settings({ items: [item({ unit: '' })] }),
    settings({ items: [item({ quantity: -1 })] }), settings({ items: [item({ quantity: Infinity })] }), settings({ items: [item({ quantity: 1000001 })] }),
    settings({ items: [item({ unitPrice: NaN })] }), settings({ items: [item({ unitPrice: -1 })] }), settings({ items: [item({ unitPrice: 1000001 })] }),
    settings({ items: [item({ taxRate: 101 })] }), settings({ items: [item({ included: undefined as unknown as boolean })] }),
  ]
  for (const value of invalid) assert.throws(() => validateOperatingSettings(value), /方案文件无效/)
  assert.doesNotThrow(() => validateOperatingSettings(settings({ items: Array.from({ length: 30 }, (_, index) => item({ id: String(index) })) })))
})

test('evidence rejects impossible dates, unsafe URLs and incomplete quotations before import', () => {
  const invalid = [
    { kind: 'assumption', name: '测试', scope: '测试', date: '2026-02-30' },
    { kind: 'quotation', name: '测试', scope: '测试' },
    { kind: 'reference', name: '测试', scope: '测试', url: 'javascript:alert(1)' },
    { kind: 'reference', name: '测试', scope: '测试', url: 'file:///quote' },
    { kind: 'assumption', name: '测试', scope: '测试', unknown: 1 },
  ]
  for (const evidence of invalid) {
    const p = project({ operating: settings({ items: [item({ evidence: evidence as OperatingItem['evidence'] })] }) })
    assert.throws(() => parseProject(JSON.stringify(p)), /方案文件无效/)
  }
})

test('strict parser rejects invalid operating budgets instead of accepting a partial project', () => {
  const p = project()
  const bad = { ...p, operating: { ...p.operating, days: -1 } }
  assert.throws(() => parseProject(JSON.stringify(bad)), /运营天数/)
  assert.deepEqual(estimateOperating(p).total, 144)
})
