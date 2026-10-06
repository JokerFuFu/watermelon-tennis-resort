import test from 'node:test'
import assert from 'node:assert/strict'
import { HOTEL_ZONES, planFacilityArray, planHotelZone } from './hotelExpansion.ts'
import { FACILITY_PRESET_BY_ID } from './facilityCatalog.ts'
import { calculateMetrics, createProject, facilityCost, parseProject } from './model.ts'
import { createFacilityPricing } from './pricing.ts'
import { createMaterialPiece, materialObstacles } from './materials.ts'
import { createFacilityBusinessItem, getMonthlyPlan } from './monthlyPlan.ts'
import type { ExpansionPlan } from './hotelExpansion.ts'
import type { Facility, Project } from './types'

function project(facilities: Facility[] = [], width = 500, depth = 500): Project {
  return { ...createProject('快速搭建测试', 'blank'), siteWidth: width, siteDepth: depth, facilities }
}
function facility(id: string, overrides: Partial<Facility> = {}): Facility {
  return { id, name: `酒店 ${id}`, type: 'hotel', x: 20, y: 20, width: 10, depth: 8, floors: 3, rooms: 6,
    roomMix: { standard: 3, deluxe: 2, suite: 1 }, unitCost: 6800, rotation: 0, ...overrides }
}
function rect(item: Facility) {
  return { x: item.x, y: item.y, width: item.rotation === 90 ? item.depth : item.width, depth: item.rotation === 90 ? item.width : item.depth }
}
function assertAtomic(plan: ExpansionPlan, original: Project, message?: RegExp) {
  assert.equal(plan.success, false)
  assert.equal(plan.project, original)
  assert.deepEqual(plan.additions, [])
  if (message) assert.match(plan.message, message)
}
function assertPlacement(plan: ExpansionPlan, original: Project, outsideGap = 4, margin = 6) {
  assert.equal(plan.success, true, plan.message)
  assert.deepEqual(plan.project.facilities.slice(0, original.facilities.length), original.facilities)
  for (const [index, item] of original.facilities.entries()) assert.equal(plan.project.facilities[index], item)
  const ids = plan.project.facilities.map(item => item.id)
  assert.equal(new Set(ids).size, ids.length)
  const rectangles = plan.additions.map(rect)
  const x = Math.min(...rectangles.map(item => item.x)), y = Math.min(...rectangles.map(item => item.y))
  const right = Math.max(...rectangles.map(item => item.x + item.width)), bottom = Math.max(...rectangles.map(item => item.y + item.depth))
  assert.ok(x >= margin && y >= margin && right <= original.siteWidth - margin && bottom <= original.siteDepth - margin)
  for (const obstacle of [...original.facilities.map(rect), ...materialObstacles(original)]) {
    assert.ok(right + outsideGap <= obstacle.x + 1e-8 || x >= obstacle.x + obstacle.width + outsideGap - 1e-8
      || bottom + outsideGap <= obstacle.y + 1e-8 || y >= obstacle.y + obstacle.depth + outsideGap - 1e-8)
  }
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    const a = rectangles[i], b = rectangles[j]
    assert.ok(a.x + a.width <= b.x + 1e-8 || b.x + b.width <= a.x + 1e-8 || a.y + a.depth <= b.y + 1e-8 || b.y + b.depth <= a.y + 1e-8)
  }
  assert.equal(plan.project.updatedAt, original.updatedAt)
  assert.deepEqual(parseProject(JSON.stringify(plan.project)), plan.project)
}

for (const zone of HOTEL_ZONES) test(`${zone.id}: real catalog facilities fit, retain prices and preserve source`, () => {
  const p = project([facility('kept', { x: 6, y: 6, locked: true, visible: false })]), before = JSON.stringify(p)
  const plan = planHotelZone(p, zone.id)
  assertPlacement(plan, p)
  assert.equal(plan.additions.length, zone.entries.reduce((sum, entry) => sum + entry.count, 0))
  const expectedIds = zone.entries.flatMap(entry => Array.from({ length: entry.count }, () => entry.presetId))
  assert.deepEqual(plan.additions.map(item => item.presetId), expectedIds)
  for (const item of plan.additions) {
    const preset = FACILITY_PRESET_BY_ID[item.presetId!]
    assert.deepEqual([item.type, item.width, item.depth, item.floors, item.rooms, item.unitCost, item.roomMix, item.surface],
      [preset.type, preset.width, preset.depth, preset.floors, preset.rooms, preset.unitCost, preset.roomMix, preset.surface])
    assert.equal(item.locked, false); assert.equal(item.visible, true)
    if (item.roomMix) assert.notEqual(item.roomMix, preset.roomMix)
  }
  assert.equal(calculateMetrics(plan.project).totalCost, calculateMetrics(p).totalCost + plan.additions.reduce((sum, item) => sum + facilityCost(item), 0))
  assert.equal(JSON.stringify(p), before)
})

