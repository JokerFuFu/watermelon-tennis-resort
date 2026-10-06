import type { EarningsEstimate, EarningsPeriod, EarningsPeriodId, EarningsSettings, Project, RoomAllocation, RoomType } from './types'
import { getRoomMix, ROOM_TYPES } from './model'
import { estimateOperating, getOperatingSettings } from './operating'
import { estimateProject } from './pricing'

const roomTypes: RoomType[] = ['standard', 'deluxe', 'suite']
const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
const periods: { id: EarningsPeriodId; label: string; days: number }[] = [
  { id: 'day', label: '日', days: 1 }, { id: 'week', label: '周', days: 7 },
  { id: 'month', label: '平均月', days: 365 / 12 }, { id: 'year', label: '年', days: 365 },
]

/** Preview defaults do not add earnings fields to an existing project. */
export function getEarningsSettings(project: Project): EarningsSettings {
  if (project.earnings) return structuredClone(project.earnings)
  const operating = getOperatingSettings(project)
  return {
    roomRates: { standard: 500, deluxe: 700, suite: 1000 }, unavailableRooms: { standard: 0, deluxe: 0, suite: 0 },
    occupancyRate: operating.occupancyRate, guestsPerRoom: operating.guestsPerRoom,
    extraDailyRevenue: 0, extraMonthlyCost: null, revenueDeductionRate: null,
    investmentMode: 'construction', manualInvestment: null,
  }
}

export function estimateEarnings(project: Project): EarningsEstimate {
  const settings = getEarningsSettings(project), operating = getOperatingSettings(project)
  const roomCounts: RoomAllocation = { standard: 0, deluxe: 0, suite: 0 }
  for (const facility of project.facilities) if (facility.type === 'hotel') {
    const mix = getRoomMix(facility)
    for (const key of roomTypes) roomCounts[key] += mix[key]
  }
  const availableRooms: RoomAllocation = { standard: 0, deluxe: 0, suite: 0 }, missingItems: string[] = [], reviewItems: string[] = []
  let knownRoomDaily = 0, roomRateMissing = false
  for (const key of roomTypes) {
    availableRooms[key] = Math.max(0, roomCounts[key] - settings.unavailableRooms[key])
    if (settings.unavailableRooms[key] > roomCounts[key]) missingItems.push(`${ROOM_TYPES[key].label}停用数量超过房型库存`)
    if (availableRooms[key] > 0 && settings.roomRates[key] === null) {
      roomRateMissing = true
      missingItems.push(`${ROOM_TYPES[key].label}每晚房价尚未填写`)
    }
    knownRoomDaily += availableRooms[key] * settings.occupancyRate / 100 * (settings.roomRates[key] ?? 0)
  }
  const totalAvailable = roomTypes.reduce((sum, key) => sum + availableRooms[key], 0)
  if (!operating.enabled) missingItems.push('日常运营预算尚未启用')
  if (settings.extraDailyRevenue === null) missingItems.push('额外每日收入尚未填写')
  if (settings.extraMonthlyCost === null) missingItems.push('额外月支出尚未填写')
  if (settings.revenueDeductionRate === null) missingItems.push('营业额税费及平台费用预留比例尚未填写')

  // estimateOperating only reads hotel room totals. Substitute the available total
  // in a temporary projection rather than changing room inventory or saved costs.
  let roomsAssigned = false
  const facilities = project.facilities.map(facility => {
    if (facility.type !== 'hotel') return { ...facility }
    const rooms = roomsAssigned ? 0 : totalAvailable
    roomsAssigned = true
    return { ...facility, rooms }
  })
  const costFor = (days: number) => estimateOperating({
    ...project, facilities,
    operating: {
      ...operating, enabled: true, days, guestMode: 'rooms', occupancyRate: settings.occupancyRate, guestsPerRoom: settings.guestsPerRoom,
      items: operating.items.map(item => ({ ...item, quantity: item.quantity * (item.basis === 'period' || item.basis === 'manual' ? days / operating.days : 1) })),
    },
  })
  const annualOperating = costFor(365)
  missingItems.push(...annualOperating.unpricedItems.map(label => `${label}运营单价尚未填写`))
  if (!project.earnings || (settings.roomRates.standard === 500 && settings.roomRates.deluxe === 700 && settings.roomRates.suite === 1000)) reviewItems.push('初始房价为内部情景示例，需按项目调整')
  reviewItems.push('入住率、房价及费用按全年恒定情景计算；平均月为 365/12 天')
  if (annualOperating.assumedRows > 0) reviewItems.push(`${annualOperating.assumedRows} 项日常运营费用采用内部示例，待核实`)
  if (annualOperating.taxUnresolvedItems.length) reviewItems.push(`运营税费口径待核实：${annualOperating.taxUnresolvedItems.join('、')}`)
  const complete = missingItems.length === 0
  const resultPeriods: EarningsPeriod[] = periods.map(period => {
    const knownRoomRevenue = money(knownRoomDaily * period.days)
    const roomRevenue = roomRateMissing ? null : knownRoomRevenue
    const otherRevenue = settings.extraDailyRevenue === null ? null : money(settings.extraDailyRevenue * period.days)
    const knownRevenue = money(knownRoomRevenue + (otherRevenue ?? 0))
    const totalRevenue = roomRevenue === null || otherRevenue === null ? null : money(roomRevenue + otherRevenue)
    const operatingCost = costFor(period.days).total
    const extraCost = settings.extraMonthlyCost === null ? null : money(settings.extraMonthlyCost * 12 / 365 * period.days)
    const deductions = settings.revenueDeductionRate === null || totalRevenue === null ? null : money(totalRevenue * settings.revenueDeductionRate / 100)
    // Incomplete room revenue must not cause known platform costs to disappear.
    const knownDeductions = settings.revenueDeductionRate === null ? 0 : money(knownRevenue * settings.revenueDeductionRate / 100)
    const knownCosts = money(operatingCost + (extraCost ?? 0) + knownDeductions)
    const knownSurplus = money(knownRevenue - knownCosts)
    return { ...period, roomRevenue, otherRevenue, totalRevenue, knownRevenue, operatingCost, extraCost, deductions, knownCosts, knownSurplus, cashSurplus: complete ? knownSurplus : null }
  })
  const construction = estimateProject(project)
  const investment = settings.investmentMode === 'manual' ? settings.manualInvestment : construction.total.point
  const investmentMissing = construction.missingItems.filter(label => !label.includes('税'))
  const investmentIncomplete = settings.investmentMode === 'construction' && investmentMissing.length > 0
  if (settings.investmentMode === 'construction') {
    if (investmentMissing.length) reviewItems.push(`初始建设投资暂估，尚缺：${investmentMissing.join('、')}`)
    const constructionTax = construction.missingItems.filter(label => label.includes('税'))
    if (constructionTax.length) reviewItems.push(`建设税费口径待核实：${constructionTax.join('、')}`)
    if (construction.assumedRows > 0) reviewItems.push('建设投资包含规划假设单价，需按完整工程报价核实')
  }
  const year = resultPeriods.find(period => period.id === 'year')!
  const paybackStatus = investment === null || investment <= 0 ? 'no-investment' : year.cashSurplus === null ? 'incomplete' : year.cashSurplus <= 0 ? 'nonpositive' : 'ready'
  const paybackYears = paybackStatus === 'ready' ? investment! / year.cashSurplus! : null
  const costBasis = { guestDay: '宾客人天', staffDay: '员工人天', personDay: '宾客及员工人天', roomDay: '入住房晚', day: '营业天数', period: `原 ${operating.days} 天期间费用均摊`, manual: `原 ${operating.days} 天手填总量均摊` }
  const costItems = annualOperating.rows.filter(row => row.included).map(row => ({ id: row.id, label: row.label, annualAmount: row.amount, basis: costBasis[row.basis] }))
  costItems.push({ id: 'earnings-extra-cost', label: '额外支出', annualAmount: year.extraCost, basis: '额外月支出 × 12' })
  costItems.push({ id: 'earnings-deductions', label: '营业额税费及平台费用预留', annualAmount: year.deductions, basis: '全年总收入 × 预留比例' })
  return { settings, roomCounts, availableRooms, occupiedRooms: totalAvailable * settings.occupancyRate / 100, periods: resultPeriods, investment, investmentIncomplete, paybackYears, paybackStatus, missingItems, reviewItems, costItems }
}

