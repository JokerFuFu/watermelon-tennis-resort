import test from 'node:test'
import assert from 'node:assert/strict'
import { FACILITY_PRESETS } from './facilityCatalog.ts'
import { calculateMetrics, createPresetFacility, createProject, facilityCost, parseProject } from './model.ts'
import { createFacilityPricing, estimateFacility, estimateProject, getBudgetSettings, validateBudgetSettings, validateFacilityPricing } from './pricing.ts'
import type { Facility, PriceItem, Project } from './types'

function fixture(overrides: Partial<Facility> = {}): Facility {
  return { id: 'test-facility', type: 'hotel', name: '测试酒店', x: 0, y: 0, width: 10, depth: 20, floors: 3, rooms: 12, unitCost: 100, rotation: 0, ...overrides }
}
function project(...facilities: Facility[]): Project {
  return { ...createProject('预算测试', 'blank'), facilities }
}
function item(overrides: Partial<PriceItem> = {}): PriceItem {
  return { id: 'item', label: '预算分项', basis: 'manual', quantity: 3, unit: '组', unitPrice: 100, lowUnitPrice: 80, highUnitPrice: 120, taxMode: 'included', evidence: { kind: 'assumption', name: '测试假设', scope: '测试范围' }, ...overrides }
}

test('all 51 preset drafts preserve original engineering baseline and validate', () => {
  const blank = project()
  assert.equal(FACILITY_PRESETS.length, 51)
  for (const preset of FACILITY_PRESETS) {
    const f = createPresetFacility(preset.id, blank)
    const before = facilityCost(f)
    f.pricing = createFacilityPricing(f)
    assert.equal(estimateFacility(f).point, before, preset.label)
    assert.deepEqual(validateFacilityPricing(f.pricing), f.pricing)
    assert.ok(estimateFacility(f).rows.every(row => row.evidence.kind === 'assumption'))
    assert.equal(estimateFacility(f).taxUnresolved, true)
  }
})

test('legacy arithmetic stays exactly unchanged and tax/source uncertainty remains explicit', () => {
  const f = fixture({ width: 12.345, depth: 23.456, unitCost: 6789.123 })
  const old = f.width * f.depth * f.floors * f.unitCost
  assert.equal(facilityCost(f), old)
  assert.equal(estimateProject(project(f)).engineering.point, calculateMetrics(project(f)).totalCost)
  assert.equal(estimateFacility(f).source, 'legacy')
  assert.equal(estimateFacility(f).quotedRows, 0)
  assert.equal(estimateFacility(f).taxUnresolved, true)
})

test('fractional baseline drafts reconcile to one cent and invalid tiny court geometry fails before producing prices', () => {
  for (const total of [0.01, 0.02, 0.014, 12345.6789, 789012.346]) {
    const f = fixture({ width: 1, depth: 1, floors: 1, unitCost: total })
    f.pricing = createFacilityPricing(f)
    assert.equal(estimateFacility(f).point, Math.round((total + Number.EPSILON) * 100) / 100)
  }
  const tinyCourt = fixture({ type: 'court', width: 1e-100, depth: 1e-100, rooms: 0, unitCost: 380000, surface: 'clay' })
  assert.throws(() => createFacilityPricing(tinyCourt), /单价.*超出范围/)
})

test('building quantity and room furniture rates change independently after draft creation', () => {
  const f = fixture()
  f.pricing = createFacilityPricing(f)
  const base = estimateFacility(f)
  const larger = estimateFacility({ ...f, width: 20 })
  const moreRooms = estimateFacility({ ...f, rooms: 24 })
  assert.equal(base.point, 60000)
  assert.equal(larger.point, 111600)
  assert.equal(moreRooms.point, 68400)
  assert.equal(larger.rows[3].amount, base.rows[3].amount)
  assert.equal(moreRooms.rows[0].amount, base.rows[0].amount)
  assert.equal(estimateFacility({ ...f, rooms: 0 }).rows[3].amount, 0)
})

