import type { CombinedEstimate, OperatingBasis, OperatingEstimate, OperatingItem, OperatingSettings, Project, TaxMode } from './types'
import { estimateProject, validatePriceEvidence } from './pricing'

const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100

const sampleItem = (id: string, label: string, basis: OperatingBasis, quantity: number, unit: string, unitPrice: number | null): OperatingItem => ({
  id, label, included: true, basis, quantity, unit, unitPrice, taxMode: 'unknown',
  evidence: { kind: 'assumption', name: '内部示例，待询价', scope: `${label}的采购与消耗成本假设；用量、单价及税口径均需按项目核实` },
})

/** Defaults are a preview, never an implicit update to an existing saved project. */
export function getOperatingSettings(project: Project): OperatingSettings {
  if (project.operating) return structuredClone(project.operating)
  return {
    enabled: false, days: 30, guestMode: 'rooms', occupancyRate: 70, guestsPerRoom: 2, dailyGuests: 0, staffCount: 0,
    items: [
      sampleItem('drinking-water', '饮用水', 'personDay', 2, '瓶', 2),
      sampleItem('guest-breakfast', '宾客早餐', 'guestDay', 1, '餐', 20),
      sampleItem('guest-lunch', '宾客午餐', 'guestDay', 1, '餐', 35),
      sampleItem('guest-dinner', '宾客晚餐', 'guestDay', 1, '餐', 35),
      sampleItem('guest-tea', '宾客茶饮', 'guestDay', 1, '份', 3),
      sampleItem('guest-snacks', '宾客水果零食', 'guestDay', 1, '份', 10),
      sampleItem('room-toiletries', '洗漱用品', 'roomDay', 1, '套', 8),
      sampleItem('room-linen', '布草洗涤', 'roomDay', 1, '次', 6),
      sampleItem('room-cleaning', '清洁耗材', 'roomDay', 1, '套', 3),
      sampleItem('staff-meals', '员工餐', 'staffDay', 2, '餐', 20),
      sampleItem('staff-wages', '员工工资', 'period', 1, '项', null),
      sampleItem('utilities', '水电燃气', 'period', 1, '项', null),
    ],
  }
}

export function estimateOperating(project: Project): OperatingEstimate {
  const settings = getOperatingSettings(project)
  const roomCount = project.facilities.reduce((count, facility) => count + (facility.type === 'hotel' ? facility.rooms : 0), 0)
  const occupiedRooms = roomCount * settings.occupancyRate / 100
  const averageGuests = settings.guestMode === 'rooms' ? occupiedRooms * settings.guestsPerRoom : settings.dailyGuests
  const averageStaff = settings.staffCount, averagePeople = averageGuests + averageStaff
  const guestDays = averageGuests * settings.days, staffDays = averageStaff * settings.days
  const personDays = averagePeople * settings.days, roomNights = occupiedRooms * settings.days
  const bases: Record<OperatingBasis, number> = { guestDay: guestDays, staffDay: staffDays, personDay: personDays, roomDay: roomNights, day: settings.days, period: 1, manual: 1 }
  const rows = settings.items.map(item => {
    const baseQuantity = bases[item.basis], quantity = baseQuantity * item.quantity
    const active = settings.enabled && item.included && quantity > 0
    const preTax = item.unitPrice === null ? null : quantity * item.unitPrice
    const factor = item.taxMode === 'excluded' && item.taxRate !== undefined ? 1 + item.taxRate / 100 : 1
    const amount = !item.included || quantity === 0 ? 0 : preTax === null ? null : money(preTax * factor)
    const taxAmount = amount === null || preTax === null || !item.included ? 0 : money(amount - money(preTax))
    const taxUnresolved = active && item.unitPrice !== null && (item.taxMode === 'unknown' || (item.taxMode === 'excluded' && item.taxRate === undefined))
    return { id: item.id, label: item.label, included: item.included, basis: item.basis, baseQuantity, quantity, unit: item.unit, unitPrice: item.unitPrice, amount, taxAmount, taxUnresolved, evidence: item.evidence }
  })
  const activeRows = settings.enabled ? rows.filter(row => row.included && row.quantity > 0) : []
  const total = money(activeRows.reduce((sum, row) => sum + (row.amount ?? 0), 0))
  return { enabled: settings.enabled, days: settings.days, averageGuests, averageStaff, averagePeople, occupiedRooms, guestDays, staffDays, personDays, roomNights, rows, total, perDay: money(total / settings.days), unpricedItems: activeRows.filter(row => row.amount === null).map(row => row.label), taxUnresolvedItems: activeRows.filter(row => row.taxUnresolved).map(row => row.label), assumedRows: activeRows.filter(row => row.evidence.kind === 'assumption').length }
}

