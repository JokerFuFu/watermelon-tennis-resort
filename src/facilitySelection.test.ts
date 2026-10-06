import test from 'node:test'
import assert from 'node:assert/strict'
import { alignFacilitySelection, getFacilitySelectionBounds, moveFacilitySelection } from './facilitySelection.ts'
import type { Facility, Project } from './types'

function facility(id: string, patch: Partial<Facility> = {}): Facility {
  return { id, type: 'hotel', name: id, x: 10, y: 10, width: 10, depth: 10, floors: 3, rooms: 12, roomMix: { standard: 6, deluxe: 4, suite: 2 }, unitCost: 6800, rotation: 0, ...patch }
}

function project(facilities: Facility[], siteWidth = 100, siteDepth = 100): Project {
  return { version: 1, id: 'selection', name: '酒店设计', location: '北京', facilities, siteWidth, siteDepth, updatedAt: '2026-10-03T00:00:00Z' }
}

test('selection bounds deduplicate IDs, ignore absent IDs, include hidden facilities and use rotated extents', () => {
  const p = project([facility('a'), facility('b', { x: 30, y: 20, width: 8, depth: 20, rotation: 90, visible: false })])
  assert.deepEqual(getFacilitySelectionBounds(p, ['b', 'a', 'a', 'missing']), { x: 10, y: 10, width: 40, depth: 18 })
  assert.equal(getFacilitySelectionBounds(p, []), null)
  assert.equal(getFacilitySelectionBounds(p, ['missing']), null)
})

test('move clamps one shared delta to the whole group and preserves relative positions', () => {
  const p = project([facility('a'), facility('b', { x: 40, y: 30, width: 20 })])
  const result = moveFacilitySelection(p, ['a', 'a', 'b'], 1000, -1000)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.facilities.map(f => [f.x, f.y]), [[50, 0], [80, 20]])
  assert.equal(result.changed, true)
  assert.deepEqual(p.facilities.map(f => [f.x, f.y]), [[10, 10], [40, 30]])
})

test('move normalizes an already out-of-bounds group when its envelope can fit', () => {
  const p = project([facility('a', { x: -20, y: 95 }), facility('b', { x: 5, y: 85 })])
  const result = moveFacilitySelection(p, ['a', 'b'], 0, 0)
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.facilities.map(f => [f.x, f.y]), [[0, 90], [25, 80]])
})

test('any selected lock rejects move and alignment atomically including no-op commands', () => {
  const p = project([facility('a'), facility('b', { locked: true, x: 30 })])
  const before = structuredClone(p)
  for (const result of [moveFacilitySelection(p, ['a', 'b'], 10, 20), moveFacilitySelection(p, ['a', 'b'], 0, 0), alignFacilitySelection(p, ['a', 'b'], 'left')]) {
    assert.equal(result.ok, false)
    if (!result.ok) assert.match(result.error, /锁定/)
  }
  assert.deepEqual(p, before)
  assert.equal(moveFacilitySelection(p, ['a'], 1, 1).ok, true)
})

test('empty selections and nonfinite movement fail without mutating input', () => {
  const p = project([facility('a')])
  assert.equal(moveFacilitySelection(p, [], 0, 0).ok, false)
  assert.equal(alignFacilitySelection(p, ['absent'], 'left').ok, false)
  for (const invalid of [NaN, Infinity, -Infinity]) {
    assert.equal(moveFacilitySelection(p, ['a'], invalid, 0).ok, false)
    assert.equal(moveFacilitySelection(p, ['a'], 0, invalid).ok, false)
  }
  assert.deepEqual([p.facilities[0].x, p.facilities[0].y], [10, 10])
})

test('oversized envelope and invalid geometry reject transforms', () => {
  const tooWide = project([facility('a', { x: 0, width: 60 }), facility('b', { x: 80, width: 30 })])
  assert.equal(moveFacilitySelection(tooWide, ['a', 'b'], 0, 0).ok, false)
  assert.equal(moveFacilitySelection(project([facility('a', { depth: 101 })]), ['a'], 0, 0).ok, false)
  for (const patch of [{ x: NaN }, { y: Infinity }, { width: NaN }, { depth: 0 }]) {
    const p = project([facility('a', patch)])
    assert.equal(getFacilitySelectionBounds(p, ['a']), null)
    assert.equal(moveFacilitySelection(p, ['a'], 0, 0).ok, false)
    assert.equal(alignFacilitySelection(p, ['a'], 'left').ok, false)
  }
  assert.equal(moveFacilitySelection(project([facility('a')], 0), ['a'], 1, 0).ok, false)
})

