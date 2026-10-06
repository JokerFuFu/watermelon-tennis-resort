import { useMemo, useState } from 'react'
import { Copy, Eye, EyeOff, LockKeyhole, MapPin, Search, Trash2, Unlock, X } from 'lucide-react'
import { FACILITY_CATEGORIES, getFacilityLabel, getFacilityPreset } from './facilityCatalog'
import { FacilityIcon } from './FacilityIcons'
import type { Facility } from './types'
import { facilityCost,formatNumber } from './model'
import './facility-manager-63.css'
import './workspace-upgrade.css'

interface Props {
  facilities:Facility[]
  selectedIds:readonly string[]
  onToggle:(id:string)=>void
  onSelectMatching:(ids:readonly string[])=>void
  onInvert:(ids:readonly string[])=>void
  onVisibility:(ids:readonly string[],visible:boolean)=>void
  onClear:()=>void
  onEditSelection:()=>void
  onLocate:(id:string)=>void
  onPatch:(id:string,patch:Partial<Facility>)=>void
  onDuplicate:(id:string)=>void
  onRemove:(id:string)=>void
}
export default function FacilityManager({facilities,selectedIds,onToggle,onSelectMatching,onInvert,onVisibility,onClear,onEditSelection,onLocate,onPatch,onDuplicate,onRemove}:Props){
  const [search,setSearch]=useState('')
  const [category,setCategory]=useState('all')
  const [status,setStatus]=useState('all'),[sort,setSort]=useState('original')
  const shown=useMemo(()=>facilities.filter(f=>{
    const p=getFacilityPreset(f)
    return(status==='all'||(status==='visible'&&f.visible!==false)||(status==='hidden'&&f.visible===false)||(status==='locked'&&!!f.locked)||(status==='unlocked'&&!f.locked))&&(category==='all'||p.category===category)&&`${f.name} ${getFacilityLabel(f)}`.toLowerCase().includes(search.trim().toLowerCase())
  }).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'zh-CN'):sort==='area'?b.width*b.depth-a.width*a.depth:sort==='cost'?facilityCost(b)-facilityCost(a):0),[facilities,search,category,status,sort])
  return <div className="facility-manager"><div className="fm-heading"><strong>管理场地中的每个空间</strong><span>{facilities.length} 个设施</span></div><div className="fm-search"><Search size={15}/><input aria-label="搜索已添加设施" placeholder="搜索设施名称或类型" value={search} onChange={e=>setSearch(e.target.value)}/>{search&&<button aria-label="清空设施搜索" onClick={()=>setSearch('')}><X size={13}/></button>}</div><select aria-label="设施管理分类" value={category} onChange={e=>setCategory(e.target.value)}><option value="all">全部分类</option>{Object.entries(FACILITY_CATEGORIES).map(([id,c])=><option value={id} key={id}>{c.label}</option>)}</select><div className="fm-filters"><select aria-label="设施状态筛选" value={status} onChange={e=>setStatus(e.target.value)}><option value="all">全部状态</option><option value="visible">显示中</option><option value="hidden">已隐藏</option><option value="locked">已锁定</option><option value="unlocked">未锁定</option></select><select aria-label="设施列表排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="original">添加顺序</option><option value="name">名称顺序</option><option value="area">占地从大到小</option><option value="cost">工程估算从高到低</option></select><button onClick={()=>{setSearch('');setCategory('all');setStatus('all');setSort('original')}}>重置筛选与排序</button></div><div className="fm-result-summary" aria-label="匹配设施统计"><span>占地面积合计 <strong>{formatNumber(shown.reduce((n,f)=>n+f.width*f.depth,0),3)} m²</strong></span><span>客房 <strong>{shown.reduce((n,f)=>n+(f.type==='hotel'?f.rooms:0),0)} 间</strong></span><span>设施工程估算 <strong>{formatNumber(shown.reduce((n,f)=>n+facilityCost(f),0)/10000,2)} 万元</strong></span><small>面积逐项相加，未扣重叠及界外；工程金额不含项目费用、土地与运营。</small></div><div className="fm-totals"><span>{shown.length} 个匹配</span><span>{facilities.filter(f=>f.locked).length} 个锁定 · {facilities.filter(f=>f.visible===false).length} 个隐藏</span></div><div className="fm-selection-tools"><button disabled={!shown.length} onClick={()=>onSelectMatching(shown.map(f=>f.id))}>选择全部结果</button><button disabled={!selectedIds.length} onClick={onClear}>清空选择</button><button disabled={!shown.length} onClick={()=>onInvert(shown.map(f=>f.id))}>反选当前结果</button></div><div className="fm-selection-tools"><button disabled={!shown.some(f=>f.visible!==false)} onClick={()=>onVisibility(shown.map(f=>f.id),false)}>隐藏当前结果</button><button disabled={!shown.some(f=>f.visible===false)} onClick={()=>onVisibility(shown.map(f=>f.id),true)}>显示当前结果</button></div>{selectedIds.length>0&&<div className="fm-selection-actions"><span>已选 {selectedIds.length} 项 · 勾选可跨分类保留</span><button onClick={onEditSelection}>{selectedIds.length>1?'编辑选区':'编辑设施'}</button></div>}<div className="fm-list">
    {shown.map(f=><article className={`fm-row ${selectedIds.includes(f.id)?'selected':''} ${f.visible===false?'is-hidden':''}`} key={f.id} data-manager-id={f.id}><label className="fm-check"><input type="checkbox" aria-label={`选择${f.name}`} checked={selectedIds.includes(f.id)} onChange={()=>onToggle(f.id)}/>加入选区</label><button className="fm-location" aria-label={`定位${f.name}`} onClick={()=>onLocate(f.id)}><span className="fm-icon"><FacilityIcon id={f.presetId??f.type} size={18}/></span><span><strong>{f.name}</strong><small>{getFacilityLabel(f)} · {f.width} × {f.depth} m</small></span><MapPin size={13}/></button><div className="fm-row-actions"><button aria-label={`${f.locked?'解锁':'锁定'}${f.name}`} aria-pressed={!!f.locked} onClick={()=>onPatch(f.id,{locked:!f.locked})}>{f.locked?<LockKeyhole size={13}/>:<Unlock size={13}/>}<span>{f.locked?'已锁定':'锁定'}</span></button><button aria-label={`${f.visible===false?'显示':'隐藏'}${f.name}`} aria-pressed={f.visible!==false} onClick={()=>onPatch(f.id,{visible:f.visible===false})}>{f.visible===false?<EyeOff size={13}/>:<Eye size={13}/>}<span>{f.visible===false?'已隐藏':'隐藏'}</span></button><button aria-label={`复制${f.name}`} disabled={facilities.length>=200} onClick={()=>onDuplicate(f.id)}><Copy size={13}/></button><button aria-label={`删除${f.name}`} disabled={!!f.locked} onClick={()=>onRemove(f.id)}><Trash2 size={13}/></button></div></article>)}
    {!shown.length&&<div className="fm-empty"><Search size={23}/><strong>{facilities.length?'没有匹配的设施':'还没有添加设施'}</strong><p>{facilities.length?'换个关键词，或选择全部分类。':'从底部设施库选择你需要的空间。'}</p></div>}
  </div><p className="fm-help">勾选设施后点击「编辑选区」一起操作；点击名称单独定位。隐藏仍计入面积和预算。</p></div>
}
