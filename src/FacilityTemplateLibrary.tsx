import { useMemo,useRef,useState } from 'react'
import { Download,Layers,Plus,Save,Upload } from 'lucide-react'
import { Modal } from './ui'
import SiteCanvas from './SiteCanvas'
import { calculateMetrics,formatNumber } from './model'
import { duplicateFacilityTemplate,createFacilityTemplate,exportFacilityTemplate,importFacilityTemplate,parseTemplateLibrary,templateBounds,writeTemplateLibrary,TEMPLATE_KEY,TEMPLATE_BACKUP_KEY,type FacilityTemplate } from './facilityTemplates'
import { planFacilityGroup,type ExpansionPlan } from './hotelExpansion'
import type { Project } from './types'
import './facility-template-library.css'

function download(raw:string,name:string){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export default function FacilityTemplateLibrary({project,selectedIds,getCurrentProject,onClose,onApply}:{project:Project;selectedIds:readonly string[];getCurrentProject:()=>Project;onClose:()=>void;onApply:(plan:Extract<ExpansionPlan,{success:true}>,source:Project)=>void}){
  const [initial]=useState(()=>{let raw:string|null=null;try{raw=localStorage.getItem(TEMPLATE_KEY);return {raw,templates:parseTemplateLibrary(raw),error:''}}catch(e){return {raw,templates:[] as FacilityTemplate[],error:e instanceof Error?e.message:'组合库暂不可读'}}})
  const current=useRef({raw:initial.raw,templates:initial.templates})
  const [templates,setTemplates]=useState(initial.templates),[error,setError]=useState(initial.error),[notice,setNotice]=useState('')
  const [name,setName]=useState('我的酒店组合'),[activeId,setActiveId]=useState(initial.templates[0]?.id??''),[rename,setRename]=useState(initial.templates[0]?.name??''),[query,setQuery]=useState('')
  const [gap,setGap]=useState('4'),[margin,setMargin]=useState('6'),[view,setView]=useState<'2d'|'3d'>('2d'),[previewScope,setPreviewScope]=useState<'group'|'placement'>('group')
  const file=useRef<HTMLInputElement>(null)
  const active=templates.find(t=>t.id===activeId)
  const [protectedLibrary,setProtectedLibrary]=useState(!!initial.error)
  function persist(next:FacilityTemplate[]){try{const raw=writeTemplateLibrary(localStorage,next,current.current.raw);current.current={raw,templates:next};setTemplates(next);setProtectedLibrary(false);setError('');return true}catch(e){setError(e instanceof Error?e.message:'保存未成功');return false}}
  function restoreLast(){try{const raw=localStorage.getItem(TEMPLATE_BACKUP_KEY);if(raw===null)throw Error('没有可恢复的组合备份');const previous=parseTemplateLibrary(raw);if(persist(previous)){setActiveId(previous[0]?.id??'');setRename(previous[0]?.name??'');setNotice('上次组合库版本已恢复，修改前的数据已保留为备份')}}catch(e){setError(e instanceof Error?e.message:'备份不可读')}}
  function saveSelection(){setNotice('');try{const template=createFacilityTemplate(getCurrentProject(),selectedIds,name);if(persist([...current.current.templates,template])){setActiveId(template.id);setRename(template.name);setNotice('当前选区已保存为独立组合')}}catch(e){setError(e instanceof Error?e.message:'选区暂未保存')}}
  const valid=gap.trim()!==''&&margin.trim()!==''&&[Number(gap),Number(margin)].every(n=>Number.isFinite(n)&&n>=0&&n<=1000)
  const plan=useMemo(()=>active&&valid?planFacilityGroup(project,active.facilities,active.name,{gap:Number(gap),margin:Number(margin)}):null,[project,active,valid,gap,margin])
  const preview=useMemo(()=>{if(!active)return null;const b=templateBounds(active.facilities);return {...project,id:active.id,name:active.name,siteWidth:Math.max(30,b.width+12),siteDepth:Math.max(30,b.depth+12),facilities:active.facilities.map(f=>({...f,x:f.x+6,y:f.y+6,locked:false,visible:true})),materials:[],materialAssemblies:[]}},[project,active])
  const stats=useMemo(()=>preview?calculateMetrics(preview):null,[preview])
  const placing=previewScope==='placement'&&plan?.success
  const shown=templates.filter(t=>t.name.includes(query.trim()))
  return <Modal title="我的设施组合库" onClose={onClose} wide><div className="ft-library">
    <p className="ft-intro">把摆好的设施保存为你的常用组合，再放进其他方案。保留组内布局、房型与报价，原方案不改动。</p>
    {error&&<div className="ft-error" role="alert">{error}{protectedLibrary&&initial.raw!==null&&<><button onClick={()=>download(initial.raw!,'设施组合库原始数据.json')}>下载原始组合库</button><button onClick={()=>{try{const raw=localStorage.getItem(TEMPLATE_BACKUP_KEY);if(raw===null)throw Error('没有可恢复的组合备份');const previous=parseTemplateLibrary(raw);if(persist(previous)){setActiveId(previous[0]?.id??'');setRename(previous[0]?.name??'');setNotice('上次组合库已恢复，原损坏数据已保留为备份')}}catch(e){setError(e instanceof Error?e.message:'备份不可读')}}}>恢复上次组合备份</button></>}</div>}
    <section className="ft-save"><div><Save size={16}/><strong>保存当前选区</strong><small>已选 {selectedIds.length} 个设施 · 组合库最多20组</small></div><label>组合名称<input aria-label="保存组合名称" maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><button className="button primary" disabled={protectedLibrary||!selectedIds.length||!name.trim()||templates.length>=20} onClick={saveSelection}>保存选区为组合</button></section>
    <div className="ft-toolbar"><button className="button secondary" onClick={restoreLast}>恢复上次库修改</button><input aria-label="搜索我的组合" placeholder="搜索组合名称" value={query} onChange={e=>setQuery(e.target.value)}/><button className="button secondary" disabled={protectedLibrary||templates.length>=20} onClick={()=>file.current?.click()}><Upload size={14}/>导入组合</button><input ref={file} type="file" hidden accept=".json,application/json" aria-label="选择组合文件" onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;setNotice('');try{if(selected.size>1024*1024)throw Error('组合文件不能超过1MB');const template=importFacilityTemplate(await selected.text());if(persist([...current.current.templates,template])){setActiveId(template.id);setRename(template.name);setNotice('组合已导入，原方案保持')}}catch(e){setError(e instanceof Error?e.message:'导入失败')}}}/></div>
    <div className="ft-grid"><div className="ft-cards" aria-label="已保存的组合">{shown.map(t=><button aria-label={`预览组合${t.name}`} aria-pressed={activeId===t.id} key={t.id} onClick={()=>{setActiveId(t.id);setRename(t.name);setNotice('')}}><Layers size={17}/><strong>{t.name}</strong><small>{t.facilities.length} 个设施 · {t.facilities.reduce((n,f)=>n+(f.type==='hotel'?f.rooms:0),0)} 间客房</small></button>)}{!shown.length&&<p className="ft-empty">{templates.length?'没有匹配组合，换个关键词试试。':'还没有自己的组合。先在设施列表勾选设施，再保存当前选区。'}</p>}</div>
    <section className="ft-detail">{active&&preview&&stats?<><h3>{active.name}</h3><div className="ft-stats"><span>占地范围<strong>{formatNumber(templateBounds(active.facilities).width,2)} × {formatNumber(templateBounds(active.facilities).depth,2)} m</strong></span><span>客房<strong>{stats.roomCount} 间</strong></span><span>设施工程估算<strong>{formatNumber(stats.totalCost/10000,2)} 万元</strong></span></div>
      <div className="ft-view"><button aria-pressed={view==='2d'} onClick={()=>setView('2d')}>组合 2D</button><button aria-pressed={view==='3d'} onClick={()=>setView('3d')}>组合 3D</button><button aria-label="导出当前组合" onClick={()=>download(exportFacilityTemplate(active),`${active.name}-设施组合.json`)}><Download size={14}/>导出组合</button></div>
      <div className="ft-view"><button aria-pressed={!placing} onClick={()=>setPreviewScope('group')}>组合近景</button><button disabled={!plan?.success} aria-pressed={!!placing} onClick={()=>setPreviewScope('placement')}>放置位置</button></div>
      <div className="ft-preview"><SiteCanvas project={placing?plan.project:preview} selectedIds={placing?plan.additions.map(f=>f.id):[]} selectedId={null} onSelect={()=>{}} onMove={()=>{}} interactive={false} mode={view} zoom={1} showLabels showGrid={false} tool="select" svgId="facility-template-preview-svg"/></div>
      <div className="ft-rename"><input aria-label="重命名组合" value={rename} maxLength={60} onChange={e=>setRename(e.target.value)}/><button disabled={protectedLibrary||!rename.trim()||rename.trim()===active.name} onClick={()=>{if(persist(current.current.templates.map(t=>t.id===active.id?{...t,name:rename.trim()}:t))){setNotice('组合已重命名')}}}>保存名称</button></div>
      <button className="button secondary" aria-label="复制当前组合" disabled={protectedLibrary||templates.length>=20} onClick={()=>{try{const copy=duplicateFacilityTemplate(active);if(persist([...current.current.templates,copy])){setActiveId(copy.id);setRename(copy.name);setNotice('已建立独立组合副本，原组合保留')}}catch(e){setError(e instanceof Error?e.message:'复制失败')}}}>复制当前组合</button>
      <button className="ft-delete" aria-label="删除当前组合" disabled={protectedLibrary} onClick={()=>{const next=current.current.templates.filter(t=>t.id!==active.id);if(persist(next)){setActiveId(next[0]?.id??'');setRename(next[0]?.name??'');setNotice('组合已删除，可用恢复上次库修改撤销')}}}>删除组合</button>
      <div className="ft-parameters"><label>对外间距 / m<input type="number" aria-label="组合对外间距" min={0} max={1000} value={gap} onChange={e=>setGap(e.target.value)}/></label><label>用地退界 / m<input type="number" aria-label="组合用地退界" min={0} max={1000} value={margin} onChange={e=>setMargin(e.target.value)}/></label></div>
      <p className={plan?.success?'ft-plan':'ft-plan failed'} role="status">{!valid?'间距和退界需为0至1000米的数字。':plan?.message}</p>
      <button className="button primary ft-apply" disabled={!plan?.success} onClick={()=>{if(!plan?.success)return;try{if(localStorage.getItem(TEMPLATE_KEY)!==current.current.raw)throw Error('组合库已被另一页面更新，请重新打开核对后再放入');onApply(plan,project)}catch(e){setError(e instanceof Error?e.message:'请重新查看组合')}}}><Plus size={15}/>将组合放入当前方案</button>
      <p className="ft-note">新设施默认显示且未锁定。费用沿用组合中的原价与报价，月度收费另设。组合只含设施，建材作品继续在建材区管理。</p>
    </>:<p className="ft-empty">选择一组，查看布局和放置结果。</p>}</section></div>
    {notice&&<p className="ft-notice" role="status">{notice}</p>}<div className="dialog-footer"><span>组合库独立保存；放入新方案支持一次撤销。</span><button className="button secondary" onClick={onClose}>返回设计</button></div>
  </div></Modal>
}
