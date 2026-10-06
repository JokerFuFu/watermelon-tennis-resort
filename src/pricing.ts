import { estimateMaterialPurchase } from './materials'
import type { BudgetSettings, Facility, FacilityEstimate, FacilityPricing, PriceBreakdown, PriceEvidence, PriceItem, PricingBasis, Project, ProjectEstimate, TaxMode } from './types'

const money = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100
const sum = (values: number[]) => money(values.reduce((total, amount) => total + amount, 0))
const legacyCost = (f: Facility) => f.type === 'court' ? f.unitCost : f.width * f.depth * (f.type === 'hotel' || f.type === 'restaurant' ? f.floors : 1) * f.unitCost

export function getBudgetSettings(project: Project): BudgetSettings {
  return { construction: 'new', grade: 'standard', designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: null, siteAmount: null, connectionAmount: null, openingAmount: null, ...project.budget }
}

function quantity(f: Facility, item: Pick<PriceItem, 'basis' | 'quantity' | 'unit'>): { quantity: number; unit: string } {
  switch (item.basis) {
    case 'grossArea': return { quantity: f.width * f.depth * (f.type === 'hotel' || f.type === 'restaurant' ? f.floors : 1), unit: '㎡' }
    case 'footprint': return { quantity: f.width * f.depth, unit: '㎡' }
    case 'rooms': return { quantity: f.rooms, unit: '间' }
    case 'perimeter': return { quantity: 2 * (f.width + f.depth), unit: 'm' }
    case 'count': return { quantity: 1, unit: '项' }
    case 'manual': return { quantity: item.quantity ?? 0, unit: item.unit ?? '项' }
  }
}

export function createFacilityPricing(f: Facility): FacilityPricing {
  const baseline = legacyCost(f)
  let allocated = 0, remainingShare = 1
  const create = (label: string, basis: PricingBasis, share: number, manualQuantity = 1, unit = '项'): PriceItem => {
    // Allocate cents before deriving full-precision rates; final component takes the remainder.
    remainingShare -= share
    const amount = Math.abs(remainingShare) < 1e-9 ? money(money(baseline) - allocated) : money(baseline * share)
    allocated = money(allocated + amount)
    const input = { basis, ...(basis === 'manual' ? { quantity: Math.max(manualQuantity, Math.ceil(amount * 1.3 / 100000000)), unit } : {}) }
    const count = quantity(f, input).quantity
    if (count <= 0 && amount > 0) throw new Error('设施尺寸过小，无法按工程量生成分项；请调整尺寸或录入供应商总报价')
    const unitPrice = count > 0 ? amount / count : 0
    return {
      id: crypto.randomUUID(), label, ...input, unitPrice, lowUnitPrice: unitPrice * 0.75, highUnitPrice: unitPrice * 1.3,
      taxMode: 'unknown', evidence: { kind: 'assumption', name: '原综合价拆分（待询价）', scope: `${label}：原综合预算的 ${Math.round(share * 100)}%，仅为可调整的规划假设；税费口径待核实` },
    }
  }
  let items: PriceItem[]
  if (f.type === 'hotel' || f.type === 'restaurant') {
    items = [create('土建工程', 'grossArea', 0.4), create('装修工程', 'grossArea', 0.28), create('机电安装', 'grossArea', 0.18), create('家具与设备', f.type === 'hotel' && f.rooms > 0 ? 'rooms' : 'manual', 0.14)]
  } else if (f.type === 'court') {
    items = [create('场地基础与排水', 'footprint', 0.45), create('运动面层', 'footprint', 0.25), create('围网工程', 'perimeter', 0.18), create('照明设备', 'manual', 0.12, 4, '组')]
  } else {
    items = [create(f.type === 'pool' ? '池体与基础' : '场地基础', 'footprint', 0.45), create(f.type === 'pool' ? '防水与池面' : '面层与铺装', 'footprint', 0.25), create(f.type === 'pool' ? '水处理与配套设备' : '配套设备与布置', 'manual', 0.3)]
  }
  return validateFacilityPricing({ mode: 'items', items })
}