test('movement honors rotated boundaries and preserves supplied distance precision', () => {
  const p = project([facility('a', { x: 10.01, y: 20.02, width: 5, depth: 20, rotation: 90 })], 50, 50)
  const result = moveFacilitySelection(p, ['a'], 90, 1.235)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual([result.facilities[0].x, result.facilities[0].y], [30, 20.02 + 1.235])
    assert.deepEqual([result.dx, result.dy], [30 - 10.01, 1.235])
  }
})

test('unchanged operations keep original array and changed operations preserve unselected object and metadata', () => {
  const a = facility('a', { presetId: 'villa', visible: false })
  const b = facility('b', { x: 50, locked: true })
  const p = project([a, b])
  const unchanged = moveFacilitySelection(p, ['a'], 0, 0)
  assert.equal(unchanged.ok, true)
  if (unchanged.ok) {
    assert.equal(unchanged.changed, false)
    assert.equal(unchanged.facilities, p.facilities)
  }
  const moved = moveFacilitySelection(p, ['a'], 3, 4)
  assert.equal(moved.ok, true)
  if (!moved.ok) return
  const { x: _oldX, y: _oldY, ...before } = a
  const { x: _newX, y: _newY, ...after } = moved.facilities[0]
  assert.deepEqual(after, before)
  assert.equal(moved.facilities[0].roomMix, a.roomMix)
  assert.equal(moved.facilities[1], b)
})

test('all six alignment actions use the selected envelope and actual rotated dimensions', () => {
  const p = project([facility('a', { x: 10, y: 10, width: 10, depth: 8 }), facility('b', { x: 30, y: 30, width: 4, depth: 20, rotation: 90 })])
  const expected = {
    left: [[10, 10], [10, 30]], right: [[40, 10], [30, 30]],
    top: [[10, 10], [30, 10]], bottom: [[10, 26], [30, 30]],
    'center-x': [[25, 10], [20, 30]], 'center-y': [[10, 18], [30, 20]],
  } as const
  for (const action of Object.keys(expected) as (keyof typeof expected)[]) {
    const result = alignFacilitySelection(p, ['b', 'a'], action)
    assert.equal(result.ok, true, action)
    if (result.ok) assert.deepEqual(result.facilities.map(f => [f.x, f.y]), expected[action], action)
  }
})

test('distribution spaces unequal widths evenly by net gap while preserving facility array order', () => {
  const p = project([facility('last', { x: 70, width: 20 }), facility('first', { x: 10, width: 10 }), facility('middle', { x: 22, width: 15 })])
  const result = alignFacilitySelection(p, ['middle', 'last', 'first', 'first'], 'distribute-x')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.facilities.map(f => [f.id, f.x]), [['last', 70], ['first', 10], ['middle', 37.5]])
  assert.equal(result.facilities[1], p.facilities[1])
  assert.equal(result.facilities[0], p.facilities[0])
})

test('vertical distribution uses rotation and stable project order for tied positions', () => {
  const p = project([facility('first', { y: 0, depth: 5 }), facility('tie-a', { y: 20, width: 10, depth: 3, rotation: 90 }), facility('tie-b', { y: 20, depth: 5 }), facility('last', { y: 45, depth: 5 })])
  const result = alignFacilitySelection(p, ['last', 'tie-b', 'tie-a', 'first'], 'distribute-y')
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.facilities.map(f => f.y), [0, 13.33, 31.67, 45])
})

test('distribution rejects fewer than three existing selections and negative net spacing', () => {
  const p = project([facility('a', { x: 0, width: 20 }), facility('b', { x: 5, width: 20 }), facility('c', { x: 10, width: 20 })])
  assert.equal(alignFacilitySelection(p, ['a', 'b', 'missing'], 'distribute-x').ok, false)
  const before = structuredClone(p)
  const result = alignFacilitySelection(p, ['a', 'b', 'c'], 'distribute-x')
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /间距/)
  assert.deepEqual(p, before)
  assert.equal(alignFacilitySelection(p, ['a', 'b', 'c'], 'distribute-y').ok, false)
})

test('zero net gap is allowed and distribution retains original array when already evenly spaced', () => {
  const p = project([facility('a', { x: 0 }), facility('b', { x: 10 }), facility('c', { x: 20 })])
  const result = alignFacilitySelection(p, ['a', 'b', 'c'], 'distribute-x')
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.equal(result.changed, false)
    assert.equal(result.facilities, p.facilities)
  }
})

