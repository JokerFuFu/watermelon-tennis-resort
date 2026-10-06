import type { CourtSurface, Facility, FacilityPresetId, FacilityType, LayoutWarning, Metrics, Project, RoomAllocation, RoomType } from './types'
import { FACILITY_PRESET_BY_ID } from './facilityCatalog'
import { estimateFacility, validateBudgetSettings, validateFacilityPricing } from './pricing'
import { calculateSiteAreas } from './area'
import { validateOperatingSettings } from './operating'
import { validateEarningsSettings } from './earnings'
import { validateMonthlyPlanSettings } from './monthlyPlan'
import { materialObstacles, validateMaterials, validateAssemblies } from './materials'

// Illustrative net room areas for concept capacity planning, not regulatory minima.
export const ROOM_TYPES: Record<RoomType, { label: string; area: number; color: string; description: string }> = {
  standard: { label: '标准间', area: 28, color: '#8fa587', description: '28 m² 示例客房净面积，适合基础住宿配置' },
  deluxe: { label: '景观房', area: 38, color: '#a6b7c5', description: '38 m² 示例客房净面积，适合景观与休闲住宿配置' },
  suite: { label: '套房', area: 58, color: '#c7a572', description: '58 m² 示例客房净面积，适合独立起居空间配置' },
}

const ROOM_KEYS: RoomType[] = ['standard', 'deluxe', 'suite']

export function getRoomMix(facility: Facility): RoomAllocation {
  return facility.roomMix ? { ...facility.roomMix } : { standard: facility.rooms, deluxe: 0, suite: 0 }
}

export function resizeRoomMix(mix: RoomAllocation, total: number): RoomAllocation {
  if (!Number.isInteger(total) || total < 0 || total > 1000) throw new RangeError('客房总数必须为 0 至 1000 的整数')
  if (ROOM_KEYS.some(key => !Number.isInteger(mix[key]) || mix[key] < 0 || mix[key] > 1000)) throw new RangeError('房型数量必须为 0 至 1000 的整数')
  const count = ROOM_KEYS.reduce((sum, key) => sum + mix[key], 0)
  if (total === 0) return { standard: 0, deluxe: 0, suite: 0 }
  if (count === 0) return { standard: total, deluxe: 0, suite: 0 }
  const quotas = ROOM_KEYS.map((key, index) => ({ key, index, numerator: mix[key] * total }))
  const result = { standard: 0, deluxe: 0, suite: 0 }
  for (const quota of quotas) result[quota.key] = Math.floor(quota.numerator / count)
  const remainder = total - ROOM_KEYS.reduce((sum, key) => sum + result[key], 0)
  // Largest fractional remainders win; ties use the stable room-type order above.
  quotas.sort((a, b) => b.numerator % count - a.numerator % count || a.index - b.index)
  for (let i = 0; i < remainder; i++) result[quotas[i].key] += 1
  return result
}

export function calculateRoomProgram(facility: Facility): { guestArea: number; grossArea: number; remainingArea: number; guestAreaRatio: number } {
  const mix = getRoomMix(facility)
  const guestArea = ROOM_KEYS.reduce((sum, key) => sum + mix[key] * ROOM_TYPES[key].area, 0)
  const grossArea = facility.width * facility.depth * facility.floors
  return { guestArea, grossArea, remainingArea: grossArea - guestArea, guestAreaRatio: grossArea > 0 ? guestArea / grossArea : 0 }
}

export const FACILITY_META: Record<FacilityType, { label: string; color: string; description: string }> = {
  hotel: { label: '酒店客房', color: '#e5ddce', description: '客房楼与度假住宿空间' },
  court: { label: '网球场', color: '#bf7553', description: '含缓冲区的网球场概念占地' },
  pool: { label: '泳池', color: '#78b5c5', description: '室外泳池与水上休闲空间' },
  restaurant: { label: '餐厅会所', color: '#d9b887', description: '餐饮、社交与球员休息空间' },
  landscape: { label: '景观绿地', color: '#97ae83', description: '明确配置的花园与景观空间' },
  parking: { label: '停车场', color: '#b7b5ac', description: '地面停车与到达空间' },
}

