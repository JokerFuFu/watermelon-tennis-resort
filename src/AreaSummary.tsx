import { Download, MapPin, Ruler } from 'lucide-react'
import { facilitySiteArea, formatArea } from './area'
import { getFacilityLabel } from './facilityCatalog'
import type { Metrics, Project } from './types'
import './area-summary.css'

interface AreaSummaryProps {
  project: Project
  metrics: Metrics
  onExport: () => void
  onLocate?: (id: string) => void
  compact?: boolean
}

function AreaValue({ value, id }: { value: number; id: string }) {
  return <strong data-testid={`area-${id}`} data-area-value={value}>{formatArea(value)}<small>㎡</small></strong>
}

export default function AreaSummary({ project, metrics, onExport, onLocate, compact = false }: AreaSummaryProps) {
  const ratio = (area: number) => metrics.siteArea > 0 ? area / metrics.siteArea * 100 : 0
  const occupiedPercent = Math.min(100, Math.max(0, ratio(metrics.occupiedArea)))
  const greenPercent = Math.min(occupiedPercent, Math.max(0, ratio(metrics.landscapeArea)))
  const otherPercent = Math.max(0, occupiedPercent - greenPercent)
  const emptyPercent = Math.max(0, 100 - occupiedPercent)
  const facts = [
    { id: 'site', label: '总用地面积', value: metrics.siteArea, note: `${project.siteWidth} × ${project.siteDepth} m` },
    { id: 'occupied', label: '界内总占地（含自建物）', value: metrics.occupiedArea, note: `联合投影去重 · ${ratio(metrics.occupiedArea).toFixed(2)}%` },
    { id: 'unallocated', label: '未配置用地', value: metrics.unallocatedArea, note: '总用地减界内去重占地' },
    { id: 'building-footprint', label: '界内建筑基底', value: metrics.footprint, note: `建筑占地去重 · ${ratio(metrics.footprint).toFixed(2)}%` },
    { id: 'building-gross', label: '建筑各层面积', value: metrics.buildingArea, note: '每栋完整占地 × 楼层后累加' },
    { id: 'green', label: '界内可用绿地', value: metrics.landscapeArea, note: `扣除非绿地覆盖 · ${ratio(metrics.landscapeArea).toFixed(2)}%` },
  ]
  return <section className={`area-summary${compact ? ' area-summary-compact' : ' surface'}`} aria-label="面积统计明细">
    <div className="area-summary-heading"><div><h3><Ruler size={16}/>面积核算</h3>{!compact && <p>按设施尺寸、朝向和用地边界实时计算，保留两位小数。</p>}</div><button className="button subtle" onClick={onExport} aria-label="导出面积明细"><Download size={14}/>{compact ? '导出' : '导出面积明细'}</button></div>
    <div className="area-summary-grid">{facts.map(fact => <div className="area-stat" key={fact.id}><span>{fact.label}</span><AreaValue value={fact.value} id={fact.id}/><p>{fact.note}</p></div>)}</div>
    <div className="area-distribution">
      <div className="area-distribution-bar" role="img" aria-label={`总用地${formatArea(metrics.siteArea)}平方米，其中可用绿地${formatArea(metrics.landscapeArea)}平方米，其他设施占地${formatArea(Math.max(0, metrics.occupiedArea - metrics.landscapeArea))}平方米，未配置用地${formatArea(metrics.unallocatedArea)}平方米`}>
        <span className="area-segment-green" style={{ width: `${greenPercent}%` }}/><span className="area-segment-occupied" style={{ width: `${otherPercent}%` }}/><span className="area-segment-empty" style={{ width: `${emptyPercent}%` }}/>
      </div>
      <div className="area-distribution-legend"><span><i className="area-segment-green"/>可用绿地</span><span><i className="area-segment-occupied"/>其他设施占地</span><span><i className="area-segment-empty"/>未配置用地</span></div>
    </div>
    <div className="area-secondary-stats"><div className={metrics.overlapArea > 0 ? 'area-has-conflict' : ''}><span>界内重叠区域</span><AreaValue value={metrics.overlapArea} id="overlap"/></div><div className={metrics.outOfBoundsArea > 0 ? 'area-has-conflict' : ''}><span>界外去重占地</span><AreaValue value={metrics.outOfBoundsArea} id="outside"/></div><div><span>完整设施占地合计</span><AreaValue value={metrics.rawFacilityArea} id="raw"/></div></div>
    <p className="area-material-note">建材与自建作品界内投影：{formatArea(metrics.materialArea)} ㎡。叠放和组合不自动增加建筑楼面、客房或球场。</p><p className="area-method-note">{compact ? '重叠与越界按区域去重；隐藏、锁定设施仍计入。未配置用地不自动算作绿地。' : '用地内同一块地只计一次；绿地已扣除非绿地设施覆盖。隐藏、锁定设施与建材仍占地，组合取整体外包范围。未配置用地尚未指定用途，不自动算作道路或绿地。建筑各层面积和预算工程量保留设施完整尺寸。'}</p>
    {!compact && <details className="area-facility-details"><summary>查看 {project.facilities.length} 项设施面积明细</summary><p>每项界内面积独立计算，直接相加会重复计入重叠区域；去重合计见上方。以下数值均为平方米。</p><div className="area-table-scroll"><table className="area-facility-table"><thead><tr><th>设施</th><th>完整占地（㎡）</th><th>界内面积（㎡）</th><th>界外面积（㎡）</th><th>建筑各层（㎡）</th>{onLocate && <th>位置</th>}</tr></thead><tbody>{project.facilities.map(facility => {
      const area = facilitySiteArea(facility, project)
      return <tr key={facility.id}><td><strong>{facility.name}</strong><span>{getFacilityLabel(facility)} · {facility.width} × {facility.depth} m · {facility.rotation}°{facility.visible === false ? ' · 已隐藏' : ''}</span></td><td>{formatArea(area.completeArea)}</td><td>{formatArea(area.inBoundsArea)}</td><td className={area.outOfBoundsArea > 0 ? 'area-has-conflict' : ''}>{formatArea(area.outOfBoundsArea)}</td><td>{formatArea(area.grossArea)}</td>{onLocate && <td><button className="area-locate" onClick={() => onLocate(facility.id)} aria-label={`定位${facility.name}`}><MapPin size={13}/>定位</button></td>}</tr>
    })}</tbody></table>{!project.facilities.length && <p className="area-empty">添加设施后即可查看面积明细。</p>}</div></details>}
    {!compact && <p className="area-geometry-note">当前统计为矩形方案的几何面积；场地总面积以实际测量为准。</p>}
  </section>
}
