import type { Facility, LayoutPlan, Project } from './types'
import { materialObstacles } from './materials'

interface Rectangle { x: number; y: number; width: number; depth: number }

function rectangle(facility: Facility): Rectangle {
  return {
    x: facility.x, y: facility.y,
    width: facility.rotation === 90 ? facility.depth : facility.width,
    depth: facility.rotation === 90 ? facility.width : facility.depth,
  }
}

function intersects(a: Rectangle, b: Rectangle, gap = 0): boolean {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x
    && a.y < b.y + b.depth + gap && a.y + a.depth + gap > b.y
}

// Search at most one candidate row per obstacle, scanning ordered blocked intervals
// on each row. Work is bounded by the 200-facility cap, not by site size or a grid step.
function findPosition(size: Rectangle, obstacles: Rectangle[], siteWidth: number, siteDepth: number, gap: number, margin: number): { x: number; y: number } | undefined {
  const maxX = siteWidth - margin - size.width
  const maxY = siteDepth - margin - size.depth
  if (maxX < margin || maxY < margin) return undefined
  const rows = [...new Set([margin, ...obstacles.map(item => item.y + item.depth + gap)])]
    .filter(y => y >= margin && y <= maxY).sort((a, b) => a - b)
  for (const y of rows) {
    const blockers = obstacles.filter(item => y < item.y + item.depth + gap && y + size.depth + gap > item.y)
      .sort((a, b) => a.x - b.x)
    let x = margin
    for (const blocker of blockers) {
      if (x + size.width + gap <= blocker.x) break
      if (x < blocker.x + blocker.width + gap) x = blocker.x + blocker.width + gap
    }
    if (x <= maxX) return { x, y }
  }
  return undefined
}

/** Deterministic concept arrangement; keeps rotations and rolls back the entire
 * proposal when this greedy search cannot fit every physical facility. */
export function arrangeFacilities(project: Project, options?: { gap?: number; margin?: number }): LayoutPlan {
  const output = structuredClone(project)
  const keptLocked = project.facilities.filter(item => item.locked === true).length
  const fail = (message: string, unplacedIds: string[] = []): LayoutPlan => ({ project: output, success: false, moved: 0, keptLocked, unplacedIds, message })
  const gap = options?.gap === undefined ? 4 : options.gap
  const margin = options?.margin === undefined ? 6 : options.margin
  for (const [label, value] of [['设施间距', gap], ['用地退界', margin]] as const) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000) {
      return fail(`${label}必须为 0 至 1000 米的有限数值，已保留原方案。`)
    }
  }
  if (![project.siteWidth, project.siteDepth].every(value => Number.isFinite(value) && value > 0 && value <= 1000)) {
    return fail('用地尺寸无效，已保留原方案。')
  }
  if (project.facilities.length > 200) return fail('自动布局最多支持 200 个设施，已保留原方案。')
  if (new Set(project.facilities.map(item => item.id)).size !== project.facilities.length) return fail('设施 ID 重复，已保留原方案。')
  const invalid = project.facilities.filter(item => ![item.x, item.y].every(Number.isFinite)
    || ![item.width, item.depth].every(value => Number.isFinite(value) && value > 0 && value <= 1000)
    || (item.rotation !== 0 && item.rotation !== 90))
  if (invalid.length) return fail('设施尺寸、位置或旋转无效，已保留原方案。', invalid.map(item => item.id))

  const locked = project.facilities.filter(item => item.locked === true)
  const outOfBounds = locked.filter(item => {
    const size = rectangle(item)
    return size.x < 0 || size.y < 0 || size.x + size.width > project.siteWidth || size.y + size.depth > project.siteDepth
  })
  if (outOfBounds.length) return fail('锁定设施超出用地边界，请先调整或解锁，已保留原方案。', outOfBounds.map(item => item.id))
  const overlapping = new Set<string>()
  for (let i = 0; i < locked.length; i++) {
    for (let j = i + 1; j < locked.length; j++) {
      if (intersects(rectangle(locked[i]), rectangle(locked[j]))) {
        overlapping.add(locked[i].id)
        overlapping.add(locked[j].id)
      }
    }
  }
  if (overlapping.size) return fail('锁定设施占地重叠，请先调整或解锁，已保留原方案。', [...overlapping])

  const obstacles = [...locked.map(rectangle), ...materialObstacles(project)]
  const movable = project.facilities.map((item, index) => ({ item, index }))
    .filter(({ item }) => item.locked !== true)
    .sort((a, b) => b.item.width * b.item.depth - a.item.width * a.item.depth || a.index - b.index)
  const positions = new Map<number, { x: number; y: number }>()
  const unplacedIds: string[] = []
  for (const { item, index } of movable) {
    const size = rectangle(item)
    const position = findPosition(size, obstacles, project.siteWidth, project.siteDepth, gap, margin)
    if (!position) unplacedIds.push(item.id)
    else {
      positions.set(index, position)
      obstacles.push({ ...size, ...position })
    }
  }
  if (unplacedIds.length) return fail(`当前自动策略未能放入 ${unplacedIds.length} 个设施，已保留原方案。可调整设施尺寸或用地条件后重试。`, unplacedIds)
  let moved = 0
  for (const [index, position] of positions) {
    const original = project.facilities[index]
    if (original.x !== position.x || original.y !== position.y) moved++
    output.facilities[index].x = position.x
    output.facilities[index].y = position.y
  }
  return { project: output, success: true, moved, keptLocked, unplacedIds: [], message: moved
    ? `已自动排列 ${movable.length} 个设施，移动 ${moved} 个，保留 ${keptLocked} 个锁定设施。`
    : `布局无需移动，保留 ${keptLocked} 个锁定设施。` }
}