test('court area, perimeter and fixed lighting quantities respond to dimensions and ignore rotation', () => {
  const f = fixture({ type: 'court', width: 10, depth: 20, floors: 1, rooms: 0, unitCost: 1000, surface: 'hard' })
  f.pricing = createFacilityPricing(f)
  const base = estimateFacility(f), larger = estimateFacility({ ...f, width: 20 })
  assert.equal(base.point, 1000)
  assert.equal(base.rows[2].quantity, 60)
  assert.equal(larger.rows[2].quantity, 80)
  assert.equal(larger.rows[3].quantity, 4)
  assert.equal(larger.rows[3].amount, 120)
  assert.equal(larger.point, 1760)
  assert.deepEqual(estimateFacility({ ...f, rotation: 90 }), base)
})

test('known excluded tax is added once, inclusive tax unchanged, unresolved tax never guessed', () => {
  const f = fixture({ pricing: { mode: 'items', items: [item({ taxMode: 'excluded', taxRate: 9 })] } })
  assert.equal(estimateFacility(f).point, 327)
  assert.equal(estimateFacility(f).rows[0].taxAmount, 27)
  assert.equal(estimateFacility(f).taxUnresolved, false)
  f.pricing!.items[0].taxMode = 'included'
  assert.equal(estimateFacility(f).point, 300)
  f.pricing!.items[0].taxMode = 'excluded'
  delete f.pricing!.items[0].taxRate
  assert.equal(estimateFacility(f).point, 300)
  assert.equal(estimateFacility(f).taxUnresolved, true)
  f.pricing!.items[0].taxRate = 0
  assert.equal(estimateFacility(f).taxUnresolved, false)
  f.pricing!.items[0].taxMode = 'unknown'
  assert.equal(estimateFacility(f).taxUnresolved, true)
})

test('component money rounds to cents and total sums rounded rows', () => {
  const rows = [item({ id: 'a', unitPrice: 0.333, lowUnitPrice: 0.3, highUnitPrice: 0.4 }), item({ id: 'b', unitPrice: 0.333, lowUnitPrice: 0.3, highUnitPrice: 0.4 })]
  const result = estimateFacility(fixture({ pricing: { mode: 'items', items: rows } }))
  assert.equal(result.point, 2)
  assert.equal(result.low, 1.8)
  assert.equal(result.high, 2.4)
})

test('total quote replaces aggregate and items without double counting and flags old quotes', () => {
  const f = fixture({ pricing: { mode: 'quotation', items: [item()], quote: { amount: 1234.56, supplier: '测试供应商', date: '2026-07-04', scope: '只含酒店建筑', taxMode: 'excluded', taxRate: 10 } } })
  const today = new Date('2026-10-03T00:00:00Z')
  const result = estimateFacility(f, today)
  assert.equal(result.point, 1358.02)
  assert.equal(result.low, result.point)
  assert.equal(result.high, result.point)
  assert.equal(result.rows.length, 1)
  assert.equal(result.quotedRows, 1)
  assert.equal(result.assumedRows, 0)
  assert.equal(result.staleQuote, true)
  f.pricing!.quote!.date = '2026-07-05'
  assert.equal(estimateFacility(f, today).staleQuote, false)
  assert.throws(() => estimateFacility(fixture({ pricing: { mode: 'quotation', items: [] } })), /总报价缺失/)
})

test('project fees use declared base, include hidden facilities and distinguish missing amounts from explicit zero', () => {
  const f = fixture({ visible: false, pricing: { mode: 'items', items: [item({ quantity: 1, unitPrice: 1000, lowUnitPrice: 800, highUnitPrice: 1200 })] } })
  const p = project(f)
  p.budget = { ...getBudgetSettings(p), landAmount: 10000, siteAmount: 200, connectionAmount: 300, openingAmount: 500 }
  const result = estimateProject(p)
  assert.equal(result.engineering.point, 1000)
  assert.equal(result.designAmount, 30)
  assert.equal(result.supervisionAmount, 10)
  assert.equal(result.reserveAmount, 154)
  assert.equal(result.total.point, 12194)
  assert.deepEqual(result.missingItems, [])
  p.budget = { ...p.budget, landAmount: null, siteAmount: 0, openingAmount: null }
  assert.deepEqual(estimateProject(p).missingItems, ['土地费用', '开办费用'])
  assert.deepEqual(estimateProject(project(f)).missingItems, ['土地费用', '场地工程费用', '市政接入费用', '开办费用'])
})

