import type { Facility, Project } from './types'
import { getFacilityLabel } from './facilityCatalog'

export interface FacilityMeasurement {
  id:string;name:string;label:string;x:number;y:number;width:number;depth:number
  right:number;bottom:number;leftMargin:number;rightMargin:number;topMargin:number;bottomMargin:number
  inBounds:boolean;visible:boolean;locked:boolean
}
export interface FacilityGap { distance:number;horizontal:number;vertical:number;overlapArea:number;relation:'overlap'|'touching'|'separate';from:[number,number];to:[number,number] }
export function measureFacility(f:Facility,p:Pick<Project,'siteWidth'|'siteDepth'>):FacilityMeasurement {
  const width=f.rotation===90?f.depth:f.width,depth=f.rotation===90?f.width:f.depth
  const right=f.x+width,bottom=f.y+depth,rightMargin=p.siteWidth-right,bottomMargin=p.siteDepth-bottom
  return {id:f.id,name:f.name,label:getFacilityLabel(f),x:f.x,y:f.y,width,depth,right,bottom,leftMargin:f.x,rightMargin,topMargin:f.y,bottomMargin,inBounds:f.x>=0&&f.y>=0&&rightMargin>=0&&bottomMargin>=0,visible:f.visible!==false,locked:!!f.locked}
}
export function measureGap(a:FacilityMeasurement,b:FacilityMeasurement):FacilityGap {
  function axis(loA:number,hiA:number,loB:number,hiB:number):[number,number]{
    if(hiA<loB)return [hiA,loB]
    if(hiB<loA)return [loA,hiB]
    const shared=(Math.max(loA,loB)+Math.min(hiA,hiB))/2
    return [shared,shared]
  }
  const [ax,bx]=axis(a.x,a.right,b.x,b.right),[ay,by]=axis(a.y,a.bottom,b.y,b.bottom)
  const horizontal=Math.abs(bx-ax),vertical=Math.abs(by-ay),distance=Math.hypot(horizontal,vertical)
  const overlapArea=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))
  return {distance,horizontal,vertical,overlapArea,relation:overlapArea>0?'overlap':distance===0?'touching':'separate',from:[ax,ay],to:[bx,by]}
}
export function nearestFacility(p:Project,id:string):{facility:FacilityMeasurement;gap:FacilityGap}|null {
  const source=p.facilities.find(f=>f.id===id);if(!source)return null
  const a=measureFacility(source,p)
  let closest:{facility:FacilityMeasurement;gap:FacilityGap}|null=null
  for(const f of p.facilities){if(f.id===id)continue;const facility=measureFacility(f,p),gap=measureGap(a,facility);if(!closest||gap.distance<closest.gap.distance)closest={facility,gap}}
  return closest
}
export function formatLength(value:number):string {
  if(value!==0&&Math.abs(value)<.001)return value<0?'−不足 0.001':'不足 0.001'
  return value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:3})
}
export function buildMeasurementsCSV(p:Project,ids?:readonly string[]):string {
  const rows:(string|number)[][]=[['项目',p.name],['用地宽度(m)',p.siteWidth],['用地进深(m)',p.siteDepth],['说明','按当前设施矩形占地测量；旋转后的占地宽深；负边距表示越界；隐藏设施仍占地。'],[],['设施ID','设施名称','类型','X(m)','Y(m)','占地宽(m)','占地深(m)','左边距(m)','右边距(m)','上边距(m)','下边距(m)','用地范围','显示状态','锁定状态','最近设施','矩形净距(m)','最近关系']]
  const ordered=ids?[...new Set(ids)].map(id=>p.facilities.find(f=>f.id===id)).filter((f):f is Facility=>!!f):p.facilities
  for(const f of ordered){const m=measureFacility(f,p),near=nearestFacility(p,f.id)
    rows.push([m.id,m.name,m.label,m.x,m.y,m.width,m.depth,m.leftMargin,m.rightMargin,m.topMargin,m.bottomMargin,m.inBounds?'界内':'越界',m.visible?'显示':'隐藏',m.locked?'锁定':'未锁定',near?.facility.name??'',near?.gap.distance??'',near?.gap.relation==='overlap'?'重叠':near?.gap.relation==='touching'?'接触':near?'分离':'无其他设施'])
  }
  const cell=(value:string|number)=>{let s=String(value);if(typeof value==='string'&&/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'}
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
