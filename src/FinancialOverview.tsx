import { useMemo } from 'react'
import { ArrowUpRight, TrendingUp } from 'lucide-react'
import { getActiveFinancialProjection } from './financialProjection'
import { estimateProject } from './pricing'
import { formatNumber } from './model'
import type { Project } from './types'
import './financial-overview.css'

export default function FinancialOverview({project,onBudget,onEarnings}:{project:Project;onBudget:()=>void;onEarnings:()=>void}){
  const budget=useMemo(()=>estimateProject(project),[project])
  const earnings=useMemo(()=>getActiveFinancialProjection(project),[project])
  const money=(value:number|null)=>value===null?'待补齐':`¥ ${formatNumber(value,2)}`
  const payback=earnings.paybackMonth??(earnings.paybackYears===null?earnings.paybackStatus==='nonpositive'?'当前假设下无法回本':earnings.paybackStatus==='not-recovered'?`${earnings.horizonYears}年范围未回收`:earnings.paybackStatus==='no-investment'?'请填写建设投入':'待补齐成本':earnings.paybackYears<.01?'少于 0.01 年':`${formatNumber(earnings.paybackYears,2)} 年`)
  return <section className="surface fo-summary" data-testid="overview-financial-summary"><div className="section-heading"><div><h2><TrendingUp size={18}/> 经营与投资总览</h2><p>建设预算和收益使用当前方案的同一套计算。</p></div><span className="subtle-tag">{earnings.model==='monthly'?'采用月度经营计划':earnings.saved?'收益参数已保存':'收益示例预览'}</span></div><div className="fo-metrics">
    <article><span>建设已计投资</span><strong data-overview-construction={budget.total.point}>{money(budget.total.point)}</strong><small>{budget.missingItems.length?'含待补项，完整投资仍需核实':'按已填写建设范围'}</small></article>
    <article><span>{earnings.model==='monthly'?'首12月营业收入':'年营业收入'}</span><strong data-overview-revenue={earnings.annualRevenue??undefined}>{money(earnings.annualRevenue)}</strong><small>{earnings.periodLabel}</small></article>
    <article><span>{earnings.model==='monthly'?'首12月经营现金结余':'年经营现金结余'}</span><strong data-overview-cash={earnings.annualCash??undefined}>{money(earnings.annualCash)}</strong><small>{earnings.annualCash===null?'工资、水电等经营缺项尚需补齐':'已扣除填写的经营成本与费用'}</small></article>
    <article><span>{earnings.model==='monthly'?'预计首次回本年月':'静态回本年限'}</span><strong data-overview-payback-status={earnings.paybackStatus} data-overview-payback-years={earnings.paybackYears??undefined} data-overview-payback-month={earnings.paybackMonth??undefined}>{payback}</strong><small>{earnings.investmentIncomplete?'按已计建设投资暂估':earnings.model==='monthly'?'逐月累计现金首次达到初始投入':'以选定初始投入与年度现金结余测算'}</small></article>
  </div><div className="fo-actions"><p>{!earnings.saved?'房价为可调整的内部示例。':''}{earnings.missingItems.length?`还需补齐 ${earnings.missingItems.length} 项收益或经营成本。`:'可在收益页比较不同入住率下的经营结果。'}</p><button className="button secondary" onClick={onBudget}>查看建设预算<ArrowUpRight size={14}/></button><button className="button primary" onClick={onEarnings}>查看收益与回本<ArrowUpRight size={14}/></button></div></section>
}
