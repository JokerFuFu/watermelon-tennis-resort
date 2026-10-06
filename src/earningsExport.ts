import { estimateEarnings } from './earnings'
import { getOperatingSettings } from './operating'
import { getEarningsScenarios } from './earningsScenarios'
import { buildMonthlyPlanCSV } from './monthlyPlanExport'
import type { Project } from './types'

export function buildEarningsCSV(project: Project): string {
  const result = estimateEarnings(project)
  const operating = getOperatingSettings(project)
  const rows: (string | number)[][] = [
    ['项目', project.name], ['收益与回本测算', '情景估算；经营现金结余不是会计净利润'],
    ['总览当前模型',project.monthlyPlan?.enabled?'月度经营计划；下方年度简算保留作对照，后附月度结果':'年度恒定情景'],
    ['入住率百分比', result.settings.occupancyRate], ['每间人数', result.settings.guestsPerRoom],
    ['额外每日收入元', result.settings.extraDailyRevenue ?? '待填写'], ['额外月支出元', result.settings.extraMonthlyCost ?? '待填写'], ['营业额费用预留百分比', result.settings.revenueDeductionRate ?? '待填写'],
    ['客房收入公式', '各房型可售间数 × 入住率 × 每晚房价 × 周期天数'],
    ['房型', '库存间数', '停用间数', '可售间数', '每晚房价元'],
    ...(['standard', 'deluxe', 'suite'] as const).map(key => [({ standard: '标准间', deluxe: '景观房', suite: '套房' })[key], result.roomCounts[key], result.settings.unavailableRooms[key], result.availableRooms[key], result.settings.roomRates[key] ?? '待填写']),
    ['周期', '天数', '客房收入元', '额外收入元', '总收入元', '日常运营已填金额元', '额外支出元', '营业额预留元', '已填成本元', '已填范围结余元', '完整经营现金结余元'],
    ...result.periods.map(period => [period.label, period.days, period.roomRevenue ?? '待补齐', period.otherRevenue ?? '待填写', period.totalRevenue ?? '待补齐', period.operatingCost, period.extraCost ?? '待填写', period.deductions ?? '待补齐', period.knownCosts, period.knownSurplus, period.cashSurplus ?? '待补齐']),
    ['初始投资来源', result.settings.investmentMode === 'construction' ? '建设已计投资' : '手填初始投资'],
    ['初始投资元', result.investment ?? '待填写'], ['投资完整性', result.investmentIncomplete ? '暂估，建设投资尚有缺项' : '按所填范围'],
    ['静态回本年数', result.paybackYears ?? ({ incomplete: '经营数据待补齐', nonpositive: '年度结余不为正，无有限回本', 'no-investment': '需填写大于零的初始投资', ready: '' })[result.paybackStatus]],
    ['年度成本明细', '计量口径', '已填金额元'],
    ...result.costItems.map(item => [item.label, item.basis, item.annualAmount ?? '待填写']),
    ['日常运营是否启用', operating.enabled ? '已启用' : '未启用，仅预览已填范围'], ['原运营预算期间天数', operating.days], ['员工人数', operating.staffCount],
    ['原运营费用设置', '计入口径', '用量系数或原期间总量', '单位', '单价元', '是否计入', '税口径', '税率百分比', '来源', '范围'],
    ...operating.items.map(item => [item.label, item.basis, item.quantity, item.unit, item.unitPrice ?? '待填写', item.included ? '计入' : '不计入', item.taxMode, item.taxRate ?? '待核实', item.evidence.name, item.evidence.scope]),
    ['经营缺项', result.missingItems.join('；') || '无'], ['核实提醒', result.reviewItems.join('；')],
    ['回本口径', '初始投资÷年度经营现金结余；全年恒定情景，忽略融资、折旧、资金时间价值及逐年变化。'],
  ]
  rows.push(['入住率情景对比','入住率百分比','年营业收入元','年经营现金结余元','静态回本年数','投资范围'])
  for(const scenario of getEarningsScenarios(project)){
    const year=scenario.estimate.periods.find(p=>p.id==='year')!
    rows.push([scenario.label,scenario.occupancyRate,year.totalRevenue??'待补齐',year.cashSurplus??'待补齐',scenario.estimate.paybackYears??'未形成有限回本',scenario.estimate.investmentIncomplete?'已计投资暂估':'按所填投资范围'])
  }
  rows.push(['情景说明','当前入住率上下10个百分点，限制在0%至100%；只作临时对比，不覆盖保存参数。'])
  const cell = (value: string | number) => {
    const raw = String(value), safe = typeof value === 'string' && (/^[=+\-@\t\r\n]/.test(raw) || /^\s+[=+\-@]/.test(raw)) ? "'" + raw : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  const annual='\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n')
  return project.monthlyPlan?annual+'\r\n'+buildMonthlyPlanCSV(project).replace(/^\uFEFF/,''):annual
}
