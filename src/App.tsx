import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, BadgeCheck, Building2, Check, CheckCheck, ChevronDown, ChevronRight, CircleHelp, Copy, Download, Expand, FolderOpen, Grid2X2, Hand, Hotel, Layers, Leaf, MapPin, Maximize2, Menu, MousePointer2, PanelLeftClose, ParkingCircle, Plus, Redo2, RotateCw, Ruler, Save, Settings2, ShieldCheck, LockKeyhole, Unlock, Magnet, SlidersHorizontal, Square, Trees, Undo2, Utensils, Wallet, Waves, X, Gamepad2, type LucideIcon } from 'lucide-react'
import SiteCanvas, {MIN_CANVAS_ZOOM,MAX_CANVAS_ZOOM} from './SiteCanvas'
import RoomPlanning from './RoomPlanning'
import CompareProjects from './CompareProjects'
import CostEstimatePage from './CostEstimatePage'
const EarningsPage=lazy(()=>import('./EarningsPage'))
const ArcadeRouter=lazy(()=>import('./arcade/ArcadeRouter'))
import { validateEarningsSettings } from './earnings'
import { validateOperatingSettings } from './operating'
import FinancialOverview from './FinancialOverview'
import { readWorkspacePage, workspacePageURL, type WorkspacePage } from './navigation'
import { buildEarningsCSV } from './earningsExport'
import { buildMonthlyPlanCSV } from './monthlyPlanExport'
import { validateMonthlyPlanSettings } from './monthlyPlan'
import ProjectCheckCenter from './ProjectCheckCenter'
import type { ProjectCheck } from './projectChecks'
import AreaSummary from './AreaSummary'
import { formatArea, facilitySiteArea } from './area'
import { buildAreaCSV } from './areaExport'
import { buildMaterialCSV } from './materialExport'
import { buildBudgetCSV } from './budgetExport'
import DesktopHeader from './DesktopHeader'
import WatermelonMark from './WatermelonMark'
import FacilityLibrary from './FacilityLibrary'
const MaterialWorkbench=lazy(()=>import('./MaterialWorkbench'))
import FacilityManager from './FacilityManager'
import FacilityBatchPanel from './FacilityBatchPanel'
import FacilityTemplateLibrary from './FacilityTemplateLibrary'
import LayoutMeasurements from './MeasurementDialog'
import {buildMeasurementsCSV} from './layoutMeasurements'
import HotelExpansionDialog from './HotelExpansionDialog'
import VersionUpdates from './VersionUpdates'
import type { ExpansionPlan } from './hotelExpansion'
import { alignFacilitySelection, moveFacilitySelection, type FacilityAlignment } from './facilitySelection'
import LayoutPreview from './LayoutPreview'
import SaveProjectCopy from './SaveProjectCopy'
import {FacilityIcon} from './FacilityIcons'
import {FACILITY_GROUP_LABELS,FACILITY_PRESET_BY_ID,getFacilityLabel,getFacilityPreset} from './facilityCatalog'
import { FACILITY_META, calculateMetrics, createFacility, createPresetFacility, createProject, facilityCost, formatNumber, getLayoutWarnings, parseProject, getRoomMix, resizeRoomMix } from './model'
import { useProject } from './useProject'
import { Modal, NumberField, Stepper, FacilityNameField } from './ui'
import type { CourtSurface, Facility, FacilityPresetId, FacilityType, Project } from './types'

type Page = WorkspacePage
type Dialog = 'create'|'settings'|'templates'|'help'|'compare'|'arrange'|'save-copy'|'checks'|'materials'|'zones'|'array'|'updates'|'measurements'|'my-templates'|null
const ICONS: Record<FacilityType,LucideIcon> = {hotel:Building2,court:Grid2X2,pool:Waves,restaurant:Utensils,landscape:Trees,parking:ParkingCircle}
const NAV: {id:Page;label:string;icon:LucideIcon}[] = [{id:'overview',label:'方案总览',icon:Layers},{id:'design',label:'场地设计',icon:Grid2X2},{id:'rooms',label:'客房规划',icon:Hotel},{id:'budget',label:'投资估算',icon:Wallet},{id:'earnings',label:'收益与回本',icon:Wallet},{id:'play',label:'顾客游玩',icon:Gamepad2}]
const TYPES:FacilityType[]=['hotel','court','pool','restaurant','landscape','parking']

function downloadFile(content:string,type:string,filename:string) {
  const url=URL.createObjectURL(new Blob([content],{type}))
  const a=document.createElement('a');a.href=url;a.download=filename;a.click()
  window.setTimeout(()=>URL.revokeObjectURL(url),1000)
}

