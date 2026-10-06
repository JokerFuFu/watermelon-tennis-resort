import { estimateEarnings } from './earnings'
import { getEarningsScenarios } from './earningsScenarios'
import MonthlyPlanReportSection from './MonthlyPlanReportSection'
import { ROOM_TYPES } from './model'
import type { Project, RoomType } from './types'

const amount=(value:number|null)=>value===null?'待补齐':`¥${value.toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2})}`

export default function EarningsReportSection({project}:{project:Project}){
  if(!project.earnings)return <><MonthlyPlanReportSection project={project}/><section className="section"><h2>收益与回本</h2><p>尚未保存收益参数。请在工作台的「收益与回本」填写房价、入住率和经营成本。</p></section></>
  const forecast=estimateEarnings(project),s=forecast.settings
  const payback=forecast.paybackStatus==='ready'&&forecast.paybackYears!==null?`${forecast.paybackYears<.01?'少于0.01':forecast.paybackYears.toFixed(2)} 年${forecast.investmentIncomplete?'（按已计投资暂估）':''}`:forecast.paybackStatus==='nonpositive'?'当前假设下无法回本':forecast.paybackStatus==='no-investment'?'请填写建设投入':'待补齐收入与成本'
  return <><MonthlyPlanReportSection project={project}/><section className="section" data-report-earnings="true"><h2>收益与回本</h2><p>入住率 {s.occupancyRate}% · 每间 {s.guestsPerRoom} 人 · 全年365天营业、房价与入住率恒定的情景测算。</p>
    <div className="table-scroll"><table><thead><tr><th>房型</th><th>规划间数</th><th>停用间数</th><th>可售间数</th><th>每晚房价</th></tr></thead><tbody>{(Object.keys(ROOM_TYPES) as RoomType[]).map(key=><tr key={key}><td>{ROOM_TYPES[key].label}</td><td>{forecast.roomCounts[key]}</td><td>{s.unavailableRooms[key]}</td><td>{forecast.availableRooms[key]}</td><td>{amount(s.roomRates[key])}</td></tr>)}</tbody></table></div>
    <div className="table-scroll"><table><thead><tr><th>周期</th><th>营业收入</th><th>已填经营支出</th><th>已填范围结余</th><th>经营现金结余</th></tr></thead><tbody>{forecast.periods.map(period=><tr key={period.id} data-report-earnings-period={period.id}><td>{period.label}</td><td data-report-earnings-revenue={period.totalRevenue??undefined}>{amount(period.totalRevenue)}</td><td data-report-earnings-cost={period.knownCosts}>{amount(period.knownCosts)}</td><td>{amount(period.knownSurplus)}</td><td data-report-earnings-cash={period.cashSurplus??undefined}>{amount(period.cashSurplus)}</td></tr>)}</tbody></table></div>
    <p>回本本金：<strong data-report-earnings-investment={forecast.investment??undefined}>{amount(forecast.investment)}</strong>。静态回本：<strong data-report-payback-status={forecast.paybackStatus} data-report-payback-years={forecast.paybackYears??undefined}>{payback}</strong>。</p>
    <p>额外每日收入 {amount(s.extraDailyRevenue)}；额外平均月支出 {amount(s.extraMonthlyCost)}；营业额费用预留 {s.revenueDeductionRate===null?'待填写':`${s.revenueDeductionRate}%`}。</p>
    {forecast.missingItems.length>0&&<p className="warning">待补齐：{forecast.missingItems.join('；')}。已填范围结余不能视为完整盈利。</p>}
    {forecast.reviewItems.length>0&&<p className="note">待核实：{forecast.reviewItems.join('；')}。</p>}
    <h3>入住率情景对比</h3><div className="table-scroll"><table><thead><tr><th>情景</th><th>入住率</th><th>年营业收入</th><th>年现金结余</th><th>回本年限</th></tr></thead><tbody>{getEarningsScenarios(project).map(scenario=>{const year=scenario.estimate.periods.find(p=>p.id==='year')!;return <tr key={scenario.id} data-report-earnings-scenario={scenario.id}><td>{scenario.label}</td><td>{scenario.occupancyRate}%</td><td>{amount(year.totalRevenue)}</td><td>{amount(year.cashSurplus)}</td><td>{scenario.estimate.paybackYears===null?'待补齐或未形成有限回本':`${scenario.estimate.paybackYears.toFixed(2)} 年`}{scenario.estimate.investmentIncomplete?'（已计投资暂估）':''}</td></tr>})}</tbody></table></div><p className="note">上下10个百分点的临时经营对比，不覆盖原参数。</p>
    <p className="note">日1天、周7天、平均月365/12天、年365天。日常费用沿用原运营费用项，按本页入住率与可售房数换算；原期间固定及手填费用按原天数均摊。回本本金不含选定期间日常支出，经营结余不再重复扣建设投入。静态回本=初始投资÷年经营现金结余，不是营业额回本，不考虑资金时间价值、融资及季节变化。</p>
  </section></>
}
