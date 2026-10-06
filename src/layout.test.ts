import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { arrangeFacilities } from './layout.ts'
import { calculateMetrics, createProject, getLayoutWarnings } from './model.ts'
import { FACILITY_PRESETS } from './facilityCatalog.ts'
import type { Facility, Project } from './types'

function fixture(facilities: Facility[] = [], width = 100, depth = 100): Project {
  return { ...createProject('排布测试', 'blank'), siteWidth: width, siteDepth: depth, facilities }
}

function facility(id: string, overrides: Partial<Facility> = {}): Facility {
  return { id, type: 'hotel', name: `酒店 ${id}`, x: 20, y: 20, width: 10, depth: 10, floors: 3, rooms: 12, roomMix: { standard: 6, deluxe: 4, suite: 2 }, unitCost: 6800, rotation: 0, ...overrides }
}

function extent(item: Facility) {
  return item.rotation === 90 ? { width: item.depth, depth: item.width } : { width: item.width, depth: item.depth }
}

function assertSpacing(project: Project, gap = 4, margin = 6) {
  for (const item of project.facilities) {
    const size = extent(item)
    if (!item.locked) {
      assert.ok(item.x >= margin - 1e-8 && item.y >= margin - 1e-8)
      assert.ok(item.x + size.width <= project.siteWidth - margin + 1e-8)
      assert.ok(item.y + size.depth <= project.siteDepth - margin + 1e-8)
    }
  }
  for (let i = 0; i < project.facilities.length; i++) {
    for (let j = i + 1; j < project.facilities.length; j++) {
      const a = project.facilities[i], b = project.facilities[j]
      if (a.locked && b.locked) continue
      const ae = extent(a), be = extent(b)
      assert.ok(a.x + ae.width + gap <= b.x + 1e-8 || b.x + be.width + gap <= a.x + 1e-8 || a.y + ae.depth + gap <= b.y + 1e-8 || b.y + be.depth + gap <= a.y + 1e-8, `${a.id} 与 ${b.id} 未满足间距`)
    }
  }
}

test('layout places largest footprints first but keeps facility order, identity and all nonposition data', () => {
  const project = fixture([
    facility('small', { presetId: 'villa', visible: false, locked: false }),
    facility('large', { width: 40, depth: 30, rotation: 90 }),
    facility('court', { type: 'court', presetId: 'hard-court', surface: 'hard', width: 18.29, depth: 36.58, rooms: 0, roomMix: undefined }),
  ])
  const before = structuredClone(project)
  const metrics = calculateMetrics(project)
  const plan = arrangeFacilities(project)
  assert.equal(plan.success, true)
  assert.deepEqual(project, before)
  assert.equal(plan.project.updatedAt, project.updatedAt)
  assert.deepEqual(plan.project.facilities.map(item => item.id), project.facilities.map(item => item.id))
  assert.deepEqual(plan.project.facilities[1], { ...project.facilities[1], x: 6, y: 6 })
  for (const [i, item] of plan.project.facilities.entries()) {
    assert.deepEqual({ ...item, x: project.facilities[i].x, y: project.facilities[i].y }, project.facilities[i])
  }
  const arrangedMetrics = calculateMetrics(plan.project)
  for (const key of ['siteArea', 'buildingArea', 'rawFacilityArea', 'roomCount', 'courtCount', 'totalCost', 'costs'] as const) {
    assert.deepEqual(arrangedMetrics[key], metrics[key])
  }
  assert.ok(arrangedMetrics.occupiedArea > metrics.occupiedArea)
  assert.equal(arrangedMetrics.overlapArea, 0)
  assert.equal(plan.moved, 3)
  assert.equal(plan.keptLocked, 0)
  assert.deepEqual(plan.unplacedIds, [])
  assert.deepEqual(getLayoutWarnings(plan.project), [])
  assertSpacing(plan.project)
  plan.project.facilities[0].roomMix!.standard = 0
  assert.deepEqual(project, before)
})

test('locked and hidden locked facilities stay fixed while hidden unlocked facilities are arranged', () => {
  const project = fixture([
    facility('locked', { x: 6, y: 6, width: 20, depth: 20, locked: true, visible: false }),
    facility('hidden', { x: 6, y: 6, visible: false }),
    facility('visible', { x: 6, y: 6 }),
  ])
  const plan = arrangeFacilities(project)
  assert.equal(plan.success, true)
  assert.equal(plan.keptLocked, 1)
  assert.equal(plan.moved, 2)
  assert.deepEqual(plan.project.facilities[0], project.facilities[0])
  assert.equal(plan.project.facilities[1].visible, false)
  assertSpacing(plan.project)
})

test('rotated actual extents fit narrow sites without altering rotation or physical dimensions', () => {
  const project = fixture([facility('rotated', { width: 16, depth: 40, rotation: 90 })], 52, 28)
  const plan = arrangeFacilities(project)
  assert.equal(plan.success, true)
  assert.deepEqual(plan.project.facilities[0], { ...project.facilities[0], x: 6, y: 6 })
  assertSpacing(plan.project)
  const impossible = fixture([facility('rotation-fixed', { width: 40, depth: 16, rotation: 90 })], 52, 28)
  assert.equal(arrangeFacilities(impossible).success, false)
})

test('fractional sizes, custom gap and margin preserve minimum spacing at exact site edges', () => {
  const project = fixture([facility('a', { width: 10.25, depth: 10.25 }), facility('b', { width: 10.25, depth: 10.25 })], 23.5, 12.25)
  const plan = arrangeFacilities(project, { gap: 1, margin: 1 })
  assert.equal(plan.success, true)
  assertSpacing(plan.project, 1, 1)
  assert.equal(plan.project.facilities[1].x, 12.25)
  assert.equal(arrangeFacilities(project, { gap: 1.1, margin: 1 }).success, false)
})

