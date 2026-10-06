import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { calculateSiteAreas, facilitySiteArea, formatArea } from './area.ts'
import { calculateMetrics, facilityCost } from './model.ts'
import { isGreenFacility } from './facilityCatalog.ts'
import type { Facility, Project } from './types'

function facility(id: string, overrides: Partial<Facility> = {}): Facility {
  return { id, name: id, type: 'hotel', x: 0, y: 0, width: 10, depth: 10, floors: 3, rooms: 1, unitCost: 100, rotation: 0, ...overrides }
}

function project(facilities: Facility[] = [], width = 20, depth = 20): Project {
  return { version: 1, id: 'area-project', name: '面积验算', location: '北京', siteWidth: width, siteDepth: depth, facilities, updatedAt: '2026-10-03T00:00:00.000Z' }
}

function near(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≠ ${expected}`)
}

test('empty site has no configured coverage or greenery and retains its entire area', () => {
  assert.deepEqual(calculateSiteAreas(project([], 10, 8)), { rawFacilityArea: 0, materialArea: 0, occupiedArea: 0, unallocatedArea: 80, overlapArea: 0, outOfBoundsArea: 0, footprint: 0, landscapeArea: 0 })
})

test('two partially overlapping buildings count occupied land and their foundation once', () => {
  const actual = calculateSiteAreas(project([facility('a'), facility('b', { type: 'restaurant', x: 5 })]))
  assert.deepEqual(actual, { rawFacilityArea: 200, materialArea: 0, occupiedArea: 150, unallocatedArea: 250, overlapArea: 50, outOfBoundsArea: 0, footprint: 150, landscapeArea: 0 })
})

test('triple-covered cells contribute once to the overlap region rather than pairwise intersection sums', () => {
  const actual = calculateSiteAreas(project([facility('a'), facility('b', { x: 5, y: 5 }), facility('c', { x: 5 })]))
  assert.equal(actual.rawFacilityArea, 300)
  assert.equal(actual.occupiedArea, 200)
  assert.equal(actual.overlapArea, 75)
  assert.equal(actual.unallocatedArea, 200)
})

test('touching edges and corners do not create overlap or duplicate land', () => {
  const actual = calculateSiteAreas(project([facility('a'), facility('b', { x: 10 }), facility('c', { x: 10, y: 10 })]))
  assert.equal(actual.occupiedArea, 300)
  assert.equal(actual.overlapArea, 0)
  assert.equal(actual.outOfBoundsArea, 0)
})

test('nested rectangles preserve outer union while nested green regions lose only non-green coverage', () => {
  const actual = calculateSiteAreas(project([
    facility('outer', { type: 'landscape' }),
    facility('inner-green', { type: 'landscape', x: 3, y: 3, width: 4, depth: 4 }),
    facility('inner-building', { x: 4, y: 4, width: 2, depth: 2 }),
  ]))
  assert.equal(actual.occupiedArea, 100)
  assert.equal(actual.overlapArea, 16)
  assert.equal(actual.landscapeArea, 96)
  assert.equal(actual.footprint, 4)
})

test('complete area preserves fractional engineering quantities and clipped calculations retain decimals', () => {
  const item = facility('decimal', { x: 9.5, y: 9, width: 2.75, depth: 1.25 })
  const p = project([item], 10, 10)
  assert.deepEqual(facilitySiteArea(item, p), { completeArea: 3.4375, inBoundsArea: .5, outOfBoundsArea: 2.9375, grossArea: 10.3125 })
  assert.equal(calculateSiteAreas(p).rawFacilityArea, 3.4375)
  assert.equal(calculateSiteAreas(p).occupiedArea, .5)
  assert.equal(calculateSiteAreas(p).outOfBoundsArea, 2.9375)
})

test('non-binary decimals and very narrow intersections retain geometric precision', () => {
  const actual = calculateSiteAreas(project([
    facility('a', { width: 1.2, depth: 1.1 }),
    facility('b', { type: 'pool', x: .5, y: .2, width: .9, depth: .7 }),
  ], 2, 2))
  near(actual.rawFacilityArea, 1.95)
  near(actual.occupiedArea, 1.46)
  near(actual.overlapArea, .49)
  near(actual.footprint, 1.32)
  const narrow = calculateSiteAreas(project([facility('a'), facility('b', { x: 10 - 1e-9 })]))
  assert.ok(narrow.overlapArea > 0)
  near(narrow.overlapArea, 1e-8)
})

test('90-degree rotation changes the clipping rectangle without changing full footprint or floor quantities', () => {
  const item = facility('rotated', { x: 7, y: 1, width: 8, depth: 2, rotation: 90 })
  const p = project([item], 10, 6)
  assert.deepEqual(facilitySiteArea(item, p), { completeArea: 16, inBoundsArea: 10, outOfBoundsArea: 6, grossArea: 48 })
  assert.equal(calculateSiteAreas(p).occupiedArea, 10)
  assert.equal(calculateSiteAreas(p).footprint, 10)
})

test('overlapping out-of-bounds facilities count their outside union once', () => {
  const p = project([facility('a', { x: -5 }), facility('b', { type: 'pool', x: -3 })], 10, 10)
  const actual = calculateSiteAreas(p)
  assert.equal(actual.rawFacilityArea, 200)
  assert.equal(actual.occupiedArea, 70)
  assert.equal(actual.overlapArea, 50)
  assert.equal(actual.outOfBoundsArea, 50)
  assert.equal(facilitySiteArea(p.facilities[0], p).outOfBoundsArea + facilitySiteArea(p.facilities[1], p).outOfBoundsArea, 80)
})

test('fully outside and boundary-touching facilities have zero in-site area', () => {
  const p = project([
    facility('negative', { x: -10, y: -10, width: 2, depth: 3 }),
    facility('touch', { x: 10, width: 2, depth: 3 }),
  ], 10, 10)
  const actual = calculateSiteAreas(p)
  assert.equal(actual.occupiedArea, 0)
  assert.equal(actual.unallocatedArea, 100)
  assert.equal(actual.outOfBoundsArea, 12)
  assert.equal(actual.footprint, 0)
  for (const item of p.facilities) assert.equal(facilitySiteArea(item, p).inBoundsArea, 0)
})

test('green unions deduct all non-green cover, including hidden and locked surfaces', () => {
  const p = project([
    facility('green', { type: 'landscape' }),
    facility('lawn', { type: 'landscape', presetId: 'activity-lawn', x: 5 }),
    facility('sports', { type: 'landscape', presetId: 'mini-golf', x: 8, width: 4, visible: false, locked: true }),
    facility('building', { x: 9, width: 2, visible: false }),
  ])
  const actual = calculateSiteAreas(p)
  assert.equal(actual.occupiedArea, 150)
  assert.equal(actual.landscapeArea, 110)
  assert.equal(actual.footprint, 20)
  for (const item of p.facilities) { item.visible = false; item.locked = true }
  assert.deepEqual(calculateSiteAreas(p), actual)
})

test('whole-site green and building coverage remains bounded after duplicate and outside layers', () => {
  const greens = [facility('a', { type: 'landscape', x: -10, y: -10, width: 40, depth: 40 }), facility('b', { type: 'landscape', width: 20, depth: 20 })]
  const greenMetrics = calculateMetrics(project(greens))
  assert.equal(greenMetrics.landscapeRatio, 1)
  assert.equal(greenMetrics.landscapeArea, 400)
  assert.equal(greenMetrics.unallocatedArea, 0)
  const mixed = calculateMetrics(project([...greens, facility('building', { width: 20, depth: 20 })]))
  assert.equal(mixed.coverageRatio, 1)
  assert.equal(mixed.landscapeRatio, 0)
  assert.equal(mixed.overlapArea, 400)
})

test('geometry corrections never alter full floor area, room capacity or the facility budget', () => {
  const p = project([facility('a', { x: -8 }), facility('b', { type: 'restaurant', x: -8 })], 10, 10)
  const before = calculateMetrics(p)
  assert.equal(before.buildingArea, 600)
  assert.equal(before.totalCost, 60000)
  assert.equal(before.footprint, 20)
  const cost = facilityCost(p.facilities[0])
  p.facilities[0].x = 0
  p.facilities[1].x = 10
  const after = calculateMetrics(p)
  for (const key of ['buildingArea', 'totalCost', 'costs', 'roomCount', 'courtCount', 'rawFacilityArea'] as const) assert.deepEqual(after[key], before[key])
  assert.equal(facilityCost(p.facilities[0]), cost)
  assert.equal(after.footprint, 100)
  assert.equal(facilitySiteArea(facility('pool', { type: 'pool' }), p).grossArea, 0)
})

test('area display uses two decimal places without rounding the underlying geometry', () => {
  assert.equal(formatArea(12345.6789), '12,345.68')
  assert.equal(formatArea(0), '0.00')
  assert.equal(formatArea(.004), '0.00')
  assert.equal(facilitySiteArea(facility('small', { width: .2, depth: .3 }), project()).completeArea, .06)
})

test('200 facilities calculate deterministically without mutating project geometry', context => {
  const p = project(Array.from({ length: 200 }, (_, i) => facility(`f-${i}`, {
    x: i * 3.71 - 10, y: (i % 23) * 7.25 - 5,
    width: 10.13 + (i % 7), depth: 20.77 + (i % 5), rotation: i % 2 ? 90 : 0,
    type: i % 3 ? 'hotel' : 'landscape', visible: i % 4 !== 0, locked: i % 5 === 0,
  })), 1000, 900)
  const copy = structuredClone(p)
  const start = performance.now()
  const first = calculateSiteAreas(p)
  context.diagnostic(`200 facilities exact area sweep: ${(performance.now() - start).toFixed(2)} ms`)
  assert.deepEqual(calculateSiteAreas(p), first)
  assert.deepEqual(p, copy)
  near(first.occupiedArea + first.unallocatedArea, 900000)
  assert.ok(first.occupiedArea <= first.rawFacilityArea)
  assert.ok(first.overlapArea <= first.occupiedArea)
})

// Integer cells are an independent test-only oracle. Production calculations
// use rectangle edges, so arbitrary decimal dimensions have no grid limit.
function oracle(p: Project) {
  const rects = p.facilities.map(f => ({ ...f, w: f.rotation === 90 ? f.depth : f.width, d: f.rotation === 90 ? f.width : f.depth }))
  const result = { occupiedArea: 0, overlapArea: 0, footprint: 0, landscapeArea: 0, outOfBoundsArea: 0 }
  const minX = Math.min(0, ...rects.map(f => f.x)), minY = Math.min(0, ...rects.map(f => f.y))
  const maxX = Math.max(p.siteWidth, ...rects.map(f => f.x + f.w)), maxY = Math.max(p.siteDepth, ...rects.map(f => f.y + f.d))
  for (let x = minX; x < maxX; x++) {
    for (let y = minY; y < maxY; y++) {
      const covers = rects.filter(f => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.d)
      const inside = x >= 0 && y >= 0 && x < p.siteWidth && y < p.siteDepth
      if (!inside) { if (covers.length) result.outOfBoundsArea++; continue }
      if (covers.length) result.occupiedArea++
      if (covers.length >= 2) result.overlapArea++
      if (covers.some(f => f.type === 'hotel' || f.type === 'restaurant')) result.footprint++
      if (covers.some(isGreenFacility) && covers.every(isGreenFacility)) result.landscapeArea++
    }
  }
  return result
}

test('exact sweep agrees with a fixed-seed integer-cell oracle across randomized overlaps and clipping', () => {
  let seed = 20261003
  const random = (max: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max }
  for (let sample = 0; sample < 80; sample++) {
    const p = project(Array.from({ length: 1 + random(15) }, (_, i) => {
      const type = (['hotel', 'pool', 'landscape', 'restaurant'] as const)[random(4)]
      return facility(String(i), { type, x: random(16) - 3, y: random(16) - 3, width: 1 + random(5), depth: 1 + random(5), rotation: random(2) ? 90 : 0, ...(type === 'landscape' && random(2) ? { presetId: 'mini-golf' as const } : {}) })
    }), 10, 10)
    const actual = calculateSiteAreas(p), expected = oracle(p)
    for (const key of ['occupiedArea', 'overlapArea', 'footprint', 'landscapeArea', 'outOfBoundsArea'] as const) assert.equal(actual[key], expected[key], `sample ${sample}: ${key}`)
    assert.equal(actual.unallocatedArea, 100 - expected.occupiedArea)
    assert.equal(actual.rawFacilityArea, p.facilities.reduce((sum, f) => sum + f.width * f.depth, 0))
  }
})