const TYPES = Object.keys(FACILITY_META) as FacilityType[]
const SURFACES: CourtSurface[] = ['clay', 'hard', 'grass']
// All prices are editable, illustrative concept assumptions in RMB, not quotations.
// Buildings use gross floor area; other facilities use footprint; courts use RMB/court.
const DEFAULTS: Record<FacilityType, Pick<Facility, 'width' | 'depth' | 'floors' | 'rooms' | 'unitCost'>> = {
  hotel: { width: 30, depth: 16, floors: 4, rooms: 40, unitCost: 6800 },
  court: { width: 18.29, depth: 36.58, floors: 1, rooms: 0, unitCost: 380000 },
  pool: { width: 25, depth: 15, floors: 1, rooms: 0, unitCost: 2800 },
  restaurant: { width: 29, depth: 15, floors: 1, rooms: 0, unitCost: 5500 },
  landscape: { width: 20, depth: 20, floors: 1, rooms: 0, unitCost: 450 },
  parking: { width: 35, depth: 13, floors: 1, rooms: 0, unitCost: 600 },
}

// Playing rectangle: ITF doubles 23.77 m × 10.97 m; checked 2026-10-02.
// https://www.itftennis.com/en/about-us/organisation/tennis-glossary/
// 36.58 m × 18.29 m is a recommended concept envelope including runoffs.
// It is not a construction-compliance certification; actual setbacks need project review.
// Reference envelope: ITF-hosted 2026 WTA Rulebook Appendix K.
// https://www.itftennis.com/media/15607/wta-2026-rulebook.pdf

function id(): string { return crypto.randomUUID() }

function extent(facility: Facility) {
  return facility.rotation === 90
    ? { width: facility.depth, depth: facility.width }
    : { width: facility.width, depth: facility.depth }
}

function overlaps(a: Facility, b: Facility): boolean {
  const ae = extent(a), be = extent(b)
  return a.x < b.x + be.width && a.x + ae.width > b.x && a.y < b.y + be.depth && a.y + ae.depth > b.y
}

function add(project: Project, type: FacilityType, properties: Partial<Facility>): Facility {
  const facility: Facility = {
    id: id(), type, name: FACILITY_META[type].label,
    x: 5, y: 5, rotation: 0, ...DEFAULTS[type],
    ...(type === 'hotel' ? { roomMix: { standard: 24, deluxe: 12, suite: 4 } } : {}),
    ...(type === 'court' ? { surface: 'clay' as const } : {}), ...properties,
  }
  project.facilities.push(facility)
  return facility
}

export function createDefaultProject(): Project {
  const project: Project = {
    version: 1, id: id(), name: '西瓜网球度假酒店', location: '北京 · 概念方案',
    siteWidth: 180, siteDepth: 130, facilities: [], updatedAt: new Date().toISOString(),
  }
  add(project, 'hotel', { name: '主楼 · 湖景客房', x: 25, y: 25, width: 60, depth: 16, floors: 4, rooms: 72, roomMix: { standard: 36, deluxe: 24, suite: 12 } })
  add(project, 'hotel', { name: '花园客房楼', x: 25, y: 48, width: 18, depth: 44, floors: 3, rooms: 48, roomMix: { standard: 28, deluxe: 16, suite: 4 } })
  add(project, 'restaurant', { name: '餐厅与网球会所', x: 53, y: 90, width: 29, depth: 15 })
  add(project, 'pool', { name: '庭院泳池', x: 56, y: 54, width: 25, depth: 15 })
  for (const [row, y] of [22, 66].entries()) {
    for (const [column, x] of [100, 123, 146].entries()) {
      add(project, 'court', { name: `红土球场 ${row * 3 + column + 1}`, x, y })
    }
  }
  add(project, 'landscape', { name: '中庭花园', x: 54, y: 73, width: 30, depth: 14 })
  add(project, 'landscape', { name: '西侧景观带', x: 4, y: 10, width: 14, depth: 88 })
  add(project, 'landscape', { name: '南侧花园', x: 24, y: 112, width: 62, depth: 14 })
  add(project, 'parking', { name: '访客停车场', x: 99, y: 107, width: 66, depth: 13 })
  return project
}

