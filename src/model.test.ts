import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateMetrics, calculateRoomProgram, createDefaultProject, createFacility, createPresetFacility, createProject, facilityCost, getLayoutWarnings, getRoomMix, parseProject, resizeRoomMix, ROOM_TYPES } from './model.ts'
import { FACILITY_PRESETS, getFacilityLabel } from './facilityCatalog.ts'
import type { Facility, Project } from './types'

function fixture(): Project {
  const project = createProject('计算测试', 'blank')
  project.siteWidth = 100
  project.siteDepth = 100
  return project
}
function facility(type: Facility['type'], overrides: Partial<Facility> = {}): Facility {
  return { id: crypto.randomUUID(), type, name: type, x: 0, y: 0, width: 10, depth: 20, floors: 3, rooms: 12, unitCost: 100, rotation: 0, ...(type === 'court' ? { surface: 'clay' as const } : {}), ...overrides }
}

test('default and compact campuses fit without overlaps and survive JSON round trips', () => {
  for (const project of [createDefaultProject(), createProject('紧凑酒店', 'compact')]) {
    assert.deepEqual(getLayoutWarnings(project), [])
    assert.deepEqual(parseProject(JSON.stringify(project)), project)
  }
  const metrics = calculateMetrics(createDefaultProject())
  assert.equal(metrics.roomCount, 120)
  assert.equal(metrics.courtCount, 6)
  assert.equal(metrics.siteArea, 23400)
  assert.equal(metrics.landscapeArea, 2520)
  const blankLocation = createProject('未确定位置的方案', 'blank')
  blankLocation.location = ''
  assert.equal(parseProject(JSON.stringify(blankLocation)).location, '')
})

test('cost respects gross floor area, footprint and per-court price, independent of rotation', () => {
  assert.equal(facilityCost(facility('hotel')), 60000)
  assert.equal(facilityCost(facility('restaurant')), 60000)
  for (const type of ['pool', 'landscape', 'parking'] as const) assert.equal(facilityCost(facility(type)), 20000)
  assert.equal(facilityCost(facility('court')), 100)
  assert.equal(facilityCost(facility('hotel', { rotation: 90 })), 60000)
})

test('metrics separate full engineering quantities from overlapping physical land coverage', () => {
  const project = fixture()
  project.facilities = [facility('hotel'), facility('restaurant', { rooms: 500, floors: 2 }), facility('pool'), facility('court'), facility('landscape'), facility('parking')]
  const metrics = calculateMetrics(project)
  assert.equal(metrics.buildingArea, 1000)
  assert.equal(metrics.footprint, 200)
  assert.equal(metrics.roomCount, 12)
  assert.equal(metrics.courtCount, 1)
  assert.equal(metrics.rawFacilityArea, 1200)
  assert.equal(metrics.occupiedArea, 200)
  assert.equal(metrics.unallocatedArea, 9800)
  assert.equal(metrics.overlapArea, 200)
  assert.equal(metrics.outOfBoundsArea, 0)
  assert.equal(metrics.landscapeArea, 0)
  assert.equal(metrics.landscapeRatio, 0)
  assert.equal(metrics.coverageRatio, .02)
  assert.equal(metrics.totalCost, 160100)
  assert.deepEqual(metrics.costs, { hotel: 60000, restaurant: 40000, pool: 20000, court: 100, landscape: 20000, parking: 20000 })
})

test('bounds and overlap checks use rotated extents; touching edges do not overlap', () => {
  const project = fixture()
  const first = facility('hotel', { x: 85, y: 0, width: 10, depth: 20 })
  project.facilities = [first]
  assert.deepEqual(getLayoutWarnings(project), [])
  first.rotation = 90
  assert.equal(getLayoutWarnings(project)[0].id, `bounds-${first.id}`)
  first.x = 0
  const second = facility('pool', { x: 15, y: 0, width: 10, depth: 10 })
  project.facilities.push(second)
  assert.equal(getLayoutWarnings(project).length, 1)
  assert.deepEqual(getLayoutWarnings(project)[0].facilityIds, [first.id, second.id])
  second.x = 20
  assert.deepEqual(getLayoutWarnings(project), [])
  second.y = -1
  assert.equal(getLayoutWarnings(project)[0].id, `bounds-${second.id}`)
})