function invalid(label: string): never { throw new Error(`方案文件无效：${label}`) }
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${label} 必须为对象`)
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !allowed.includes(key))) invalid(`${label} 含未知字段`)
  return data
}
function numeric(value: unknown, label: string, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) invalid(`${label} 数值超出范围`)
  return value
}
function nullable(value: unknown, label: string, max: number): number | null { return value === null ? null : numeric(value, label, max) }

export function validateEarningsSettings(value: unknown): EarningsSettings {
  const data = object(value, ['roomRates', 'unavailableRooms', 'occupancyRate', 'guestsPerRoom', 'extraDailyRevenue', 'extraMonthlyCost', 'revenueDeductionRate', 'investmentMode', 'manualInvestment'], '收益设置')
  const rates = object(data.roomRates, roomTypes, '房型价格'), unavailable = object(data.unavailableRooms, roomTypes, '停用客房')
  const roomRates = {} as EarningsSettings['roomRates'], unavailableRooms = {} as RoomAllocation
  for (const key of roomTypes) {
    roomRates[key] = nullable(rates[key], `${ROOM_TYPES[key].label}房价`, 1000000)
    unavailableRooms[key] = numeric(unavailable[key], `${ROOM_TYPES[key].label}停用数量`, 100000, true)
  }
  if (data.investmentMode !== 'construction' && data.investmentMode !== 'manual') invalid('投资来源选项错误')
  return { roomRates, unavailableRooms, occupancyRate: numeric(data.occupancyRate, '收益入住率', 100), guestsPerRoom: numeric(data.guestsPerRoom, '收益每间人数', 10),
    extraDailyRevenue: nullable(data.extraDailyRevenue, '额外每日收入', 1000000), extraMonthlyCost: nullable(data.extraMonthlyCost, '额外月支出', 1000000),
    revenueDeductionRate: nullable(data.revenueDeductionRate, '营业额费用预留比例', 100), investmentMode: data.investmentMode,
    manualInvestment: nullable(data.manualInvestment, '手填初始投资', 1000000000000) }
}
