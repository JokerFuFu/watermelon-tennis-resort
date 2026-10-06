import { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, CheckCheck, ChevronDown, Copy, Download, Grid2X2, Layers, MapPin, Maximize2, Save, Settings2, Smartphone, Square, Wallet, Hotel, ShieldCheck, Gamepad2 } from 'lucide-react'
import type { Project } from './types'
import WatermelonMark from './WatermelonMark'
import { formatArea } from './area'

export type DesktopPage = import('./navigation').WorkspacePage
interface DesktopHeaderProps {
  project:Project
  projects:Project[]
  page:DesktopPage
  saved:boolean
  nativeFullscreen:boolean
  onPageChange:(page:DesktopPage)=>void
  onSettings:()=>void
  onOpenProject:(project:Project)=>void
  onCreate:()=>void
  onCompare:()=>void
  onTemplates:()=>void
  onSave:()=>void
  onSaveCopy:()=>void
  onFullscreen:()=>void
  onExportJSON:()=>void
  onExportSVG:()=>void
  onExportBudget:()=>void
  onExportMaterials:()=>void
  onExportEarnings:()=>void
  onExportMonthly:()=>void
  onExportReport:()=>void
  onChecks:()=>void
  onUpdates:()=>void
  onImport:()=>void
}
const pages=[{id:'design',label:'场地设计',icon:Grid2X2},{id:'rooms',label:'客房规划',icon:Hotel},{id:'budget',label:'投资估算',icon:Wallet},{id:'earnings',label:'收益与回本',icon:Wallet},{id:'overview',label:'方案总览',icon:Layers},{id:'play',label:'顾客游玩',icon:Gamepad2}] as const

export default function DesktopHeader(props:DesktopHeaderProps){
  const [exportOpen,setExportOpen]=useState(false)
  const [projectsOpen,setProjectsOpen]=useState(false)
  const menuRef=useRef<HTMLDivElement>(null)
  const projectMenuRef=useRef<HTMLDivElement>(null)
  useEffect(()=>{
    const dismiss=(e:MouseEvent)=>{if(!menuRef.current?.contains(e.target as Node))setExportOpen(false);if(!projectMenuRef.current?.contains(e.target as Node))setProjectsOpen(false)}
    document.addEventListener('click',dismiss)
    return()=>document.removeEventListener('click',dismiss)
  },[])
  const exported=(fn:()=>void)=>{setExportOpen(false);fn()}
  return <header className="desktop-header">
    <a className="desktop-brand" href="/web" onClick={e=>{e.preventDefault();props.onPageChange('design')}} aria-label="西瓜网球 桌面首页"><WatermelonMark size={32}/><strong>西瓜网球</strong></a>
    <div className="desktop-project" ref={projectMenuRef}><div><h1>{props.project.name}</h1><button className="icon-button" aria-label="切换项目" title="切换项目" aria-expanded={projectsOpen} onClick={()=>setProjectsOpen(!projectsOpen)}><ChevronDown size={13}/></button><button className="icon-button" aria-label="编辑项目设置" title="项目设置" onClick={props.onSettings}><Settings2 size={16}/></button></div><span><MapPin size={12}/>{props.project.location}<small><Square size={10}/>{formatArea(props.project.siteWidth*props.project.siteDepth)} m²</small></span>{projectsOpen&&<div className="dropdown desktop-project-dropdown">{props.projects.map(p=><button key={p.id} onClick={()=>{props.onOpenProject(p);setProjectsOpen(false)}}><Layers size={14}/><span>{p.name}</span>{p.id===props.project.id&&<CheckCheck size={13}/>}</button>)}<div className="dropdown-divider"/><button onClick={()=>{setProjectsOpen(false);props.onCreate()}}>新建项目</button></div>}</div>
    <nav className="desktop-nav" aria-label="桌面主导航">{pages.map(p=><button className={props.page===p.id?'active':''} key={p.id} onClick={()=>props.onPageChange(p.id)}><p.icon size={17} strokeWidth={1.6}/><span>{p.label}</span></button>)}</nav>
    <div className="desktop-header-actions"><button className="desktop-edition-tag" aria-label="版本更新" title="查看版本更新" onClick={props.onUpdates}>6.3.1</button><button className="icon-button" aria-label="方案对比" title="方案对比" onClick={props.onCompare}><Copy size={17}/></button><button className="icon-button" aria-label="方案模板" title="方案模板与新建项目" onClick={props.onTemplates}><Layers size={17}/></button><a className="desktop-mobile-link" href="/mobile" title="打开手机版" aria-label="打开手机版"><Smartphone size={17}/></a><span className="desktop-action-rule"/><span className="desktop-save-status" title={props.saved?'方案已保存到本浏览器':'等待保存'}><CheckCheck size={15}/></span><div className="dropdown-wrap" ref={menuRef}><button className="button secondary" aria-label="导出方案" aria-expanded={exportOpen} onClick={()=>setExportOpen(!exportOpen)}><Download size={14}/><span>导出</span><ChevronDown size={11}/></button>{exportOpen&&<div className="dropdown export-dropdown"><button onClick={()=>exported(props.onExportJSON)}><ArrowDownToLine size={16}/>方案文件 (.json)</button><button disabled={props.page!=='design'} title={props.page==='design'?'导出当前布局图':'在场地设计页导出布局图'} onClick={()=>exported(props.onExportSVG)}><Grid2X2 size={16}/>当前布局图 (.svg)</button><button onClick={()=>exported(props.onExportBudget)}><Wallet size={16}/>投资估算表 (.csv)</button><button onClick={()=>exported(props.onExportMaterials)}>建材清单 (.csv)</button><button onClick={()=>exported(props.onExportEarnings)}>收益回本测算 (.csv)</button><button onClick={()=>exported(props.onExportMonthly)}>月度经营计划 (.csv)</button><button onClick={()=>exported(props.onExportReport)}><Download size={16}/>方案报告 (.html)</button><div className="dropdown-divider"/><button onClick={()=>exported(props.onUpdates)}><Layers size={16}/>版本更新与新功能</button><button onClick={()=>exported(props.onImport)}><ArrowUpFromLine size={16}/>导入已有方案</button><button onClick={()=>exported(props.onChecks)}><ShieldCheck size={16}/>打开方案检查</button></div>}</div><button className="icon-button copy-save-button" aria-label="另存为新方案" title="另存为新方案" onClick={props.onSaveCopy}><Copy size={16}/></button><button className="button primary" aria-label="保存方案" onClick={props.onSave}><Save size={14}/><span>保存</span></button><button className="icon-button" aria-label={props.nativeFullscreen?'退出屏幕全屏':'进入屏幕全屏'} title={props.nativeFullscreen?'退出屏幕全屏':'进入屏幕全屏'} onClick={props.onFullscreen}><Maximize2 size={17}/></button></div>
  </header>
}