test('courts warn on undersized runoffs including when dimensions are reversed', () => {
  const project = fixture()
  project.facilities = [facility('court', { width: 36.58, depth: 18.29 })]
  assert.deepEqual(getLayoutWarnings(project), [])
  project.facilities[0].depth = 10.97
  assert.match(getLayoutWarnings(project)[0].message, /建议概念占地/)
})

test('new facilities find separate free spaces without mutating the project', () => {
  const project = fixture()
  const first = createFacility('hotel', project)
  assert.equal(project.facilities.length, 0)
  project.facilities.push(first)
  const second = createFacility('hotel', project)
  project.facilities.push(second)
  assert.deepEqual(getLayoutWarnings(project), [])
  assert.notEqual(first.id, second.id)
})

test('new facilities use site edges when margins leave no vacancy', () => {
  const project = fixture()
  project.siteWidth = 30
  project.siteDepth = 60
  project.facilities = [facility('landscape', { x: 0, y: 20, width: 30, depth: 20 })]
  const added = createFacility('hotel', project)
  project.facilities.push(added)
  assert.deepEqual(getLayoutWarnings(project), [])
})

test('import rejects malformed objects, mismatched versions, unknown fields and duplicate IDs', () => {
  for (const input of ['{', 'null', '[]', '"test"']) assert.throws(() => parseProject(input))
  const base = createDefaultProject()
  const malformed: unknown[] = [
    { ...base, version: 2 }, { ...base, facilities: {} }, { ...base, facilities: [null] },
    { ...base, name: '' }, { ...base, extra: true }, { ...base, updatedAt: '2026-02-30T00:00:00.000Z' },
    { ...base, facilities: [base.facilities[0], base.facilities[0]] },
  ]
  for (const input of malformed) assert.throws(() => parseProject(JSON.stringify(input)))
})

test('import rejects numeric coercion, nonfinite values and ranges', () => {
  const base = createDefaultProject()
  for (const siteWidth of ['180', null, 29, 1001, Infinity, NaN]) {
    assert.throws(() => parseProject(JSON.stringify({ ...base, siteWidth })))
  }
  assert.throws(() => parseProject(JSON.stringify(base).replace('"siteWidth":180', '"siteWidth":1e999')))
  const invalid = [
    { width: 0 }, { depth: -1 }, { width: 1001 }, { width: '20' }, { x: 1001 },
    { unitCost: -1 }, { unitCost: 1e9 }, { floors: 0 }, { floors: 31 }, { floors: 1.5 },
    { rooms: -1 }, { rooms: 1001 }, { rooms: 1.5 }, { rotation: 45 }, { type: 'office' },
  ]
  for (const overrides of invalid) {
    assert.throws(() => parseProject(JSON.stringify({ ...base, facilities: [{ ...base.facilities[0], ...overrides }] })))
  }
  assert.throws(() => parseProject(JSON.stringify({ ...base, facilities: [facility('court', { surface: undefined })] })))
  assert.throws(() => parseProject(JSON.stringify({ ...base, facilities: [facility('court', { surface: 'unknown' as Facility['surface'] })] })))
})

test('import and creation enforce 200 facility maximum while allowing a blank plan', () => {
  const project = fixture()
  assert.deepEqual(parseProject(JSON.stringify(project)).facilities, [])
  project.facilities = Array.from({ length: 200 }, () => facility('landscape'))
  assert.equal(parseProject(JSON.stringify(project)).facilities.length, 200)
  assert.throws(() => createFacility('pool', project), /200/)
  project.facilities.push(facility('pool'))
  assert.throws(() => parseProject(JSON.stringify(project)), /200/)
})