export function createProject(name: string, template: 'resort' | 'compact' | 'blank'): Project {
  const project = createDefaultProject()
  project.name = name.trim() || '未命名网球酒店'
  if (template === 'blank') project.facilities = []
  if (template === 'compact') {
    project.siteWidth = 115
    project.siteDepth = 105
    project.facilities = []
    add(project, 'hotel', { name: '精品客房楼', x: 25, y: 15, width: 32, depth: 16, floors: 4, rooms: 48, roomMix: { standard: 28, deluxe: 16, suite: 4 } })
    add(project, 'court', { name: '红土球场 1', x: 70, y: 22 })
    add(project, 'court', { name: '红土球场 2', x: 70, y: 64 })
    add(project, 'pool', { name: '花园泳池', x: 25, y: 45 })
    add(project, 'restaurant', { name: '餐厅会所', x: 25, y: 71, width: 25, depth: 14 })
    add(project, 'landscape', { name: '西侧花园', x: 5, y: 5, width: 12, depth: 90 })
    add(project, 'parking', { name: '到达停车区', x: 25, y: 91, width: 40, depth: 10 })
  }
  return project
}

export function createFacility(type: FacilityType, project: Project): Facility {
  if (project.facilities.length >= 200) throw new Error('最多支持 200 个设施')
  const count = project.facilities.filter(item => item.type === type).length + 1
  const facility: Facility = {
    id: id(), type, name: `${FACILITY_META[type].label} ${count}`, ...DEFAULTS[type],
    ...(type === 'hotel' ? { roomMix: { standard: 24, deluxe: 12, suite: 4 } } : {}),
    x: 5, y: 5, rotation: 0, ...(type === 'court' ? { surface: 'clay' as const } : {}),
  }
  return findVacancy(facility, project)
}

export function createPresetFacility(presetId: FacilityPresetId, project: Project): Facility {
  if (project.facilities.length >= 200) throw new Error('最多支持 200 个设施')
  if (!Object.hasOwn(FACILITY_PRESET_BY_ID, presetId)) throw new Error('未知设施预设')
  const preset = FACILITY_PRESET_BY_ID[presetId]
  const count = project.facilities.filter(item => (item.presetId ?? item.type) === presetId).length + 1
  const facility: Facility = {
    id: id(), type: preset.type, presetId, name: `${preset.label} ${count}`,
    width: preset.width, depth: preset.depth, floors: preset.floors,
    rooms: preset.rooms, unitCost: preset.unitCost, x: 5, y: 5, rotation: 0,
    ...(preset.roomMix ? { roomMix: { ...preset.roomMix } } : {}),
    ...(preset.surface ? { surface: preset.surface } : {}),
  }
  return findVacancy(facility, project)
}

function findVacancy(facility: Facility, project: Project): Facility {
  const materialRects = materialObstacles(project)
  for (const rotation of [0, 90] as const) {
    facility.rotation = rotation
    const size = extent(facility)
    for (const { inset, margin } of [{ inset: 5, margin: 2 }, { inset: 0, margin: 0 }]) {
      for (let y = inset; y + size.depth <= project.siteDepth - margin; y += 5) {
        for (let x = inset; x + size.width <= project.siteWidth - margin; x += 5) {
          facility.x = x
          facility.y = y
          const blockedByMaterial = materialRects.some(item => x < item.x + item.width && x + size.width > item.x && y < item.y + item.depth && y + size.depth > item.y)
          if (!blockedByMaterial && project.facilities.every(item => !overlaps(facility, item))) return facility
        }
      }
    }
  }
  // Keep the requested physical size when no vacancy exists; warnings expose the conflict.
  facility.rotation = 0
  facility.x = Math.max(0, (project.siteWidth - facility.width) / 2)
  facility.y = Math.max(0, (project.siteDepth - facility.depth) / 2)
  return facility
}

export function facilityCost(facility: Facility): number {
  return estimateFacility(facility).point
}

