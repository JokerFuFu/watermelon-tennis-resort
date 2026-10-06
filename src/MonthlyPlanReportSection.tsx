import { estimateMonthlyPlan } from './monthlyPlan'
import type { Project } from './types'

const money=(value:number|null)=>value===null?'待补齐':`¥${value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`
export default function MonthlyPlanReportSection({project}:{project:Project}){
  if(!project.monthlyPlan)return null
  const result=estimateMonthlyPlan(project)
  return <section className="section" data-report-monthly-plan="true"><h2>月度经营模拟</h2><p>{result.enabled?'此月度计划已用于总览':'月度草案，未替换年度简算'}；{result.settings.startMonth} 起连续12个月，预测 {result.settings.horizonYears} 年。</p><p>首12月营业收入 <strong data-report-monthly-revenue={result.annualRevenue??undefined}>{money(result.annualRevenue)}</strong>；已填成本 {money(result.annualKnownCosts)}；完整现金结余 <strong data-report-monthly-cash={result.annualCash??undefined}>{money(result.annualCash)}</strong>。</p><p>初始投入 {money(result.investment)}；预计首次回收 <strong data-report-monthly-payback-status={result.paybackStatus} data-report-monthly-payback-month={result.paybackMonth??undefined}>{result.paybackMonth??(result.paybackStatus==='incomplete'?'待补齐经营数据':result.paybackStatus==='no-investment'?'请填写初始投资':`${result.settings.horizonYears}年情景范围未回收`)}</strong>{result.investmentIncomplete?'（已计投入暂估）':''}。</p>
  <div className="table-scroll"><table><thead><tr><th>月份</th><th>营业天数</th><th>入住率</th><th>客房收入</th><th>设施收入</th><th>总收入</th><th>已填成本</th><th>完整现金结余</th><th>累计结余</th><th>未回收投入</th></tr></thead><tbody>{result.months.map(row=><tr key={row.month} data-report-monthly-row={row.month}><td>{row.month}</td><td>{row.openDays}/{row.calendarDays}</td><td>{row.occupancyRate}%</td><td>{money(row.roomRevenue)}</td><td>{money(row.facilityRevenue)}</td><td data-report-monthly-row-revenue={row.totalRevenue??undefined}>{money(row.totalRevenue)}</td><td>{money(row.knownCosts)}</td><td data-report-monthly-row-cash={row.cashSurplus??undefined}>{money(row.cashSurplus)}</td><td>{money(row.cumulativeCash)}</td><td>{money(row.remainingInvestment)}</td></tr>)}</tbody></table></div>
  <h3>独立设施收费与成本</h3><div className="table-scroll"><table><thead><tr><th>月份</th><th>收费项目</th><th>数量/单位</th><th>营业收入</th><th>直接成本</th></tr></thead><tbody>{result.months.flatMap(month=>month.facilityRows.map(row=><tr key={`${month.month}-${row.id}`} data-report-monthly-facility={row.id}><td>{month.month}</td><td>{row.label}</td><td>{row.quantity.toFixed(4)} {row.unit}</td><td>{money(row.revenue)}</td><td>{money(row.directCost)}</td></tr>))}</tbody></table></div>
  {result.missingItems.length>0&&<p className="warning">待补齐：{result.missingItems.join('；')}。未知成本不当作0。</p>}
  <p className="note">{result.reviewItems.join('；')}。按循环月计划累计，首次达到投入后仍可能再次回落；年数插值假设当月均匀收支，不代表实际收款日期。固定费用按自然月天数均摊，变动耗用按营业天数；不考虑融资、通胀、应收应付款及时间价值。</p>
  </section>
}
