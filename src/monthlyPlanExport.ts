import { estimateMonthlyPlan } from './monthlyPlan'
import { getEarningsSettings } from './earnings'
import { getOperatingSettings } from './operating'
import type { Project } from './types'

export function buildMonthlyPlanCSV(project:Project):string{
  const result=estimateMonthlyPlan(project),common=getEarningsSettings(project),op=getOperatingSettings(project)
  const rows:(string|number)[][]=[['项目',project.name],['月度计划状态',result.enabled?'已用于总览':'草案预览，未用于总览'],['起始月份',result.settings.startMonth],['预测年数',result.settings.horizonYears],['初始投资元',result.investment??'待填写'],['投资范围',result.investmentIncomplete?'按已计投资暂估':'按所填范围'],['预计首次回本年月',result.paybackMonth??'未形成确定年月'],['近似回本年数',result.paybackYears??'待补齐或在情景范围内未回收'],['每间宾客数',common.guestsPerRoom],['营业额费用预留百分比',common.revenueDeductionRate??'待填写'],['原运营预算天数',op.days],['员工人数',op.staffCount],['月份','自然天数','营业天数','入住率百分比','客房收入元','设施收入元','其他收入元','总营业收入元','日常成本元','设施直接成本元','额外固定支出元','营业额预留元','已填总成本元','已填范围结余元','完整现金结余元','累计现金结余元','未回收投资元']]
  for(const row of result.months)rows.push([row.month,row.calendarDays,row.openDays,row.occupancyRate,row.roomRevenue??'待补齐',row.facilityRevenue??'待补齐',row.otherRevenue??'待补齐',row.totalRevenue??'待补齐',row.operatingCost,row.facilityCost,row.extraCost??'待填写',row.deductions??'待填写',row.knownCosts,row.knownSurplus,row.cashSurplus??'待补齐',row.cumulativeCash??'待补齐',row.remainingInvestment??'待补齐'])
  rows.push(['首12月已填总收入元',result.annualKnownRevenue],['首12月已填总成本元',result.annualKnownCosts],['首12月完整现金结余元',result.annualCash??'待补齐'],['每月经营参数','营业天数','入住率','标准间价','景观房价','套房价','其他每日收入','额外固定月费'])
  for(const month of result.settings.months)rows.push([month.month,month.openDays,month.occupancyRate,month.roomRates.standard??'待填写',month.roomRates.deluxe??'待填写',month.roomRates.suite??'待填写',month.extraDailyRevenue??'待填写',month.extraFixedCost??'待填写'])
  rows.push(['设施收费计划','绑定设施ID','是否计入','单位','每日容量','单价','直接单位成本','固定月成本','来源类型','来源名称','来源日期','范围','链接'])
  for(const item of result.settings.facilityItems){rows.push([item.label,item.facilityId,item.included?'计入':'不计入',item.unit,item.capacityPerDay,item.unitPrice??'待填写',item.directUnitCost??'待填写',item.fixedMonthlyCost??'待填写',item.evidence.kind,item.evidence.name,item.evidence.date??'',item.evidence.scope,item.evidence.url??'']);rows.push(['逐月利用率',...item.utilizationRates])}
  rows.push(['设施每月收费明细','设施名称','收费数量','单位','收入元','直接成本元'])
  for(const month of result.months)for(const item of month.facilityRows)rows.push([month.month,item.label,item.quantity,item.unit,item.revenue??'待填写',item.directCost??'待填写'])
  rows.push(['逐月回收预测','经营现金结余元','累计现金结余元','未回收投资元'])
  for(const month of result.forecast)rows.push([month.month,month.cashSurplus??'待补齐',month.cumulativeCash??'待补齐',month.remainingInvestment??'待补齐'])
  rows.push(['待补事项',result.missingItems.join('；')||'无'],['核实提醒',result.reviewItems.join('；')],['测算约定','变动成本按营业天数，期间和手填成本按自然月天数/原期间均摊；循环12个月计划，未来日历重算；月内均匀收支仅用于年数近似，首次回收后仍可能亏损。'])
  const cell=(value:string|number)=>{const raw=String(value),safe=typeof value==='string'&&(/^[=+\-@\t\r\n]/.test(raw)||/^\s+[=+\-@]/.test(raw))?"'"+raw:raw;return `"${safe.replaceAll('"','""')}"`}
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