test('zero spacing permits touching edges and locked facilities can remain outside the new inset', () => {
  const project = fixture([facility('fixed', { x: 0, y: 0, locked: true }), facility('a'), facility('b')], 30, 10)
  const plan = arrangeFacilities(project, { gap: 0, margin: 0 })
  assert.equal(plan.success, true)
  assertSpacing(plan.project, 0, 0)
  assert.deepEqual(getLayoutWarnings(plan.project), [])
  const fixedAtBoundary = fixture([facility('fixed', { x: 0, y: 0, locked: true }), facility('a')])
  assert.equal(arrangeFacilities(fixedAtBoundary).success, true)
})

test('locked out-of-bounds facilities and overlapping locked facilities fail without moving anything', () => {
  for (const facilities of [
    [facility('outside', { x: 91, rotation: 90, width: 8, depth: 10, locked: true }), facility('other')],
    [facility('negative', { x: -1, locked: true })],
    [facility('fractional-negative', { x: -1e-10, locked: true })],
    [facility('tiny-overlap-a', { x: 0, locked: true }), facility('tiny-overlap-b', { x: 10 - 1e-10, locked: true })],
    [facility('a', { locked: true }), facility('b', { x: 25, locked: true, visible: false }), facility('other')],
  ]) {
    const project = fixture(facilities)
    const before = structuredClone(project)
    const plan = arrangeFacilities(project)
    assert.equal(plan.success, false)
    assert.equal(plan.moved, 0)
    assert.deepEqual(plan.project, before)
    assert.deepEqual(project, before)
    assert.match(plan.message, /锁定.*(边界|重叠)/)
    assert.ok(plan.unplacedIds.length > 0)
  }
})

test('a failed placement rolls back all tentative moves without deleting or resizing facilities', () => {
  const project = fixture([
    facility('large', { x: 22, y: 22, width: 35, depth: 35 }),
    facility('small', { x: 2, y: 2, width: 20, depth: 20 }),
  ], 50, 50)
  const before = structuredClone(project)
  const plan = arrangeFacilities(project)
  assert.equal(plan.success, false)
  assert.equal(plan.moved, 0)
  assert.deepEqual(plan.unplacedIds, ['small'])
  assert.match(plan.message, /当前自动策略.*未能放入.*保留原方案/)
  assert.deepEqual(plan.project, before)
  assert.deepEqual(project, before)
  plan.project.facilities[0].roomMix!.standard = 999
  assert.deepEqual(project, before)
})

test('empty and already arranged plans succeed with zero moves and unchanged save time', () => {
  const empty = fixture()
  const emptyPlan = arrangeFacilities(empty)
  assert.equal(emptyPlan.success, true)
  assert.equal(emptyPlan.moved, 0)
  assert.deepEqual(emptyPlan.project, empty)
  const project = fixture([facility('a', { x: 6, y: 6 }), facility('b', { x: 20, y: 6 }), facility('fixed', { x: 0, y: 30, locked: true })])
  const plan = arrangeFacilities(project)
  assert.equal(plan.success, true)
  assert.equal(plan.moved, 0)
  assert.equal(plan.keptLocked, 1)
  assert.deepEqual(plan.project, project)
})

test('invalid layout options and geometry fail closed before searching', () => {
  const project = fixture([facility('a')])
  for (const key of ['gap', 'margin']) {
    for (const value of [-1, NaN, Infinity, 1001, '4', null]) {
      const plan = arrangeFacilities(project, { [key]: value } as Parameters<typeof arrangeFacilities>[1])
      assert.equal(plan.success, false)
      assert.deepEqual(plan.project, project)
      assert.equal(plan.moved, 0)
      assert.match(plan.message, /间距|退界/)
    }
  }
  for (const input of [
    { ...project, siteWidth: NaN },
    { ...project, siteDepth: 0 },
    { ...project, facilities: [facility('a', { width: Infinity })] },
    { ...project, facilities: [facility('a', { depth: -1 })] },
    { ...project, facilities: [facility('a', { x: NaN })] },
    { ...project, facilities: Array.from({ length: 201 }, (_, i) => facility(String(i))) },
  ]) {
    const plan = arrangeFacilities(input)
    assert.equal(plan.success, false)
    assert.deepEqual(plan.project, input)
  }
})

test('200 varied facilities produce a deterministic complete valid plan with bounded search', context => {
  const facilities = Array.from({ length: 200 }, (_, index) => {
    const preset = FACILITY_PRESETS[index % FACILITY_PRESETS.length]
    return facility(`f-${index}`, {
      type: preset.type, presetId: preset.id, name: `${preset.label} ${index}`, width: preset.width, depth: preset.depth,
      floors: preset.floors, rooms: preset.rooms, roomMix: preset.roomMix ? { ...preset.roomMix } : undefined,
      unitCost: preset.unitCost, surface: preset.surface, rotation: index % 3 === 0 ? 90 : 0,
      visible: index % 5 !== 0,
    })
  })
  const project = fixture(facilities, 1000, 900)
  const before = structuredClone(project)
  const started = performance.now()
  const plan = arrangeFacilities(project)
  context.diagnostic(`200 facilities in 1000 × 900 m: ${(performance.now() - started).toFixed(2)} ms`)
  assert.equal(plan.success, true)
  assert.equal(plan.project.facilities.length, 200)
  assert.deepEqual(project, before)
  assert.deepEqual(arrangeFacilities(project), plan)
  assert.deepEqual(getLayoutWarnings(plan.project), [])
  assertSpacing(plan.project)
  assert.equal(arrangeFacilities(plan.project).moved, 0)
})