test('room mixes are configured in templates and new hotels while old projects remain valid', () => {
  const project = createDefaultProject()
  assert.deepEqual(getRoomMix(project.facilities[0]), { standard: 36, deluxe: 24, suite: 12 })
  assert.deepEqual(getRoomMix(project.facilities[1]), { standard: 28, deluxe: 16, suite: 4 })
  assert.deepEqual(getRoomMix(createProject('紧凑酒店', 'compact').facilities[0]), { standard: 28, deluxe: 16, suite: 4 })
  assert.deepEqual(getRoomMix(createFacility('hotel', fixture())), { standard: 24, deluxe: 12, suite: 4 })
  for (const item of project.facilities) delete item.roomMix
  const imported = parseProject(JSON.stringify(project))
  assert.equal(imported.version, 1)
  assert.deepEqual(getRoomMix(imported.facilities[0]), { standard: 72, deluxe: 0, suite: 0 })
  assert.equal(imported.facilities[0].roomMix, undefined)
  const existing = createDefaultProject().facilities[0]
  const mix = getRoomMix(existing)
  mix.standard = 0
  assert.equal(getRoomMix(existing).standard, 36)
})

test('room mix import validates exact keys, integer counts, sums and hotel-only assignment', () => {
  const base = createDefaultProject()
  const hotel = base.facilities[0]
  const malformed: unknown[] = [
    null, [], 'standard', {}, { standard: 72, deluxe: 0 },
    { standard: 72, deluxe: 0, suite: 0, other: 0 },
    { standard: '72', deluxe: 0, suite: 0 }, { standard: 71.5, deluxe: .5, suite: 0 },
    { standard: -1, deluxe: 73, suite: 0 }, { standard: 1001, deluxe: 0, suite: 0 },
    { standard: 71, deluxe: 0, suite: 0 }, { standard: Infinity, deluxe: 0, suite: 0 },
  ]
  for (const roomMix of malformed) assert.throws(() => parseProject(JSON.stringify({ ...base, facilities: [{ ...hotel, roomMix }] })))
  const nonHotel = facility('restaurant', { rooms: 12, roomMix: { standard: 12, deluxe: 0, suite: 0 } })
  assert.throws(() => parseProject(JSON.stringify({ ...base, facilities: [nonHotel] })), /只有酒店/)
  assert.deepEqual(parseProject(JSON.stringify(base)).facilities[0].roomMix, hotel.roomMix)
})

test('room mix resizing preserves total with proportional largest remainders and deterministic ties', () => {
  assert.deepEqual(resizeRoomMix({ standard: 36, deluxe: 24, suite: 12 }, 36), { standard: 18, deluxe: 12, suite: 6 })
  assert.deepEqual(resizeRoomMix({ standard: 36, deluxe: 24, suite: 12 }, 10), { standard: 5, deluxe: 3, suite: 2 })
  assert.deepEqual(resizeRoomMix({ standard: 36, deluxe: 24, suite: 12 }, 2), { standard: 1, deluxe: 1, suite: 0 })
  assert.deepEqual(resizeRoomMix({ standard: 1, deluxe: 1, suite: 1 }, 2), { standard: 1, deluxe: 1, suite: 0 })
  assert.deepEqual(resizeRoomMix({ standard: 1, deluxe: 1, suite: 1 }, 0), { standard: 0, deluxe: 0, suite: 0 })
  assert.deepEqual(resizeRoomMix({ standard: 0, deluxe: 0, suite: 0 }, 17), { standard: 17, deluxe: 0, suite: 0 })
  const mix = { standard: 7, deluxe: 5, suite: 3 }
  for (const total of [0, 1, 2, 3, 7, 15, 37, 1000]) {
    const resized = resizeRoomMix(mix, total)
    assert.equal(resized.standard + resized.deluxe + resized.suite, total)
    for (const key of ['standard', 'deluxe', 'suite'] as const) {
      assert.equal(Number.isInteger(resized[key]), true)
      assert.ok(Math.abs(resized[key] - mix[key] / 15 * total) < 1)
    }
  }
  assert.deepEqual(mix, { standard: 7, deluxe: 5, suite: 3 })
  assert.throws(() => resizeRoomMix(mix, 1.5))
  assert.throws(() => resizeRoomMix(mix, 1001))
  assert.throws(() => resizeRoomMix({ standard: NaN, deluxe: 0, suite: 0 }, 10))
})

