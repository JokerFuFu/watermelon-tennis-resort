import { useMemo, useState } from 'react'
import { BedDouble, CheckCheck, Grid3X3, Layers, Map as MapIcon, Plus, TriangleAlert } from 'lucide-react'
import { calculateSiteAreas, facilitySiteArea } from './area'
import { FACILITY_PRESETS } from './facilityCatalog'
import { HOTEL_ZONES, planFacilityArray, planHotelZone } from './hotelExpansion'
import type { ExpansionPlan } from './hotelExpansion'
import { formatNumber } from './model'
import { estimateFacility } from './pricing'
import SiteCanvas from './SiteCanvas'
import { Modal } from './ui'
import type { Project } from './types'
import './hotel-expansion.css'

interface Props {
  project: Project
  mode: 'zones' | 'array'
  selectedIds: readonly string[]
  onClose: () => void
  onApply: (plan: Extract<ExpansionPlan, { success: true }>, source: Project) => void
}

const presetNames = new Map(FACILITY_PRESETS.map(preset => [preset.id, preset.label]))
const noop = () => {}

function validNumber(raw: string, min: number, max: number, integer = false): number | null {
  if (!raw.trim()) return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= min && value <= max && (!integer || Number.isInteger(value)) ? value : null
}

function ExpansionField({ label, value, onChange, integer = false, min = 0, max = 1000, unit = '米' }: {
  label: string
  value: string
  onChange: (value: string) => void
  integer?: boolean
  min?: number
  max?: number
  unit?: string
}) {
  const invalid = validNumber(value, min, max, integer) === null
  return <label className="he-field"><span>{label}</span><div><input type="number" inputMode={integer ? 'numeric' : 'decimal'} aria-label={label} aria-invalid={invalid} value={value} min={min} max={max} step={integer ? 1 : 'any'} onChange={event => onChange(event.target.value)} /><span>{unit}</span></div></label>
}

