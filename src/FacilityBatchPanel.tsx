import { useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Eye, EyeOff, LockKeyhole, MousePointer2, Trash2, Unlock, X } from 'lucide-react'
import { calculateSiteAreas, formatArea } from './area'
import { getFacilitySelectionBounds, type FacilityAlignment } from './facilitySelection'
import { formatNumber } from './model'
import type { Project } from './types'
import './facility-selection.css'

interface Props {
  project: Project
  ids: readonly string[]
  onMove: (dx: number, dy: number) => void
  onAlign: (action: FacilityAlignment) => void
  onDuplicate: () => void
  onPatch: (patch: { locked?: boolean; visible?: boolean }) => void
  onDelete: () => void
  onClear: () => void
  onArray: () => void
  onFocus: () => void
  onMeasurements: () => void
  onTemplates: () => void
}
const alignments: { id: FacilityAlignment; label: string }[] = [
  { id: 'left', label: '左边对齐' }, { id: 'center-x', label: '水平居中' }, { id: 'right', label: '右边对齐' },
  { id: 'top', label: '上边对齐' }, { id: 'center-y', label: '垂直居中' }, { id: 'bottom', label: '下边对齐' },
  { id: 'distribute-x', label: '横向均匀排列' }, { id: 'distribute-y', label: '纵向均匀排列' },
]

export default function FacilityBatchPanel({ project, ids, onMove, onAlign, onDuplicate, onPatch, onDelete, onClear, onArray, onFocus, onMeasurements, onTemplates }: Props) {
  const facilities = useMemo(() => project.facilities.filter(f => ids.includes(f.id)), [project.facilities, ids])
  const bounds = getFacilitySelectionBounds(project, ids)
  const area = useMemo(() => calculateSiteAreas({ ...project, facilities, materials: [], materialAssemblies: [] }).occupiedArea, [project, facilities])
  const [step, setStep] = useState(1)
  const [dx, setDx] = useState('0'), [dy, setDy] = useState('0')
  const validOffset = dx.trim() !== '' && dy.trim() !== '' && Number.isFinite(Number(dx)) && Number.isFinite(Number(dy)) && Math.abs(Number(dx)) <= 1000 && Math.abs(Number(dy)) <= 1000
  const locked = facilities.filter(f => f.locked).length
  const hidden = facilities.filter(f => f.visible === false).length
  return <section className="facility-batch-panel" aria-label="设施批量编辑">
    <div className="fb-heading"><span><MousePointer2 size={18}/>已选 {facilities.length} 个设施</span><button aria-label="清空批量选择" title="清空选择" onClick={onClear}><X size={16}/></button></div>
    <p className="fb-intro">一起移动和排列，让每个空间各就其位。</p>
    <div className="fb-quick-tools"><button aria-label="查看选区" onClick={onFocus}><MousePointer2 size={14}/>查看选区</button><button aria-label="阵列复制" onClick={onArray}><Copy size={14}/>阵列复制</button></div>
    <button className="fb-templates-button" aria-label="保存选区组合" onClick={onTemplates}>保存选区为常用组合</button>
    <button className="fb-measure-button" aria-label="测量选区" onClick={onMeasurements}>查看尺寸、边距和设施间距</button>
    <div className="fb-summary"><div><span>去重占地</span><strong>{formatArea(area)}<small> m²</small></strong></div><div><span>客房合计</span><strong>{formatNumber(facilities.reduce((n, f) => n + (f.type === 'hotel' ? f.rooms : 0), 0))}<small> 间</small></strong></div></div>
    {bounds && <p className="fb-bounds">选区范围 {formatArea(bounds.width)} × {formatArea(bounds.depth)} m <span>含空间间隔</span></p>}
    <div className="fb-names">{facilities.slice(0, 4).map(f => <span key={f.id} title={f.name}>{f.name}</span>)}{facilities.length > 4 && <span>另 {facilities.length - 4} 项</span>}</div>
    {!!locked && <p className="fb-lock-note" role="status">{locked} 项已锁定。解锁后可整体移动、排列或删除。</p>}
    <div className="fb-section"><h3>整体移动<select aria-label="批量移动步长" value={step} onChange={e => setStep(Number(e.target.value))}>{[1, 5, 10].map(n => <option key={n} value={n}>{n} 米 / 次</option>)}</select></h3>
      <div className="fb-directions">{[{ label: '选区向左移动', icon: ArrowLeft, x: -step, y: 0 }, { label: '选区向上移动', icon: ArrowUp, x: 0, y: -step }, { label: '选区向下移动', icon: ArrowDown, x: 0, y: step }, { label: '选区向右移动', icon: ArrowRight, x: step, y: 0 }].map(({ label, icon: Icon, x, y }) => <button key={label} aria-label={label} title={label} disabled={!!locked} onClick={() => onMove(x, y)}><Icon size={17}/></button>)}</div>
      <div className="fb-offsets"><label>横向位移 / m<input type="number" aria-label="选区横向位移" step="0.01" min={-1000} max={1000} value={dx} disabled={!!locked} onChange={e => setDx(e.target.value)}/></label><label>纵向位移 / m<input type="number" aria-label="选区纵向位移" step="0.01" min={-1000} max={1000} value={dy} disabled={!!locked} onChange={e => setDy(e.target.value)}/></label></div>
      <button className="fb-apply" disabled={!!locked || !validOffset || (Number(dx) === 0 && Number(dy) === 0)} onClick={() => onMove(Number(dx), Number(dy))}>应用位移</button>
      {!validOffset && <p className="fb-note" role="alert">位移请填写 −1000 至 1000 之间的数字。</p>}
    </div>
    <div className="fb-section"><h3>对齐与排列</h3><div className="fb-alignments">{alignments.map(a => <button key={a.id} disabled={!!locked || (a.id.startsWith('distribute') && facilities.length < 3)} onClick={() => onAlign(a.id)}>{a.label}</button>)}</div><p className="fb-note">沿选区范围对齐；均匀排列保持首尾位置，至少选择 3 项。重叠提醒可在场地信息中查看。</p></div>
    <div className="fb-section"><h3>批量管理<span>{hidden} 项隐藏 · {locked} 项锁定</span></h3><div className="fb-actions">
      <button aria-label="批量复制设施" disabled={project.facilities.length + facilities.length > 200} onClick={onDuplicate}><Copy size={14}/>复制选区</button>
      <button aria-label={locked === facilities.length ? '批量解锁设施' : '批量锁定设施'} onClick={() => onPatch({ locked: locked !== facilities.length })}>{locked === facilities.length ? <Unlock size={14}/> : <LockKeyhole size={14}/>} {locked === facilities.length ? '全部解锁' : '全部锁定'}</button>
      <button aria-label={hidden === facilities.length ? '批量显示设施' : '批量隐藏设施'} onClick={() => onPatch({ visible: hidden === facilities.length })}>{hidden === facilities.length ? <Eye size={14}/> : <EyeOff size={14}/>} {hidden === facilities.length ? '全部显示' : '全部隐藏'}</button>
      <button className="fb-delete" aria-label="批量删除设施" disabled={!!locked} onClick={onDelete}><Trash2 size={14}/>删除选区</button>
    </div><p className="fb-note">隐藏仍计入面积与预算。复制保留设施属性；副本的收费请在月度经营中设置。所有修改均可撤销。</p></div>
  </section>
}
