import type { Facility, Project } from './types'

export type FacilityAlignment = 'left' | 'right' | 'top' | 'bottom' | 'center-x' | 'center-y' | 'distribute-x' | 'distribute-y'
export type FacilitySelectionResult = { ok: true; facilities: Facility[]; changed: boolean } | { ok: false; error: string }
export type FacilityMoveResult = { ok: true; facilities: Facility[]; changed: boolean; dx: number; dy: number } | { ok: false; error: string }
type Bounds = { x: number; y: number; width: number; depth: number }

const EPSILON = 1e-9
const failure = (error: string): { ok: false; error: string } => ({ ok: false, error })
const roundPosition = (value: number) => Math.round((value + Number.EPSILON * Math.max(1, Math.abs(value))) * 100) / 100

function dimensions(facility: Facility) {
  return facility.rotation === 90
    ? { width: facility.depth, depth: facility.width }
    : { width: facility.width, depth: facility.depth }
}

function selectedFacilities(project: Project, ids: readonly string[]): Facility[] {
  const selected = new Set(ids)
  return project.facilities.filter(facility => selected.has(facility.id))
}

function selectionBounds(facilities: Facility[]): Bounds | null {
  if (!facilities.length) return null
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity
  for (const facility of facilities) {
    const size = dimensions(facility)
    if (![facility.x, facility.y, size.width, size.depth, facility.x + size.width, facility.y + size.depth].every(Number.isFinite) || size.width <= 0 || size.depth <= 0) return null
    x = Math.min(x, facility.x)
    y = Math.min(y, facility.y)
    right = Math.max(right, facility.x + size.width)
    bottom = Math.max(bottom, facility.y + size.depth)
  }
  return { x, y, width: right - x, depth: bottom - y }
}

export function getFacilitySelectionBounds(project: Project, ids: readonly string[]): Bounds | null {
  return selectionBounds(selectedFacilities(project, ids))
}

function validateSelection(project: Project, selected: Facility[]): string | null {
  if (!selected.length) return '请先选择设施。'
  if (selected.some(facility => facility.locked)) return '选区包含锁定设施，请先解锁后再调整。'
  if (!Number.isFinite(project.siteWidth) || !Number.isFinite(project.siteDepth) || project.siteWidth <= 0 || project.siteDepth <= 0) return '用地尺寸无效，无法调整选区。'
  if (!selectionBounds(selected)) return '选区设施的位置或尺寸无效。'
  return null
}

function finishTransform(project: Project, positions: Map<string, { x: number; y: number }>): FacilitySelectionResult {
  let changed = false
  for (const facility of project.facilities) {
    const position = positions.get(facility.id)
    if (!position) continue
    const size = dimensions(facility)
    if (![position.x, position.y].every(Number.isFinite) || position.x < -EPSILON || position.y < -EPSILON || position.x + size.width > project.siteWidth + EPSILON || position.y + size.depth > project.siteDepth + EPSILON) {
      return failure('选区无法在用地内摆放，请调整尺寸或位置。')
    }
    if (position.x !== facility.x || position.y !== facility.y) changed = true
  }
  if (!changed) return { ok: true, facilities: project.facilities, changed: false }
  return {
    ok: true, changed: true,
    facilities: project.facilities.map(facility => {
      const position = positions.get(facility.id)
      return position && (position.x !== facility.x || position.y !== facility.y) ? { ...facility, ...position } : facility
    }),
  }
}

export function moveFacilitySelection(project: Project, ids: readonly string[], dx: number, dy: number): FacilityMoveResult {
  const selected = selectedFacilities(project, ids)
  const error = validateSelection(project, selected)
  if (error) return failure(error)
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return failure('移动距离必须是有限数值。')
  const bounds = selectionBounds(selected)!
  if (bounds.width > project.siteWidth + EPSILON || bounds.depth > project.siteDepth + EPSILON) return failure('选区整体尺寸超过用地，无法保持相对位置移动。')
  const clampedX = Math.min(Math.max(dx, -bounds.x), project.siteWidth - bounds.x - bounds.width)
  const clampedY = Math.min(Math.max(dy, -bounds.y), project.siteDepth - bounds.y - bounds.depth)
  const result = finishTransform(project, new Map(selected.map(facility => [facility.id, { x: facility.x + clampedX, y: facility.y + clampedY }])))
  return result.ok ? { ...result, dx: clampedX, dy: clampedY } : result
}

export function alignFacilitySelection(project: Project, ids: readonly string[], action: FacilityAlignment): FacilitySelectionResult {
  const selected = selectedFacilities(project, ids)
  const error = validateSelection(project, selected)
  if (error) return failure(error)
  const bounds = selectionBounds(selected)!
  const positions = new Map(selected.map(facility => [facility.id, { x: facility.x, y: facility.y }]))
  if (action === 'distribute-x' || action === 'distribute-y') {
    if (selected.length < 3) return failure('均匀分布至少需要选择 3 个设施。')
    const horizontal = action === 'distribute-x'
    const axis = horizontal ? 'x' : 'y'
    const extent = horizontal ? 'width' : 'depth'
    const sorted = selected.map((facility, index) => ({ facility, index })).sort((a, b) => a.facility[axis] - b.facility[axis] || a.index - b.index)
    const first = sorted[0].facility, last = sorted[sorted.length - 1].facility
    const span = last[axis] + dimensions(last)[extent] - first[axis]
    const totalSize = selected.reduce((total, facility) => total + dimensions(facility)[extent], 0)
    const gap = (span - totalSize) / (selected.length - 1)
    if (gap < -EPSILON) return failure('选区空间不足，均匀分布会产生负间距，请先拉开首尾设施。')
    let cursor = first[axis]
    sorted.forEach(({ facility }, index) => {
      if (index > 0 && index < sorted.length - 1) positions.get(facility.id)![axis] = roundPosition(cursor)
      cursor += dimensions(facility)[extent] + Math.max(0, gap)
    })
  } else {
    for (const facility of selected) {
      const size = dimensions(facility)
      const position = positions.get(facility.id)!
      switch (action) {
        case 'left': position.x = roundPosition(bounds.x); break
        case 'right': position.x = roundPosition(bounds.x + bounds.width - size.width); break
        case 'top': position.y = roundPosition(bounds.y); break
        case 'bottom': position.y = roundPosition(bounds.y + bounds.depth - size.depth); break
        case 'center-x': position.x = roundPosition(bounds.x + (bounds.width - size.width) / 2); break
        case 'center-y': position.y = roundPosition(bounds.y + (bounds.depth - size.depth) / 2); break
        default: return failure('不支持的设施对齐方式。')
      }
    }
  }
  return finishTransform(project, positions)
}
