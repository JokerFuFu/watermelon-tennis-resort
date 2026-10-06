import { FACILITY_PRESET_BY_ID } from './facilityCatalog'
import { materialObstacles } from './materials'
import type { Facility, FacilityPresetId, Project } from './types'

export const HOTEL_ZONES: { id: string; name: string; description: string; entries: { presetId: FacilityPresetId; count: number }[] }[] = [
  { id: 'tennis', name: '网球训练区', description: '四片硬地球场，配套球员休息与更衣空间', entries: [{ presetId: 'hard-court', count: 4 }, { presetId: 'players-lounge', count: 1 }, { presetId: 'locker-room', count: 1 }] },
  { id: 'cabin', name: '花园木屋区', description: '四栋度假木屋，配套花园与咖啡馆', entries: [{ presetId: 'cabin', count: 4 }, { presetId: 'landscape', count: 1 }, { presetId: 'coffee', count: 1 }] },
  { id: 'family', name: '亲子游乐区', description: '儿童游乐、戏水、桌游与公共卫生间', entries: [{ presetId: 'kids-play', count: 1 }, { presetId: 'splash-pad', count: 1 }, { presetId: 'board-game-room', count: 1 }, { presetId: 'restroom', count: 1 }] },
  { id: 'wellness', name: '泳池康养区', description: '健身房、理疗、瑜伽与泳池', entries: [{ presetId: 'fitness', count: 1 }, { presetId: 'spa', count: 1 }, { presetId: 'yoga', count: 1 }, { presetId: 'pool', count: 1 }] },
  { id: 'dining', name: '餐饮聚会区', description: '餐厅、咖啡馆、酒吧与户外烧烤', entries: [{ presetId: 'restaurant', count: 1 }, { presetId: 'coffee', count: 1 }, { presetId: 'bar', count: 1 }, { presetId: 'bbq', count: 1 }] },
  { id: 'leisure', name: '棋牌休闲区', description: '两间麻将包厢，配套棋牌、台球与茶艺空间', entries: [{ presetId: 'mahjong-room', count: 2 }, { presetId: 'card-room', count: 1 }, { presetId: 'billiards-room', count: 1 }, { presetId: 'tea-lounge', count: 1 }] },
  { id: 'business', name: '商务活动区', description: '会议、宴会、拍卖厅与游客接待', entries: [{ presetId: 'conference', count: 1 }, { presetId: 'banquet', count: 1 }, { presetId: 'auction-hall', count: 1 }, { presetId: 'reception', count: 1 }] },
  { id: 'service', name: '交通后勤区', description: '停车、充电、洗衣、仓储、卫生间与安保', entries: [{ presetId: 'parking', count: 1 }, { presetId: 'ev-parking', count: 1 }, { presetId: 'laundry', count: 1 }, { presetId: 'storage', count: 1 }, { presetId: 'restroom', count: 1 }, { presetId: 'security', count: 1 }] },
]

export type ExpansionPlan = { success: true; additions: Facility[]; project: Project; message: string }
  | { success: false; additions: []; project: Project; message: string }
type Rectangle = { x: number; y: number; width: number; depth: number }
const failure = (project: Project, message: string): ExpansionPlan => ({ success: false, additions: [], project, message: `${message}已保留原方案。` })
const numberInRange = (value: number, min: number, max: number) => Number.isFinite(value) && value >= min && value <= max

function rectangle(facility: Facility): Rectangle {
  return { x: facility.x, y: facility.y, width: facility.rotation === 90 ? facility.depth : facility.width, depth: facility.rotation === 90 ? facility.width : facility.depth }
}
function validRectangle(item: Rectangle, maxSize = 1000) {
  return [item.x, item.y, item.x + item.width, item.y + item.depth].every(Number.isFinite)
    && numberInRange(item.width, Number.MIN_VALUE, maxSize) && numberInRange(item.depth, Number.MIN_VALUE, maxSize)
}
function intersects(a: Rectangle, b: Rectangle) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.depth && a.y + a.depth > b.y
}

