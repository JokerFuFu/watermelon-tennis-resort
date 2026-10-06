import { getFacilityLabel } from './facilityCatalog'
import { estimateFacility, estimateProject } from './pricing'
import { estimateCombinedBudget, getOperatingSettings } from './operating'
import { estimateMaterialPurchase } from './materials'
import type { Project } from './types'

/** Uses the same estimates as the screen; unknown costs stay blank. */
export function buildBudgetCSV(project:Project):string {
  const budget=estimateProject(project)
  const combined=estimateCombinedBudget(project)
  const operating=combined.operating, operatingSettings=getOperatingSettings(project)
  const rows:(string|number)[][]=[
    ['项目',project.name,'地点',project.location,'币种','人民币'],
    ['范围','已计入费用；规划情景范围并非置信区间；用户报价未独立核验'],
    ['设施','类型','费用分项','计价数量','单位','单价元','已计金额元','情景下限元','情景上限元','另加税额元','税口径','来源类型','来源名称','日期','适用范围','链接'],
  ]
  const evidenceLabels={assumption:'规划假设',reference:'公开参考',quotation:'用户报价，未独立核验'}
  for(const f of project.facilities){
    const estimate=estimateFacility(f)
    for(const row of estimate.rows){
      const source=f.pricing?.mode==='quotation'?f.pricing.quote:f.pricing?.items.find(item=>item.id===row.id)
      const taxScope=source?.taxMode==='included'?'报价已含税，内含税额未拆分':source?.taxMode==='excluded'?(source.taxRate===undefined?'不含税，税率待核实，尚未加税':`不含税，另加税率 ${source.taxRate}%`):'税口径待确认，尚未补计税费'
      const unit=!f.pricing&&f.type==='court'?'片':row.unit
      rows.push([f.name,getFacilityLabel(f),row.label,row.quantity,unit,row.unitPrice,row.amount,row.low,row.high,row.taxAmount,taxScope,evidenceLabels[row.evidence.kind],row.evidence.name,row.evidence.date??'',row.evidence.scope,row.evidence.url??''])
    }
    rows.push([f.name,getFacilityLabel(f),'设施工程小计','','','',estimate.point,estimate.low,estimate.high,'',estimate.taxUnresolved?'税口径待确认':''])
  }
  rows.push(['设施工程合计','','','','','',budget.engineering.point,budget.engineering.low,budget.engineering.high])
  const materialList=estimateMaterialPurchase({...project,materialBudgetIncluded:true})
  rows.push(['建材采购是否另计',project.materialBudgetIncluded===true?'是':'否，先核对是否包含在设施综合价'])
  if(project.materials?.length){
    rows.push(['建材采购明细','计量数量','单位','单价元','已知采购金额元','另加税额元','税口径','来源','日期','范围'])
    for(const row of materialList.rows)rows.push([row.label,row.quantity,row.unit,row.unitPrice??'',row.amount??'',row.taxAmount,row.taxUnresolved?'待核实':'按录入口径',row.evidence.name,row.evidence.date??'',row.evidence.scope])
    rows.push(['建材清单已知金额',materialList.total],['建材未报价项',materialList.unpricedItems.join('；')||'无'])
  }
  rows.push(['已纳入建材采购金额','','','','','',budget.materialsAmount])
  rows.push(['设计费',`${budget.settings.designRate}% × 设施工程合计`,'可调规划假设','','','',budget.designAmount])
  rows.push(['监理费',`${budget.settings.supervisionRate}% × 设施工程合计`,'可调规划假设','','','',budget.supervisionAmount])
  for(const [label,key] of [['土地费用','landAmount'],['场地与基础设施','siteAmount'],['市政接入','connectionAmount'],['开业筹备','openingAmount']] as const){
    const amount=budget.settings[key]
    rows.push([label,amount===null?'待询价，未计入合计':'用户填写项目费用','','','','',amount??''])
  }
  rows.push(['预备费',`${budget.settings.reserveRate}% ×（设施工程 + 设计 + 监理 + 场地 + 接入）`,'不以土地与开业筹备为基数；可调规划假设','','','',budget.reserveAmount])
  rows.push(['建设已计预算合计','','','','','',budget.total.point,budget.total.low,budget.total.high])
  rows.push(['用户报价覆盖比例',`${(budget.quoteCoverage*100).toFixed(1)}%`,'占设施工程金额；不代表价格准确率'])
  rows.push(['待确认费用',budget.missingItems.join('；')||'当前填写范围内无待确认项'])
  rows.push(['报价复核提醒',budget.staleQuotes,'超过90天仅提醒复核，并非报价失效判定'])
  rows.push(['运营预算状态',operating.enabled?'已启用':'未启用，未计入综合合计'])
  if(operating.enabled){
    rows.push(['运营预算期间（天）',operating.days],['平均每日服务宾客',operating.averageGuests],['每日员工',operating.averageStaff],['宾客人天',operating.guestDays],['员工人天',operating.staffDays],['总人天',operating.personDays],['入住房晚',operating.roomNights])
    rows.push(['运营费用','是否计入','数量基数','每基数用量','总数量','单位','采购单价元','期间已计金额元','另加税额元','税费口径','来源类型','来源名称','日期','采购范围','链接'])
    const bases={guestDay:'宾客人天',staffDay:'员工人天',personDay:'总人天',roomDay:'入住房晚',day:'天数',period:'整个期间',manual:'手填总数量'}
    for(const row of operating.rows){
      const original=operatingSettings.items.find(item=>item.id===row.id)!
      const scope=original.taxMode==='included'?'单价含税，内含税未拆分':original.taxMode==='excluded'?(original.taxRate===undefined?'单价未含税，税率待核实':`单价未含税，另加 ${original.taxRate}%`):'税口径待核实，未自动补税'
      rows.push([row.label,row.included?'计入':'未计入',bases[row.basis],original.quantity,row.quantity,row.unit,row.unitPrice??'',row.amount??'',row.taxAmount,scope,evidenceLabels[row.evidence.kind],row.evidence.name,row.evidence.date??'',row.evidence.scope,row.evidence.url??''])
    }
    rows.push(['运营未报价项',operating.unpricedItems.join('；')||'无'],['运营税口径待确认',operating.taxUnresolvedItems.join('；')||'无'])
  }
  rows.push(['期间运营已计合计','','','','','',operating.total])
  rows.push(['建设加期间运营已计合计','','','','','',combined.total.point,combined.total.low,combined.total.high])
  rows.push(['综合合计口径','建设已计费用加已启用的选定期间日常消耗；运营不追加建设设计、监理及预备费；情景范围只调整建设部分'])
  rows.push(['未纳入范围','未报价费用、融资及尚未录入的其他运营支出；不等同于完整酒店生命周期成本'])
  const quote=(value:string|number)=>{
    const str=String(value)
    const safe=/^[=+\-@\t\r]/.test(str)?"'"+str:str
    return `"${safe.replaceAll('"','""')}"`
  }
  return '\uFEFF'+rows.map(row=>row.map(quote).join(',')).join('\r\n')
}