test('zone uses three uniform-width columns and uniform-depth rows with custom spacing', () => {
  const p = project(), plan = planHotelZone(p, 'tennis', { gap: 1.25, margin: 2.5 })
  assertPlacement(plan, p, 1.25, 2.5)
  const columnWidth = Math.max(...plan.additions.map(item => rect(item).width)), rowDepth = Math.max(...plan.additions.map(item => rect(item).depth))
  for (const [index, item] of plan.additions.entries()) {
    assert.equal(item.x, 2.5 + (index % 3) * (columnWidth + 1.25))
    assert.equal(item.y, 2.5 + Math.floor(index / 3) * (rowDepth + 1.25))
  }
})

test('zone room allocations are independent from siblings, preset and earlier plans', () => {
  const p = project(), first = planHotelZone(p, 'cabin'), second = planHotelZone(p, 'cabin')
  const presetBefore = structuredClone(FACILITY_PRESET_BY_ID.cabin.roomMix)
  first.additions[0].roomMix!.standard = 999
  assert.deepEqual(first.additions[1].roomMix, presetBefore)
  assert.deepEqual(second.additions[0].roomMix, presetBefore)
  assert.deepEqual(FACILITY_PRESET_BY_ID.cabin.roomMix, presetBefore)
})

test('array adds rows × columns full copies while preserving rotated fractional group layout', () => {
  const a = facility('a', { x: 20.125, y: 40.25, width: 10.375, depth: 8.5, rotation: 90, locked: true, visible: false })
  a.pricing = createFacilityPricing(a)
  const b = facility('b', { x: 31.875, y: 42.625, width: 7.75, depth: 6.25 }), p = project([a, b]), before = JSON.stringify(p)
  const options = { rows: 2, columns: 3, gapX: 1.125, gapY: 2.25 }, plan = planFacilityArray(p, ['b', 'a'], options)
  assertPlacement(plan, p)
  assert.equal(plan.additions.length, 12)
  const width = b.x + b.width - a.x, depth = a.width
  for (let i = 0; i < 6; i++) {
    const copyA: Facility = plan.additions[i * 2], copyB: Facility = plan.additions[i * 2 + 1]
    assert.equal(copyB.x - copyA.x, b.x - a.x); assert.equal(copyB.y - copyA.y, b.y - a.y)
    assert.equal(copyA.x - plan.additions[0].x, (i % 3) * (width + options.gapX))
    assert.equal(copyA.y - plan.additions[0].y, Math.floor(i / 3) * (depth + options.gapY))
    assert.equal(copyA.rotation, 90); assert.equal(copyA.locked, false); assert.equal(copyA.visible, true)
    assert.deepEqual(copyA.roomMix, a.roomMix); assert.notEqual(copyA.roomMix, a.roomMix)
    assert.deepEqual(copyA.pricing, a.pricing); assert.notEqual(copyA.pricing, a.pricing)
    assert.notEqual(copyA.pricing!.items[0].evidence, a.pricing!.items[0].evidence)
  }
  plan.additions[0].pricing!.items[0].evidence.name = '修改副本'
  plan.additions[0].roomMix!.standard = 99
  assert.equal(JSON.stringify(p), before)
  assert.deepEqual(plan.additions[2].pricing, a.pricing)
  assert.deepEqual(plan.additions[2].roomMix, a.roomMix)
})