test('room programs use illustrative net areas and retain negative remaining capacity', () => {
  assert.deepEqual([ROOM_TYPES.standard.area, ROOM_TYPES.deluxe.area, ROOM_TYPES.suite.area], [28, 38, 58])
  const hotel = facility('hotel', { width: 20, depth: 10, floors: 3, rooms: 6, roomMix: { standard: 3, deluxe: 2, suite: 1 } })
  assert.deepEqual(calculateRoomProgram(hotel), { guestArea: 218, grossArea: 600, remainingArea: 382, guestAreaRatio: 218 / 600 })
  assert.deepEqual(calculateRoomProgram({ ...hotel, rotation: 90 }), calculateRoomProgram(hotel))
  assert.equal(calculateRoomProgram(facility('hotel', { rooms: 12 })).guestArea, 336)
  const overfull = calculateRoomProgram({ ...hotel, width: 5, depth: 5, floors: 1 })
  assert.equal(overfull.remainingArea, -193)
  assert.ok(overfull.guestAreaRatio > 1)
})

test('all catalog presets use catalog defaults, occupy separate vacancies and preserve their identity through JSON', () => {
  const project = fixture()
  project.siteWidth = 1000
  project.siteDepth = 900
  assert.equal(FACILITY_PRESETS.length, 51)
  for (const preset of FACILITY_PRESETS) {
    const added = createPresetFacility(preset.id, project)
    assert.equal(project.facilities.length, FACILITY_PRESETS.indexOf(preset))
    assert.equal(added.presetId, preset.id)
    assert.equal(added.type, preset.type)
    assert.equal(getFacilityLabel(added), preset.label)
    for (const key of ['width', 'depth', 'floors', 'rooms', 'unitCost', 'surface'] as const) assert.equal(added[key], preset[key])
    if (preset.roomMix) {
      assert.deepEqual(added.roomMix, preset.roomMix)
      assert.notEqual(added.roomMix, preset.roomMix)
    }
    project.facilities.push(added)
  }
  assert.deepEqual(getLayoutWarnings(project), [])
  assert.deepEqual(parseProject(JSON.stringify(project)), project)
  const repeated = createPresetFacility('cabin', project)
  assert.equal(repeated.name, '度假木屋 2')
})

test('preset imports reject unknown keys and mismatched base types while accepting old facilities', () => {
  const project = fixture()
  const cabin = createPresetFacility('cabin', project)
  for (const presetId of ['unknown', '__proto__', 'constructor', 'toString', '', null, 1, {}]) {
    assert.throws(() => parseProject(JSON.stringify({ ...project, facilities: [{ ...cabin, presetId }] })), /预设/)
  }
  assert.throws(() => parseProject(JSON.stringify({ ...project, facilities: [{ ...cabin, presetId: 'fitness' }] })), /预设/)
  assert.throws(() => createPresetFacility('unknown' as typeof cabin.presetId & string, project), /预设/)
  const oldHotel = createFacility('hotel', project)
  assert.equal(oldHotel.presetId, undefined)
  assert.deepEqual(parseProject(JSON.stringify({ ...project, facilities: [oldHotel] })).facilities[0], oldHotel)
})

test('outdoor activity presets do not inflate greenery and all court surfaces count as courts', () => {
  const project = fixture()
  for (const presetId of ['landscape', 'basketball', 'kids-play', 'bbq', 'hard-court', 'grass-court'] as const) {
    project.facilities.push(createPresetFacility(presetId, project))
  }
  const metrics = calculateMetrics(project)
  assert.equal(metrics.landscapeArea, 400)
  assert.equal(metrics.landscapeRatio, .04)
  assert.equal(metrics.courtCount, 2)
  assert.equal(metrics.costs.landscape, 400 * 450 + 32 * 19 * 850 + 22 * 18 * 1300 + 18 * 14 * 1000)
  assert.equal(metrics.costs.court, 720000)
})