function validateProject(project: Project): string | undefined {
  if (![project.siteWidth, project.siteDepth].every(value => numberInRange(value, 30, 1000))) return '用地尺寸必须为 30 至 1000 米。'
  if (project.facilities.length > 200) return '设施总数超过 200 个上限。'
  if (project.facilities.some(item => typeof item.id !== 'string' || !item.id.trim()) || new Set(project.facilities.map(item => item.id)).size !== project.facilities.length) return '原方案的设施 ID 无效或重复。'
  if (project.facilities.some(item => !validRectangle(rectangle(item)) || (item.rotation !== 0 && item.rotation !== 90))) return '原设施的位置、尺寸或旋转无效。'
  if (materialObstacles(project).some(item => !validRectangle(item, Infinity))) return '建材或组合占地尺寸无效。'
  return undefined
}

// Candidate rows follow obstacle edges; interval scanning does not depend on a metre grid.
function findPosition(size: Rectangle, obstacles: Rectangle[], siteWidth: number, siteDepth: number, gap: number, margin: number): { x: number; y: number } | undefined {
  const maxX = siteWidth - margin - size.width, maxY = siteDepth - margin - size.depth
  if (maxX < margin || maxY < margin) return undefined
  const rows = [...new Set([margin, ...obstacles.map(item => item.y + item.depth + gap)])]
    .filter(y => y >= margin && y <= maxY).sort((a, b) => a - b)
  for (const y of rows) {
    const blockers = obstacles.filter(item => y < item.y + item.depth + gap && y + size.depth + gap > item.y).sort((a, b) => a.x - b.x)
    let x = margin
    for (const blocker of blockers) {
      if (x + size.width + gap <= blocker.x) break
      if (x < blocker.x + blocker.width + gap) x = blocker.x + blocker.width + gap
    }
    if (x <= maxX) return { x, y }
  }
  return undefined
}

function placeBlock(project: Project, additions: Facility[], width: number, depth: number, gap: number, margin: number, label: string): ExpansionPlan {
  const obstacles = [...project.facilities.map(rectangle), ...materialObstacles(project)]
  const position = findPosition({ x: 0, y: 0, width, depth }, obstacles, project.siteWidth, project.siteDepth, gap, margin)
  if (!position) return failure(project, '当前区块摆放策略未找到完整空位，请调整区块间距、尺寸或用地后重试。')
  const placed = additions.map(item => ({ ...item, x: item.x + position.x, y: item.y + position.y }))
  return { success: true, additions: placed, project: { ...project, facilities: [...project.facilities, ...placed] }, message: `已生成${label}预览，新增 ${placed.length} 个设施，原设施位置保持不变。` }
}

export function planHotelZone(project: Project, zoneId: string, options?: { gap?: number; margin?: number }): ExpansionPlan {
  const zone = HOTEL_ZONES.find(item => item.id === zoneId)
  if (!zone) return failure(project, '请选择有效的功能区。')
  const gap = options?.gap === undefined ? 4 : options.gap, margin = options?.margin === undefined ? 6 : options.margin
  if (![gap, margin].every(value => numberInRange(value, 0, 1000))) return failure(project, '区块间距和用地退界必须为 0 至 1000 米的有限数值。')
  const invalid = validateProject(project)
  if (invalid) return failure(project, invalid)
  const count = zone.entries.reduce((sum, item) => sum + item.count, 0)
  if (project.facilities.length + count > 200) return failure(project, '新增后超过 200 个设施上限。')
  // Use the same catalog dimensions, room allocations and RMB examples as the single-facility factory.
  // Placement is handled once for the whole block, rather than running the factory's individual grid search.
  const additions: Facility[] = []
  for (const entry of zone.entries) {
    const preset = FACILITY_PRESET_BY_ID[entry.presetId]
    const originalCount = project.facilities.filter(item => (item.presetId ?? item.type) === entry.presetId).length
    for (let i = 0; i < entry.count; i++) additions.push({
      id: crypto.randomUUID(), type: preset.type, presetId: preset.id, name: `${preset.label} ${originalCount + i + 1}`,
      x: 0, y: 0, width: preset.width, depth: preset.depth, floors: preset.floors, rooms: preset.rooms,
      unitCost: preset.unitCost, rotation: 0, locked: false, visible: true,
      ...(preset.roomMix ? { roomMix: { ...preset.roomMix } } : {}), ...(preset.surface ? { surface: preset.surface } : {}),
    })
  }
  const columnWidth = Math.max(...additions.map(item => rectangle(item).width)), rowDepth = Math.max(...additions.map(item => rectangle(item).depth))
  const columns = Math.min(3, additions.length), rows = Math.ceil(additions.length / columns)
  additions.forEach((item, index) => { item.x = (index % columns) * (columnWidth + gap); item.y = Math.floor(index / columns) * (rowDepth + gap) })
  return placeBlock(project, additions, columns * columnWidth + (columns - 1) * gap, rows * rowDepth + (rows - 1) * gap, gap, margin, zone.name)
}