export default function HotelExpansionDialog({ project, mode, selectedIds, onClose, onApply }: Props) {
  const [zoneId, setZoneId] = useState(HOTEL_ZONES[0]?.id ?? '')
  const [gap, setGap] = useState('4')
  const [margin, setMargin] = useState('6')
  const [rows, setRows] = useState('1')
  const [columns, setColumns] = useState('3')
  const [gapX, setGapX] = useState('5')
  const [gapY, setGapY] = useState('5')
  const [view, setView] = useState<'2d' | '3d'>('2d')
  const [previewScope, setPreviewScope] = useState<'all' | 'new'>('all')
  const parsedMargin = validNumber(margin, 0, 1000)
  const parsedGap = validNumber(gap, 0, 1000)
  const parsedRows = validNumber(rows, 1, 10, true)
  const parsedColumns = validNumber(columns, 1, 10, true)
  const parsedGapX = validNumber(gapX, 0, 1000)
  const parsedGapY = validNumber(gapY, 0, 1000)
  const valid = parsedMargin !== null && (mode === 'zones' ? parsedGap !== null : parsedRows !== null && parsedColumns !== null && parsedGapX !== null && parsedGapY !== null)
  const plan = useMemo(() => {
    if (!valid || parsedMargin === null) return null
    if (mode === 'zones' && parsedGap !== null) return planHotelZone(project, zoneId, { gap: parsedGap, margin: parsedMargin })
    if (mode === 'array' && parsedRows !== null && parsedColumns !== null && parsedGapX !== null && parsedGapY !== null) {
      return planFacilityArray(project, selectedIds, { rows: parsedRows, columns: parsedColumns, gapX: parsedGapX, gapY: parsedGapY, margin: parsedMargin })
    }
    return null
  }, [project, mode, selectedIds, zoneId, valid, parsedMargin, parsedGap, parsedRows, parsedColumns, parsedGapX, parsedGapY])
  const addedIds = useMemo(() => plan?.additions.map(facility => facility.id) ?? [], [plan])
  const stats = useMemo(() => {
    if (!plan?.success) return null
    const additionsProject: Project = { ...project, facilities: plan.additions, materials: [], materialAssemblies: [] }
    const estimates = plan.additions.map(facility => estimateFacility(facility))
    return {
      count: plan.additions.length,
      rooms: plan.additions.reduce((sum, facility) => sum + (facility.type === 'hotel' ? facility.rooms : 0), 0),
      area: calculateSiteAreas(additionsProject).occupiedArea,
      grossArea: plan.additions.reduce((sum, facility) => sum + facilitySiteArea(facility, additionsProject).grossArea, 0),
      cost: estimates.reduce((sum, estimate) => sum + estimate.point, 0),
      taxUnresolved: estimates.some(estimate => estimate.taxUnresolved),
    }
  }, [plan, project])
  const previewProject = useMemo(() => {
    if (!plan?.success || previewScope === 'all') return plan?.success ? plan.project : project
    const added = plan.additions
    const left = Math.min(...added.map(f => f.x)), top = Math.min(...added.map(f => f.y))
    const right = Math.max(...added.map(f => f.x + (f.rotation === 90 ? f.depth : f.width)))
    const bottom = Math.max(...added.map(f => f.y + (f.rotation === 90 ? f.width : f.depth)))
    return { ...project, siteWidth: Math.max(30, right - left + 12), siteDepth: Math.max(30, bottom - top + 12),
      facilities: added.map(f => ({ ...f, x: f.x - left + 6, y: f.y - top + 6 })), materials: [], materialAssemblies: [] }
  }, [plan, project, previewScope])
  const selected = project.facilities.filter(facility => selectedIds.includes(facility.id))
  const selectedZone = HOTEL_ZONES.find(zone => zone.id === zoneId)
  const error = !valid ? (mode === 'zones' ? '间距与退界须填写 0–1000 米的有效数字，不能留空。' : '行数、列数须填写 1–10 的整数；横纵间距与退界须填写 0–1000 米的有效数字，不能留空。') : null

  return <Modal title={mode === 'zones' ? '功能区组合' : '阵列复制'} onClose={onClose} wide>
    <div className="hotel-expansion">
      <p className="he-intro">{mode === 'zones' ? '选择一组酒店配套，先看布局与工程估算，再加入当前方案。' : '将所选设施整组复制为阵列，保留组内相对位置与原件。'}</p>
      {mode === 'zones' ? <div className="he-zones" aria-label="功能区组合方案">
        {HOTEL_ZONES.map(zone => <button key={zone.id} type="button" className={`he-zone${zone.id === zoneId ? ' selected' : ''}`} aria-pressed={zone.id === zoneId} onClick={() => setZoneId(zone.id)}>
          <span className="he-zone-title"><Layers size={16} /><strong>{zone.name}</strong><span>{zone.entries.reduce((sum, entry) => sum + entry.count, 0)} 个设施</span></span>
          <span className="he-zone-description">{zone.description}</span>
          <span className="he-zone-facilities">{zone.entries.map(entry => <span key={entry.presetId}>{presetNames.get(entry.presetId)} × {entry.count}</span>)}</span>
        </button>)}
      </div> : <div className="he-source">
        <span><Grid3X3 size={17} /><strong>已选 {selected.length} 个设施</strong></span>
        <p>{selected.length ? selected.map(facility => facility.name).join('、') : '请先在设施列表中勾选需要复制的设施。'}</p>
        <small>新增行数 × 列数份所选组，原件保留且不计入新增份数。每份均包含全部所选设施。</small>
      </div>}
      <div className="he-parameters">
        {mode === 'zones' ? <ExpansionField label="设施间距" value={gap} onChange={setGap} /> : <>
          <ExpansionField label="新增行数" value={rows} onChange={setRows} min={1} max={10} integer unit="行" />
          <ExpansionField label="新增列数" value={columns} onChange={setColumns} min={1} max={10} integer unit="列" />
          <ExpansionField label="横向间距" value={gapX} onChange={setGapX} />
          <ExpansionField label="纵向间距" value={gapY} onChange={setGapY} />
        </>}
        <ExpansionField label="用地退界" value={margin} onChange={setMargin} />
      </div>
      {error ? <div className="he-status failed" role="alert"><TriangleAlert size={19} /><div><strong>请检查输入参数</strong><p>{error}</p></div></div> : plan && <div className={`he-status${plan.success ? '' : ' failed'}`} role="status"><span>{plan.success ? <CheckCheck size={19} /> : <TriangleAlert size={19} />}</span><div><strong>{plan.success ? '完整新增方案已生成' : '未找到完整新增方案'}</strong><p>{plan.message}</p></div></div>}
      {stats && <div className="he-stats" aria-label="新增设施统计">
        <div><span><Layers size={14} />新增设施</span><strong>{stats.count}<small>个</small></strong></div>
        <div><span><BedDouble size={14} />新增客房</span><strong>{formatNumber(stats.rooms)}<small>间</small></strong></div>
        <div><span><MapIcon size={14} />界内去重占地</span><strong>{formatNumber(stats.area, 2)}<small>㎡</small></strong></div>
        <div><span>完整建筑面积</span><strong>{formatNumber(stats.grossArea, 2)}<small>㎡</small></strong></div>
        <div className="he-cost"><span>新增工程已计估算</span><strong>{formatNumber(stats.cost / 10000, 2)}<small>万元</small></strong></div>
      </div>}
      <div className="he-preview-heading"><div><strong>布局预览</strong><span>{plan?.success ? `${mode === 'zones' ? selectedZone?.name : '新增阵列'} · 新设施已标亮` : '当前方案 · 尚未加入新设施'}</span></div><div className="he-view" aria-label="预览视图"><button type="button" aria-pressed={view === '2d'} onClick={() => setView('2d')}>2D 平面</button><button type="button" aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D 视图</button></div></div>
      <div className="he-scope" aria-label="预览范围"><button type="button" aria-pressed={previewScope === 'all'} onClick={() => setPreviewScope('all')}>全场位置</button><button type="button" disabled={!plan?.success} aria-pressed={previewScope === 'new'} onClick={() => setPreviewScope('new')}>新增区块近景</button><span>{previewScope === 'new' ? '只看新增设施，实际位置见全场。' : '查看新设施与原布局的关系。'}</span></div>
      <div className="he-canvas"><SiteCanvas project={previewProject} selectedId={null} selectedIds={addedIds} onSelect={noop} onMove={noop} mode={view} zoom={1} showLabels showGrid={false} tool="select" svgId="hotel-expansion-preview-svg" interactive={false} /></div>
      <p className="he-note">只预览不会更改方案，加入后支持统一撤销。{mode === 'zones' ? '设施采用可修改的示例单价，请按实际询价调整。' : '新增设施沿用原件尺寸、房型与计价资料，复制报价不会形成新的供应商询价。'}{stats?.taxUnresolved ? '部分税费口径待核实。' : ''}以上仅计新增设施工程；项目附加费用与地价请到投资估算页核对。</p>
      <div className="dialog-footer he-footer"><span>现有设施与建材保留，空间不足时整组不加入。</span><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="button" disabled={!valid || !plan?.success || !plan.additions.length} onClick={() => { if (valid && plan?.success && plan.additions.length) onApply(plan, project) }}><Plus size={15} />加入当前方案</button></div>
    </div>
  </Modal>
}