test('array preserves supplier quote and truncates only copy name suffix to 120 characters', () => {
  const a = facility('a', { name: '木'.repeat(120), pricing: { mode: 'quotation', items: [], quote: { amount: 12345, taxMode: 'included', supplier: '报价公司', date: '2026-10-04', scope: '施工' } } }), p = project([a])
  const plan = planFacilityArray(p, ['a'], { rows: 1, columns: 1, gapX: 0, gapY: 0, margin: 0 })
  assertPlacement(plan, p, 4, 0)
  const copy = plan.additions[0]
  assert.equal(copy.name.length, 120); assert.ok(copy.name.endsWith(' 副本 1-1'))
  assert.deepEqual(copy.pricing, a.pricing); assert.notEqual(copy.pricing!.quote, a.pricing!.quote)
  assert.equal(facilityCost(copy), facilityCost(a))
  assert.equal(p.facilities.length, 1)
})

test('copy and zone preserve all project metadata and never duplicate monthly business bindings', () => {
  const a = facility('a', { type: 'restaurant', rooms: 0, roomMix: undefined }), p = project([a])
  p.monthlyPlan = getMonthlyPlan(p)
  p.monthlyPlan.facilityItems = [createFacilityBusinessItem(p, a.id)]
  p.materialBudgetIncluded = true
  const before = JSON.stringify(p)
  for (const plan of [planHotelZone(p, 'dining'), planFacilityArray(p, ['a'], { rows: 2, columns: 2, gapX: 4, gapY: 4 })]) {
    assert.equal(plan.success, true)
    assert.equal(plan.project.monthlyPlan, p.monthlyPlan)
    assert.deepEqual(plan.project.monthlyPlan!.facilityItems.map(item => item.facilityId), ['a'])
    assert.deepEqual({ ...plan.project, facilities: p.facilities }, p)
  }
  assert.equal(JSON.stringify(p), before)
})

test('all existing facilities including hidden overlapping and out-of-site records are fixed obstacles', () => {
  const p = project([
    facility('hidden', { x: 0, y: 0, width: 90, depth: 90, visible: false }),
    facility('overlap', { x: 20, y: 30, width: 40, depth: 70, locked: true }),
    facility('outside', { x: -20, y: 90, width: 130, depth: 30 }),
  ]), before = JSON.stringify(p)
  const plan = planHotelZone(p, 'family')
  assertPlacement(plan, p)
  assert.equal(JSON.stringify(p), before)
})

test('material pieces and whole assembly envelope are reserved including hidden locked material', () => {
  const p = project([facility('source', { x: 200, y: 200 })]), material = createMaterialPiece('red-brick', project())
  p.materials = [
    { ...material, id: 'single', x: 0, y: 0, width: 120, depth: 100, visible: false, locked: true },
    { ...material, id: 'left', x: 125, y: 0, width: 10, depth: 100 },
    { ...material, id: 'right', x: 240, y: 0, width: 10, depth: 100 },
  ]
  p.materialAssemblies = [{ id: 'assembly', name: '组合留空也占地', pieceIds: ['left', 'right'] }]
  const before = JSON.stringify(p)
  for (const plan of [planHotelZone(p, 'leisure'), planFacilityArray(p, ['source'], { rows: 1, columns: 2, gapX: 2, gapY: 2 })]) {
    assertPlacement(plan, p)
    assert.equal(plan.project.materials, p.materials)
    assert.equal(plan.project.materialAssemblies, p.materialAssemblies)
  }
  assert.equal(JSON.stringify(p), before)
})

test('zone and array fail atomically when whole block cannot fit or site is fully reserved', () => {
  const small = project([facility('a')], 30, 30), before = JSON.stringify(small)
  assertAtomic(planHotelZone(small, 'tennis'), small, /策略未找到完整空位/)
  assertAtomic(planFacilityArray(small, ['a'], { rows: 3, columns: 3, gapX: 4, gapY: 4 }), small, /策略未找到完整空位/)
  assert.equal(JSON.stringify(small), before)
  const full = project([facility('full', { x: 0, y: 0, width: 500, depth: 500 })])
  assertAtomic(planHotelZone(full, 'leisure'), full)
  assertAtomic(planFacilityArray(full, ['full'], { rows: 1, columns: 1, gapX: 0, gapY: 0 }), full)
})

test('selected internal overlap is rejected; exact touching edges are accepted', () => {
  const p = project([facility('a'), facility('b', { x: 25 })])
  assertAtomic(planFacilityArray(p, ['a', 'b'], { rows: 1, columns: 1, gapX: 0, gapY: 0 }), p, /选区内部/)
  p.facilities[1].x = 30
  assertPlacement(planFacilityArray(p, ['a', 'b'], { rows: 1, columns: 1, gapX: 0, gapY: 0 }), p)
})