function tax(mode: TaxMode, rate?: number): { factor: number; unresolved: boolean } {
  return { factor: mode === 'excluded' && rate !== undefined ? 1 + rate / 100 : 1, unresolved: mode === 'unknown' || (mode === 'excluded' && rate === undefined) }
}
function stale(date: string | undefined, now: Date): boolean {
  return !!date && now.getTime() - Date.parse(`${date}T00:00:00Z`) > 90 * 86400000
}

export function estimateFacility(f: Facility, now = new Date()): FacilityEstimate {
  const pricing = f.pricing
  if (!pricing) {
    const point = legacyCost(f)
    const basis: PricingBasis = f.type === 'court' ? 'count' : f.type === 'hotel' || f.type === 'restaurant' ? 'grossArea' : 'footprint'
    const measure = quantity(f, { basis })
    return { source: 'legacy', point, low: point * 0.75, high: point * 1.3, taxUnresolved: true, assumedRows: 1, quotedRows: 0, staleQuote: false, rows: [{ id: 'legacy', label: '原综合预算', ...measure, unitPrice: f.unitCost, amount: point, low: point * 0.75, high: point * 1.3, taxAmount: 0, taxUnresolved: true, evidence: { kind: 'assumption', name: '现有可编辑综合价', scope: '保留原价；来源、工程范围及税口径待核实' } }] }
  }
  if (pricing.mode === 'quotation') {
    if (!pricing.quote) throw new Error('供应商总报价缺失')
    const quote = pricing.quote
    const taxInfo = tax(quote.taxMode, quote.taxRate)
    const point = money(quote.amount * taxInfo.factor)
    const evidence: PriceEvidence = { kind: 'quotation', name: quote.supplier, date: quote.date, scope: quote.scope, ...(quote.url ? { url: quote.url } : {}) }
    return { source: 'quotation', point, low: point, high: point, taxUnresolved: taxInfo.unresolved, assumedRows: 0, quotedRows: 1, staleQuote: stale(quote.date, now), rows: [{ id: 'quotation', label: '供应商总报价（用户录入，未独立核验）', quantity: 1, unit: '项', unitPrice: quote.amount, amount: point, low: point, high: point, taxAmount: money(point - quote.amount), taxUnresolved: taxInfo.unresolved, evidence }] }
  }
  const rows: PriceBreakdown[] = pricing.items.map(item => {
    const measure = quantity(f, item)
    const taxInfo = tax(item.taxMode, item.taxRate)
    const preTax = measure.quantity * item.unitPrice
    const amount = money(preTax * taxInfo.factor)
    return { id: item.id, label: item.label, ...measure, unitPrice: item.unitPrice, amount, low: money(measure.quantity * item.lowUnitPrice * taxInfo.factor), high: money(measure.quantity * item.highUnitPrice * taxInfo.factor), taxAmount: money(amount - preTax), evidence: item.evidence, taxUnresolved: taxInfo.unresolved }
  })
  return { source: 'items', point: sum(rows.map(row => row.amount)), low: sum(rows.map(row => row.low)), high: sum(rows.map(row => row.high)), rows, taxUnresolved: rows.some(row => row.taxUnresolved), assumedRows: rows.filter(row => row.evidence.kind === 'assumption').length, quotedRows: rows.filter(row => row.evidence.kind === 'quotation').length, staleQuote: rows.some(row => row.evidence.kind === 'quotation' && stale(row.evidence.date, now)) }
}

