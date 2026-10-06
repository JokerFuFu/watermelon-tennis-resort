import { useEffect, useRef } from 'react'
import { BedDouble, Building2, Check, Download, Hotel, Info, Layers3, Plus, Ruler, TriangleAlert } from 'lucide-react'
import type { Facility, Metrics, Project, RoomAllocation, RoomType } from './types'
import { calculateRoomProgram, formatNumber, getRoomMix, ROOM_TYPES } from './model'
import { formatArea } from './area'
import './room-planning.css'

interface RoomPlanningProps {
  project: Project
  metrics: Metrics
  update: (id: string, patch: Partial<Facility>) => void
  onAdd: () => void
  focusFacilityId?: string|null
  focusToken?: number
}
const TYPES: RoomType[] = ['standard', 'deluxe', 'suite']
function finiteInteger(value: string, min: number, max: number): number | null {
  if (value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : null
}
function RoomSketch({ type }: { type: RoomType }) {
  const color = ROOM_TYPES[type].color
  return <svg className="rp-room-sketch" viewBox="0 0 125 77" aria-hidden="true">
    <rect x="15" y="8" width="94" height="62" rx="2" fill="#fffef9" stroke="#cfD4c8" strokeWidth="1.5"/>
    <path d="M15 46V70H83M99 70H109V8H15V30" fill="none" stroke="#8c9984" strokeWidth="2"/>
    <path d="M83 70V54A16 16 0 0 1 99 70" fill="none" stroke="#c6cebe" strokeWidth=".8"/>
    <rect x="82" y="8" width="27" height="24" fill="#f0f2e9" stroke="#d8dece" strokeWidth=".7"/>
    <rect x="90" y="12" width="14" height="9" rx="1.5" fill="#fffef9" stroke="#c4ccbb" strokeWidth=".8"/>
    <circle cx="96" cy="27" r="2" fill="none" stroke="#c1cbb7" strokeWidth=".8"/>
    {type === 'standard' ? <>{[28, 51].map(x => <g key={x}><rect x={x} y="18" width="19" height="32" rx="1.5" fill={color} fillOpacity=".34" stroke={color} strokeWidth="1"/><rect x={x + 2} y="20" width="15" height="7" rx="1.5" fill="#fffdf5"/><path d={`M${x} 30H${x + 19}`} stroke={color} strokeWidth=".8"/></g>)}</> : <><rect x="28" y="18" width="37" height="33" rx="1.5" fill={color} fillOpacity=".32" stroke={color} strokeWidth="1"/><rect x="31" y="20" width="13" height="7" rx="1.5" fill="#fffdf5"/><rect x="49" y="20" width="13" height="7" rx="1.5" fill="#fffdf5"/><path d="M28 30H65" stroke={color} strokeWidth=".8"/></>}
    <rect x="23" y="56" width="24" height="4" rx="1" fill="#d6dccb"/>
    {type === 'suite' ? <><rect x="76" y="39" width="25" height="8" rx="2" fill={color} fillOpacity=".24" stroke={color} strokeWidth=".7"/><rect x="77" y="48" width="7" height="13" rx="2" fill={color} fillOpacity=".24" stroke={color} strokeWidth=".7"/><circle cx="93" cy="55" r="5" fill="#f0e5d3" stroke="#ccbfa8" strokeWidth=".7"/></> : <><circle cx="92" cy="44" r="5" fill="#efeadf" stroke="#cacbbb" strokeWidth=".7"/><rect x="87" y="54" width="11" height="4" rx="1.5" fill="#d5dcc9"/></>}
    <path d="M28 8H70" stroke="#b0c9bd" strokeWidth="3"/>
  </svg>
}

export default function RoomPlanning({ project, metrics, update, onAdd, focusFacilityId, focusToken }: RoomPlanningProps) {
  const sectionRef=useRef<HTMLElement>(null)
  useEffect(()=>{
    if(!focusFacilityId)return
    const card=[...sectionRef.current?.querySelectorAll<HTMLElement>('[data-room-facility-id]')??[]].find(element=>element.dataset.roomFacilityId===focusFacilityId)
    card?.scrollIntoView({block:'center'})
    card?.focus({preventScroll:true})
  },[focusFacilityId,focusToken])
  const hotels = project.facilities.filter(f => f.type === 'hotel')
  const hotelArea = hotels.reduce((sum, f) => sum + f.width * f.depth * f.floors, 0)
  const totals = hotels.reduce<RoomAllocation>((sum, f) => {
    const mix = getRoomMix(f)
    TYPES.forEach(type => { sum[type] += mix[type] })
    return sum
  }, { standard: 0, deluxe: 0, suite: 0 })
  const totalGuestArea = hotels.reduce((sum, f) => sum + calculateRoomProgram(f).guestArea, 0)
  const shortageCount = hotels.filter(f => calculateRoomProgram(f).remainingArea < 0).length
  function changeCount(hotel: Facility, type: RoomType, value: string) {
    const mix = getRoomMix(hotel)
    const others = TYPES.reduce((sum, key) => sum + (key === type ? 0 : mix[key]), 0)
    const n = finiteInteger(value, 0, Math.max(0, 1000 - others))
    if (n === null) return
    const next = { ...mix, [type]: n }
    update(hotel.id, { roomMix: next, rooms: next.standard + next.deluxe + next.suite })
  }
  function exportRooms() {
    const cell = (value: string | number) => {
      const text = String(value)
      const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
      return `"${safe.replace(/"/g, '""')}"`
    }
    const rows: (string | number)[][] = [['酒店楼', '房型', '数量（间）', '示例单间净面积（㎡）', '客房净面积小计（㎡）', '楼层', '酒店建筑面积（㎡，完整楼层合计）']]
    hotels.forEach(hotel => {
      const mix = getRoomMix(hotel)
      TYPES.forEach(type => rows.push([hotel.name, ROOM_TYPES[type].label, mix[type], ROOM_TYPES[type].area.toFixed(2), (mix[type] * ROOM_TYPES[type].area).toFixed(2), hotel.floors, calculateRoomProgram(hotel).grossArea.toFixed(2)]))
    })
    const content = '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8;' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${project.name.replace(/[\\/:*?"<>|]/g, '_')}-客房配置.csv`
    document.body.appendChild(link); link.click(); link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1500)
  }
  return <section ref={sectionRef} className="surface room-page rp-page">
    <div className="section-heading rp-heading">
      <div><h2>为每一位住客，留一处舒适空间。</h2><p>配置房型组合，让客房容量与建筑空间一起生长。</p></div>
      <div className="rp-heading-actions"><button className="button subtle" onClick={exportRooms} aria-label="导出客房配置" disabled={!hotels.length}><Download size={14}/>导出配置</button><button className="button primary" onClick={onAdd}><Plus size={15}/>添加酒店楼</button></div>
    </div>
    <div className="room-summary rp-summary">
      <div><span className="rp-kpi-icon"><Hotel size={21}/></span><span>规划客房总数</span><strong>{metrics.roomCount}<small>间</small></strong><p>{hotels.length} 栋酒店楼 · 三类房型</p></div>
      <div><span className="rp-kpi-icon"><Building2 size={21}/></span><span>酒店建筑面积</span><strong>{formatArea(hotelArea)}<small>m²</small></strong><p>占地面积 × 配置楼层</p></div>
      <div><span className="rp-kpi-icon"><Ruler size={21}/></span><span>每间客房分摊建筑面积</span><strong>{metrics.roomCount ? formatArea(hotelArea / metrics.roomCount) : '—'}<small>m² / 间</small></strong><p>含公共交通与服务空间</p></div>
    </div>
    <div className="rp-section-label"><h3>房型组合</h3><span>{metrics.roomCount ? formatArea(totalGuestArea) : '0.00'} m² 客房示例净面积</span></div>
    <div className="rp-type-overview">
      {TYPES.map(type => <article className="rp-type-card" key={type} style={{ borderTopColor: ROOM_TYPES[type].color }}>
        <div className="rp-type-top"><span className="rp-type-name"><i style={{ background: ROOM_TYPES[type].color }}/>{ROOM_TYPES[type].label}</span><span className="rp-area-tag">{ROOM_TYPES[type].area} m² / 间</span></div>
        <div className="rp-type-content"><div><strong>{totals[type]}<small>间</small></strong><p>{metrics.roomCount ? formatNumber(totals[type] / metrics.roomCount * 100, 1) : '0'}% 的客房组合</p></div><RoomSketch type={type}/></div>
        <p className="rp-type-description">{ROOM_TYPES[type].description}</p>
      </article>)}
    </div>
    <div className="rp-section-label rp-building-label"><h3>酒店楼配置 <span>{hotels.length}</span></h3><span>修改后自动保存到当前项目</span></div>
    <div className="rp-hotels">
      {hotels.map(hotel => {
        const mix = getRoomMix(hotel), program = calculateRoomProgram(hotel)
        const shortage = program.remainingArea < 0
        const barTotal = Math.max(program.grossArea, program.guestArea, 1)
        const areaRatio = program.grossArea > 0 ? program.guestArea / program.grossArea * 100 : 0
        return <article className={`rp-hotel-card${shortage ? ' rp-insufficient' : ''}${focusFacilityId===hotel.id?' rp-hotel-focus':''}`} key={hotel.id} data-room-facility-id={hotel.id} tabIndex={-1}>
          <div className="rp-hotel-heading"><div className="rp-hotel-title"><span className="rp-building-icon"><Building2 size={22}/></span><div><h3>{hotel.name}</h3></div></div><span className={`rp-capacity-status${shortage ? ' rp-status-warning' : ''}`}>{shortage ? <TriangleAlert size={12}/> : <Check size={12}/>} {shortage ? '客房面积超出建筑容量' : '配置已同步'}</span></div>
          <div className="rp-building-controls">
            <div className="rp-stat"><span>建筑面积</span><strong>{formatArea(program.grossArea)} <small>m²</small></strong></div>
            <label className="rp-control"><span><Layers3 size={12}/>楼层</span><div><input className="table-number" aria-label={`${hotel.name}楼层`} type="number" min={1} max={30} step={1} disabled={!!hotel.locked} value={hotel.floors} onChange={event => { const n = finiteInteger(event.target.value, 1, 30); if (n !== null) update(hotel.id, { floors: n }) }}/><small>层</small></div></label>
            <label className="rp-control"><span><BedDouble size={12}/>客房总数</span><div><input className="table-number" aria-label={`${hotel.name}客房数量`} type="number" min={0} max={1000} step={1} disabled={!!hotel.locked} value={hotel.rooms} onChange={event => { const n = finiteInteger(event.target.value, 0, 1000); if (n !== null) update(hotel.id, { rooms: n }) }}/><small>间</small></div></label>
            <div className="rp-stat"><span>分摊建筑面积</span><strong>{hotel.rooms ? formatArea(program.grossArea / hotel.rooms) : '—'} <small>m² / 间</small></strong></div>
          </div>
          <div className="rp-mix-grid">
            {TYPES.map(type => <label className="rp-mix-input" key={type}><span className="rp-mix-title"><i style={{ background: ROOM_TYPES[type].color }}/>{ROOM_TYPES[type].label}<small>{ROOM_TYPES[type].area} m² / 间</small></span><div className="rp-mix-value"><input aria-label={`${hotel.name}${ROOM_TYPES[type].label}数量`} type="number" min={0} max={Math.max(0, 1000 - TYPES.reduce((sum, key) => sum + (key === type ? 0 : mix[key]), 0))} step={1} disabled={!!hotel.locked} value={mix[type]} onChange={event => changeCount(hotel, type, event.target.value)}/><span>间</span><small>{formatArea(mix[type] * ROOM_TYPES[type].area)} m²</small></div></label>)}
          </div>
          <div className="rp-area-program"><div className="rp-area-heading"><span>建筑空间分配</span><span>客房净面积占比 <strong>{formatNumber(areaRatio, 1)}%</strong></span></div>
            <div className="rp-allocation-bar" role="img" aria-label={`${hotel.name}客房净面积${formatArea(program.guestArea)}平方米，${shortage ? '面积缺口' : '公共与服务空间'}${formatArea(Math.abs(program.remainingArea))}平方米`}>
              {TYPES.map(type => <span key={type} style={{ width: `${mix[type] * ROOM_TYPES[type].area / barTotal * 100}%`, background: ROOM_TYPES[type].color }} title={`${ROOM_TYPES[type].label} · ${mix[type]}间 · ${formatArea(mix[type] * ROOM_TYPES[type].area)} m²`}/>)}
              {!shortage && <span style={{ width: `${Math.max(0, program.remainingArea) / barTotal * 100}%`, background: '#e6eadd' }} title={`公共与服务空间 · ${formatArea(program.remainingArea)} m²`}/>}
            </div>
            <div className="rp-allocation-legend"><span><i style={{ background: '#71876b' }}/>客房示例净面积 <strong>{formatArea(program.guestArea)} m²</strong></span><span className={shortage ? 'rp-area-shortage' : ''}><i style={{ background: shortage ? '#c67f59' : '#e2e7d7' }}/>{shortage ? '面积缺口' : '公共与服务空间'} <strong>{formatArea(Math.abs(program.remainingArea))} m²</strong></span></div>
            {shortage && <p className="rp-shortage-message" role="status"><TriangleAlert size={13}/>客房示例净面积已超过建筑面积 {formatArea(-program.remainingArea)} m²。可调整房型数量、增加楼层或扩大酒店楼占地；当前方案已保留。</p>}
          </div>
        </article>
      })}
      {!hotels.length && <div className="rp-empty empty-table"><span><Hotel size={30}/></span><h3>让第一栋酒店楼，成为度假的起点。</h3><p>添加酒店楼后，即可配置客房数量、房型组合与建筑空间。</p><button className="button primary" onClick={onAdd}><Plus size={15}/>添加酒店楼</button></div>}
    </div>
    <div className="room-note rp-note"><Info size={17}/><div><strong>从概念容量，走向详细设计。</strong><p>28 / 38 / 58 m² 为三类房型的示例净面积，用于容量测算，可用建筑面积包含全部楼层。剩余面积作为公共交通与服务空间的概念预留，实际房型、结构、设备及消防条件需在详细设计中核定。</p>{shortageCount > 0 && <p className="rp-note-warning">当前有 {shortageCount} 栋酒店楼存在面积缺口，请结合方案调整。</p>}</div></div>
  </section>
}