test('invalid selections reject zero, duplicates, missing and badly typed IDs', () => {
  const p = project([facility('a')]), options = { rows: 1, columns: 1, gapX: 4, gapY: 4 }
  for (const ids of [[], ['a', 'a'], ['missing'], ['a', 'missing'], [''], [null as unknown as string], [1 as unknown as string]]) assertAtomic(planFacilityArray(p, ids, options), p)
  assertAtomic(planHotelZone(p, 'toString'), p)
  assertAtomic(planHotelZone(p, 'missing'), p)
})

test('bad array counts, spacings and margins fail without modification', () => {
  const p = project([facility('a')]), options = { rows: 1, columns: 1, gapX: 4, gapY: 4 }, before = JSON.stringify(p)
  for (const key of ['rows', 'columns'] as const) for (const value of [0, -1, 11, 1.5, NaN, Infinity]) assertAtomic(planFacilityArray(p, ['a'], { ...options, [key]: value }), p)
  for (const key of ['gapX', 'gapY', 'margin'] as const) for (const value of [-1, 1001, NaN, Infinity, null as unknown as number]) assertAtomic(planFacilityArray(p, ['a'], { ...options, [key]: value }), p)
  for (const key of ['gap', 'margin'] as const) for (const value of [-1, 1001, NaN, Infinity, null as unknown as number]) assertAtomic(planHotelZone(p, 'leisure', { [key]: value }), p)
  assert.equal(JSON.stringify(p), before)
})

test('200 facility cap is checked before any clone IDs are allocated', t => {
  const p = project(Array.from({ length: 199 }, (_, index) => facility(`f${index}`))), randomUUID = t.mock.method(crypto, 'randomUUID')
  assertAtomic(planHotelZone(p, 'leisure'), p, /200/)
  assertAtomic(planFacilityArray(p, ['f0'], { rows: 10, columns: 10, gapX: 0, gapY: 0 }), p, /200/)
  assert.equal(randomUUID.mock.callCount(), 0)
})

test('array may reach exactly 200 and leaves nonselected overlap warnings untouched', () => {
  const p = project(Array.from({ length: 199 }, (_, index) => facility(`f${index}`, { x: 200, y: 200 })))
  const plan = planFacilityArray(p, ['f0'], { rows: 1, columns: 1, gapX: 0, gapY: 0 })
  assertPlacement(plan, p)
  assert.equal(plan.project.facilities.length, 200)
})

test('invalid geometry, duplicate source IDs and bad site dimensions reject both strategies', () => {
  const options = { rows: 1, columns: 1, gapX: 4, gapY: 4 }
  for (const patch of [{ x: NaN }, { y: Infinity }, { width: 0 }, { depth: -1 }, { width: 1001 }, { rotation: 45 as Facility['rotation'] }]) {
    const p = project([facility('a', patch)])
    assertAtomic(planHotelZone(p, 'leisure'), p)
    assertAtomic(planFacilityArray(p, ['a'], options), p)
  }
  const duplicate = project([facility('a'), facility('a', { x: 40 })])
  assertAtomic(planHotelZone(duplicate, 'leisure'), duplicate)
  assertAtomic(planFacilityArray(duplicate, ['a'], options), duplicate)
  for (const siteWidth of [NaN, Infinity, 0, 29, 1001]) {
    const p = project([facility('a')], siteWidth)
    assertAtomic(planHotelZone(p, 'leisure'), p)
    assertAtomic(planFacilityArray(p, ['a'], options), p)
  }
})

test('zero gaps, one-copy array and decimal site positions are accepted without snapping', () => {
  const p = project([facility('a', { x: 100.1234, y: 150.5678 }), facility('b', { x: 112.9876, y: 150.6791 })])
  const plan = planFacilityArray(p, ['a', 'b'], { rows: 1, columns: 1, gapX: 0, gapY: 0, margin: 1.2345 })
  assertPlacement(plan, p, 4, 1.2345)
  assert.ok(Math.abs((plan.additions[1].x - plan.additions[0].x) - (p.facilities[1].x - p.facilities[0].x)) < 1e-12)
  assert.ok(Math.abs((plan.additions[1].y - plan.additions[0].y) - (p.facilities[1].y - p.facilities[0].y)) < 1e-12)
})
