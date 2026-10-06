import type { FacilityBusinessItem, FacilityBusinessUnit, MonthlyPlanEntry, MonthlyPlanEstimate, MonthlyPlanResult, MonthlyPlanSettings, Project, RoomType } from './types'
import { getEarningsSettings } from './earnings'
import { getRoomMix, ROOM_TYPES } from './model'
import { getOperatingSettings, estimateOperating } from './operating'
import { estimateProject, validatePriceEvidence } from './pricing'

const roomTypes: RoomType[] = ['standard', 'deluxe', 'suite']
const units: FacilityBusinessUnit[] = ['hour', 'ticket', 'roomHour', 'session', 'parkingDay', 'serving', 'time']
const unitLabels: Record<FacilityBusinessUnit, string> = { hour: '小时', ticket: '张票', roomHour: '包厢小时', session: '场次', parkingDay: '车天', serving: '份', time: '次' }
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
function monthAt(start: string, offset: number): string {
  const [year, month] = start.split('-').map(Number), serial = year * 12 + month - 1 + offset
  return `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(2, '0')}`
}
export function calendarDays(month: string): number {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('月份必须为 YYYY-MM')
  const [year, number] = month.split('-').map(Number)
  return number === 2 ? (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28) : [4, 6, 9, 11].includes(number) ? 30 : 31
}
function currentMonth(): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find(part => part.type === 'year')!.value}-${parts.find(part => part.type === 'month')!.value}`
}
/** Old projects receive a detached preview; no field is injected into saved data. */
export function getMonthlyPlan(project: Project): MonthlyPlanSettings {
  if (project.monthlyPlan) return structuredClone(project.monthlyPlan)
  const earnings = getEarningsSettings(project), startMonth = currentMonth()
  return { enabled: false, startMonth, horizonYears: 30, facilityItems: [], months: Array.from({ length: 12 }, (_, index) => {
    const month = monthAt(startMonth, index)
    return { month, openDays: calendarDays(month), occupancyRate: earnings.occupancyRate, roomRates: { ...earnings.roomRates }, extraDailyRevenue: earnings.extraDailyRevenue, extraFixedCost: earnings.extraMonthlyCost }
  }) }
}
export function setMonthlyStartMonth(plan: MonthlyPlanSettings, startMonth: string): MonthlyPlanSettings {
  const copy = structuredClone(plan)
  copy.startMonth = startMonth
  copy.months = copy.months.map((entry, index) => {
    const month = monthAt(startMonth, index)
    return { ...entry, month, openDays: Math.min(entry.openDays, calendarDays(month)) }
  })
  return validateMonthlyPlanSettings(copy)
}
export function createFacilityBusinessItem(project: Project, facilityId: string): FacilityBusinessItem {
  const facility = project.facilities.find(item => item.id === facilityId)
  if (!facility || facility.type === 'hotel') throw new Error('请添加场地中的非客房设施收费项目')
  if (project.monthlyPlan?.facilityItems.some(item => item.facilityId === facilityId)) throw new Error('该设施已有收费项目')
  const preset = facility.presetId ?? facility.type
  const roomHourly = ['card-room', 'mahjong-room', 'karaoke', 'board-game-room', 'tea-lounge'].includes(preset)
  const hourly = facility.type === 'court' || ['basketball', 'pickleball', 'beach-volleyball', 'table-tennis', 'billiards-room'].includes(preset)
  const serving = ['restaurant', 'coffee', 'bar', 'bbq', 'sports-shop'].includes(preset)
  const session = ['auction-hall', 'conference', 'banquet', 'outdoor-cinema'].includes(preset)
  const unit: FacilityBusinessUnit = facility.type === 'parking' ? 'parkingDay' : roomHourly ? 'roomHour' : hourly ? 'hour' : serving ? 'serving' : session ? 'session' : 'ticket'
  return { id: crypto.randomUUID(), facilityId, label: facility.name, included: true, unit, capacityPerDay: hourly || roomHourly ? 8 : serving || facility.type === 'parking' ? 4 : 1,
    utilizationRates: Array(12).fill(50), unitPrice: null, directUnitCost: null, fixedMonthlyCost: null,
    evidence: { kind: 'assumption', name: '内部经营草案，待填写', scope: '每日容量和利用率仅为示例；收费价格、直接成本与固定费用待填写并核实，避免与酒店日常费用重复' } }
}

export function estimateMonthlyPlan(project: Project): MonthlyPlanEstimate {
  const settings = getMonthlyPlan(project), earnings = getEarningsSettings(project), operating = getOperatingSettings(project)
  const counts = { standard: 0, deluxe: 0, suite: 0 }, available = { ...counts }, commonMissing: string[] = [], reviewItems: string[] = []
  for (const facility of project.facilities) if (facility.type === 'hotel') {
    const mix = getRoomMix(facility)
    for (const key of roomTypes) counts[key] += mix[key]
  }
  for (const key of roomTypes) {
    available[key] = Math.max(0, counts[key] - earnings.unavailableRooms[key])
    if (earnings.unavailableRooms[key] > counts[key]) commonMissing.push(`${ROOM_TYPES[key].label}停用数量超过房型库存`)
  }
  if (!operating.enabled) commonMissing.push('日常运营预算尚未启用')
  if (earnings.revenueDeductionRate === null) commonMissing.push('营业额税费及平台费用预留比例尚未填写')
  const totalRooms = roomTypes.reduce((total, key) => total + available[key], 0)
  let assigned = false
  const facilities = project.facilities.map(facility => {
    if (facility.type !== 'hotel') return { ...facility }
    const rooms = assigned ? 0 : totalRooms
    assigned = true
    return { ...facility, rooms }
  })
  const costFor = (entry: MonthlyPlanEntry, days: number, fixed: boolean) => estimateOperating({ ...project, facilities,
    operating: { ...operating, enabled: true, days, guestMode: 'rooms', occupancyRate: entry.occupancyRate, guestsPerRoom: earnings.guestsPerRoom,
      items: operating.items.filter(item => (item.basis === 'period' || item.basis === 'manual') === fixed).map(item => ({ ...item, quantity: item.quantity * (fixed ? days / operating.days : 1) })) } })
  const construction = estimateProject(project), investment = earnings.investmentMode === 'manual' ? earnings.manualInvestment : construction.total.point
  const constructionMissing = construction.missingItems.filter(label => !label.includes('税'))
  const investmentIncomplete = earnings.investmentMode === 'construction' && constructionMissing.length > 0
  if (investmentIncomplete) reviewItems.push(`初始建设投资暂估，尚缺：${constructionMissing.join('、')}`)
  if (earnings.investmentMode === 'construction' && construction.assumedRows > 0) reviewItems.push('初始建设投资包含规划假设单价，待按完整工程报价核实')
  if (earnings.investmentMode === 'construction' && construction.missingItems.some(label => label.includes('税'))) reviewItems.push('建设投资税费口径待核实')
  if (!project.monthlyPlan) reviewItems.push('起始月份及房价来自内部草案，可按实际经营计划调整')
  reviewItems.push('循环重复这 12 个月的经营参数，未来月份按自然月天数重算；当月收支均匀发生的假设用于回本年数插值', '设施直接成本与其他收入应排除已在日常费用及独立收费中计算的部分')
  if (settings.facilityItems.some(item => item.included && item.evidence.kind === 'assumption')) reviewItems.push('部分设施收费与容量采用内部经营草案，待核实')
  const cache = new Map<string, MonthlyPlanResult>()
  let assumedOperating = false, taxUnresolved = false
  const compute = (entry: MonthlyPlanEntry, index: number, days: number): MonthlyPlanResult => {
    const cacheKey = `${index}-${days}`, existing = cache.get(cacheKey)
    if (existing) return structuredClone(existing)
    const openDays = Math.min(entry.openDays, days), missingItems = [...commonMissing]
    let knownRoom = 0, roomMissing = false
    for (const key of roomTypes) {
      if (available[key] * entry.occupancyRate * openDays > 0 && entry.roomRates[key] === null) {
        roomMissing = true; missingItems.push(`${ROOM_TYPES[key].label}每晚房价尚未填写`)
      }
      knownRoom += money(available[key] * entry.occupancyRate / 100 * (entry.roomRates[key] ?? 0) * openDays)
    }
    const roomRevenue = roomMissing ? null : money(knownRoom)
    const otherRevenue = openDays === 0 ? 0 : entry.extraDailyRevenue === null ? null : money(entry.extraDailyRevenue * openDays)
    if (otherRevenue === null) missingItems.push('其他每日收入尚未填写')
    const facilityRows = settings.facilityItems.filter(item => item.included).map(item => {
      const facility = project.facilities.find(facility => facility.id === item.facilityId), valid = facility && facility.type !== 'hotel'
      const label = item.label, quantity = valid ? item.capacityPerDay * item.utilizationRates[index] / 100 * openDays : 0
      if (!valid) missingItems.push(`${label}绑定的非客房设施不存在`)
      const revenue = !valid || quantity === 0 ? 0 : item.unitPrice === null ? null : money(quantity * item.unitPrice)
      const variableCost = !valid || quantity === 0 ? 0 : item.directUnitCost === null ? null : money(quantity * item.directUnitCost)
      const fixedCost = !valid ? 0 : item.fixedMonthlyCost === null ? null : money(item.fixedMonthlyCost)
      if (valid && revenue === null) missingItems.push(`${label}收费单价尚未填写`)
      if (valid && variableCost === null) missingItems.push(`${label}直接单位成本尚未填写`)
      if (valid && fixedCost === null) missingItems.push(`${label}每月固定成本尚未填写`)
      const knownCost = money((variableCost ?? 0) + (fixedCost ?? 0))
      return { id: item.id, facilityId: item.facilityId, label, unit: unitLabels[item.unit], quantity, revenue, directCost: variableCost === null || fixedCost === null ? null : knownCost, knownRevenue: revenue ?? 0, knownCost }
    })
    const knownFacility = money(facilityRows.reduce((sum, row) => sum + row.knownRevenue, 0)), facilityCost = money(facilityRows.reduce((sum, row) => sum + row.knownCost, 0))
    const facilityRevenue = facilityRows.some(row => row.revenue === null) ? null : knownFacility
    const knownRevenue = money(knownRoom + knownFacility + (otherRevenue ?? 0))
    const totalRevenue = roomRevenue === null || facilityRevenue === null || otherRevenue === null ? null : knownRevenue
    const variable = costFor(entry, openDays, false), fixed = costFor(entry, days, true)
    missingItems.push(...[...variable.unpricedItems, ...fixed.unpricedItems].map(label => `${label}运营单价尚未填写`))
    assumedOperating ||= variable.assumedRows + fixed.assumedRows > 0
    taxUnresolved ||= variable.taxUnresolvedItems.length + fixed.taxUnresolvedItems.length > 0
    const operatingCost = money(variable.total + fixed.total), extraCost = entry.extraFixedCost === null ? null : money(entry.extraFixedCost)
    if (extraCost === null) missingItems.push('额外固定月支出尚未填写')
    const deductions = earnings.revenueDeductionRate === null || totalRevenue === null ? null : money(totalRevenue * earnings.revenueDeductionRate / 100)
    const knownDeductions = earnings.revenueDeductionRate === null ? 0 : money(knownRevenue * earnings.revenueDeductionRate / 100)
    const knownCosts = money(operatingCost + facilityCost + (extraCost ?? 0) + knownDeductions), knownSurplus = money(knownRevenue - knownCosts)
    const row: MonthlyPlanResult = { month: entry.month, calendarDays: days, openDays, occupancyRate: entry.occupancyRate, roomRevenue, facilityRevenue, otherRevenue, totalRevenue, knownRevenue, operatingCost, facilityCost, extraCost, deductions, knownCosts, knownSurplus, cashSurplus: missingItems.length ? null : knownSurplus, cumulativeCash: null, remainingInvestment: null, facilityRows, missingItems: [...new Set(missingItems)] }
    cache.set(cacheKey, row)
    return structuredClone(row)
  }
  let cumulative: number | null = 0, paybackMonth: string | null = null, paybackYears: number | null = null
  const forecast = Array.from({ length: settings.horizonYears * 12 }, (_, index) => {
    const month = monthAt(settings.startMonth, index), result = compute(settings.months[index % 12], index % 12, calendarDays(month)), previous = cumulative
    result.month = month
    cumulative = cumulative === null || result.cashSurplus === null ? null : money(cumulative + result.cashSurplus)
    result.cumulativeCash = cumulative
    result.remainingInvestment = cumulative === null || investment === null ? null : money(Math.max(0, investment - cumulative))
    if (paybackMonth === null && investment !== null && investment > 0 && previous !== null && cumulative !== null && cumulative >= investment && result.cashSurplus! > 0) {
      paybackMonth = month; paybackYears = (index + (investment - previous) / result.cashSurplus!) / 12
    }
    return result
  })
  const months = forecast.slice(0, 12), operatingComplete = forecast.every(month => month.cashSurplus !== null)
  const paybackStatus: MonthlyPlanEstimate['paybackStatus'] = investment === null || investment <= 0 ? 'no-investment' : !operatingComplete ? 'incomplete' : paybackMonth ? 'ready' : 'not-recovered'
  if (paybackStatus !== 'ready') { paybackMonth = null; paybackYears = null }
  if (paybackMonth && forecast.some(month => month.month > paybackMonth! && month.cumulativeCash !== null && month.cumulativeCash < investment!)) reviewItems.push('首次回本后累计现金可能再次低于初始投资，请同时查看完整现金曲线')
  if (assumedOperating) reviewItems.push('部分日常运营成本为内部示例，待核实')
  if (taxUnresolved) reviewItems.push('日常运营费用税口径待核实')
  const missingItems = [...new Set(months.flatMap(month => month.missingItems.map(label => `${month.month}：${label}`)))]
  return { settings, enabled: settings.enabled, months, forecast, investment, investmentIncomplete, paybackStatus, paybackMonth, paybackYears,
    annualRevenue: months.some(month => month.totalRevenue === null) ? null : money(months.reduce((sum, month) => sum + month.totalRevenue!, 0)),
    annualKnownRevenue: money(months.reduce((sum, month) => sum + month.knownRevenue, 0)), annualKnownCosts: money(months.reduce((sum, month) => sum + month.knownCosts, 0)),
    annualCash: months.some(month => month.cashSurplus === null) ? null : money(months.reduce((sum, month) => sum + month.cashSurplus!, 0)), missingItems, reviewItems }
}

function invalid(label: string): never { throw new Error(`方案文件无效：${label}`) }
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${label} 必须为对象`)
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !allowed.includes(key))) invalid(`${label} 含未知字段`)
  return data
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 120) invalid(`${label} 文本格式错误`)
  return value
}
function numeric(value: unknown, label: string, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max || (integer && !Number.isInteger(value))) invalid(`${label} 数值超出范围`)
  return value
}
function nullable(value: unknown, label: string, max = 1000000): number | null { return value === null ? null : numeric(value, label, max) }
function bool(value: unknown, label: string): boolean { if (typeof value !== 'boolean') invalid(`${label} 必须为布尔值`); return value }
function checkedMonth(value: unknown): string {
  if (typeof value !== 'string' || !/^(20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(value)) invalid('月份必须为 2000 至 2200 年的 YYYY-MM')
  return value
}
export function validateMonthlyPlanSettings(value: unknown): MonthlyPlanSettings {
  const data = object(value, ['enabled', 'startMonth', 'horizonYears', 'months', 'facilityItems'], '月度经营计划'), startMonth = checkedMonth(data.startMonth)
  if (!Array.isArray(data.months) || data.months.length !== 12) invalid('经营月份必须为连续 12 个月')
  const months = data.months.map((value, index) => {
    const entry = object(value, ['month', 'openDays', 'occupancyRate', 'roomRates', 'extraDailyRevenue', 'extraFixedCost'], '经营月份'), month = monthAt(startMonth,index)
    if (entry.month !== month) invalid('经营月份必须从起始月连续排列')
    const rates = object(entry.roomRates, roomTypes, '每月房价'), roomRates = {} as MonthlyPlanEntry['roomRates']
    for (const key of roomTypes) roomRates[key] = nullable(rates[key], `${ROOM_TYPES[key].label}月度房价`)
    return { month, roomRates, openDays: numeric(entry.openDays, '月营业天数', calendarDays(month), true), occupancyRate: numeric(entry.occupancyRate, '月入住率', 100), extraDailyRevenue: nullable(entry.extraDailyRevenue, '其他每日收入'), extraFixedCost: nullable(entry.extraFixedCost, '额外固定月支出') }
  })
  if (!Array.isArray(data.facilityItems) || data.facilityItems.length > 200) invalid('设施收费项必须为 0 至 200 项')
  const ids = new Set<string>(), facilityIds = new Set<string>()
  const facilityItems = data.facilityItems.map(value => {
    const item = object(value, ['id', 'facilityId', 'label', 'included', 'unit', 'capacityPerDay', 'utilizationRates', 'unitPrice', 'directUnitCost', 'fixedMonthlyCost', 'evidence'], '设施收费项'), id = text(item.id, '收费 ID'), facilityId = text(item.facilityId, '绑定设施 ID')
    if (ids.has(id) || facilityIds.has(facilityId)) invalid('收费 ID 或绑定设施重复')
    ids.add(id); facilityIds.add(facilityId)
    if (typeof item.unit !== 'string' || !units.includes(item.unit as FacilityBusinessUnit)) invalid('设施收费单位无效')
    if (!Array.isArray(item.utilizationRates) || item.utilizationRates.length !== 12) invalid('设施利用率必须为 12 个月')
    return { id, facilityId, label: text(item.label, '收费名称'), included: bool(item.included, '是否计入收费'), unit: item.unit as FacilityBusinessUnit, capacityPerDay: numeric(item.capacityPerDay, '每日可售总单位', 1000000), utilizationRates: item.utilizationRates.map(rate => numeric(rate, '设施月利用率', 100)), unitPrice: nullable(item.unitPrice, '设施收费单价'), directUnitCost: nullable(item.directUnitCost, '设施直接单位成本'), fixedMonthlyCost: nullable(item.fixedMonthlyCost, '设施每月固定成本'), evidence: validatePriceEvidence(item.evidence) }
  })
  const horizonYears = numeric(data.horizonYears, '预测年数', 60, true)
  if (horizonYears < 1) invalid('预测年数至少为 1')
  return { enabled: bool(data.enabled, '是否启用月度计划'), startMonth, horizonYears, months, facilityItems }
}