test('alignment rejects final positions outside either site axis instead of partially applying', () => {
  const p = project([facility('a', { x: -10 }), facility('b', { x: 20 })])
  const before = structuredClone(p)
  const result = alignFacilitySelection(p, ['a', 'b'], 'left')
  assert.equal(result.ok, false)
  assert.deepEqual(p, before)
  assert.equal(alignFacilitySelection(project([facility('a', { y: 95 }), facility('b')]), ['a', 'b'], 'left').ok, false)
})

test('fractional dimensions can fit exactly at the site edge without rounding position', () => {
  const p = project([facility('a', { width: 10.004 })], 20, 100)
  const before = structuredClone(p)
  const result = moveFacilitySelection(p, ['a'], 100, 0)
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.ok(Math.abs(result.facilities[0].x - (20 - 10.004)) < 1e-12)
    assert.ok(Math.abs(result.facilities[0].x + result.facilities[0].width - 20) < 1e-12)
  }
  assert.deepEqual(p, before)
})

test('one common movement delta preserves old coordinate precision and relative offsets', () => {
  const p = project([facility('a', { x: 10.004, y: 5.003 }), facility('b', { x: 30.006, y: 15.007 })])
  const result = moveFacilitySelection(p, ['a', 'b'], 1, 2.1234)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.facilities.map(f => [f.x, f.y]), [[10.004 + 1, 5.003 + 2.1234], [30.006 + 1, 15.007 + 2.1234]])
  assert.ok(Math.abs(result.facilities[1].x - result.facilities[0].x - 20.002) < 1e-12)
  assert.deepEqual([result.dx, result.dy], [1, 2.1234])
})

test('applying a returned clamped delta to the same original snapshot exactly reproduces preview', () => {
  const p = project([facility('a', { x: 10.004, y: 5.003 }), facility('b', { x: 30.006, y: 15.007, width: 10.004 })], 50, 40)
  const preview = moveFacilitySelection(p, ['a', 'b'], 100, 100)
  assert.equal(preview.ok, true)
  if (!preview.ok) return
  const commit = moveFacilitySelection(p, ['a', 'b'], preview.dx, preview.dy)
  assert.deepEqual(commit, preview)
})

test('zero movement leaves original fractional coordinates and references unchanged', () => {
  const p = project([facility('a', { x: 10.004, y: 5.003 }), facility('b', { x: 30.006, y: 15.007 })])
  const result = moveFacilitySelection(p, ['a', 'b'], 0, 0)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.changed, false)
  assert.equal(result.facilities, p.facilities)
  assert.deepEqual([result.dx, result.dy], [0, 0])
})

test('distribution rejects negative spacing between sorted first and last anchors even when a middle item extends farther', () => {
  const p = project([facility('first', { x: 0, width: 10 }), facility('middle', { x: 20, width: 100 }), facility('last', { x: 100, width: 10 })], 150)
  const before = structuredClone(p)
  const result = alignFacilitySelection(p, ['first', 'middle', 'last'], 'distribute-x')
  assert.equal(result.ok, false)
  if (!result.ok) assert.match(result.error, /间距/)
  assert.deepEqual(p, before)
})

test('distribution preserves precise first and last anchors and redistributes a middle item that extends past the last', () => {
  const p = project([facility('first', { x: 0.004, width: 10 }), facility('middle', { x: 90, width: 20 }), facility('last', { x: 100.006, width: 5 })], 150)
  const result = alignFacilitySelection(p, ['last', 'middle', 'first'], 'distribute-x')
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.deepEqual(result.facilities.map(f => f.x), [0.004, 45.01, 100.006])
  assert.equal(result.facilities[0], p.facilities[0])
  assert.equal(result.facilities[2], p.facilities[2])
})

test('vertical distribution also preserves first and last precision with rotated middle dimensions', () => {
  const p = project([facility('first', { y: 0.004, depth: 10 }), facility('middle', { y: 90, width: 20, depth: 3, rotation: 90 }), facility('last', { y: 100.006, depth: 5 })], 100, 150)
  const result = alignFacilitySelection(p, ['last', 'middle', 'first'], 'distribute-y')
  assert.equal(result.ok, true)
  if (result.ok) assert.deepEqual(result.facilities.map(f => f.y), [0.004, 45.01, 100.006])
})
