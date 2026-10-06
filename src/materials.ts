import { MATERIAL_PRESET_BY_ID } from './materialCatalog'
import type { MaterialAssembly, MaterialPiece, MaterialPresetId, MaterialPurchaseEstimate, PriceEvidence, Project } from './types'

export function materialBounds(piece: MaterialPiece) {
  return { x:piece.x,y:piece.y,z:piece.z,width:piece.rotation===90?piece.depth:piece.width,depth:piece.rotation===90?piece.width:piece.depth,height:piece.height }
}
export function materialSelectionBounds(pieces:MaterialPiece[]) {
  if (!pieces.length) return {x:0,y:0,z:0,width:0,depth:0,height:0}
  const bounds=pieces.map(materialBounds),x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y)),z=Math.min(...bounds.map(b=>b.z))
  return {x,y,z,width:Math.max(...bounds.map(b=>b.x+b.width))-x,depth:Math.max(...bounds.map(b=>b.y+b.depth))-y,height:Math.max(...bounds.map(b=>b.z+b.height))-z}
}
export function materialObstacles(project:Project) {
  const pieces=project.materials??[], grouped=new Set((project.materialAssemblies??[]).flatMap(g=>g.pieceIds))
  return [...pieces.filter(p=>!grouped.has(p.id)).map(materialBounds),...(project.materialAssemblies??[]).map(g=>materialSelectionBounds(pieces.filter(p=>g.pieceIds.includes(p.id))))]
}
function intersects(a:{x:number;y:number;width:number;depth:number},b:{x:number;y:number;width:number;depth:number}) {return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.depth&&a.y+a.depth>b.y}
export function createMaterialPiece(materialId:MaterialPresetId,project:Project):MaterialPiece {
  if ((project.materials?.length??0)>=500) throw new Error('最多支持 500 件建材')
  if (!Object.hasOwn(MATERIAL_PRESET_BY_ID,materialId)) throw new Error('未知建材')
  const preset=MATERIAL_PRESET_BY_ID[materialId]
  const piece:MaterialPiece={id:crypto.randomUUID(),materialId,name:preset.name,x:Math.max(0,(project.siteWidth-preset.width)/2),y:Math.max(0,(project.siteDepth-preset.depth)/2),z:0,width:preset.width,depth:preset.depth,height:preset.height,rotation:0,color:preset.color,unitPrice:null,priceBasis:preset.priceBasis,taxMode:'unknown',evidence:{kind:'assumption',name:'待填写采购来源',scope:'采购价格与规格尚未核实'}}
  const obstacles=[...materialObstacles(project),...project.facilities.map(f=>({x:f.x,y:f.y,width:f.rotation===90?f.depth:f.width,depth:f.rotation===90?f.width:f.depth}))]
  // Candidate coordinates follow obstacle edges and the site centre, independent of tiny brick sizes.
  const xs=[piece.x,0,...obstacles.map(b=>b.x+b.width+.05)],ys=[piece.y,0,...obstacles.map(b=>b.y+b.depth+.05)]
  for(const y of ys)for(const x of xs)if(x>=0&&y>=0&&x+piece.width<=project.siteWidth&&y+piece.depth<=project.siteDepth&&!obstacles.some(b=>intersects({...piece,x,y},b)))return {...piece,x,y}
  return piece // Keep dimensions when no vacancy exists; the editor can reposition it.
}
function selection(project:Project,ids:string[]) {
  const requested=new Set(ids),pieces=project.materials??[]
  if(!requested.size||[...requested].some(id=>!pieces.some(p=>p.id===id)))throw new Error('请选择有效建材')
  for(const group of project.materialAssemblies??[])if(group.pieceIds.some(id=>requested.has(id)))group.pieceIds.forEach(id=>requested.add(id))
  return pieces.filter(p=>requested.has(p.id))
}
function unlocked(pieces:MaterialPiece[]) {if(pieces.some(p=>p.locked))throw new Error('组合或选中建材含锁定零件，请先解锁')}
function checked(project:Project):Project {validateMaterials(project.materials??[]);validateAssemblies(project.materialAssemblies??[],project.materials??[]);return project}
export function moveMaterialSelection(project:Project,ids:string[],dx:number,dy:number,dz=0):Project {
  const chosen=selection(project,ids);unlocked(chosen)
  if(![dx,dy,dz].every(Number.isFinite))throw new Error('移动距离必须为有限数值')
  const chosenIDs=new Set(chosen.map(p=>p.id)),output=structuredClone(project)
  output.materials=output.materials!.map(p=>chosenIDs.has(p.id)?{...p,x:p.x+dx,y:p.y+dy,z:p.z+dz}:p)
  return checked(output)
}
export function copyMaterialSelection(project:Project,ids:string[],options?:{stack?:boolean}):Project {
  const chosen=selection(project,ids);unlocked(chosen)
  if((project.materials?.length??0)+chosen.length>500)throw new Error('复制后超过 500 件建材')
  const bounds=materialSelectionBounds(chosen),mapping=new Map(chosen.map(p=>[p.id,crypto.randomUUID()])),output=structuredClone(project)
  const copies=chosen.map(p=>({...structuredClone(p),id:mapping.get(p.id)!,x:p.x+(options?.stack?0:.5),y:p.y+(options?.stack?0:.5),z:p.z+(options?.stack?bounds.height:0),name:`${p.name} 副本`}))
  output.materials=[...(output.materials??[]),...copies]
  const copiedGroups=(project.materialAssemblies??[]).filter(g=>g.pieceIds.every(id=>mapping.has(id))).map(g=>({id:crypto.randomUUID(),name:`${g.name} 副本`,pieceIds:g.pieceIds.map(id=>mapping.get(id)!)}))
  if(copiedGroups.length)output.materialAssemblies=[...(output.materialAssemblies??[]),...copiedGroups]
  return checked(output)
}
export function createMaterialAssembly(project:Project,ids:string[],name:string):Project {
  if(new Set(ids).size<2||new Set(ids).size!==ids.length)throw new Error('组合至少需要两件不同建材')
  if(!name.trim()||name.length>120)throw new Error('组合名称无效')
  if((project.materialAssemblies??[]).some(g=>g.pieceIds.some(id=>ids.includes(id))))throw new Error('请先解散已有组合')
  const chosen=selection(project,ids);unlocked(chosen)
  const output=structuredClone(project)
  output.materialAssemblies=[...(output.materialAssemblies??[]),{id:crypto.randomUUID(),name,pieceIds:[...ids]}]
  return checked(output)
}
export function dissolveMaterialAssembly(project:Project,id:string):Project {
  const group=project.materialAssemblies?.find(g=>g.id===id)
  if(!group)throw new Error('组合不存在')
  unlocked((project.materials??[]).filter(p=>group.pieceIds.includes(p.id)))
  const output=structuredClone(project);output.materialAssemblies=output.materialAssemblies!.filter(g=>g.id!==id);return output
}
export function removeMaterialPieces(project:Project,ids:string[]):Project {
  const chosen=selection(project,ids);unlocked(chosen);const chosenIDs=new Set(chosen.map(p=>p.id)),output=structuredClone(project)
  output.materials=output.materials!.filter(p=>!chosenIDs.has(p.id))
  if(output.materialAssemblies)output.materialAssemblies=output.materialAssemblies.map(g=>({...g,pieceIds:g.pieceIds.filter(id=>!chosenIDs.has(id))})).filter(g=>g.pieceIds.length>=2)
  return checked(output)
}
export function rotateMaterialSelection(project:Project,ids:string[]):Project {
  const chosen=selection(project,ids);unlocked(chosen);const bounds=materialSelectionBounds(chosen),chosenIDs=new Set(chosen.map(p=>p.id)),output=structuredClone(project)
  output.materials=output.materials!.map(p=>{
    if(!chosenIDs.has(p.id))return p
    const b=materialBounds(p)
    return {...p,x:bounds.x+bounds.depth-(b.y-bounds.y)-b.depth,y:bounds.y+(b.x-bounds.x),rotation:p.rotation===90?0:90}
  })
  return checked(output)
}
export function standMaterialPiece(project:Project,id:string,axis:'depth'|'width'='depth'):Project {
  if(axis!=='depth'&&axis!=='width')throw new Error('立放轴只能为 depth 或 width')
  const chosen=selection(project,[id]);unlocked(chosen)
  if(chosen.length!==1)throw new Error('请先解散组合后立放单件建材')
  const output=structuredClone(project)
  output.materials=output.materials!.map(p=>{
    if(p.id!==id)return p
    const order=(p.axisOrder??'xyz').split('')
    const index=axis==='width'?0:1
    ;[order[index],order[2]]=[order[2],order[index]]
    const axisOrder=order.join('') as NonNullable<MaterialPiece['axisOrder']>
    return axis==='width'?{...p,width:p.height,height:p.width,axisOrder}:{...p,depth:p.height,height:p.depth,axisOrder}
  })
  return checked(output)
}
function fail(message:string):never{throw new Error(`建材数据无效：${message}`)}
function obj(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))fail('必须为对象');return value as Record<string,unknown>}
function keys(value:Record<string,unknown>,allowed:string[]){if(Object.keys(value).some(k=>!allowed.includes(k)))fail('含未知字段')}
function str(value:unknown,max=120):string{if(typeof value!=='string'||!value.trim()||value.length>max)fail('文本格式错误');return value}
function num(value:unknown,min:number,max:number):number{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail('数值超出范围');return value}
function evidence(value:unknown):PriceEvidence {
  const v=obj(value);keys(v,['kind','name','scope','url','date'])
  if(!['assumption','reference','quotation'].includes(v.kind as string))fail('价格来源类型错误')
  let url:string|undefined,date:string|undefined
  if(v.url!==undefined){url=str(v.url,1000);try{if(!['http:','https:'].includes(new URL(url).protocol))fail('来源网址必须为 HTTP 或 HTTPS')}catch{fail('来源网址错误')}}
  if(v.date!==undefined){date=str(v.date,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)fail('来源日期错误')}
  return {kind:v.kind as PriceEvidence['kind'],name:str(v.name,200),scope:str(v.scope,1000),...(url?{url}:{}),...(date?{date}:{})}
}
export function validateMaterials(value:unknown):MaterialPiece[] {
  if(!Array.isArray(value)||value.length>500)fail('最多 500 件建材')
  const ids=new Set<string>()
  return value.map(raw=>{
    const v=obj(raw);keys(v,['id','materialId','name','x','y','z','width','depth','height','rotation','color','locked','visible','unitPrice','priceBasis','taxMode','taxRate','evidence','axisOrder'])
    const id=str(v.id);if(ids.has(id))fail('零件 ID 重复');ids.add(id)
    if(typeof v.materialId!=='string'||!Object.hasOwn(MATERIAL_PRESET_BY_ID,v.materialId))fail('未知建材类型')
    if(v.rotation!==0&&v.rotation!==90)fail('旋转只能为 0 或 90 度')
    if(v.axisOrder!==undefined&&!['xyz','xzy','yxz','yzx','zxy','zyx'].includes(v.axisOrder as string))fail('建材轴顺序错误')
    if(typeof v.color!=='string'||!/^#[0-9a-f]{6}$/i.test(v.color))fail('颜色格式错误')
    for(const key of ['locked','visible'])if(Object.hasOwn(v,key)&&typeof v[key]!=='boolean')fail('状态必须为布尔值')
    if(!['piece','length','area','volume'].includes(v.priceBasis as string))fail('采购计量方式错误')
    if(!['included','excluded','unknown'].includes(v.taxMode as string))fail('税费状态错误')
    return {id,materialId:v.materialId as MaterialPresetId,name:str(v.name),x:num(v.x,-1000,1000),y:num(v.y,-1000,1000),z:num(v.z,0,1000),width:num(v.width,.0001,1000),depth:num(v.depth,.0001,1000),height:num(v.height,.0001,1000),rotation:v.rotation,color:v.color,unitPrice:v.unitPrice===null?null:num(v.unitPrice,0,1e8),priceBasis:v.priceBasis as MaterialPiece['priceBasis'],taxMode:v.taxMode as MaterialPiece['taxMode'],evidence:evidence(v.evidence),...(Object.hasOwn(v,'locked')?{locked:v.locked as boolean}:{}),...(Object.hasOwn(v,'visible')?{visible:v.visible as boolean}:{}),...(v.taxRate!==undefined?{taxRate:num(v.taxRate,0,100)}:{}),...(v.axisOrder!==undefined?{axisOrder:v.axisOrder as MaterialPiece['axisOrder']}:{})}
  })
}
export function validateAssemblies(value:unknown,pieces:MaterialPiece[]):MaterialAssembly[] {
  if(!Array.isArray(value)||value.length>250)fail('组合列表格式错误')
  const ids=new Set<string>(),members=new Set<string>(),valid=new Set(pieces.map(p=>p.id))
  return value.map(raw=>{
    const v=obj(raw);keys(v,['id','name','pieceIds']);const id=str(v.id);if(ids.has(id))fail('组合 ID 重复');ids.add(id)
    if(!Array.isArray(v.pieceIds)||v.pieceIds.length<2||v.pieceIds.length>500)fail('组合至少两件建材')
    const pieceIds=v.pieceIds.map(rawID=>{const pid=str(rawID);if(!valid.has(pid)||members.has(pid))fail('组合成员缺失或重复');members.add(pid);return pid})
    return {id,name:str(v.name),pieceIds}
  })
}
const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)/100
export function estimateMaterialPurchase(project:Project):MaterialPurchaseEstimate {
  const included=project.materialBudgetIncluded===true,unpricedItems:string[]=[],taxUnresolvedItems:string[]=[]
  const rows=(project.materials??[]).map(piece=>{
    const dimensions=[piece.width,piece.depth,piece.height].sort((a,b)=>b-a)
    const quantity=piece.priceBasis==='piece'?1:piece.priceBasis==='length'?dimensions[0]:piece.priceBasis==='area'?dimensions[0]*dimensions[1]:dimensions[0]*dimensions[1]*dimensions[2]
    const unit=piece.priceBasis==='piece'?'件':piece.priceBasis==='length'?'m':piece.priceBasis==='area'?'m²':'m³'
    const taxUnresolved=piece.taxMode==='unknown'||piece.taxMode==='excluded'&&piece.taxRate===undefined
    const base=piece.unitPrice===null?null:cents(quantity*piece.unitPrice),taxAmount=base!==null&&piece.taxMode==='excluded'&&piece.taxRate!==undefined?cents(base*piece.taxRate/100):0
    if(piece.unitPrice===null)unpricedItems.push(piece.name)
    else if(taxUnresolved)taxUnresolvedItems.push(piece.name)
    return {id:piece.id,label:piece.name,quantity,unit,unitPrice:piece.unitPrice,amount:base===null?null:cents(base+taxAmount),taxAmount,taxUnresolved,evidence:piece.evidence}
  })
  return {included,total:included?cents(rows.reduce((sum,row)=>sum+(row.amount??0),0)):0,rows,unpricedItems,taxUnresolvedItems}
}
