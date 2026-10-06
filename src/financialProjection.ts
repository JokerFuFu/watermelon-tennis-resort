import { estimateEarnings } from './earnings'
import { estimateMonthlyPlan } from './monthlyPlan'
import type { Project } from './types'

/** One active model for the overview and checks; detailed views retain both plans. */
export function getActiveFinancialProjection(project:Project){
  if(project.monthlyPlan?.enabled){
    const result=estimateMonthlyPlan(project)
    return {model:'monthly' as const,saved:true,annualRevenue:result.annualRevenue,annualCash:result.annualCash,knownCosts:result.annualKnownCosts,investment:result.investment,investmentIncomplete:result.investmentIncomplete,paybackStatus:result.paybackStatus,paybackYears:result.paybackYears,paybackMonth:result.paybackMonth,missingItems:result.missingItems,reviewItems:result.reviewItems,horizonYears:result.settings.horizonYears,periodLabel:`${result.settings.startMonth} 起12个自然月`}
  }
  const result=estimateEarnings(project),year=result.periods.find(p=>p.id==='year')!
  return {model:'annual' as const,saved:!!project.earnings,annualRevenue:year.totalRevenue,annualCash:year.cashSurplus,knownCosts:year.knownCosts,investment:result.investment,investmentIncomplete:result.investmentIncomplete,paybackStatus:result.paybackStatus,paybackYears:result.paybackYears,paybackMonth:null,missingItems:result.missingItems,reviewItems:result.reviewItems,horizonYears:0,periodLabel:'全年365天恒定情景'}
}