export function calculateMetrics(project: Project): Metrics {
  const costs: Record<FacilityType, number> = { hotel: 0, court: 0, pool: 0, restaurant: 0, landscape: 0, parking: 0 }
  const metrics: Metrics = {
    siteArea: project.siteWidth * project.siteDepth, buildingArea: 0, ...calculateSiteAreas(project),
    roomCount: 0, courtCount: 0, landscapeRatio: 0, coverageRatio: 0, totalCost: 0, costs,
  }
  for (const facility of project.facilities) {
    const area = facility.width * facility.depth
    const cost = facilityCost(facility)
    costs[facility.type] += cost
    metrics.totalCost += cost
    if (facility.type === 'hotel' || facility.type === 'restaurant') {
      metrics.buildingArea += area * facility.floors
    }
    if (facility.type === 'hotel') metrics.roomCount += facility.rooms
    if (facility.type === 'court') metrics.courtCount += 1
  }
  // Floor area and costs retain full engineering quantities; land metrics use
  // clipped unions, and explicit greenery excludes non-green physical cover.
  metrics.landscapeRatio = metrics.siteArea > 0 ? Math.max(0, Math.min(1, metrics.landscapeArea / metrics.siteArea)) : 0
  metrics.coverageRatio = metrics.siteArea > 0 ? Math.max(0, Math.min(1, metrics.footprint / metrics.siteArea)) : 0
  return metrics
}

export function getLayoutWarnings(project: Project): LayoutWarning[] {
  const warnings: LayoutWarning[] = []
  for (const facility of project.facilities) {
    const size = extent(facility)
    if (facility.x < 0 || facility.y < 0 || facility.x + size.width > project.siteWidth || facility.y + size.depth > project.siteDepth) {
      warnings.push({ id: `bounds-${facility.id}`, message: `${facility.name} 超出用地边界`, facilityIds: [facility.id] })
    }
    if (facility.type === 'court' && (Math.min(facility.width, facility.depth) < 18.29 || Math.max(facility.width, facility.depth) < 36.58)) {
      warnings.push({ id: `court-${facility.id}`, message: `${facility.name} 小于建议概念占地 36.58 × 18.29 m（含缓冲区）`, facilityIds: [facility.id] })
    }
  }
  for (let i = 0; i < project.facilities.length; i++) {
    for (let j = i + 1; j < project.facilities.length; j++) {
      const a = project.facilities[i], b = project.facilities[j]
      if (overlaps(a, b)) warnings.push({ id: `overlap-${a.id}-${b.id}`, message: `${a.name} 与 ${b.name} 占地重叠`, facilityIds: [a.id, b.id] })
    }
  }
  return warnings
}

function fail(label: string): never { throw new Error(`方案文件无效：${label}`) }
function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(`${label} 必须为对象`)
  return value as Record<string, unknown>
}
function string(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || (!allowEmpty && !value.trim()) || value.length > max) fail(`${label} 文本格式错误`)
  return value
}
function number(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) fail(`${label} 数值超出范围`)
  return value
}
function keys(value: Record<string, unknown>, allowed: string[], label: string) {
  if (Object.keys(value).some(key => !allowed.includes(key))) fail(`${label} 含未知字段`)
}

