import { parseProject } from './model'
import type { Facility,Project } from './types'
import { planFacilityGroup } from './hotelExpansion'
export interface FacilityTemplate {id:string;name:string;createdAt:string;facilities:Facility[]}
export function duplicateFacilityTemplate(template:FacilityTemplate):FacilityTemplate {
  const copy=validateFacilityTemplate(structuredClone(template));return {...copy,id:crypto.randomUUID(),name:`${copy.name.slice(0,55)} 副本`,createdAt:new Date().toISOString()}
}
export const TEMPLATE_KEY='courtside-facility-templates-v1'
export const TEMPLATE_BACKUP_KEY='courtside-facility-templates-backup-v1'
export interface TemplateStorage {getItem(key:string):string|null;setItem(key:string,value:string):void}
const MAX_BYTES=1024*1024
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw Error('组合格式错误');return value as Record<string,unknown>}
function validName(value:unknown){if(typeof value!=='string'||!value.trim()||value.trim().length>60)throw Error('组合名称需为1至60个字符');return value.trim()}
export function templateBounds(facilities:readonly Facility[]){
  const x=Math.min(...facilities.map(f=>f.x)),y=Math.min(...facilities.map(f=>f.y))
  return {x,y,width:Math.max(...facilities.map(f=>f.x+(f.rotation===90?f.depth:f.width)))-x,depth:Math.max(...facilities.map(f=>f.y+(f.rotation===90?f.width:f.depth)))-y}
}
export function validateFacilityTemplate(raw:unknown):FacilityTemplate {
  const value=record(raw)
  if(typeof value.id!=='string'||!value.id.trim()||value.id.length>120||typeof value.createdAt!=='string')throw Error('组合标识或保存时间错误')
  if(!Array.isArray(value.facilities)||!value.facilities.length||value.facilities.length>200)throw Error('组合需要包含1至200个设施')
  const name=validName(value.name)
  const checked=parseProject(JSON.stringify({version:1,id:'template-validation',name,location:'',siteWidth:1000,siteDepth:1000,updatedAt:value.createdAt,facilities:value.facilities}))
  const bounds=templateBounds(checked.facilities)
  if(bounds.x!==0||bounds.y!==0||bounds.width>1000||bounds.depth>1000)throw Error('组合坐标或整体尺寸无效')
  if(checked.facilities.some(f=>f.x<0||f.y<0||f.x+(f.rotation===90?f.depth:f.width)>1000||f.y+(f.rotation===90?f.width:f.depth)>1000))throw Error('组合超出可用尺寸')
  const plan=planFacilityGroup({...checked,facilities:[]},checked.facilities,name,{margin:0,gap:0})
  if(!plan.success)throw Error(plan.message)
  return {id:value.id,name,createdAt:checked.updatedAt,facilities:checked.facilities}
}
export function createFacilityTemplate(project:Project,ids:readonly string[],name:string):FacilityTemplate {
  if(!ids.length||new Set(ids).size!==ids.length)throw Error('请先选择要保存的设施')
  const facilities=project.facilities.filter(f=>ids.includes(f.id))
  if(facilities.length!==ids.length)throw Error('选区已变化，请重新选择设施')
  const bounds=templateBounds(facilities)
  return validateFacilityTemplate({id:crypto.randomUUID(),name:validName(name),createdAt:new Date().toISOString(),facilities:facilities.map(f=>({...structuredClone(f),x:f.x-bounds.x,y:f.y-bounds.y}))})
}
export function parseTemplateLibrary(raw:string|null):FacilityTemplate[]{
  if(raw===null)return []
  if(new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('组合库超过1MB，请先导出整理')
  const value=record(JSON.parse(raw))
  if(value.version!==1||!Array.isArray(value.templates)||value.templates.length>20)throw Error('组合库格式错误或超过20组')
  const templates=value.templates.map(validateFacilityTemplate)
  if(new Set(templates.map(t=>t.id)).size!==templates.length)throw Error('组合标识重复')
  return templates
}
export function serializeTemplateLibrary(templates:readonly FacilityTemplate[]):string {
  const raw=JSON.stringify({version:1,templates});parseTemplateLibrary(raw);return raw
}
export function exportFacilityTemplate(template:FacilityTemplate):string{return JSON.stringify({kind:'courtside-facility-template',version:1,template:validateFacilityTemplate(template)},null,2)}
export function importFacilityTemplate(raw:string):FacilityTemplate {
  if(new TextEncoder().encode(raw).length>MAX_BYTES)throw Error('组合文件不能超过1MB')
  const value=record(JSON.parse(raw));if(value.kind!=='courtside-facility-template'||value.version!==1)throw Error('请导入自定义设施组合文件')
  return {...validateFacilityTemplate(value.template),id:crypto.randomUUID()}
}
export function writeTemplateLibrary(storage:TemplateStorage,templates:readonly FacilityTemplate[],expectedRaw:string|null):string {
  const raw=serializeTemplateLibrary(templates)
  const actual=storage.getItem(TEMPLATE_KEY)
  if(actual!==expectedRaw)throw Error('另一页面已更新组合库，请关闭后重新打开，当前数据保留')
  if(actual!==null){storage.setItem(TEMPLATE_BACKUP_KEY,actual);if(storage.getItem(TEMPLATE_BACKUP_KEY)!==actual)throw Error('旧组合库备份未成功，原数据保持')}
  storage.setItem(TEMPLATE_KEY,raw);if(storage.getItem(TEMPLATE_KEY)!==raw)throw Error('组合库保存未通过回读，请导出备份')
  return raw
}
