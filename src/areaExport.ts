import { facilitySiteArea } from './area'
import { materialObstacles } from './materials'
import { getFacilityLabel } from './facilityCatalog'
import { calculateMetrics } from './model'
import type { Project } from './types'

function cell(value: string | number): string {
  const text = String(value)
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
  return `"${safe.replace(/"/g, '""')}"`
}

export function buildAreaCSV(project: Project): string {
  const metrics = calculateMetrics(project)
  const rows: (string | number)[][] = [
    ['项目', project.name], ['地点', project.location], ['面积单位', '㎡（m²）'],
    ['计算口径', '设施与建材、自建组合的外包矩形按朝向裁切到用地；空间总计求并集，每处只计一次。隐藏及锁定项仍计入，建材叠放不作为设施重叠冲突。'],
    ['用地宽（m）', project.siteWidth], ['用地深（m）', project.siteDepth], [],
    ['设施', '类型', '宽（m）', '深（m）', '朝向（°）', '楼层', '完整占地（㎡）', '单设施界内面积（㎡）', '单设施界外面积（㎡）', '建筑各层面积（㎡）', 'X（m）', 'Y（m）', '显示状态', '锁定状态'],
  ]
  project.facilities.forEach(facility => {
    const area = facilitySiteArea(facility, project)
    rows.push([facility.name, getFacilityLabel(facility), facility.width, facility.depth, facility.rotation, facility.floors, area.completeArea.toFixed(2), area.inBoundsArea.toFixed(2), area.outOfBoundsArea.toFixed(2), area.grossArea.toFixed(2), facility.x, facility.y, facility.visible === false ? '隐藏' : '显示', facility.locked ? '锁定' : '未锁定'])
  })
  rows.push([], ['汇总指标', '面积（㎡）', '说明'],
    ['总用地面积', metrics.siteArea.toFixed(2), '用地宽 × 深'],
    [project.materials?.length?'界内总占地（含自建物）':'界内设施占地', metrics.occupiedArea.toFixed(2), '设施与建材、自建组合界内外包矩形联合去重'],
    ['建材与作品界内投影',metrics.materialArea.toFixed(2),'组合取整体外包范围，不增加建筑各层面积'],
    ['未配置用地', metrics.unallocatedArea.toFixed(2), '总用地减界内联合去重占地；不自动视为道路或绿地'],
    ['界内建筑基底', metrics.footprint.toFixed(2), '建筑界内矩形并集'],
    ['建筑各层面积', metrics.buildingArea.toFixed(2), '每栋完整占地 × 楼层后累加，不扣减平面重叠和越界'],
    ['界内可用绿地', metrics.landscapeArea.toFixed(2), '界内绿地并集扣除非绿地覆盖'],
    ['界内重叠区域', metrics.overlapArea.toFixed(2), '被至少两个设施覆盖的界内区域，每处只计一次'],
    ['界外去重占地', metrics.outOfBoundsArea.toFixed(2), '全部设施与建材、自建组合外包矩形联合并集在用地外的区域'],
    ['完整设施占地合计', metrics.rawFacilityArea.toFixed(2), '每项完整占地累加；含重叠和越界，不等于实际用地占用'],
    ['建筑基底占比（%）', (metrics.coverageRatio * 100).toFixed(2), '界内去重建筑基底 / 总用地'],
    ['可用绿地占比（%）', (metrics.landscapeRatio * 100).toFixed(2), '界内可用绿地 / 总用地'],
    [], ['明细说明', '单设施界内面积不能直接加总为界内去重占地。当前统计为矩形方案几何面积，场地总面积以实际测量为准。'])
  if(project.materials?.length){rows.push([],['建材与作品投影','X米','Y米','外包宽米','外包深米']);for(const rect of materialObstacles(project))rows.push(['投影占位',rect.x,rect.y,rect.width,rect.depth])}
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
}