export function estimateProject(project: Project, now = new Date()): ProjectEstimate {
  const estimates = project.facilities.map(f => estimateFacility(f, now))
  const settings = getBudgetSettings(project)
  const materialPurchase=estimateMaterialPurchase(project)
  // Keep legacy engineering totals exactly consistent with calculateMetrics.
  const engineering = { low: estimates.reduce((total, row) => total + row.low, 0), point: estimates.reduce((total, row) => total + row.point, 0), high: estimates.reduce((total, row) => total + row.high, 0) }
  const landAmount = settings.landAmount ?? 0, siteAmount = settings.siteAmount ?? 0, connectionAmount = settings.connectionAmount ?? 0, openingAmount = settings.openingAmount ?? 0
  const compute = (amount: number) => {
    const design = money(amount * settings.designRate / 100), supervision = money(amount * settings.supervisionRate / 100)
    const reserve = money((amount + design + supervision + siteAmount + connectionAmount) * settings.reserveRate / 100)
    return { total: money(amount + design + supervision + reserve + landAmount + siteAmount + connectionAmount + openingAmount), design, supervision, reserve }
  }
  const point = compute(engineering.point)
  const missingItems: string[] = []
  for (const [key, label] of [['landAmount', '土地费用'], ['siteAmount', '场地工程费用'], ['connectionAmount', '市政接入费用'], ['openingAmount', '开办费用']] as const) if (settings[key] === null) missingItems.push(label)
  if (estimates.some(row => row.taxUnresolved)) missingItems.push('部分设施税费口径待核实')
  if(materialPurchase.included&&materialPurchase.unpricedItems.length)missingItems.push('部分建材采购尚未报价')
  if(materialPurchase.included&&materialPurchase.taxUnresolvedItems.length)missingItems.push('部分建材税口径待核实')
  const quotedAmount = estimates.flatMap(row => row.rows).filter(row => row.evidence.kind === 'quotation').reduce((total, row) => total + row.amount, 0)
  return { engineering, total: { low: money(compute(engineering.low).total+materialPurchase.total), point: money(point.total+materialPurchase.total), high: money(compute(engineering.high).total+materialPurchase.total) }, settings, designAmount: point.design, supervisionAmount: point.supervision, reserveAmount: point.reserve, landAmount, siteAmount, connectionAmount, openingAmount, quoteCoverage: engineering.point > 0 ? Math.min(1, quotedAmount / engineering.point) : 0, missingItems, assumedRows: estimates.reduce((total, row) => total + row.assumedRows, 0), staleQuotes: estimates.filter(row => row.staleQuote).length, materialsAmount:materialPurchase.total, materialUnpricedItems:materialPurchase.included?materialPurchase.unpricedItems:[] }
}

function invalid(label: string): never { throw new Error(`方案文件无效：${label}`) }
function object(value: unknown, allowed: string[], label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${label} 必须为对象`)
  const record = value as Record<string, unknown>
  if (Object.keys(record).some(key => !allowed.includes(key))) invalid(`${label} 含未知字段`)
  return record
}
function text(value: unknown, label: string, max = 300): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) invalid(`${label} 文本格式错误`)
  return value
}
function numeric(value: unknown, label: string, max = 100000000): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) invalid(`${label} 数值超出范围`)
  return value
}
function choice<T extends string>(value: unknown, options: readonly T[], label: string): T {
  if (typeof value !== 'string' || !options.includes(value as T)) invalid(`${label} 选项错误`)
  return value as T
}
function date(value: unknown, label: string): string {
  const result = text(value, label, 10)
  const stamp = Date.parse(`${result}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== result) invalid(`${label} 日期格式错误`)
  return result
}
function url(value: unknown): string {
  const result = text(value, '来源网址', 1000)
  let parsed: URL
  try { parsed = new URL(result) } catch { return invalid('来源网址格式错误') }
  if (!['http:', 'https:'].includes(parsed.protocol)) invalid('来源网址仅支持 HTTP 或 HTTPS')
  return result
}
export function validatePriceEvidence(value: unknown): PriceEvidence {
  const data = object(value, ['kind', 'name', 'url', 'date', 'scope'], '价格来源')
  const kind = choice(data.kind, ['assumption', 'reference', 'quotation'], '来源类型')
  if (kind === 'quotation' && data.date === undefined) invalid('用户报价来源必须填写日期')
  return { kind, name: text(data.name, '来源名称'), scope: text(data.scope, '工程范围', 1000), ...(data.url !== undefined ? { url: url(data.url) } : {}), ...(data.date !== undefined ? { date: date(data.date, '来源日期') } : {}) }
}
function taxFields(data: Record<string, unknown>): { taxMode: TaxMode; taxRate?: number } {
  return { taxMode: choice(data.taxMode, ['included', 'excluded', 'unknown'], '税口径'), ...(data.taxRate !== undefined ? { taxRate: numeric(data.taxRate, '税率', 100) } : {}) }
}

