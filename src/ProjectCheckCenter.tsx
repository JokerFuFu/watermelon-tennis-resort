import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowUpRight, Check, ClipboardCheck, Search, X } from 'lucide-react'
import { Modal } from './ui'
import { CHECK_CATEGORIES, inspectProject, type CheckCategory, type ProjectCheck } from './projectChecks'
import type { Project } from './types'
import './project-checks.css'

interface Props {project:Project;onClose:()=>void;onAction:(check:ProjectCheck)=>void;onExportReport:()=>void}
export default function ProjectCheckCenter({project,onClose,onAction,onExportReport}:Props){
  const [category,setCategory]=useState<CheckCategory|'all'>('all')
  const [query,setQuery]=useState('')
  const [limit,setLimit]=useState(30)
  const checks=useMemo(()=>inspectProject(project),[project])
  const byId=useMemo(()=>new Map(project.facilities.map(f=>[f.id,f])),[project.facilities])
  const needle=query.trim().toLowerCase()
  const shown=checks.filter(check=>(category==='all'||check.category===category)&&`${check.title} ${check.detail} ${check.facilityIds.map(id=>byId.get(id)?.name??'').join(' ')}`.toLowerCase().includes(needle))
  if(needle){
    const rank=(check:ProjectCheck)=>{
      const primary=byId.get(check.target.facilityId??'')?.name.toLowerCase()??''
      return primary===needle?0:check.title.toLowerCase().includes(needle)?1:2
    }
    shown.sort((a,b)=>rank(a)-rank(b))
  }
  const adjust=checks.filter(c=>c.level==='adjust').length
  return createPortal(<div className="pc-modal-host"><Modal title="方案检查" onClose={onClose} wide><div className="pc-center">
    <p className="pc-intro">把布局、客房容量、预算与收益的待办放在一起，按项完善你的方案。</p>
    <div className="pc-summary"><div><ClipboardCheck size={20}/><strong>{adjust}</strong><span>项需要调整</span></div><div><strong>{checks.length-adjust}</strong><span>项待确认</span></div><button className="button secondary" onClick={onExportReport}>导出方案报告<ArrowUpRight size={14}/></button></div>
    <div className="pc-search"><Search size={16}/><input aria-label="搜索检查事项" placeholder="搜索设施或待办，例如泳池、税费" value={query} onChange={e=>{setQuery(e.target.value);setLimit(30)}}/>{query&&<button aria-label="清空检查搜索" onClick={()=>{setQuery('');setLimit(30)}}><X size={14}/></button>}</div>
    <div className="pc-filters" role="group" aria-label="检查分类"><button aria-pressed={category==='all'} onClick={()=>{setCategory('all');setLimit(30)}}>全部事项 <span>{checks.length}</span></button>{Object.entries(CHECK_CATEGORIES).map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>{setCategory(id as CheckCategory);setLimit(30)}}>{label}<span>{checks.filter(c=>c.category===id).length}</span></button>)}</div>
    <p className="pc-result-count" role="status">{shown.length} 项匹配</p>
    <div className="pc-list">{shown.slice(0,limit).map(check=>{
      const target=project.facilities.find(f=>f.id===check.target.facilityId)
      const label=check.target.page==='design'?(target?.visible===false?'显示并定位':target?'定位设施':'打开场地设计'):check.target.page==='rooms'?'调整客房':check.target.page==='earnings'?'补齐收益':check.target.facilityId?'复核报价':'补充预算'
      return <article key={check.id} className={`pc-item pc-${check.level}`} data-check-id={check.id} data-check-category={check.category} data-check-facility-id={check.target.facilityId??''}><div><span className="pc-item-tag">{CHECK_CATEGORIES[check.category]} · {check.level==='adjust'?'需调整':'待确认'}</span><h3>{check.title}</h3><p>{check.detail}</p>{target?.locked&&<small>该设施已锁定，需要修改时可先解锁。</small>}</div><button className="pc-action" onClick={()=>onAction(check)}>{label}<ArrowUpRight size={14}/></button></article>
    })}</div>
    {!shown.length&&<div className="pc-empty"><Check size={26}/><strong>{checks.length?'没有匹配的检查事项':'当前检查范围内没有提醒'}</strong><p>{checks.length?'换个关键词或查看全部分类。':'可继续核对实际场地条件和供应商报价。'}</p>{checks.length>0&&<button className="button secondary" onClick={()=>{setQuery('');setCategory('all');setLimit(30)}}>查看全部事项</button>}</div>}
    {shown.length>limit&&<button className="button secondary pc-more" onClick={()=>setLimit(n=>n+30)}>再显示 30 项</button>}
    <p className="pc-method">检查依据当前矩形布局、示例房型面积和已填价格；没有提醒不代表施工、规范或投资审批已通过。查看与导出不会修改方案，点击“显示并定位”会恢复对应设施的显示。</p>
    <div className="dialog-footer"><span>{project.name}</span><button className="button secondary" onClick={onClose}>返回设计</button></div>
  </div></Modal></div>,document.body)
}