export function planFacilityArray(project: Project, ids: readonly string[], options: { rows: number; columns: number; gapX: number; gapY: number; margin?: number }): ExpansionPlan {
  const { rows, columns, gapX, gapY } = options, margin = options.margin === undefined ? 6 : options.margin
  if (![rows, columns].every(value => Number.isInteger(value) && numberInRange(value, 1, 10))) return failure(project, '阵列行数和列数必须为 1 至 10 的整数。')
  if (![gapX, gapY, margin].every(value => numberInRange(value, 0, 1000))) return failure(project, '阵列间距和用地退界必须为 0 至 1000 米的有限数值。')
  if (!ids.length || ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) return failure(project, '请选择不重复的有效设施。')
  const requested = new Set(ids), selected = project.facilities.filter(item => requested.has(item.id))
  if (selected.length !== ids.length) return failure(project, '选区包含不存在的设施。')
  // Reject excessive copies before allocating UUIDs, cloned objects or a large array.
  if (project.facilities.length + selected.length * rows * columns > 200) return failure(project, '新增阵列后超过 200 个设施上限。')
  const invalid = validateProject(project)
  if (invalid) return failure(project, invalid)
  const rectangles = selected.map(rectangle)
  for (let i = 0; i < rectangles.length; i++) for (let j = i + 1; j < rectangles.length; j++) {
    if (intersects(rectangles[i], rectangles[j])) return failure(project, '选区内部存在设施重叠，请先调整选区。')
  }
  const x = Math.min(...rectangles.map(item => item.x)), y = Math.min(...rectangles.map(item => item.y))
  const width = Math.max(...rectangles.map(item => item.x + item.width)) - x, depth = Math.max(...rectangles.map(item => item.y + item.depth)) - y
  const blockWidth = columns * width + (columns - 1) * gapX, blockDepth = rows * depth + (rows - 1) * gapY
  const additions: Facility[] = []
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) for (const original of selected) {
    const suffix = ` 副本 ${row + 1}-${column + 1}`
    additions.push({ ...structuredClone(original), id: crypto.randomUUID(), name: original.name.slice(0, 120 - suffix.length) + suffix,
      x: original.x - x + column * (width + gapX), y: original.y - y + row * (depth + gapY), locked: false, visible: true })
  }
  return placeBlock(project, additions, blockWidth, blockDepth, 4, margin, `${rows} × ${columns} 阵列`)
}

/** Append one reusable group without moving any existing facility or material. */
export function planFacilityGroup(project:Project,source:readonly Facility[],label:string,options?:{gap?:number;margin?:number}):ExpansionPlan {
  const gap=options?.gap??4,margin=options?.margin??6
  if(![gap,margin].every(v=>numberInRange(v,0,1000)))return failure(project,'间距与退界须为0至1000米的有效数值。')
  if(!source.length||source.length>200||project.facilities.length+source.length>200)return failure(project,'新增后超过200个设施或组合为空。')
  const invalid=validateProject(project);if(invalid)return failure(project,invalid)
  if(new Set(source.map(f=>f.id)).size!==source.length||source.some(f=>!validRectangle(rectangle(f))||![0,90].includes(f.rotation)))return failure(project,'组合的尺寸、位置或标识无效。')
  const rects=source.map(rectangle)
  for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)if(intersects(rects[i],rects[j]))return failure(project,'组合内部存在设施重叠，请先调整组合。')
  const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y))
  const width=Math.max(...rects.map(r=>r.x+r.width))-x,depth=Math.max(...rects.map(r=>r.y+r.depth))-y
  const additions=source.map(f=>({...structuredClone(f),id:crypto.randomUUID(),x:f.x-x,y:f.y-y,locked:false,visible:true}))
  return placeBlock(project,additions,width,depth,gap,margin,label)
}