/** Validate and copy user/imported prices before saving; throws actionable field errors. */
export function validateFacilityPricing(value: unknown): FacilityPricing {
  const data = object(value, ['mode', 'items', 'quote'], '设施预算')
  const mode = choice(data.mode, ['items', 'quotation'], '计价方式')
  if (!Array.isArray(data.items) || data.items.length > 20 || (mode === 'items' && data.items.length === 0)) invalid('分项工程列表必须为 1 至 20 项；总报价方式可为空')
  const identifiers = new Set<string>()
  const items: PriceItem[] = data.items.map(value => {
    const item = object(value, ['id', 'label', 'basis', 'quantity', 'unit', 'unitPrice', 'lowUnitPrice', 'highUnitPrice', 'taxMode', 'taxRate', 'evidence'], '价格分项')
    const id = text(item.id, '分项 ID', 120)
    if (identifiers.has(id)) invalid('分项 ID 重复')
    identifiers.add(id)
    const basis = choice(item.basis, ['grossArea', 'footprint', 'rooms', 'perimeter', 'count', 'manual'], '工程量口径')
    if (basis === 'manual' && item.quantity === undefined) invalid('手填工程量缺失')
    const unitPrice = numeric(item.unitPrice, '单价'), lowUnitPrice = numeric(item.lowUnitPrice, '情景低价'), highUnitPrice = numeric(item.highUnitPrice, '情景高价')
    if (lowUnitPrice > unitPrice || unitPrice > highUnitPrice) invalid('情景价格必须满足低价 ≤ 单价 ≤ 高价')
    return { id, label: text(item.label, '分项名称', 120), basis, unitPrice, lowUnitPrice, highUnitPrice, ...taxFields(item), evidence: validatePriceEvidence(item.evidence), ...(item.quantity !== undefined ? { quantity: numeric(item.quantity, '工程量') } : {}), ...(item.unit !== undefined ? { unit: text(item.unit, '工程量单位', 20) } : {}) }
  })
  let quote: FacilityPricing['quote']
  if (data.quote !== undefined) {
    const value = object(data.quote, ['amount', 'taxMode', 'taxRate', 'supplier', 'date', 'scope', 'url'], '供应商报价')
    quote = { amount: numeric(value.amount, '供应商总报价'), ...taxFields(value), supplier: text(value.supplier, '供应商名称'), date: date(value.date, '报价日期'), scope: text(value.scope, '报价范围', 1000), ...(value.url !== undefined ? { url: url(value.url) } : {}) }
  }
  if (mode === 'quotation' && !quote) invalid('供应商总报价缺失')
  return { mode, items, ...(quote ? { quote } : {}) }
}

export function validateBudgetSettings(value: unknown): BudgetSettings {
  const data = object(value, ['construction', 'grade', 'designRate', 'supervisionRate', 'reserveRate', 'landAmount', 'siteAmount', 'connectionAmount', 'openingAmount'], '项目预算设置')
  const optionalAmount = (key: string) => data[key] === null ? null : numeric(data[key], key, 100000000000)
  return { construction: choice(data.construction, ['new', 'renovation', 'simulation'], '建设性质'), grade: choice(data.grade, ['economy', 'standard', 'premium'], '建设档次'), designRate: numeric(data.designRate, '设计费率', 100), supervisionRate: numeric(data.supervisionRate, '监理费率', 100), reserveRate: numeric(data.reserveRate, '预备费率', 100), landAmount: optionalAmount('landAmount'), siteAmount: optionalAmount('siteAmount'), connectionAmount: optionalAmount('connectionAmount'), openingAmount: optionalAmount('openingAmount') }
}
