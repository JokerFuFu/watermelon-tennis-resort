import type { Facility, Project } from './types'
import { isGreenFacility } from './facilityCatalog'
import { materialObstacles } from './materials'

interface Rectangle {
  left: number
  right: number
  top: number
  bottom: number
  building: boolean
  green: boolean
  facility: boolean
}

interface Coverage {
  occupied: number
  overlap: number
  buildings: number
  greenery: number
}

function rectangle(facility: Facility): Rectangle {
  const width = facility.rotation === 90 ? facility.depth : facility.width
  const depth = facility.rotation === 90 ? facility.width : facility.depth
  return {
    left: facility.x, right: facility.x + width,
    top: facility.y, bottom: facility.y + depth,
    building: facility.type === 'hotel' || facility.type === 'restaurant',
    green: isGreenFacility(facility),
    facility: true,
  }
}

function clipToSite(rect: Rectangle, project: Project): Rectangle | undefined {
  const clipped = {
    ...rect, left: Math.max(0, rect.left), right: Math.min(project.siteWidth, rect.right),
    top: Math.max(0, rect.top), bottom: Math.min(project.siteDepth, rect.bottom),
  }
  return clipped.right > clipped.left && clipped.bottom > clipped.top ? clipped : undefined
}

// Every rectangle edge defines an exact strip. Sweeping its y events avoids
// sampling and counts triple coverage once, while tracking green occlusion.
function sweep(rectangles: Rectangle[]): Coverage {
  const result: Coverage = { occupied: 0, overlap: 0, buildings: 0, greenery: 0 }
  const xEvents = rectangles.flatMap((rect, id) => [
    { x: rect.left, id, entering: true }, { x: rect.right, id, entering: false },
  ]).sort((a, b) => a.x - b.x)
  const active = new Set<number>()
  let previousX = xEvents[0]?.x ?? 0
  let index = 0
  while (index < xEvents.length) {
    const x = xEvents[index].x
    const stripWidth = x - previousX
    if (stripWidth > 0 && active.size) {
      const yEvents = [...active].flatMap(id => {
        const rect = rectangles[id]
        return [{ y: rect.top, delta: 1, rect }, { y: rect.bottom, delta: -1, rect }]
      }).sort((a, b) => a.y - b.y)
      let count = 0, facilityCount = 0, buildings = 0, greens = 0, nonGreens = 0
      let previousY = yEvents[0].y
      let yIndex = 0
      while (yIndex < yEvents.length) {
        const y = yEvents[yIndex].y
        const area = stripWidth * (y - previousY)
        if (count > 0) result.occupied += area
        if (facilityCount >= 2) result.overlap += area
        if (buildings > 0) result.buildings += area
        if (greens > 0 && nonGreens === 0) result.greenery += area
        while (yIndex < yEvents.length && yEvents[yIndex].y === y) {
          const event = yEvents[yIndex++]
          count += event.delta
          if (event.rect.facility) facilityCount += event.delta
          if (event.rect.building) buildings += event.delta
          if (event.rect.green) greens += event.delta
          else nonGreens += event.delta
        }
        previousY = y
      }
    }
    while (index < xEvents.length && xEvents[index].x === x) {
      const event = xEvents[index++]
      if (event.entering) active.add(event.id)
      else active.delete(event.id)
    }
    previousX = x
  }
  return result
}

export function calculateSiteAreas(project: Project): {
  rawFacilityArea: number
  materialArea: number
  occupiedArea: number
  unallocatedArea: number
  overlapArea: number
  outOfBoundsArea: number
  footprint: number
  landscapeArea: number
} {
  const materialRectangles: Rectangle[] = materialObstacles(project).map(b => ({ left:b.x, right:b.x+b.width, top:b.y, bottom:b.y+b.depth, building:false, green:false, facility:false }))
  const rectangles = [...project.facilities.map(rectangle), ...materialRectangles]
  const clipped = rectangles.flatMap(rect => {
    const inside = clipToSite(rect, project)
    return inside ? [inside] : []
  })
  const inside = sweep(clipped)
  const complete = sweep(rectangles)
  const siteArea = project.siteWidth * project.siteDepth
  const bounded = (area: number) => Math.max(0, Math.min(siteArea, area))
  const occupiedArea = bounded(inside.occupied)
  return {
    rawFacilityArea: project.facilities.reduce((sum, facility) => sum + facility.width * facility.depth, 0),
    materialArea: bounded(sweep(materialRectangles.flatMap(rect => { const clipped=clipToSite(rect,project); return clipped?[clipped]:[] })).occupied),
    occupiedArea,
    unallocatedArea: bounded(siteArea - occupiedArea),
    overlapArea: bounded(inside.overlap),
    outOfBoundsArea: Math.max(0, complete.occupied - occupiedArea),
    footprint: bounded(inside.buildings),
    landscapeArea: bounded(inside.greenery),
  }
}

export function facilitySiteArea(facility: Facility, project: Project): {
  completeArea: number
  inBoundsArea: number
  outOfBoundsArea: number
  grossArea: number
} {
  const completeArea = facility.width * facility.depth
  const rect = rectangle(facility)
  const inside = clipToSite(rect, project)
  const inBoundsArea = inside ? (inside.right - inside.left) * (inside.bottom - inside.top) : 0
  return {
    completeArea,
    inBoundsArea,
    outOfBoundsArea: Math.max(0, completeArea - inBoundsArea),
    grossArea: rect.building ? completeArea * facility.floors : 0,
  }
}

const areaFormatter = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export function formatArea(value: number): string {
  return areaFormatter.format(value)
}