test('lodging presets maintain consistent room mixes and use their actual gross area for cost', () => {
  const project = fixture()
  for (const presetId of ['hotel', 'villa', 'cabin', 'apartment'] as const) {
    const added = createPresetFacility(presetId, project)
    const mix = getRoomMix(added)
    assert.equal(mix.standard + mix.deluxe + mix.suite, added.rooms)
    assert.equal(calculateRoomProgram(added).grossArea, added.width * added.depth * added.floors)
    assert.equal(facilityCost(added), added.width * added.depth * added.floors * 6800)
    project.facilities.push(added)
  }
  const metrics = calculateMetrics(project)
  assert.equal(metrics.roomCount, 58)
  assert.equal(metrics.buildingArea, 1920 + 168 + 80 + 672)
  assert.equal(metrics.costs.hotel, metrics.buildingArea * 6800)
  const gym = createPresetFacility('fitness', project)
  gym.floors = 2
  assert.equal(facilityCost(gym), 24 * 16 * 2 * 6200)
})

test('preset vacancy scanning uses its dimensions rather than the base hotel dimensions', () => {
  const project = fixture()
  project.siteWidth = 30
  project.siteDepth = 30
  project.facilities = [facility('landscape', { x: 0, y: 12, width: 30, depth: 18 })]
  const cabin = createPresetFacility('cabin', project)
  project.facilities.push(cabin)
  assert.equal(cabin.width, 10)
  assert.equal(cabin.depth, 8)
  assert.equal(cabin.y, 0)
  assert.deepEqual(getLayoutWarnings(project), [])
  assert.equal(getLayoutWarnings({ ...project, facilities: [project.facilities[0], createFacility('hotel', project)] }).length, 1)
})

test('preset creation enforces the existing 200 facility limit', () => {
  const project = fixture()
  project.facilities = Array.from({ length: 200 }, () => facility('landscape'))
  assert.throws(() => createPresetFacility('cabin', project), /200/)
})

test('optional locked and visible flags round trip exact booleans without changing old plans', () => {
  const project = fixture()
  project.facilities = [facility('hotel', { locked: true, visible: false }), facility('pool', { locked: false, visible: true }), facility('landscape')]
  assert.deepEqual(parseProject(JSON.stringify(project)), project)
  const imported = parseProject(JSON.stringify(project)).facilities[2]
  assert.equal(Object.hasOwn(imported, 'locked'), false)
  assert.equal(Object.hasOwn(imported, 'visible'), false)
})

test('facility state imports reject strings, numbers, null and objects for boolean flags', () => {
  const project = fixture()
  for (const key of ['locked', 'visible']) {
    for (const value of ['true', 'false', 0, 1, null, {}, []]) {
      assert.throws(() => parseProject(JSON.stringify({ ...project, facilities: [{ ...facility('pool'), [key]: value }] })), /必须为布尔值/)
    }
  }
})

test('hidden facilities retain their area, room capacity, costs and layout warnings', () => {
  const project = fixture()
  project.facilities = [facility('hotel'), facility('court'), facility('landscape', { x: -2 })]
  const metrics = calculateMetrics(project)
  const warnings = getLayoutWarnings(project)
  for (const item of project.facilities) item.visible = false
  assert.deepEqual(calculateMetrics(project), metrics)
  assert.deepEqual(getLayoutWarnings(project), warnings)
})


const FUN_PRESET_IDS = ['mini-golf', 'pickleball', 'beach-volleyball', 'splash-pad', 'kart-track', 'climbing', 'arcade', 'karaoke', 'bowling', 'table-tennis', 'outdoor-cinema', 'activity-lawn'] as const

test('twelve entertainment presets create independently, retain editable prices and exact JSON metadata', () => {
  const project = fixture()
  project.siteWidth = 1000
  project.siteDepth = 900
  assert.deepEqual(FACILITY_PRESETS.filter(p => p.category === 'fun' && FUN_PRESET_IDS.some(id => id === p.id)).map(p => p.id), [...FUN_PRESET_IDS])
  for (const id of FUN_PRESET_IDS) {
    const preset = FACILITY_PRESETS.find(p => p.id === id)!
    const added = createPresetFacility(id, project)
    assert.equal(added.presetId, id)
    assert.equal(added.name, `${preset.label} 1`)
    assert.equal(added.rooms, 0)
    assert.equal(added.type, ['climbing', 'arcade', 'karaoke', 'bowling', 'table-tennis'].includes(id) ? 'restaurant' : id === 'splash-pad' ? 'pool' : 'landscape')
    const expectedCost = added.width * added.depth * added.floors * added.unitCost
    assert.equal(facilityCost(added), expectedCost)
    assert.ok(expectedCost > 0)
    added.unitCost += 137
    added.rotation = 90
    added.locked = true
    added.visible = false
    assert.equal(facilityCost(added), added.width * added.depth * added.floors * added.unitCost)
    project.facilities.push(added)
  }
  assert.equal(new Set(project.facilities.map(f => f.id)).size, 12)
  const imported = parseProject(JSON.stringify(project))
  assert.deepEqual(imported, project)
  for (const id of FUN_PRESET_IDS) {
    const added = createPresetFacility(id, imported)
    assert.match(added.name, / 2$/)
    assert.equal(added.presetId, id)
    assert.equal(added.locked, undefined)
    assert.equal(added.visible, undefined)
    assert.notEqual(added.id, imported.facilities.find(f => f.presetId === id)!.id)
  }
})