function App() {
  const desktopWeb=window.location.pathname.replace(/\/$/,'')==='/web'||new URLSearchParams(window.location.search).get('view')==='web'
  const state=useProject()
  const {project,change,undo,redo,canUndo,canRedo}=state
  const [page,setPageState]=useState<Page>(()=>readWorkspacePage(window.location.search))
  const [facilitySelection,setFacilitySelection]=useState<string[]>(()=>project.facilities[0]?[project.facilities[0].id]:[])
  const selectedIds=useMemo(()=>facilitySelection.filter(id=>project.facilities.some(f=>f.id===id)),[facilitySelection,project.facilities])
  const selectedId=selectedIds.at(-1)??null
  const setSelectedId=useCallback((id:string|null)=>setFacilitySelection(id?[id]:[]),[])
  const [mode,setMode]=useState<'3d'|'2d'>('3d')
  const [zoom,setZoom]=useState(1)
  const [tool,setTool]=useState<'select'|'move'>('select')
  const [showLabels,setShowLabels]=useState(true)
  const [showGrid,setShowGrid]=useState(false)
  const [showMeasurements,setShowMeasurements]=useState(false)
  const [dialog,setDialog]=useState<Dialog>(null)
  const closeDialog=useCallback(()=>setDialog(null),[])
  const [toast,setToast]=useState<string|null>(null)
  const [exportMenu,setExportMenu]=useState(false)
  const [projectMenu,setProjectMenu]=useState(false)
  const [mobileNav,setMobileNav]=useState(false)
  const [sidebarCollapsed,setSidebarCollapsed]=useState(false)
  const [panelTab,setPanelTab]=useState<'facility'|'site'|'manage'>('facility')
  const [expanded,setExpanded]=useState(()=>{try{return localStorage.getItem('courtside-workbench-fullscreen')!=='false'}catch{return true}})
  const [nativeFullscreen,setNativeFullscreen]=useState(false)
  const [positionOpen,setPositionOpen]=useState(false)
  const [resetToken,setResetToken]=useState(0)
  const [focusId,setFocusId]=useState<string|null>(null)
  const [focusToken,setFocusToken]=useState(0)
  const [focusSelectionIds,setFocusSelectionIds]=useState<string[]>([])
  const [focusSelectionToken,setFocusSelectionToken]=useState(0)
  const [snapToGrid,setSnapToGrid]=useState(false)
  const [materialSelection,setMaterialSelection]=useState<string[]>([])
  const [roomFocusId,setRoomFocusId]=useState<string|null>(null)
  const [roomFocusToken,setRoomFocusToken]=useState(0)
  const [costEditId,setCostEditId]=useState<string|null>(null)
  const [costEditToken,setCostEditToken]=useState(0)
  const [operatingFocusToken,setOperatingFocusToken]=useState(0)
  function editFacilityPrice(id:string){setCostEditId(id);setCostEditToken(n=>n+1);navigatePage('budget')}
  const importRef=useRef<HTMLInputElement>(null)
  const selected=project.facilities.find(f=>f.id===selectedId)??null
  const metrics=useMemo(()=>calculateMetrics(project),[project])
  const selectedArea=selected?facilitySiteArea(selected,project):null
  const warnings=useMemo(()=>getLayoutWarnings(project),[project])
  const notify=useCallback((message:string)=>setToast(message),[])
  useEffect(()=>{document.title=`${project.name} · 网球酒店设计工作台`},[project.name])
  useEffect(()=>{if(desktopWeb)return;try{localStorage.setItem('courtside-workbench-fullscreen',String(expanded))}catch{/* Current layout still works when storage is unavailable. */}},[expanded,desktopWeb])
  useEffect(()=>{const update=()=>setNativeFullscreen(!!document.fullscreenElement);document.addEventListener('fullscreenchange',update);return()=>document.removeEventListener('fullscreenchange',update)},[])
  async function toggleScreenFullscreen(){try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();else notify('工作台已铺满窗口；当前浏览器不支持屏幕全屏。')}catch{notify('工作台已铺满窗口；可使用浏览器菜单进入屏幕全屏。')}}
  useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(null),3800);return()=>clearTimeout(t)},[toast])
  useEffect(()=>{setSelectedId(project.facilities.find(f=>f.visible!==false)?.id??null);setZoom(1);setFocusId(null);setFocusToken(0);setFocusSelectionIds([]);setFocusSelectionToken(0);setResetToken(n=>n+1)},[project.id])
  useEffect(()=>{
    function outside(e:MouseEvent){if(!(e.target as HTMLElement).closest('.dropdown-wrap')){setExportMenu(false);setProjectMenu(false)}}
    document.addEventListener('click',outside);return()=>document.removeEventListener('click',outside)
  },[])
  const updateFacility=useCallback((id:string,patch:Partial<Facility>)=>change(p=>({...p,facilities:p.facilities.map(f=>{
    if(f.id!==id)return f
    if(f.locked&&Object.keys(patch).some(key=>key!=='locked'&&key!=='visible'))return f
    const next={...f,...patch,...(f.type==='hotel'&&patch.rooms!==undefined&&!patch.roomMix?{roomMix:resizeRoomMix(getRoomMix(f),patch.rooms)}:{})}
    if(f.type==='court'&&patch.surface&&f.presetId){
      const nextId:FacilityPresetId=patch.surface==='hard'?'hard-court':patch.surface==='grass'?'grass-court':'court'
      next.presetId=nextId
      const prefix=getFacilityLabel(f)+' '
      if(f.name.startsWith(prefix)&&/^\d+$/.test(f.name.slice(prefix.length)))next.name=FACILITY_PRESET_BY_ID[nextId].label+' '+f.name.slice(prefix.length)
    }
    return next
  })})),[change])
  function commitActiveField(){
    const active=document.activeElement
    if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement)active.blur()
  }
  function openWithCommittedInputs(next:Project){commitActiveField();return state.open(next)}
  function selectFacility(id:string|null,additive=false){
    commitActiveField()
    if(!id){setSelectedId(null);return}
    setFacilitySelection(current=>additive?(current.includes(id)?current.filter(x=>x!==id):[...current,id]):[id])
  }
  function invertMatchingFacilities(ids:readonly string[]){commitActiveField();setFacilitySelection(current=>[...current.filter(id=>!ids.includes(id)),...ids.filter(id=>!current.includes(id))])}
  function setMatchingVisibility(ids:readonly string[],visible:boolean){commitActiveField();change(p=>({...p,facilities:p.facilities.map(f=>ids.includes(f.id)?{...f,visible}:f)}));notify(`${visible?'已显示':'已隐藏'}匹配设施，可一次撤销；面积与预算保持计入`)}
  function selectMatchingFacilities(ids:readonly string[]){commitActiveField();setFacilitySelection(current=>[...new Set([...current,...ids])])}
  function moveSelection(ids:readonly string[],dx:number,dy:number){
    commitActiveField()
    const result=moveFacilitySelection(state.getCurrentProject(),ids,dx,dy)
    if(!result.ok){notify(result.error);return}
    if(result.changed)change(p=>({...p,facilities:result.facilities}))
  }
  function alignSelection(action:FacilityAlignment){
    commitActiveField()
    const result=alignFacilitySelection(state.getCurrentProject(),selectedIds,action)
    if(!result.ok){notify(result.error);return}
    if(result.changed){change(p=>({...p,facilities:result.facilities}));notify('选区已排列，可撤销本次修改')}
    else notify('选区已处于目标位置')
  }
  function patchSelection(patch:{locked?:boolean;visible?:boolean}){
    commitActiveField()
    const ids=new Set(selectedIds)
    change(p=>({...p,facilities:p.facilities.map(f=>ids.has(f.id)?{...f,...patch}:f)}))
    if(patch.visible===false)setFocusId(null)
  }
  function focusSelection(ids:readonly string[]=selectedIds){
    commitActiveField()
    const visible=state.getCurrentProject().facilities.filter(f=>ids.includes(f.id)&&f.visible!==false).map(f=>f.id)
    if(!visible.length){notify('请先选择可见设施，再查看选区');return}
    setFocusId(null);setFocusSelectionIds(visible);setFocusSelectionToken(n=>n+1)
    if(!desktopWeb)document.getElementById('site-plan-svg')?.scrollIntoView({block:'center',behavior:'smooth'})
  }
  function openExpansion(mode:'zones'|'array'){
    commitActiveField()
    if(mode==='array'&&!selectedIds.length){notify('请先选择要复制的设施');return}
    setDialog(mode)
  }
  function applyExpansion(plan:Extract<ExpansionPlan,{success:true}>,source:Project){
    commitActiveField()
    const current=state.getCurrentProject()
    if(JSON.stringify(current)!==JSON.stringify(source)){notify('方案已发生变化，请查看最新预览后再加入');return}
    if(!plan.additions.length||current.facilities.length+plan.additions.length>200){notify('当前方案最多配置 200 个设施，请减少新增数量');return}
    try{parseProject(JSON.stringify({...current,facilities:[...current.facilities,...plan.additions]}))}catch{notify('新增设施未通过检查，请重新生成预览');return}
    change(p=>({...p,facilities:[...p.facilities,...structuredClone(plan.additions)]}))
    const ids=plan.additions.map(f=>f.id)
    setFacilitySelection(ids);setPanelTab('facility');setDialog(null);navigatePage('design',false)
    setFocusId(null);setFocusSelectionIds(ids);setFocusSelectionToken(n=>n+1)
    notify(`已加入 ${ids.length} 个设施，可撤销恢复原方案`)
  }
  function openMaterials(ids:string[]=[]){commitActiveField();setMaterialSelection(ids);setDialog('materials')}
  const navigatePage=useCallback((next:Page,commitInputs=true)=>{
    if(commitInputs)commitActiveField()
    const url=workspacePageURL(window.location.href,next)
    if(url!==window.location.href)window.history.pushState(null,'',url)
    setPageState(next);setMobileNav(false)
  },[])
  useEffect(()=>{
    const restore=()=>{commitActiveField();setPageState(readWorkspacePage(window.location.search));setMobileNav(false)}
    window.addEventListener('popstate',restore)
    return()=>window.removeEventListener('popstate',restore)
  },[])
  function processCheck(check:ProjectCheck){
    closeDialog()
    if(check.target.page==='design'){
      if(check.target.facilityId)locateFacility(check.target.facilityId)
      else navigatePage('design')
    }else if(check.target.page==='budget'){
      if(check.target.facilityId)editFacilityPrice(check.target.facilityId)
      else navigatePage('budget')
    }else if(check.target.page==='earnings'){navigatePage('earnings')}else {setRoomFocusId(check.target.facilityId??null);setRoomFocusToken(n=>n+1);navigatePage('rooms')}
  }
  function locateFacility(id:string){
    commitActiveField()
    const facility=project.facilities.find(f=>f.id===id)
    if(!facility)return
    if(facility.visible===false)updateFacility(id,{visible:true})
    setSelectedId(id);setPanelTab('facility');setFocusId(id);setFocusToken(n=>n+1);navigatePage('design')
  }
  const removeFacilities=useCallback((ids:readonly string[])=>{
    commitActiveField()
    const selected=state.getCurrentProject().facilities.filter(f=>ids.includes(f.id))
    if(!selected.length)return
    if(selected.some(f=>f.locked)){notify('选区中有已锁定设施，请先解锁');return}
    const removed=new Set(selected.map(f=>f.id))
    change(p=>({...p,facilities:p.facilities.filter(f=>!removed.has(f.id)),...(p.monthlyPlan?{monthlyPlan:{...p.monthlyPlan,facilityItems:p.monthlyPlan.facilityItems.filter(item=>!removed.has(item.facilityId))}}:{})}))
    setFacilitySelection(current=>current.filter(id=>!removed.has(id)))
    setFocusId(current=>current&&removed.has(current)?null:current)
    if(selected.length>1)notify(`已删除 ${selected.length} 个设施，可撤销恢复`)
  },[state.getCurrentProject,change,notify])
  const removeFacility=useCallback((id:string)=>removeFacilities([id]),[removeFacilities])
  const removeSelected=useCallback(()=>removeFacilities(selectedIds),[selectedIds,removeFacilities])
  useEffect(()=>{
    function keyboard(e:KeyboardEvent){
      if(page==='play')return
      const target=e.target as HTMLElement
      const saveShortcut=(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'
      if(dialog||target.closest('[role="dialog"]')){if(saveShortcut)e.preventDefault();return}
      if(saveShortcut){e.preventDefault();target.blur();notify(state.save(true)?'方案已保存到此浏览器':'保存失败，请导出方案备份');return}
      if(target.closest('input,textarea,select,[contenteditable="true"]'))return
      if(page==='design'&&(e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='a'){e.preventDefault();setFacilitySelection(state.getCurrentProject().facilities.filter(f=>f.visible!==false).map(f=>f.id));setPanelTab('facility');return}
      if(page==='design'&&(e.metaKey||e.ctrlKey)&&!e.altKey&&e.key.toLowerCase()==='d'){e.preventDefault();duplicateFacilities(selectedIds);return}
      if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'){e.preventDefault();e.shiftKey?redo():undo()}
      if(page==='design' && (e.key==='Delete'||e.key==='Backspace') && selectedId){e.preventDefault();removeSelected()}
      if(e.key==='Escape'){setExpanded(false);setExportMenu(false)}
      if(page==='design' && e.key.toLowerCase()==='v')setTool('select')
      if(page==='design' && e.key.toLowerCase()==='h')setTool('move')
    }
    window.addEventListener('keydown',keyboard);return()=>window.removeEventListener('keydown',keyboard)
  },[dialog,page,redo,undo,notify,state.save,selectedId,selectedIds,removeSelected,project])

  function addFacility(type:FacilityType) {
    if(project.facilities.length>=200){notify('每个方案最多配置 200 个设施');return}
    const facility=createFacility(type,project)
    change(p=>({...p,facilities:[...p.facilities,facility]}));setSelectedId(facility.id);setPanelTab('facility');navigatePage('design');setFocusId(facility.id);setFocusToken(n=>n+1);notify(`已添加${FACILITY_META[type].label}，可拖动调整位置`)
  }
  function addPresetFacility(id:FacilityPresetId){
    if(project.facilities.length>=200){notify('每个方案最多配置 200 个设施');return}
    const facility=createPresetFacility(id,project)
    change(p=>({...p,facilities:[...p.facilities,facility]}))
    setSelectedId(facility.id);setPanelTab('facility');navigatePage('design');setFocusId(facility.id);setFocusToken(n=>n+1)
    notify(`已添加${getFacilityLabel(facility)}，可拖动或输入参数调整`)
  }
  function duplicateFacilities(ids:readonly string[]){
    commitActiveField()
    const current=state.getCurrentProject()
    const originals=current.facilities.filter(f=>ids.includes(f.id))
    if(!originals.length)return
    if(current.facilities.length+originals.length>200){notify('复制后将超过 200 个设施，请减少选择');return}
    const copies=originals.map(f=>({...f,id:crypto.randomUUID(),name:`${f.name.slice(0,110)} 副本`,locked:false,visible:true}))
    const copyIds=copies.map(f=>f.id)
    const positioned=moveFacilitySelection({...current,facilities:copies},copyIds,5,5)
    if(!positioned.ok){notify(positioned.error);return}
    change(p=>({...p,facilities:[...p.facilities,...positioned.facilities]}))
    setFacilitySelection(copyIds);setPanelTab('facility');setFocusId(copies[0].id);setFocusToken(n=>n+1)
    notify(`已复制 ${copies.length} 个设施，可移动选区并设置副本收费`)
  }
  function duplicateFacility(id:string){duplicateFacilities([id])}
  function duplicateSelected(){duplicateFacilities(selectedIds)}
  function exportJSON(){commitActiveField();downloadFile(JSON.stringify(state.getCurrentProject(),null,2),'application/json',`${project.name}.json`);setExportMenu(false);notify('方案 JSON 已导出，可再次导入继续编辑')}
  function exportSVG(){
    commitActiveField()
    const svg=document.getElementById('site-plan-svg')
    if(!svg){notify('请先打开场地设计，再导出布局图');setExportMenu(false);return}
    const clone=svg.cloneNode(true) as SVGSVGElement
    clone.setAttribute('xmlns','http://www.w3.org/2000/svg')
    const vb=clone.viewBox.baseVal;clone.setAttribute('width','1600');clone.setAttribute('height',String(Math.round(1600*vb.height/vb.width)))
    const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=project.name;clone.prepend(title)
    downloadFile(new XMLSerializer().serializeToString(clone),'image/svg+xml',`${project.name}-${mode==='3d'?'轴测图':'平面图'}.svg`);setExportMenu(false);notify('场地布局图已导出')
  }
  function exportBudget(){
    commitActiveField()
    downloadFile(buildBudgetCSV(state.getCurrentProject()),'text/csv;charset=utf-8',`${project.name}-投资估算.csv`);setExportMenu(false);notify('分项估算表已导出，包含计价口径与待确认费用')
  }
  function openMyTemplates(){commitActiveField();setDialog('my-templates')}
  function openMeasurements(){commitActiveField();setDialog('measurements')}
  function exportMeasurements(ids:readonly string[]){commitActiveField();const current=state.getCurrentProject();downloadFile(buildMeasurementsCSV(current,ids),'text/csv;charset=utf-8',`${current.name}-布局测量.csv`);notify('测量清单已导出，与当前筛选一致')}
  function exportAreas(){
    commitActiveField()
    downloadFile(buildAreaCSV(state.getCurrentProject()),'text/csv;charset=utf-8',`${project.name}-面积明细.csv`);notify('面积明细已导出，包含界内去重总计及每个设施的面积')
  }
  function exportMaterials(){commitActiveField();downloadFile(buildMaterialCSV(state.getCurrentProject()),'text/csv;charset=utf-8',`${project.name}-建材清单.csv`);setExportMenu(false);notify('建材清单已导出')}
  function exportEarnings(){commitActiveField();downloadFile(buildEarningsCSV(state.getCurrentProject()),'text/csv;charset=utf-8',`${project.name}-收益回本测算.csv`);setExportMenu(false);notify('收益测算已导出，包含周期金额、测算参数及缺项')}
  function exportMonthly(){commitActiveField();const current=state.getCurrentProject();downloadFile(buildMonthlyPlanCSV(current),'text/csv;charset=utf-8',`${current.name}-月度经营.csv`);setExportMenu(false);notify('月度经营已导出，包含逐月收入、成本和回收预测')}
  async function exportReport(){
    commitActiveField()
    const snapshot=state.getCurrentProject()
    try{
      const {buildProjectReport}=await import('./projectReport')
      downloadFile(buildProjectReport(snapshot),'text/html;charset=utf-8',`${snapshot.name.replace(/[\\/:*?"<>|]/g,'_')}-方案报告.html`)
      setExportMenu(false);notify('方案报告已导出，可离线打开并使用浏览器打印')
    }catch(error){console.error('方案报告导出失败',error);notify('报告导出失败，当前方案保留。请重试或先导出 JSON 备份。')}
  }
  async function importJSON(e:ChangeEvent<HTMLInputElement>){
    const file=e.target.files?.[0];if(!file)return
    try {
      if(file.size>2_000_000)throw new Error('文件超过 2 MB，请使用导出的方案 JSON')
      const imported=parseProject(await file.text())
      imported.id=crypto.randomUUID()
      if(!openWithCommittedInputs(imported)){notify('当前方案未能保存，已保留。请先导出或另存为新方案');return}
      navigatePage('design',false);notify(`已导入“${imported.name}”`)
    }catch(error){notify(`导入失败：${error instanceof Error?error.message:'文件格式有误'}。当前方案已保留。`)}
    e.target.value=''
  }
  function openProject(p:Project){commitActiveField();if(!openWithCommittedInputs(p)){notify('当前方案未能保存，已保留。请先导出或另存为新方案');return false}setProjectMenu(false);navigatePage('design',false);return true}

  return <div className={`app-shell ${page==='design'&&(expanded||desktopWeb)?'canvas-expanded':''} ${sidebarCollapsed?'sidebar-collapsed':''} ${desktopWeb?'desktop-web':''}`}>
    <aside className={`sidebar ${mobileNav?'sidebar-open':''}`}>
      <a className="brand" href="#" onClick={e=>{e.preventDefault();navigatePage('design')}} aria-label="西瓜网球 首页"><WatermelonMark/><div><strong>西瓜网球</strong><small>网球酒店设计工作台</small></div></a>
      <div className="sidebar-caption">工作空间 <button className="icon-button" aria-label={sidebarCollapsed?'展开侧边栏':'收起侧边栏'} onClick={()=>{if(window.innerWidth>850)setSidebarCollapsed(!sidebarCollapsed);else setMobileNav(false)}}><PanelLeftClose size={15}/></button></div>
      <div className="dropdown-wrap project-wrap"><button className="workspace-switch" onClick={()=>setProjectMenu(!projectMenu)} aria-expanded={projectMenu}><span className="workspace-icon"><FolderOpen size={18}/></span><span><strong>我的项目</strong><small>{state.projects.length} 个设计方案</small></span><ChevronDown size={15}/></button>{projectMenu&&<div className="dropdown project-dropdown">{state.projects.map(p=><button key={p.id} onClick={()=>openProject(p)}><Building2 size={15}/><span>{p.name}</span>{p.id===project.id&&<Check size={14}/>}</button>)}<button onClick={()=>{setDialog('create');setProjectMenu(false)}}><Plus size={15}/>新建项目</button></div>}</div>
      <nav className="main-nav" aria-label="主导航">{NAV.map(n=><button key={n.id} title={n.label} className={page===n.id?'active':''} onClick={()=>navigatePage(n.id)}><n.icon size={19} strokeWidth={1.6}/><span>{n.label}</span>{page===n.id&&<span className="active-indicator"/>}</button>)}</nav>
      <div className="sidebar-rule"/>
      <div className="sidebar-caption">设计资源</div>
      <nav className="resource-nav"><button title="方案模板" onClick={()=>setDialog('templates')}><Square size={18} strokeWidth={1.6}/>方案模板<span className="small-tag">3</span></button><button title="设计指南" onClick={()=>setDialog('help')}><Ruler size={18} strokeWidth={1.6}/>设计指南<ArrowUpRight size={14}/></button></nav>
      <button className="new-project" onClick={()=>setDialog('create')}><Plus size={17}/>新建项目</button>
      <div className="sidebar-bottom"><div className="local-note"><ShieldCheck size={18}/><div><strong>你的设计，安心留存</strong><p>方案自动保存在此浏览器</p></div></div><button className="help-link" onClick={()=>setDialog('help')}><CircleHelp size={17}/>帮助与快捷键</button><div className="profile"><span className="avatar">瓜</span><div><strong>本地工作空间</strong><small>专注设计的每一刻</small></div><span className="online-dot"/></div></div>
    </aside>
    {mobileNav&&<button className="sidebar-overlay" aria-label="关闭侧栏" onClick={()=>setMobileNav(false)}/>}
    <div className="main-shell">
      {desktopWeb&&<DesktopHeader project={project} projects={state.projects} onOpenProject={openProject} onCreate={()=>setDialog('create')} page={page} saved={state.saved} nativeFullscreen={nativeFullscreen} onPageChange={navigatePage} onSettings={()=>setDialog('settings')} onCompare={()=>setDialog('compare')} onTemplates={()=>setDialog('templates')} onSaveCopy={()=>setDialog('save-copy')} onSave={()=>notify(state.save(true)?'方案已保存到此浏览器':'保存失败，请导出 JSON 保留方案')} onFullscreen={toggleScreenFullscreen} onExportJSON={exportJSON} onExportSVG={exportSVG} onExportBudget={exportBudget} onExportMaterials={exportMaterials} onExportEarnings={exportEarnings} onExportMonthly={exportMonthly} onExportReport={exportReport} onUpdates={()=>setDialog('updates')} onChecks={()=>setDialog('checks')} onImport={()=>importRef.current?.click()}/>}
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开菜单" onClick={()=>setMobileNav(true)}><Menu size={20}/></button><span>我的项目</span><ChevronRight size={13}/><strong>{project.name}</strong><span className="concept-badge">概念设计</span></div><div className="top-actions"><span className={`save-status ${state.saved?'':'pending'}`}><CheckCheck size={15}/>{state.saved?'本地已保存':'等待保存'}</span><div className="dropdown-wrap"><button className="button secondary export-button" onClick={()=>setExportMenu(!exportMenu)} aria-expanded={exportMenu}><Download size={15}/>导出方案<ChevronDown size={13}/></button>{exportMenu&&<div className="dropdown export-dropdown"><button onClick={exportJSON}><ArrowDownToLine size={16}/>方案文件 (.json)</button><button onClick={exportSVG}><Grid2X2 size={16}/>当前布局图 (.svg)</button><button onClick={exportBudget}><Wallet size={16}/>投资估算表 (.csv)</button><button onClick={exportMaterials}>建材清单 (.csv)</button><button onClick={exportEarnings}>收益回本测算 (.csv)</button><button onClick={exportMonthly}>月度经营计划 (.csv)</button><button onClick={exportReport}><Download size={16}/>方案报告 (.html)</button><button onClick={()=>{setExportMenu(false);setDialog('updates')}}><Layers size={16}/>版本更新与新功能</button><div className="dropdown-divider"/><button onClick={()=>{importRef.current?.click();setExportMenu(false)}}><ArrowUpFromLine size={16}/>导入已有方案</button></div>}</div><button className="button secondary" aria-label="另存为新方案" title="另存为新方案" onClick={()=>setDialog('save-copy')}><Copy size={15}/></button><button className="button primary" onClick={()=>notify(state.save(true)?'方案已保存到此浏览器':'保存失败，请导出 JSON 保留方案')}><Save size={15}/>保存方案</button></div></header>
      <main className="main-content">
        <section className="project-heading"><div><div className="heading-eyebrow"><span className="project-status-dot"/>正在设计 <span className="heading-divider"/> {NAV.find(n=>n.id===page)?.label}</div><h1>{project.name}<button className="icon-button" aria-label="编辑项目设置" onClick={()=>setDialog('settings')}><Settings2 size={18}/></button></h1><div className="project-meta"><span><MapPin size={14}/>{project.location}</span><span><Square size={13}/>用地 {formatArea(metrics.siteArea)} m²</span><span className="project-version">方案 {state.projects.findIndex(p=>p.id===project.id)+1 || state.projects.length+1}</span></div></div><div className="project-heading-actions"><button className="button secondary compare-open" onClick={()=>setDialog('compare')}><Copy size={14}/>方案对比</button><button className="template-button" onClick={()=>setDialog('templates')}><Layers size={16}/>从模板开始<ArrowUpRight size={14}/></button></div></section>
        {state.storageError&&<div className="storage-warning" role="alert">{state.storageError}</div>}
        {page==='design'&&<>
          <div className="studio-grid">
            <section className="studio-panel"><div className="studio-top"><div className="panel-heading">{expanded&&!desktopWeb&&<button className="icon-button" aria-label="返回项目导航" title="返回项目导航" onClick={()=>setExpanded(false)}><Menu size={17}/></button>}<span className="green-square"><Grid2X2 size={15}/></span><h2>{expanded&&!desktopWeb?project.name:'场地布局'}</h2>{expanded&&!desktopWeb&&<span className="fullscreen-location"><MapPin size={12}/>{project.location}</span>}<span className="subtle-tag">{project.facilities.length} 个设施{project.materials?.length?` · ${project.materials.length} 件建材`:null}</span></div><div className="studio-upgrade-actions"><button className="icon-button" aria-label="设施管理" title="设施管理" onClick={()=>setPanelTab('manage')}><Layers size={16}/></button><button className="icon-button" aria-label="网格吸附" title="拖动时吸附到1米网格" aria-pressed={snapToGrid} onClick={()=>setSnapToGrid(!snapToGrid)}><Magnet size={16}/></button><button className="button secondary" aria-label="自动排布" onClick={()=>setDialog('arrange')}><Grid2X2 size={14}/><span>自动排布</span></button></div><div className="view-switch" aria-label="视图"><button className={mode==='3d'?'active':''} onClick={()=>setMode('3d')}><Layers size={14}/>3D 总览</button><button className={mode==='2d'?'active':''} onClick={()=>setMode('2d')}><Grid2X2 size={14}/>2D 平面</button></div>{expanded&&!desktopWeb&&<div className="fullscreen-actions"><button className="icon-button" aria-label="另存为新方案" title="另存为新方案" onClick={()=>setDialog('save-copy')}><Copy size={15}/></button><button className="icon-button screen-fullscreen-button" aria-label={nativeFullscreen?'退出屏幕全屏':'进入屏幕全屏'} title={nativeFullscreen?'退出屏幕全屏':'进入屏幕全屏'} onClick={toggleScreenFullscreen}><Maximize2 size={16}/></button><div className="dropdown-wrap"><button className="button secondary" aria-label="导出方案" onClick={()=>setExportMenu(!exportMenu)}><Download size={14}/><span>导出</span></button>{exportMenu&&<div className="dropdown export-dropdown"><button onClick={exportJSON}><ArrowDownToLine size={16}/>方案文件 (.json)</button><button onClick={exportSVG}><Grid2X2 size={16}/>当前布局图 (.svg)</button><button onClick={exportBudget}><Wallet size={16}/>投资估算表 (.csv)</button><button onClick={exportMaterials}>建材清单 (.csv)</button><button onClick={exportEarnings}>收益回本测算 (.csv)</button><button onClick={exportMonthly}>月度经营计划 (.csv)</button><button onClick={exportReport}><Download size={16}/>方案报告 (.html)</button><button onClick={()=>{setExportMenu(false);setDialog('updates')}}><Layers size={16}/>版本更新与新功能</button><div className="dropdown-divider"/><button onClick={()=>{importRef.current?.click();setExportMenu(false)}}><ArrowUpFromLine size={16}/>导入已有方案</button></div>}</div><button className="button primary" aria-label="保存方案" onClick={()=>notify(state.save(true)?'方案已保存到此浏览器':'保存失败，请导出 JSON 保留方案')}><Save size={14}/><span>保存</span></button></div>}{!desktopWeb&&<button className="icon-button expand-button" aria-label={expanded?'退出全屏工作台':'全屏工作台'} title={expanded?'退出全屏工作台':'全屏工作台'} onClick={()=>setExpanded(!expanded)}>{expanded?<X size={17}/>:<Expand size={17}/>}</button>}</div>
              <div className="canvas-area"><div className="canvas-caption"><strong>{mode==='3d'?'酒店总平面轴测':'酒店总平面布局'}</strong><small><MapPin size={9}/>{project.location}<span/> {project.siteWidth} × {project.siteDepth} m <span/> {mode==='3d'?'概念场景':'实际占地比例'}</small><span className="watermelon-theme-tag"><WatermelonMark size={15}/>西瓜主题度假</span></div><div className="canvas-options"><button className={showLabels?'enabled':''} aria-label="显示设施名称" aria-pressed={showLabels} title="显示设施名称" onClick={()=>setShowLabels(!showLabels)}><Layers size={17}/></button><button className={showGrid?'enabled':''} aria-label="显示参考网格" aria-pressed={showGrid} title="显示参考网格" onClick={()=>setShowGrid(!showGrid)}><Grid2X2 size={17}/></button><button className={showMeasurements?'measurement-enabled':''} aria-label="测量标注" aria-pressed={showMeasurements} title="标注选中设施的尺寸与两设施净距" onClick={()=>{commitActiveField();setShowMeasurements(!showMeasurements)}}><Ruler size={17}/></button><button aria-label="测量清单" title="查看布局测量清单" onClick={openMeasurements}><SlidersHorizontal size={17}/></button></div><SiteCanvas project={project} selectedId={selectedId} selectedIds={selectedIds} onSelect={(id,additive)=>{selectFacility(id,additive);setPanelTab('facility')}} onMove={(id,x,y)=>updateFacility(id,{x,y})} onMoveSelection={moveSelection} mode={mode} zoom={zoom} showLabels={showLabels} showGrid={showGrid} showMeasurements={showMeasurements} tool={tool} onZoomChange={setZoom} resetToken={resetToken} focusId={focusId} focusToken={focusToken} focusSelectionIds={focusSelectionIds} focusSelectionToken={focusSelectionToken} snapToGrid={snapToGrid} onSelectMaterial={id=>openMaterials([id])}/><div className="compass"><span>N</span><svg viewBox="0 0 30 36" aria-hidden="true"><path d="M15 2 25 29 15 22 5 29Z" fill="#415c3e"/><path d="M15 2 15 22 5 29Z" fill="#91a18b"/></svg></div><div className="canvas-hint">{tool==='move'?'拖动画布移动视角':selectedIds.length>1?`已选 ${selectedIds.length} 项 · 拖动整体移动 · Shift 点击增减`:'点击选择设施 · Shift 多选 · 拖动调整位置'}{showMeasurements&&selectedIds.filter(id=>project.facilities.some(f=>f.id===id&&f.visible!==false)).length>8&&<span className="measurement-caption"> · 已标注前8项，完整数据见测量清单</span>}</div><div className="canvas-toolbar"><button className={tool==='select'?'active':''} title="选择工具 (V)" aria-label="选择工具" onClick={()=>setTool('select')}><MousePointer2 size={18}/></button><button className={tool==='move'?'active':''} title="移动视角 (H)" aria-label="移动视角" onClick={()=>setTool('move')}><Hand size={18}/></button><span className="toolbar-divider"/><button disabled={!canUndo} title="撤销 (⌘Z)" aria-label="撤销" onClick={undo}><Undo2 size={17}/></button><button disabled={!canRedo} title="重做 (⌘⇧Z)" aria-label="重做" onClick={redo}><Redo2 size={17}/></button></div><div className="zoom-control"><button aria-label="缩小" onClick={()=>setZoom(Math.max(MIN_CANVAS_ZOOM,zoom-.15))}>−</button><button className="zoom-value" aria-label="重置缩放" onClick={()=>setZoom(1)}>{Math.round(zoom*100)}%</button><button aria-label="放大" onClick={()=>setZoom(Math.min(MAX_CANVAS_ZOOM,zoom+.15))}>+</button><span/><button className="zoom-selection-fit" aria-label="适应选区" title="放大查看选中设施" disabled={!selectedIds.some(id=>project.facilities.some(f=>f.id===id&&f.visible!==false))} onClick={()=>focusSelection()}><MousePointer2 size={14}/></button><button aria-label="适应画布" onClick={()=>{setZoom(1);setFocusId(null);setFocusToken(0);setResetToken(n=>n+1)}}><Maximize2 size={14}/></button></div></div>
              <div className="canvas-footer"><div className="legend"><span><i style={{background:'#e1d3bd'}}/>酒店与配套</span><span><i style={{background:'#b97859'}}/>网球场</span><span><i style={{background:'#8ca778'}}/>景观绿地</span><span><i style={{background:'#81bfc8'}}/>水景</span></div><span className="scale-label">示意模型 · 非施工图</span></div>
              <FacilityLibrary onOpenTemplates={openMyTemplates} onOpenZones={()=>openExpansion('zones')} onOpenMaterials={()=>openMaterials()} onAdd={addPresetFacility} disabled={project.facilities.length>=200}/>
            </section>
            <aside className="properties-panel"><div className="property-tabs"><button className={panelTab==='facility'?'active':''} onClick={()=>setPanelTab('facility')}>设施属性</button><button className={panelTab==='site'?'active':''} onClick={()=>setPanelTab('site')}>场地信息</button><button className={panelTab==='manage'?'active':''} onClick={()=>setPanelTab('manage')}>设施列表</button><SlidersHorizontal size={15}/></div>{panelTab==='manage'?<FacilityManager facilities={project.facilities} selectedIds={selectedIds} onToggle={id=>selectFacility(id,true)} onSelectMatching={selectMatchingFacilities} onInvert={invertMatchingFacilities} onVisibility={setMatchingVisibility} onClear={()=>selectFacility(null)} onEditSelection={()=>setPanelTab('facility')} onLocate={locateFacility} onPatch={(id,patch)=>{updateFacility(id,patch);if(patch.visible===false){setFacilitySelection(current=>current.filter(x=>x!==id));setFocusId(current=>current===id?null:current)}}} onDuplicate={duplicateFacility} onRemove={removeFacility}/>:panelTab==='site'?<SiteProperties project={project} metrics={metrics} change={change} warnings={warnings} onLocate={id=>{setMode('2d');locateFacility(id)}} onExportAreas={exportAreas} onChecks={()=>setDialog('checks')}/>:selectedIds.length>1?<FacilityBatchPanel key={selectedIds.join(',')} project={project} ids={selectedIds} onMove={(dx,dy)=>moveSelection(selectedIds,dx,dy)} onAlign={alignSelection} onDuplicate={duplicateSelected} onPatch={patchSelection} onDelete={removeSelected} onClear={()=>selectFacility(null)} onArray={()=>openExpansion('array')} onFocus={()=>focusSelection()} onMeasurements={openMeasurements} onTemplates={openMyTemplates}/>:selected?<><div className="selected-heading"><span className="selected-icon"><FacilityIcon id={selected.presetId??selected.type} size={23}/></span><div><small title={getFacilityPreset(selected).description}>{getFacilityLabel(selected)}</small><h3>{selected.name}</h3></div><button className="selected-lock" aria-label={`${selected.locked?'解锁':'锁定'}${selected.name}`} aria-pressed={!!selected.locked} onClick={()=>updateFacility(selected.id,{locked:!selected.locked})}>{selected.locked?<LockKeyhole size={16}/>:<Unlock size={16}/>}</button></div><button className="ft-open-selection" aria-label="保存为我的组合" onClick={openMyTemplates}><Layers size={14}/>保存为我的组合</button><button className="selected-measurements-open" aria-label="测量选中设施" onClick={openMeasurements}><Ruler size={14}/>查看尺寸与间距</button>{selected.locked&&<p className="property-lock-note">设施已锁定。点击上方锁定图标可解除锁定并编辑。</p>}<fieldset key={selected.id} className="property-form" disabled={!!selected.locked}><FacilityNameField key={selected.id} value={selected.name} onCommit={name=>updateFacility(selected.id,{name})} onInvalid={()=>notify('设施名称不能为空，已保留原名称')}/><div className="field-section-heading">空间尺寸<span>单位：米</span></div><div className="field-row"><NumberField label="宽度" value={selected.width} min={1} max={1000} step={.01} unit="m" onChange={n=>updateFacility(selected.id,{width:n})}/><NumberField label="进深" value={selected.depth} min={1} max={1000} step={.01} unit="m" onChange={n=>updateFacility(selected.id,{depth:n})}/></div>{(selected.type==='hotel'||selected.type==='restaurant')&&<Stepper label="建筑层数" value={selected.floors} unit="层" onChange={n=>updateFacility(selected.id,{floors:n})}/>} {selected.type==='hotel'&&<NumberField integer label="客房数量" value={selected.rooms} min={0} max={1000} unit="间" onChange={n=>updateFacility(selected.id,{rooms:Math.round(n)})}/>} {selected.type==='court'&&<div className="surface-field"><span>场地面层</span><div className="surface-options">{([{id:'clay',name:'红土'},{id:'hard',name:'硬地'},{id:'grass',name:'草地'}] as {id:CourtSurface;name:string}[]).map(s=><button key={s.id} className={`${s.id} ${selected.surface===s.id?'active':''}`} onClick={()=>updateFacility(selected.id,{surface:s.id})}><span/>{s.name}{selected.surface===s.id&&<Check size={12}/>}</button>)}</div></div>}
              <div className="field-section-heading"><button className="position-toggle" aria-expanded={positionOpen} onClick={()=>setPositionOpen(!positionOpen)}>位置与方向<ChevronDown size={12} style={{transform:positionOpen?'rotate(180deg)':undefined}}/></button><button className="rotate-button" aria-label="旋转设施" onClick={()=>updateFacility(selected.id,{rotation:selected.rotation===0?90:0})}><RotateCw size={13}/>{selected.rotation}°</button></div>{positionOpen&&<div className="field-row"><NumberField label="横向位置" value={selected.x} min={-1000} max={1000} step={0.01} unit="m" onChange={n=>updateFacility(selected.id,{x:n})}/><NumberField label="纵向位置" value={selected.y} min={-1000} max={1000} step={0.01} unit="m" onChange={n=>updateFacility(selected.id,{y:n})}/></div>}<div className="property-divider"/>{!selected.pricing&&<NumberField label={`参考单价${selected.type==='court'?'（每片）':'（每平方米）'}`} value={selected.unitCost} min={0} max={10000000} step={100} unit="元" onChange={n=>updateFacility(selected.id,{unitCost:n})}/>}<button className="button secondary facility-price-edit" onClick={()=>editFacilityPrice(selected.id)}>{selected.pricing?'编辑分项或报价':'细化费用与报价'}<ArrowUpRight size={14}/></button><div className="facility-totals"><div><span>完整占地面积</span><strong>{formatArea(selected.width*selected.depth)}<small> m²</small></strong></div><div><span>界内占地面积</span><strong>{formatArea(selectedArea!.inBoundsArea)}<small> m²</small></strong></div><div><span>界外面积</span><strong>{formatArea(selectedArea!.outOfBoundsArea)}<small> m²</small></strong></div><div><span>设施估算</span><strong>¥ {formatNumber(facilityCost(selected)/10000,1)}<small> 万</small></strong></div></div></fieldset><div className="property-actions"><button className="button secondary" disabled={project.facilities.length>=200} onClick={duplicateSelected}><Copy size={14}/>复制设施</button><button className="button secondary" aria-label="阵列复制" onClick={()=>openExpansion('array')}><Grid2X2 size={14}/>阵列复制</button><button className="delete-button" disabled={!!selected.locked} onClick={removeSelected} aria-label="删除选中设施"><X size={15}/>删除</button></div></>:<div className="empty-properties"><MousePointer2 size={30} strokeWidth={1.2}/><h3>选择一个设施</h3><p>点击场地中的设施，调整它的位置、大小与配置。</p></div>}<div className="property-note"><WatermelonMark size={20}/><p>西瓜主题 · 网球与度假空间设计</p></div></aside>
          </div>
          <MetricStrip metrics={metrics}/>
          {warnings.length>0&&<button className="layout-warning" onClick={()=>{setPanelTab('site');setSelectedId(warnings[0].facilityIds[0]??null)}}><ShieldCheck size={16}/>{warnings.length} 项布局提醒：{warnings[0].message}<ChevronRight size={15}/></button>}
        </>}
        {page==='play'&&<Suspense fallback={<div className="workspace-loading" role="status">正在打开顾客游戏…</div>}><ArcadeRouter allowRuleEditing onBackToDesign={()=>navigatePage('design')}/></Suspense>}
        {page==='earnings'&&<Suspense fallback={<div role="status" className="workspace-loading">正在打开收益与回本…</div>}><EarningsPage key={project.id} project={project} onChange={earnings=>change(p=>({...p,earnings:validateEarningsSettings(earnings)}))} onChangeOperating={operating=>change(p=>({...p,operating:validateOperatingSettings(operating)}))} onOpenOperating={()=>{setOperatingFocusToken(n=>n+1);navigatePage('budget')}} onExport={exportEarnings} onChangeMonthly={monthlyPlan=>change(p=>({...p,monthlyPlan:validateMonthlyPlanSettings(monthlyPlan)}))} onExportMonthly={exportMonthly}/></Suspense>}
        {page==='overview'&&<Overview project={project} metrics={metrics} warnings={warnings} onDesign={()=>navigatePage('design')} onBudget={()=>navigatePage('budget')} onExportAreas={exportAreas} onLocate={locateFacility} onChecks={()=>setDialog('checks')} onExportReport={exportReport} onEarnings={()=>navigatePage('earnings')}/>}
        {page==='rooms'&&<RoomPlanning project={project} metrics={metrics} update={updateFacility} onAdd={()=>addFacility('hotel')} focusFacilityId={roomFocusId} focusToken={roomFocusToken}/>}
        {page==='budget'&&<CostEstimatePage project={project} update={updateFacility} updateBudget={budget=>change(p=>({...p,budget}))} updateOperating={operating=>change(p=>({...p,operating}))} updateMaterialBudget={materialBudgetIncluded=>change(p=>({...p,materialBudgetIncluded}))} onOpenMaterials={()=>openMaterials()} onExport={exportBudget} editFacilityId={costEditId} editToken={costEditToken} onEditRequestHandled={()=>setCostEditId(null)} operatingFocusToken={operatingFocusToken}/>}
        <footer className="page-footer"><span>好设计，让运动与度假相遇。</span><span>西瓜网球 设计工作台 <span className="footer-separator">/</span> 数据仅存于当前浏览器</span></footer>
      </main>
    </div>
    <input type="file" accept=".json,application/json" className="visually-hidden" ref={importRef} onChange={importJSON} aria-label="导入方案文件"/>
    {toast&&<div className="toast" role="status"><Check size={17}/>{toast}<button aria-label="关闭提示" onClick={()=>setToast(null)}><X size={14}/></button></div>}
    {dialog==='my-templates'&&<FacilityTemplateLibrary key={project.id} project={project} selectedIds={selectedIds} getCurrentProject={state.getCurrentProject} onClose={closeDialog} onApply={applyExpansion}/>}
    {dialog==='measurements'&&<LayoutMeasurements key={project.id} project={project} selectedIds={selectedIds} onClose={closeDialog} onExport={exportMeasurements} onLocate={id=>{closeDialog();locateFacility(id)}}/>}
    {dialog==='updates'&&<VersionUpdates onClose={closeDialog}/>}
    {(dialog==='zones'||dialog==='array')&&<HotelExpansionDialog key={`${project.id}-${dialog}`} project={project} mode={dialog==='zones'?'zones':'array'} selectedIds={selectedIds} onClose={closeDialog} onApply={applyExpansion}/>}
    {dialog==='materials'&&<Suspense fallback={<div role="status" className="workspace-loading">正在打开建材工作台…</div>}><MaterialWorkbench project={project} initialSelection={materialSelection} onChange={edit=>change(p=>parseProject(JSON.stringify(edit(p))))} onClose={closeDialog} onUndo={undo} onRedo={redo} canUndo={canUndo} canRedo={canRedo}/></Suspense>}
    {dialog==='checks'&&<ProjectCheckCenter project={project} onClose={closeDialog} onAction={processCheck} onExportReport={exportReport}/>}
    {dialog==='help'&&<Modal title="把想法变成场地方案" onClose={closeDialog} wide><div className="guide-content"><p className="dialog-intro">从一个布局开始，逐步完善你的网球酒店。</p><ol className="guide-steps"><li><span>1</span><div><strong>选择或添加设施</strong><p>点击模型查看参数，使用下方设施库添加酒店、网球场和配套。</p></div></li><li><span>2</span><div><strong>调整空间与配置</strong><p>直接拖动设施，或在右侧输入位置、尺寸、层数、客房和单价。按住 Shift 点击多选，或在设施列表中勾选，再打开「编辑选区」整体移动、对齐和均匀排列。</p></div></li><li><span>3</span><div><strong>保存并分享方案</strong><p>方案自动保存在此浏览器。导出 JSON 可备份或在另一浏览器继续编辑。</p></div></li></ol><p className="dialog-intro">5.0 新增「功能区组合」，先预览再整套加入。选中设施可「阵列复制」生成多行副本，「适应选区」放大查看。</p><div className="shortcut-list"><span>选择工具 <kbd>V</kbd></span><span>移动视角 <kbd>H</kbd></span><span>多选设施 <kbd>Shift + 点击</kbd></span><span>移动选区 <kbd>方向键</kbd></span><span>撤销 <kbd>⌘ / Ctrl Z</kbd></span><span>保存 <kbd>⌘ / Ctrl S</kbd></span><span>删除设施 <kbd>Delete</kbd></span></div><div className="guide-reference"><strong>场地与估算说明</strong><p>网球双打比赛区域为 23.77 × 10.97 m；模板每片球场预留约 36.58 × 18.29 m，包含缓冲区。轴测图用于概念布局，完整施工需另行专业设计。单价为可修改的示例假设，设施工程金额未计项目附加费用；投资页单列设计、监理和预备费，土地等未报价费用列为待确认，税费按所填口径计算。餐饮与用品可在运营预算中计入选定期间费用，其他未录入支出及融资另行核算。</p><a href="https://www.itftennis.com/en/about-us/organisation/tennis-glossary/" target="_blank" rel="noreferrer">查看 ITF 球场尺寸资料 <ArrowUpRight size={13}/></a></div><button className="button primary" onClick={()=>setDialog(null)}>开始设计<ChevronRight size={15}/></button></div></Modal>}
    {(dialog==='create'||dialog==='templates')&&<CreateDialog templates={dialog==='templates'} onClose={closeDialog} onCreate={(name,template)=>{const p=createProject(name,template);if(!openWithCommittedInputs(p)){notify('当前方案未能保存，已保留。请先导出或另存为新方案');return}navigatePage('design',false);setDialog(null);notify(`已创建“${p.name}”，原方案保留在“我的项目”`)}}/>}
    {dialog==='compare'&&<CompareProjects projects={state.projects} current={project} onClose={closeDialog} onOpen={p=>{if(openProject(p))setDialog(null)}} onClone={()=>{commitActiveField();const source=state.getCurrentProject();const copy={...source,id:crypto.randomUUID(),name:`${source.name.slice(0,100)} · 对照方案`,updatedAt:new Date().toISOString()};if(!openWithCommittedInputs(copy)){notify('未能保存副本，原方案已保留');return}navigatePage('design',false);setDialog(null);notify('已复制方案，可调整后打开方案对比')}}/>}
    {dialog==='arrange'&&<LayoutPreview project={project} onClose={closeDialog} onApply={next=>{change(()=>next);setDialog(null);setZoom(1);setFocusId(null);setFocusToken(0);setResetToken(n=>n+1);notify('排布已应用，可通过撤销恢复原布局')}}/>}
    {dialog==='save-copy'&&<SaveProjectCopy project={project} onClose={closeDialog} onSave={name=>{commitActiveField();const copy={...state.getCurrentProject(),id:crypto.randomUUID(),name,updatedAt:new Date().toISOString()};if(!openWithCommittedInputs(copy)){notify('未能保存副本，原方案已保留');return}setDialog(null);navigatePage('design',false);notify('副本已保存，原方案保留在项目列表中')}}/>}
    {dialog==='settings'&&<SettingsDialog project={project} onClose={closeDialog} onSave={patch=>{change(p=>({...p,...patch}));setDialog(null);notify('项目设置已更新')}}/>}
  </div>
}

function MetricStrip({metrics}:{metrics:ReturnType<typeof calculateMetrics>}){
  return <div className="metric-strip"><div className="metric-block"><span className="metric-icon"><Square size={20} strokeWidth={1.3}/></span><div><span>总建筑面积</span><strong>{formatArea(metrics.buildingArea)}<small>m²</small></strong></div><span className="metric-detail">覆盖率 {formatNumber(metrics.coverageRatio*100,2)}%</span></div><div className="metric-block"><span className="metric-icon"><Grid2X2 size={21} strokeWidth={1.3}/></span><div><span>网球场配置</span><strong>{metrics.courtCount}<small>片</small></strong></div><span className="metric-detail">运动的核心</span></div><div className="metric-block"><span className="metric-icon"><Hotel size={22} strokeWidth={1.3}/></span><div><span>规划客房</span><strong>{metrics.roomCount}<small>间</small></strong></div><span className="metric-detail">度假的归处</span></div><div className="metric-block budget-metric"><span className="metric-icon"><Wallet size={21} strokeWidth={1.3}/></span><div><span>设施工程估算</span><strong>{formatNumber(metrics.totalCost/10000,1)}<small>万元</small></strong></div><span className="metric-detail">项目附加费用见投资页</span></div></div>
}

function SiteProperties({project,metrics,change,warnings,onLocate,onExportAreas,onChecks}:{project:Project;metrics:ReturnType<typeof calculateMetrics>;change:(f:(p:Project)=>Project)=>void;warnings:ReturnType<typeof getLayoutWarnings>;onLocate:(id:string)=>void;onExportAreas:()=>void;onChecks:()=>void}){
  return <div className="site-properties"><div className="selected-heading"><span className="selected-icon"><MapPin size={23}/></span><div><small>场地条件</small><h3>用地与指标</h3></div></div><div className="property-form"><div className="field-row"><NumberField label="用地宽度" resetKey={project.id} value={project.siteWidth} min={30} max={1000} step={0.01} unit="m" onChange={n=>change(p=>({...p,siteWidth:n}))}/><NumberField label="用地进深" resetKey={project.id} value={project.siteDepth} min={30} max={1000} step={0.01} unit="m" onChange={n=>change(p=>({...p,siteDepth:n}))}/></div><div className="site-indicators"><div><span>总用地面积</span><strong>{formatArea(metrics.siteArea)} m²</strong></div><div><span>{project.materials?.length?'界内总占地（含自建物）':'界内设施占地（去重）'}</span><strong data-testid="site-occupied-area">{formatArea(metrics.occupiedArea)} m²</strong></div><div><span>未配置面积</span><strong>{formatArea(metrics.unallocatedArea)} m²</strong></div><div><span>建筑基底面积</span><strong>{formatArea(metrics.footprint)} m²</strong></div><div><span>容积率</span><strong>{formatNumber(metrics.buildingArea/metrics.siteArea,2)}</strong></div><div><span>已配置绿地</span><strong>{formatArea(metrics.landscapeArea)} m²</strong></div><div><span>已配置绿地率</span><strong>{formatNumber(metrics.landscapeRatio*100,2)}%</strong></div><div><span>界内重叠区域</span><strong>{formatArea(metrics.overlapArea)} m²</strong></div><div><span>界外占地（去重）</span><strong>{formatArea(metrics.outOfBoundsArea)} m²</strong></div></div><button className="button secondary" onClick={onExportAreas}><Download size={14}/>导出面积明细</button><div className="field-section-heading">布局检查<BadgeCheck size={15}/></div>{warnings.length?<ul className="warning-list">{warnings.slice(0,12).map(w=><li key={w.id}><p>{w.message}</p><div className="warning-facilities">{w.facilityIds.map(id=>{const f=project.facilities.find(x=>x.id===id);return f?<button key={id} onClick={()=>onLocate(id)} aria-label={`定位${f.name}`}><MapPin size={11}/>{f.name}<ChevronRight size={10}/></button>:null})}</div></li>)}</ul>:<div className="checks-clear"><Check size={17}/>设施位于用地内，未发现重叠</div>}{warnings.length>12&&<p className="warning-more">已显示前 12 项布局提醒，可在方案检查中按设施查看。</p>}<button className="button secondary" onClick={onChecks}>方案检查<ArrowUpRight size={14}/></button><p className="subtle-explanation">面积按设施与建材、自建组合的外包矩形计算，界内联合去重，界外部分单列。绿地扣除非绿地覆盖，未配置面积不自动计绿地；隐藏项仍参与计算，建材叠放不作为设施重叠。</p></div></div>
}

function Overview({project,metrics,warnings,onDesign,onBudget,onExportAreas,onLocate,onChecks,onExportReport,onEarnings}:{project:Project;metrics:ReturnType<typeof calculateMetrics>;warnings:ReturnType<typeof getLayoutWarnings>;onDesign:()=>void;onBudget:()=>void;onExportAreas:()=>void;onLocate:(id:string)=>void;onChecks:()=>void;onExportReport:()=>void;onEarnings:()=>void}){
  return <div className="overview"><div className="overview-tools"><button className="button secondary" onClick={onChecks}><ShieldCheck size={15}/>方案检查</button><button className="button secondary" onClick={onExportReport}><Download size={15}/>导出方案报告</button></div><MetricStrip metrics={metrics}/><FinancialOverview project={project} onBudget={onBudget} onEarnings={onEarnings}/><AreaSummary project={project} metrics={metrics} onExport={onExportAreas} onLocate={onLocate}/><div className="overview-grid"><section className="overview-model surface"><div className="section-heading"><h2>让理想的度假，落在场地上。</h2><button className="button secondary" onClick={onDesign}>继续设计<ArrowUpRight size={14}/></button></div><div className="overview-canvas"><SiteCanvas project={project} selectedId={null} onSelect={()=>{}} onMove={()=>{}} mode="3d" zoom={1} showLabels showGrid={false} tool="select" interactive={false}/></div></section><section className="surface overview-summary"><h2>方案构成</h2><p>每一个空间，都有自己的角色。</p>{TYPES.map(t=>{const Icon=ICONS[t];const fs=project.facilities.filter(f=>f.type===t);return <div className="summary-row" key={t}><span className={`summary-icon ${t}`}><Icon size={18}/></span><span>{FACILITY_GROUP_LABELS[t]}</span><strong>{fs.length}<small> 处</small></strong></div>})}<button className="button primary" onClick={onBudget}>查看投资明细<ArrowUpRight size={14}/></button></section></div><div className={`overview-check surface ${warnings.length?'has-warnings':''}`}><ShieldCheck size={24}/><div><strong>{warnings.length?`有 ${warnings.length} 项布局需要关注`:'场地布局检查通过'}</strong><p>{warnings.length?warnings[0].message:'所有设施位于用地范围内，矩形占地区域未发现重叠。可继续完善客房与投资配置。'}</p></div><button className="button secondary" onClick={onDesign}>查看布局</button></div></div>
}

function CreateDialog({templates,onClose,onCreate}:{templates:boolean;onClose:()=>void;onCreate:(name:string,template:'resort'|'compact'|'blank')=>void}){
  const [name,setName]=useState(templates?'西瓜网球度假酒店':'西瓜网球酒店 · 新方案')
  const [template,setTemplate]=useState<'resort'|'compact'|'blank'>('resort')
  return <Modal title={templates?'从一个好方案开始':'创建你的网球酒店'} onClose={onClose} wide><form className="create-form" onSubmit={e=>{e.preventDefault();if(name.trim())onCreate(name.trim(),template)}}><p className="dialog-intro">选择一个起点，每处空间都可以按你的想法调整。</p><label className="text-field"><span>项目名称</span><input autoFocus required maxLength={60} value={name} onChange={e=>setName(e.target.value)} placeholder="为你的酒店起个名字"/></label><div className="template-options">{([{id:'resort',name:'网球度假酒店',description:'完整酒店与六片球场，兼顾运动与休闲。',icon:Trees},{id:'compact',name:'精品网球酒店',description:'紧凑用地与双球场，适合轻量起步。',icon:Building2},{id:'blank',name:'空白场地',description:'从一块空地开始，自由定义每个空间。',icon:Square}] as const).map(t=><button type="button" key={t.id} className={`template-option ${template===t.id?'selected':''}`} aria-pressed={template===t.id} onClick={()=>setTemplate(t.id)}><span className={`template-illustration ${t.id}`}><t.icon size={38} strokeWidth={1}/>{t.id!=='blank'&&<span className="template-courts"><i/><i/></span>}</span><strong>{t.name}</strong><p>{t.description}</p><span className="template-radio">{template===t.id&&<Check size={12}/>}</span></button>)}</div><div className="dialog-footer"><span>现有方案会保留在“我的项目”中</span><button className="button primary" type="submit" disabled={!name.trim()}><Plus size={15}/>创建方案</button></div></form></Modal>
}

function SettingsDialog({project,onClose,onSave}:{project:Project;onClose:()=>void;onSave:(patch:Partial<Project>)=>void}){
  const [name,setName]=useState(project.name);const [location,setLocation]=useState(project.location);const [width,setWidth]=useState(project.siteWidth);const [depth,setDepth]=useState(project.siteDepth)
  return <Modal title="项目设置" onClose={onClose}><form className="settings-form" onSubmit={e=>{e.preventDefault();if(name.trim())onSave({name:name.trim(),location:location.trim(),siteWidth:width,siteDepth:depth})}}><label className="text-field"><span>项目名称</span><input required maxLength={60} value={name} onChange={e=>setName(e.target.value)}/></label><label className="text-field"><span>项目位置 / 说明</span><input maxLength={100} value={location} onChange={e=>setLocation(e.target.value)}/></label><div className="field-row"><NumberField label="用地宽度" value={width} min={30} max={1000} step={0.01} unit="m" onChange={setWidth}/><NumberField label="用地进深" value={depth} min={30} max={1000} step={0.01} unit="m" onChange={setDepth}/></div><p className="subtle-explanation">缩小用地后，现有设施保持位置；超出边界会在布局检查中提示。</p><div className="dialog-footer"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" type="submit">保存设置</button></div></form></Modal>
}

export default App