test('construction and grade record scope without arbitrary price multipliers; ranges are monotonic', () => {
  const p = project(fixture())
  const original = estimateProject(p)
  p.budget = { ...getBudgetSettings(p), construction: 'renovation', grade: 'premium' }
  const changed = estimateProject(p)
  assert.deepEqual(changed.total, original.total)
  assert.ok(changed.total.low <= changed.total.point && changed.total.point <= changed.total.high)
})

test('coverage counts money from user quotations, not public references or assumptions', () => {
  const p = project(fixture({ id: 'a', pricing: { mode: 'items', items: [item({ quantity: 1, evidence: { kind: 'quotation', name: '报价单位', scope: '设备', date: '2026-10-01' } })] } }), fixture({ id: 'b', pricing: { mode: 'items', items: [item({ quantity: 1, evidence: { kind: 'reference', name: '公开案例', scope: '参考案例' } })] } }))
  assert.equal(estimateProject(p).quoteCoverage, 0.5)
  assert.equal(estimateProject(project()).quoteCoverage, 0)
})

test('strict price validation rejects inconsistent ranges, invalid dates, identifiers, manual quantities and unsafe sources', () => {
  const base = { mode: 'items' as const, items: [item()] }
  const invalid = [
    { ...base, surprise: 1 }, { ...base, items: [] }, { ...base, items: Array.from({ length: 21 }, (_, i) => item({ id: `i${i}` })) },
    { ...base, items: [item(), item()] }, { ...base, items: [item({ quantity: undefined })] }, { ...base, items: [item({ quantity: -1 })] },
    { ...base, items: [item({ lowUnitPrice: 101 })] }, { ...base, items: [item({ highUnitPrice: 99 })] }, { ...base, items: [item({ unitPrice: Infinity })] },
    { ...base, items: [item({ taxRate: 101 })] }, { ...base, items: [item({ evidence: { kind: 'reference', name: '案例', scope: '范围', url: 'javascript:alert(1)' } })] },
    { ...base, items: [item({ evidence: { kind: 'quotation', name: '单位', scope: '范围', date: '2026-02-30' } })] },
    { ...base, items: [item({ evidence: { kind: 'quotation', name: '单位', scope: '范围' } })] },
    { mode: 'quotation', items: [] }, { mode: 'quotation', items: [], quote: { amount: 100, supplier: '', scope: '范围', date: '2026-10-01', taxMode: 'included' } },
  ]
  for (const input of invalid) assert.throws(() => validateFacilityPricing(input), /方案文件无效/)
  assert.deepEqual(validateFacilityPricing({ mode: 'quotation', items: [], quote: { amount: 0, supplier: '免费报价单位', scope: '范围', date: '2024-02-29', taxMode: 'included', url: 'https://example.com/quote' } }).items, [])
})

test('budget validation rejects unknown keys, missing values, out-of-range rates and nonnumeric amounts', () => {
  const base = getBudgetSettings(project())
  for (const settings of [{ ...base, fake: 1 }, { ...base, landAmount: undefined }, { ...base, designRate: 101 }, { ...base, reserveRate: -1 }, { ...base, siteAmount: '100' }, { ...base, openingAmount: 100000000001 }, { ...base, grade: 'luxury' }]) assert.throws(() => validateBudgetSettings(settings), /方案文件无效/)
  assert.deepEqual(validateBudgetSettings(base), base)
})

test('new pricing and project budget survive strict JSON import/export and preserve legacy fields', () => {
  const f = fixture()
  f.pricing = createFacilityPricing(f)
  const p = project(f)
  p.budget = getBudgetSettings(p)
  const imported = parseProject(JSON.stringify(p))
  assert.deepEqual(imported, p)
  assert.equal(imported.facilities[0].unitCost, 100)
  assert.equal(calculateMetrics(imported).totalCost, 60000)
  assert.deepEqual(estimateProject(imported), estimateProject(p))
  const corrupt = JSON.parse(JSON.stringify(p))
  corrupt.facilities[0].pricing.items[0].highUnitPrice = -1
  assert.throws(() => parseProject(JSON.stringify(corrupt)), /数值超出范围/)
})
