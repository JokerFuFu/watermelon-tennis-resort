import { formatArea } from './area'
import { calculateRoomProgram, getLayoutWarnings } from './model'
import { estimateFacility, estimateProject } from './pricing'
import { estimateMaterialPurchase, materialObstacles } from './materials'
import { estimateOperating } from './operating'
import { getActiveFinancialProjection } from './financialProjection'
import type { Project } from './types'

export type CheckCategory='layout'|'rooms'|'budget'|'earnings'
export interface ProjectCheck {
  id:string
  category:CheckCategory
  level:'adjust'|'review'
  title:string
  detail:string
  facilityIds:string[]
  target:{page:'design'|'rooms'|'budget'|'earnings';facilityId?:string}
}
export const CHECK_CATEGORIES:Record<CheckCategory,string>={layout:'场地布局',rooms:'客房容量',budget:'预算与来源',earnings:'收益与回本'}

/** Uses the existing checks and calculations; this is a planning work list. */
export function inspectProject(project:Project,now=new Date()):ProjectCheck[] {
  const checks:ProjectCheck[]=[]
  const byId=new Map(project.facilities.map(f=>[f.id,f]))
  const names=(ids:string[])=>ids.map(id=>byId.get(id)?.name??'设施')
  const list=(ids:string[])=>names(ids).slice(0,4).join('、')+(ids.length>4?`等 ${ids.length} 个设施`:'')
  const overlaps=new Map<string,Set<string>>()
  for(const warning of getLayoutWarnings(project)){
    if(warning.id.startsWith('overlap-')){
      const [a,b]=warning.facilityIds
      if(!overlaps.has(a))overlaps.set(a,new Set())
      if(!overlaps.has(b))overlaps.set(b,new Set())
      overlaps.get(a)!.add(b);overlaps.get(b)!.add(a)
    }else{
      checks.push({id:warning.id,category:'layout',level:'adjust',title:warning.message,detail:warning.id.startsWith('court-')?'参考概念占地包含缓冲区，可调整尺寸或重新安排；实际工程范围需另行设计。':'界外部分已从界内面积中扣除，但设施仍需调整位置或用地边界。',facilityIds:warning.facilityIds,target:{page:'design',facilityId:warning.facilityIds[0]}})
    }
  }
  // Show at most one intersection task per facility, rather than thousands of pairs.
  for(const facility of project.facilities){
    const others=overlaps.get(facility.id)
    if(others?.size)checks.push({id:`intersections-${facility.id}`,category:'layout',level:'adjust',title:`${facility.name} 与 ${others.size} 个设施占地相交`,detail:`涉及 ${list([...others])}。面积已去重，平面冲突仍需按设计用途处理。`,facilityIds:[facility.id,...others],target:{page:'design',facilityId:facility.id}})
    if(facility.type==='hotel'){
      const room=calculateRoomProgram(facility)
      if(room.remainingArea<0)checks.push({id:`room-capacity-${facility.id}`,category:'rooms',level:'adjust',title:`${facility.name} 客房示例面积超出楼面`,detail:`房型示例净面积 ${formatArea(room.guestArea)} ㎡，完整楼面 ${formatArea(room.grossArea)} ㎡，缺口 ${formatArea(-room.remainingArea)} ㎡。可调整房型、数量、楼层或尺寸。`,facilityIds:[facility.id],target:{page:'rooms',facilityId:facility.id}})
    }
  }
  if(!project.facilities.length)checks.push({id:'empty-plan',category:'layout',level:'review',title:'场地尚未配置设施',detail:'从设施库添加酒店、网球场和需要的配套，再查看面积与投资。',facilityIds:[],target:{page:'design'}})
  const budget=estimateProject(project,now)
  const extra=[['landAmount','土地费用'],['siteAmount','场地工程费用'],['connectionAmount','市政接入费用'],['openingAmount','开办费用']] as const
  for(const [key,label] of extra)if(budget.settings[key]===null)checks.push({id:`missing-${key}`,category:'budget',level:'review',title:`${label} 尚未报价`,detail:'目前未计入已计预算合计。填写金额后计入；明确为零时填写 0，保留空值表示待询价。',facilityIds:[],target:{page:'budget'}})
  const prices=project.facilities.map(f=>({f,estimate:estimateFacility(f,now)}))
  const assumptions=prices.filter(({estimate})=>estimate.assumedRows>0).map(({f})=>f.id)
  const tax=prices.filter(({estimate})=>estimate.taxUnresolved).map(({f})=>f.id)
  const references=prices.filter(({estimate})=>estimate.rows.some(row=>row.evidence.kind==='reference')).map(({f})=>f.id)
  const stale=prices.filter(({estimate})=>estimate.staleQuote).map(({f})=>f.id)
  if(assumptions.length)checks.push({id:'price-sources',category:'budget',level:'review',title:`${assumptions.length} 个设施价格来源待核实`,detail:`${list(assumptions)}仍含综合价或内部假设。可录入实际报价、日期与包含范围，不能将示例单价视为北京市场报价。`,facilityIds:assumptions,target:{page:'budget'}})
  if(tax.length)checks.push({id:'tax-scope',category:'budget',level:'review',title:`${tax.length} 个设施税口径待确认`,detail:`${list(tax)}的税口径或未税税率未明确，尚未自动补计税费。`,facilityIds:tax,target:{page:'budget'}})
  if(references.length)checks.push({id:'reference-scope',category:'budget',level:'review',title:`${references.length} 个设施使用公开参考价格`,detail:`${list(references)}需核对参考工程、材料和实际建设范围是否一致；公开材料价不能直接视为整项建成报价。`,facilityIds:references,target:{page:'budget'}})
  if(stale.length)checks.push({id:'quote-recheck',category:'budget',level:'review',title:`${stale.length} 个设施报价超过 90 天`,detail:`${list(stale)}建议向供应商复核。这里只提示复核，不判定报价已失效。`,facilityIds:stale,target:{page:'budget',facilityId:stale[0]}})
  if(project.operating?.enabled){
    const operating=estimateOperating(project)
    if(operating.unpricedItems.length)checks.push({id:'operating-unpriced',category:'budget',level:'review',title:'餐饮与日常消耗仍有未报价项',detail:operating.unpricedItems.join('、')+'尚未计入期间运营合计，请按采购范围填写单价。',facilityIds:[],target:{page:'budget'}})
    if(operating.taxUnresolvedItems.length)checks.push({id:'operating-tax',category:'budget',level:'review',title:'运营费用税口径待确认',detail:operating.taxUnresolvedItems.join('、')+'未核定含税口径或税率，尚未自动补税。',facilityIds:[],target:{page:'budget'}})
    if(operating.assumedRows)checks.push({id:'operating-assumptions',category:'budget',level:'review',title:'餐饮与用品仍采用示例采购成本',detail:`${operating.assumedRows} 项用量或价格来源为内部假设；${operating.days} 天预算需要按实际人数与供应商报价核实。`,facilityIds:[],target:{page:'budget'}})
  }
  const materialBounds=materialObstacles(project)
  if(materialBounds.some(rect=>rect.x<0||rect.y<0||rect.x+rect.width>project.siteWidth||rect.y+rect.depth>project.siteDepth))checks.push({id:'material-bounds',category:'layout',level:'adjust',title:'建材或自建作品超出用地',detail:'请打开建材区核对坐标与整体外包范围；正常叠放不作为设施相交冲突。',facilityIds:[],target:{page:'design'}})
  const procurement=estimateMaterialPurchase(project)
  if(procurement.included&&procurement.unpricedItems.length)checks.push({id:'material-unpriced',category:'budget',level:'review',title:'部分自建材料尚未报价',detail:procurement.unpricedItems.join('、')+'尚未计入已知材料金额。',facilityIds:[],target:{page:'budget'}})
  if(project.earnings||project.monthlyPlan?.enabled){
    const earnings=getActiveFinancialProjection(project)
    if(earnings.missingItems.length)checks.push({id:'earnings-incomplete',category:'earnings',level:'review',title:'收益与回本仍有待补项',detail:earnings.missingItems.join('；')+'。补齐后计算完整经营结余及回本，已填范围不能当完整盈利。',facilityIds:[],target:{page:'earnings'}})
    if(earnings.paybackStatus==='nonpositive'||earnings.paybackStatus==='not-recovered')checks.push({id:'earnings-nonpositive',category:'earnings',level:'adjust',title:earnings.model==='monthly'?`${earnings.horizonYears}年情景范围未回收投入`:'年度经营现金结余不为正',detail:earnings.model==='monthly'?'可在月度经营页核对现金曲线和缺项；此范围未回收不表示永远无法回本。':'当前假设下无法通过经营现金结余回收初始投资，可在收益页对比房价、入住率和经营成本。',facilityIds:[],target:{page:'earnings'}})
    if(earnings.paybackStatus==='no-investment')checks.push({id:'earnings-investment',category:'earnings',level:'review',title:'回本初始投资尚未填完整',detail:'请使用建设已计投资或手填大于零的完整投入。',facilityIds:[],target:{page:'earnings'}})
  }
  return checks
}