export function parseProject(input: string): Project {
  let parsed: unknown
  try { parsed = JSON.parse(input) } catch { return fail('JSON 格式错误') }
  const root = record(parsed, '方案')
  keys(root, ['version', 'id', 'name', 'location', 'siteWidth', 'siteDepth', 'facilities', 'updatedAt', 'budget', 'operating', 'earnings', 'monthlyPlan', 'materials', 'materialAssemblies', 'materialBudgetIncluded'], '方案')
  if (root.version !== 1) fail('不支持的方案版本')
  if (!Array.isArray(root.facilities) || root.facilities.length > 200) fail('设施列表格式错误或超过 200 个')
  const updatedAt = string(root.updatedAt, '保存时间', 40)
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt)) || new Date(updatedAt).toISOString() !== updatedAt) fail('保存时间格式错误')
  const identifiers = new Set<string>()
  const facilities = root.facilities.map((item, index): Facility => {
    const value = record(item, `设施 ${index + 1}`)
    keys(value, ['id', 'type', 'presetId', 'locked', 'visible', 'name', 'x', 'y', 'width', 'depth', 'floors', 'rooms', 'roomMix', 'unitCost', 'surface', 'rotation', 'pricing'], '设施')
    for (const key of ['locked', 'visible']) {
      if (Object.hasOwn(value, key) && typeof value[key] !== 'boolean') fail(`${key === 'locked' ? '锁定状态' : '显示状态'} 必须为布尔值`)
    }
    const facilityId = string(value.id, '设施 ID', 120)
    if (identifiers.has(facilityId)) fail('设施 ID 重复')
    identifiers.add(facilityId)
    if (!TYPES.includes(value.type as FacilityType)) fail('未知设施类型')
    if (value.rotation !== 0 && value.rotation !== 90) fail('设施旋转只能为 0 或 90 度')
    const type = value.type as FacilityType
    let presetId: FacilityPresetId | undefined
    if (value.presetId !== undefined) {
      if (typeof value.presetId !== 'string' || !Object.hasOwn(FACILITY_PRESET_BY_ID, value.presetId)) fail('未知设施预设')
      presetId = value.presetId as FacilityPresetId
      if (FACILITY_PRESET_BY_ID[presetId].type !== type) fail('设施预设与基础类型不一致')
    }
    const rooms = number(value.rooms, '客房数', 0, 1000, true)
    let roomMix: RoomAllocation | undefined
    if (value.roomMix !== undefined) {
      if (type !== 'hotel') fail('只有酒店设施可以配置房型')
      const mix = record(value.roomMix, '房型配置')
      keys(mix, ROOM_KEYS, '房型配置')
      roomMix = {
        standard: number(mix.standard, '标准间数量', 0, 1000, true),
        deluxe: number(mix.deluxe, '景观房数量', 0, 1000, true),
        suite: number(mix.suite, '套房数量', 0, 1000, true),
      }
      if (roomMix.standard + roomMix.deluxe + roomMix.suite !== rooms) fail('房型数量合计与客房总数不一致')
    }
    if ((type === 'court' && !SURFACES.includes(value.surface as CourtSurface)) || (value.surface !== undefined && !SURFACES.includes(value.surface as CourtSurface))) fail('球场材质错误')
    return {
      id: facilityId, type, name: string(value.name, '设施名称', 120),
      ...(presetId ? { presetId } : {}),
      ...(Object.hasOwn(value, 'locked') ? { locked: value.locked as boolean } : {}),
      ...(Object.hasOwn(value, 'visible') ? { visible: value.visible as boolean } : {}),
      // Negative coordinates remain valid design data and trigger boundary warnings.
      x: number(value.x, 'X 坐标', -1000, 1000), y: number(value.y, 'Y 坐标', -1000, 1000),
      width: number(value.width, '设施宽度', Number.MIN_VALUE, 1000), depth: number(value.depth, '设施长度', Number.MIN_VALUE, 1000),
      floors: number(value.floors, '层数', 1, 30, true), rooms, ...(roomMix ? { roomMix } : {}),
      unitCost: number(value.unitCost, '参考单价', 0, 100000000), rotation: value.rotation,
      ...(value.pricing !== undefined ? { pricing: validateFacilityPricing(value.pricing) } : {}),
      ...(value.surface !== undefined ? { surface: value.surface as CourtSurface } : {}),
    }
  })
  const materials = root.materials !== undefined ? validateMaterials(root.materials) : undefined
  const materialAssemblies = root.materialAssemblies !== undefined ? validateAssemblies(root.materialAssemblies, materials ?? []) : undefined
  if (Object.hasOwn(root, 'materialBudgetIncluded') && typeof root.materialBudgetIncluded !== 'boolean') fail('建材预算开关必须为布尔值')
  return {
    version: 1, id: string(root.id, '方案 ID', 120), name: string(root.name, '方案名称', 120),
    location: string(root.location, '项目位置', 200, true), siteWidth: number(root.siteWidth, '用地宽度', 30, 1000),
    siteDepth: number(root.siteDepth, '用地长度', 30, 1000), facilities, updatedAt,
    ...(root.budget !== undefined ? { budget: validateBudgetSettings(root.budget) } : {}),
    ...(root.operating !== undefined ? { operating: validateOperatingSettings(root.operating) } : {}),
    ...(root.earnings !== undefined ? { earnings: validateEarningsSettings(root.earnings) } : {}),
    ...(root.monthlyPlan !== undefined ? { monthlyPlan: validateMonthlyPlanSettings(root.monthlyPlan) } : {}),
    ...(materials !== undefined ? { materials } : {}),
    ...(materialAssemblies !== undefined ? { materialAssemblies } : {}),
    ...(Object.hasOwn(root, 'materialBudgetIncluded') ? { materialBudgetIncluded: root.materialBudgetIncluded as boolean } : {}),
  }
}

export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}