test('natural activity lawn alone contributes entertainment greenery; racket and beach sports add no tennis courts', () => {
  const project = fixture()
  project.siteWidth = 1000
  project.siteDepth = 900
  for (const id of FUN_PRESET_IDS) project.facilities.push(createPresetFacility(id, project))
  const metrics = calculateMetrics(project)
  assert.equal(metrics.landscapeArea, 864)
  assert.equal(metrics.landscapeRatio, 864 / 900000)
  assert.equal(metrics.courtCount, 0)
  assert.equal(metrics.roomCount, 0)
  assert.equal(metrics.buildingArea, 352 + 252 + 352 + 720 + 252)
  assert.equal(metrics.costs.pool, 28 * 20 * 4500)
  assert.equal(metrics.costs.landscape, 30 * 20 * 950 + 18 * 10 * 900 + 24 * 16 * 650 + 80 * 50 * 800 + 26 * 18 * 1200 + 36 * 24 * 380)
  for (const id of ['mini-golf', 'pickleball', 'beach-volleyball', 'kart-track', 'outdoor-cinema'] as const) {
    const isolated = { ...project, facilities: [createPresetFacility(id, fixture())] }
    assert.equal(calculateMetrics(isolated).landscapeArea, 0)
    assert.equal(calculateMetrics(isolated).courtCount, 0)
  }
  project.facilities.push(createPresetFacility('court', project))
  assert.equal(calculateMetrics(project).courtCount, 1)
  assert.equal(calculateMetrics(project).landscapeArea, 864)
})

const LEISURE_PRESETS = [
  { id: 'card-room', label: '棋牌室', category: 'fun', width: 12, depth: 10, unitCost: 4200 },
  { id: 'mahjong-room', label: '麻将包厢', category: 'fun', width: 8, depth: 7, unitCost: 4800 },
  { id: 'billiards-room', label: '台球室', category: 'fun', width: 18, depth: 12, unitCost: 4800 },
  { id: 'board-game-room', label: '桌游活动室', category: 'fun', width: 14, depth: 10, unitCost: 4200 },
  { id: 'reading-lounge', label: '阅读休息室', category: 'fun', width: 16, depth: 10, unitCost: 4600 },
  { id: 'tea-lounge', label: '茶艺休闲室', category: 'dining', width: 14, depth: 10, unitCost: 4500 },
] as const

test('auction hall is a distinct editable building and survives legacy-compatible JSON', () => {
  const project = fixture()
  project.siteWidth = 1000
  project.siteDepth = 900
  const hall = createPresetFacility('auction-hall', project)
  assert.equal(project.facilities.length, 0)
  assert.equal(hall.name, '拍卖厅 1')
  assert.equal(hall.type, 'restaurant')
  assert.equal(hall.width, 30)
  assert.equal(hall.depth, 20)
  assert.equal(hall.unitCost, 5600)
  assert.equal(hall.rooms, 0)
  assert.equal(facilityCost(hall), 3360000)
  project.facilities.push(hall)
  hall.floors = 2
  hall.rotation = 90
  hall.locked = true
  hall.visible = false
  const metrics = calculateMetrics(project)
  assert.equal(metrics.buildingArea, 1200)
  assert.equal(metrics.footprint, 600)
  assert.equal(metrics.totalCost, 6720000)
  assert.equal(metrics.roomCount, 0)
  assert.equal(metrics.courtCount, 0)
  assert.equal(metrics.landscapeArea, 0)
  assert.deepEqual(parseProject(JSON.stringify(project)), project)
  const second = createPresetFacility('auction-hall', project)
  assert.equal(second.name, '拍卖厅 2')
  assert.notEqual(second.id, hall.id)
  assert.throws(() => parseProject(JSON.stringify({ ...project, facilities: [{ ...hall, type: 'landscape' }] })), /预设与基础类型/)
})

