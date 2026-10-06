import { useCallback, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Plus, Search, X } from 'lucide-react'
import { FACILITY_CATEGORIES, FACILITY_PRESETS, FACILITY_PRESET_BY_ID, type FacilityCategory } from './facilityCatalog'
import { FacilityIcon } from './FacilityIcons'
import type { FacilityPresetId } from './types'
import { Modal } from './ui'
import './facility-library.css'

const QUICK_PRESETS:FacilityPresetId[]=['hotel','court','pool','restaurant','landscape','parking']
const LEISURE_PRESETS:FacilityPresetId[]=['card-room','mahjong-room','billiards-room','board-game-room','reading-lounge','tea-lounge']
const CATEGORIES=Object.entries(FACILITY_CATEGORIES) as [FacilityCategory,{label:string;description:string}][]

export default function FacilityLibrary({onAdd,disabled,onOpenMaterials,onOpenZones,onOpenTemplates}:{onOpenTemplates:()=>void;onOpenZones:()=>void;onAdd:(id:FacilityPresetId)=>void;disabled:boolean;onOpenMaterials:()=>void}) {
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')
  const [category,setCategory]=useState<FacilityCategory|'all'|'leisure'>('all')
  const close=useCallback(()=>setOpen(false),[])
  const filtered=useMemo(()=>{
    const term=query.trim().toLocaleLowerCase()
    return FACILITY_PRESETS.filter(preset=>(category==='all'||(category==='leisure'?LEISURE_PRESETS.includes(preset.id):preset.category===category))&&(!term||`${preset.id} ${preset.label} ${preset.description} ${FACILITY_CATEGORIES[preset.category].label}`.toLocaleLowerCase().includes(term)))
  },[query,category])

  function showLibrary(initialCategory:FacilityCategory|'all'|'leisure'='all') {
    setQuery('')
    setCategory(initialCategory)
    setOpen(true)
  }
  function add(id:FacilityPresetId) {
    if(disabled)return
    onAdd(id)
    setOpen(false)
  }

  return <>
    <div className="facility-palette fl-palette">
      <div className="palette-title fl-palette-title">
        <div className="fl-title-text"><h3>添加设施</h3><span className="fl-total">{FACILITY_PRESETS.length} 种空间</span></div>
        <div className="fl-title-actions"><button className="facility-library-morebutton" aria-label="我的组合" onClick={onOpenTemplates}>我的组合<Plus size={13}/></button><button className="facility-library-morebutton fl-zone-button" aria-label="功能区组合" onClick={onOpenZones}>功能区组合<Plus size={13}/></button><button className="facility-library-morebutton fl-material-button" aria-label="建材区" onClick={onOpenMaterials}>建材区<Plus size={13}/></button><button className="facility-library-morebutton fl-leisure-button" onClick={()=>showLibrary('leisure')} aria-label="棋牌休闲"><span>棋牌休闲</span><Plus size={13}/></button><button className="facility-library-morebutton fl-fun-button" onClick={()=>showLibrary('fun')} aria-label="游玩设施"><span>游玩设施</span><Plus size={13}/></button><button className="facility-library-morebutton" onClick={()=>showLibrary()} aria-label="更多设施"><span>更多设施</span><ArrowUpRight size={14}/></button></div>
      </div>
      <div className="palette-items">{QUICK_PRESETS.map(id=>{
        const preset=FACILITY_PRESET_BY_ID[id]
        return <button className={`palette-item palette-${preset.type}`} key={id} disabled={disabled} onClick={()=>add(id)} aria-label={`添加${preset.label}`}><span className="facility-mini"><FacilityIcon id={id} size={26}/></span><span>{preset.label}</span><Plus size={12}/></button>
      })}</div>
      {disabled&&<p className="fl-limit-note" role="status">当前方案已达到 200 个设施，请删除部分设施后再添加。</p>}
    </div>
    {open&&createPortal(<div className="fl-modal-host"><Modal title={`设施库 · ${FACILITY_PRESETS.length} 种可添加空间`} onClose={close} wide>
      <div className="fl-library">
        <p className="fl-intro">选择需要的空间，添加后可调整位置、尺寸和配置。</p>
        <div className="fl-search"><Search size={18}/><input aria-label="搜索设施" placeholder="搜索设施，例如麻将、棋牌、健身房" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="清空搜索" onClick={()=>setQuery('')}><X size={16}/></button>}</div>
        <div className="fl-categories" role="group" aria-label="设施分类"><button aria-pressed={category==='all'} onClick={()=>setCategory('all')}>全部</button><button aria-label="棋牌休闲分类" aria-pressed={category==='leisure'} onClick={()=>setCategory('leisure')}>棋牌休闲</button>{CATEGORIES.map(([id,entry])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id)}>{entry.label}</button>)}</div>
        <div className="fl-results-heading"><span role="status" aria-live="polite">{filtered.length} 种可选设施</span><span>尺寸为初始值，可修改</span></div>
        {disabled&&<p className="fl-cap-warning" role="status">当前方案已达到 200 个设施，请删除部分设施后再添加。</p>}
        <div className="fl-results-scroll">
          {filtered.length>0?<div className="fl-cards">{filtered.map(preset=><article className="fl-card" data-library-preset={preset.id} key={preset.id}>
            <div className="fl-card-heading"><span className="fl-card-icon" style={{backgroundColor:`${preset.color}33`}}><FacilityIcon id={preset.id} size={25}/></span><span className="fl-card-category">{FACILITY_CATEGORIES[preset.category].label}</span></div>
            <h3>{preset.label}</h3><p className="fl-card-description">{preset.description}</p>
            <div className="fl-card-specs"><span>{preset.width} × {preset.depth} m</span>{preset.type==='hotel'||preset.type==='restaurant'?<span>{preset.floors} 层</span>:null}{preset.rooms>0&&<span>{preset.rooms} 间客房</span>}</div>
            <button className="fl-add-button" disabled={disabled} aria-label={`添加${preset.label}`} onClick={()=>add(preset.id)}><Plus size={15}/><span>添加到方案</span></button>
          </article>)}</div>:<div className="fl-empty"><Search size={26}/><strong>没有找到匹配的设施</strong><p>试试其他关键词，或查看全部分类。</p><button onClick={()=>{setQuery('');setCategory('all')}}>清空筛选，查看全部</button></div>}
        </div>
      </div>
    </Modal></div>,document.body)}
  </>
}