/** Operating consumption does not participate in construction fees or reserve. */
export function estimateCombinedBudget(project: Project): CombinedEstimate {
  const construction = estimateProject(project).total, operating = estimateOperating(project)
  return { construction, operating, total: { low: money(construction.low + operating.total), point: money(construction.point + operating.total), high: money(construction.high + operating.total) } }
}

function invalid(label: string): never { throw new Error(`方案文件无效：${label}`) }
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${label} 必须为对象`)
  const data = value as Record<string, unknown>
  if (Object.keys(data).some(key => !allowed.includes(key))) invalid(`${label} 含未知字段`)
  return data
}
function text(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${label} 文本格式错误`)
  return value
}
function numeric(value: unknown, label: string, min: number, max: number, integer = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) invalid(`${label} 数值超出范围`)
  return value
}
function boolean(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') invalid(`${label} 必须为布尔值`)
  return value
}
function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid(`${label} 选项错误`)
  return value as T
}

/** Strict schema used both by imports and editing, rejecting invalid data before save. */
export function validateOperatingSettings(value: unknown): OperatingSettings {
  const data = object(value, ['enabled', 'days', 'guestMode', 'occupancyRate', 'guestsPerRoom', 'dailyGuests', 'staffCount', 'items'], '运营预算')
  if (!Array.isArray(data.items) || data.items.length > 30) invalid('运营费用列表必须为 0 至 30 项')
  const ids = new Set<string>()
  const items = data.items.map(value => {
    const item = object(value, ['id', 'label', 'included', 'basis', 'quantity', 'unit', 'unitPrice', 'taxMode', 'taxRate', 'evidence'], '运营费用项')
    const id = text(item.id, '运营费用 ID', 120)
    if (ids.has(id)) invalid('运营费用 ID 重复')
    ids.add(id)
    return {
      id, label: text(item.label, '运营费用名称', 120), included: boolean(item.included, '是否计入费用'),
      basis: choice<OperatingBasis>(item.basis, ['guestDay', 'staffDay', 'personDay', 'roomDay', 'day', 'period', 'manual'], '运营用量口径'),
      quantity: numeric(item.quantity, '运营用量', 0, 1000000), unit: text(item.unit, '运营单位', 20),
      unitPrice: item.unitPrice === null ? null : numeric(item.unitPrice, '运营单价', 0, 1000000),
      taxMode: choice<TaxMode>(item.taxMode, ['included', 'excluded', 'unknown'], '运营税口径'),
      ...(item.taxRate !== undefined ? { taxRate: numeric(item.taxRate, '运营税率', 0, 100) } : {}),
      evidence: validatePriceEvidence(item.evidence),
    }
  })
  return {
    enabled: boolean(data.enabled, '是否启用运营预算'), days: numeric(data.days, '运营天数', 1, 3650, true),
    guestMode: choice(data.guestMode, ['rooms', 'manual'], '宾客人数口径'), occupancyRate: numeric(data.occupancyRate, '入住率', 0, 100),
    guestsPerRoom: numeric(data.guestsPerRoom, '每间平均宾客人数', 0, 10), dailyGuests: numeric(data.dailyGuests, '平均每日宾客人数', 0, 1000000),
    staffCount: numeric(data.staffCount, '员工人数', 0, 100000, true), items,
  }
}
