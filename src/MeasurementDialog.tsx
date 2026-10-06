import { useMemo,useState } from 'react'
import { Download, MapPin, Ruler } from 'lucide-react'
import { Modal } from './ui'
import { measureFacility,measureGap,nearestFacility,formatLength } from './layoutMeasurements'
import type { Project } from './types'
import './layout-measurements.css'
export default function LayoutMeasurements({project,selectedIds,onClose,onExport,onLocate}:{project:Project;selectedIds:readonly string[];onClose:()=>void;onExport:(ids:readonly string[])=>void;onLocate:(id:string)=>void}){
  const [scope,setScope]=useState(selectedIds.length?'selected':'all'),[query,setQuery]=useState('')
  const [sort,setSort]=useState('original')
  const [first,setFirst]=useState(selectedIds[0]??project.facilities[0]?.id??'')
  const [second,setSecond]=useState(selectedIds[1]??nearestFacility(project,selectedIds[0]??project.facilities[0]?.id??'')?.facility.id??'')
  const rows=useMemo(()=>project.facilities.filter(f=>(scope==='all'||selectedIds.includes(f.id))&&`${f.name} ${measureFacility(f,project).label}`.includes(query.trim())).map(f=>measureFacility(f,project)).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'zh-CN'):sort==='area'?b.width*b.depth-a.width*a.depth:sort==='margin'?Math.min(a.leftMargin,a.rightMargin,a.topMargin,a.bottomMargin)-Math.min(b.leftMargin,b.rightMargin,b.topMargin,b.bottomMargin):0),[project,selectedIds,scope,query,sort])
  const a=project.facilities.find(f=>f.id===first),b=project.facilities.find(f=>f.id===second),gap=a&&b&&a.id!==b.id?measureGap(measureFacility(a,project),measureFacility(b,project)):null
  return <Modal title="布局测量清单" onClose={onClose} wide><div className="layout-measurements">
    <p className="lm-intro">检查尺寸、位置、距用地边界及设施净间距。测量按当前矩形占地计算，包含隐藏设施。</p>
    <section className="lm-pair" aria-label="两设施间距"><h3><Ruler size={17}/>两设施间距</h3><div className="lm-pair-controls"><label>设施一<select aria-label="测量设施一" value={first} onChange={e=>setFirst(e.target.value)}><option value="">请选择</option>{project.facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label><label>设施二<select aria-label="测量设施二" value={second} onChange={e=>setSecond(e.target.value)}><option value="">请选择</option>{project.facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label></div>
      {gap?<div className="lm-gap"><strong data-testid="measured-gap">{formatLength(gap.distance)}<small> m</small></strong><span>{gap.relation==='overlap'?'矩形占地重叠':gap.relation==='touching'?'矩形边界接触':'两处矩形占地之间的最短净距'}</span><p>横向间隔 {formatLength(gap.horizontal)} m · 纵向间隔 {formatLength(gap.vertical)} m{gap.overlapArea>0?` · 重叠 ${gap.overlapArea.toLocaleString('zh-CN',{maximumFractionDigits:3})} m²`:''}</p></div>:<p className="lm-empty">请选择两个不同的设施。</p>}
    </section>
    <div className="lm-toolbar"><div><button aria-pressed={scope==='all'} onClick={()=>setScope('all')}>全部设施</button><button disabled={!selectedIds.length} aria-pressed={scope==='selected'} onClick={()=>setScope('selected')}>当前选区</button></div><input aria-label="搜索测量清单" placeholder="搜索设施名称或类型" value={query} onChange={e=>setQuery(e.target.value)}/><select aria-label="测量清单排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="original">添加顺序</option><option value="name">名称顺序</option><option value="area">占地从大到小</option><option value="margin">最小边距从小到大</option></select><button className="button secondary" disabled={!rows.length} onClick={()=>onExport(rows.map(r=>r.id))}><Download size={14}/>导出测量 CSV</button></div>
    <div className="lm-count">{rows.length} 项 · 用地 {formatLength(project.siteWidth)} × {formatLength(project.siteDepth)} m</div>
    <div className="lm-table-scroll"><table><thead><tr><th>设施</th><th>位置 X / Y(m)</th><th>占地宽 / 深(m)</th><th>左 / 右边距(m)</th><th>上 / 下边距(m)</th><th>范围与状态</th><th>最近设施 / 净距</th><th>查看</th></tr></thead><tbody>{rows.map(m=>{const near=nearestFacility(project,m.id);return <tr key={m.id} data-measure-row={m.id}><td><strong>{m.name}</strong><small>{m.label}</small></td><td>{formatLength(m.x)} / {formatLength(m.y)}</td><td>{formatLength(m.width)} / {formatLength(m.depth)}</td><td>{formatLength(m.leftMargin)} / {formatLength(m.rightMargin)}</td><td>{formatLength(m.topMargin)} / {formatLength(m.bottomMargin)}</td><td className={m.inBounds?'':'lm-outside'}>{m.inBounds?'界内':'越界'}{m.visible?'':' · 隐藏'}{m.locked?' · 锁定':''}</td><td>{near?<><span>{near.facility.name}</span><small>{formatLength(near.gap.distance)} m · {near.gap.relation==='overlap'?'重叠':near.gap.relation==='touching'?'接触':'分离'}</small></>:'无其他设施'}</td><td><button aria-label={`定位${m.name}`} onClick={()=>onLocate(m.id)}><MapPin size={14}/></button></td></tr>})}</tbody></table></div>
    {!rows.length&&<p className="lm-empty">没有匹配的设施。</p>}
    <p className="lm-note">占地宽深已按旋转方向换算；负边距表示越界。列表最多显示三位小数，计算使用原始精度。导出范围与当前筛选、排序一致。定位隐藏设施会恢复显示。</p>
    <div className="dialog-footer"><span>查看清单不改动布局、价格或经营设置。</span><button className="button primary" onClick={onClose}>返回设计</button></div>
  </div></Modal>
}