test('six leisure spaces create independently with specific names and preserve editable details through JSON', () => {
  const project = fixture()
  project.siteWidth = 1000
  project.siteDepth = 900
  assert.equal(FACILITY_PRESETS.filter(p => p.category === 'fun').length, 17)
  assert.equal(FACILITY_PRESETS.filter(p => p.category === 'dining').length, 7)
  for (const expected of LEISURE_PRESETS) {
    const preset = FACILITY_PRESETS.find(p => p.id === expected.id)!
    assert.equal(preset.category, expected.category)
    assert.equal(preset.greenArea, false)
    const added = createPresetFacility(expected.id, project)
    assert.equal(project.facilities.length, LEISURE_PRESETS.indexOf(expected))
    assert.equal(added.name, `${expected.label} 1`)
    assert.equal(added.type, 'restaurant')
    assert.equal(added.width, expected.width)
    assert.equal(added.depth, expected.depth)
    assert.equal(added.unitCost, expected.unitCost)
    assert.equal(added.floors, 1)
    assert.equal(added.rooms, 0)
    assert.equal(added.roomMix, undefined)
    assert.equal(added.surface, undefined)
    added.width += .25
    added.depth += .5
    added.floors = 2
    added.unitCost += 137
    added.rotation = 90
    added.locked = true
    added.visible = false
    assert.equal(facilityCost(added), added.width * added.depth * 2 * added.unitCost)
    project.facilities.push(added)
  }
  assert.equal(new Set(project.facilities.map(f => f.id)).size, 6)
  assert.deepEqual(getLayoutWarnings(project), [])
  const imported = parseProject(JSON.stringify(project))
  assert.deepEqual(imported, project)
  for (const expected of LEISURE_PRESETS) {
    const repeated = createPresetFacility(expected.id, imported)
    assert.equal(repeated.name, `${expected.label} 2`)
    assert.notEqual(repeated.id, imported.facilities.find(f => f.presetId === expected.id)!.id)
    assert.equal(repeated.locked, undefined)
    assert.equal(repeated.visible, undefined)
  }
})

test('leisure spaces add building area and cost without adding greenery, tennis courts or hotel rooms', () => {
  const project = fixture()
  project.siteWidth = 1000
  project.siteDepth = 900
  for (const expected of LEISURE_PRESETS) {
    const added = createPresetFacility(expected.id, project)
    added.floors = 3
    project.facilities.push(added)
  }
  const metrics = calculateMetrics(project)
  const footprint = LEISURE_PRESETS.reduce((sum, p) => sum + p.width * p.depth, 0)
  const totalCost = LEISURE_PRESETS.reduce((sum, p) => sum + p.width * p.depth * 3 * p.unitCost, 0)
  assert.equal(metrics.buildingArea, footprint * 3)
  assert.equal(metrics.rawFacilityArea, footprint)
  assert.equal(metrics.occupiedArea, footprint)
  assert.equal(metrics.landscapeArea, 0)
  assert.equal(metrics.courtCount, 0)
  assert.equal(metrics.roomCount, 0)
  assert.equal(metrics.totalCost, totalCost)
  assert.equal(metrics.costs.restaurant, totalCost)
})

test('leisure space JSON rejects a preset paired with a nonbuilding base type', () => {
  const project = fixture()
  for (const { id } of LEISURE_PRESETS) {
    const added = createPresetFacility(id, project)
    for (const type of ['hotel', 'landscape', 'pool', 'parking', 'court'] as const) {
      assert.throws(() => parseProject(JSON.stringify({ ...project, facilities: [{ ...added, type, ...(type === 'court' ? { surface: 'clay' } : {}) }] })), /预设/)
    }
  }
})
