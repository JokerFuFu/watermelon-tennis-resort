import test from 'node:test'
import assert from 'node:assert/strict'
import { buildProjectReport } from './projectReport'
import { calculateMetrics, createPresetFacility, createProject } from './model'
import { estimateFacility, estimateProject, getBudgetSettings } from './pricing'
import { formatArea } from './area'
import { FACILITY_PRESETS } from './facilityCatalog'
import type { Facility, Project } from './types'

const generatedAt = new Date('2026-10-03T02:30:00.000Z')
const money = (value: number) => `¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
function facility(id: string, patch: Partial<Facility> = {}): Facility {
  return { id, name: id, type: 'hotel', x: 1, y: 1, width: 10.5, depth: 10.2, floors: 2, rooms: 8, unitCost: 100, rotation: 0, ...patch }
}
function project(facilities: Facility[] = []): Project {
  const result = createProject('离线方案', 'blank')
  result.siteWidth = 100
  result.siteDepth = 80
  result.facilities = facilities
  result.updatedAt = '2026-10-02T12:00:00.000Z'
  return result
}
function metric(html: string, key: string) {
  const value = html.match(new RegExp(`data-report-metric="${key}" data-value="([^"]+)"`))?.[1]
  assert.ok(value, `Missing ${key}`)
  return Number(value)
}

test('report keeps old project immutable and uses complete engineering and clipped land metrics', () => {
  const p = project([facility('hidden', { x: 95, visible: false, locked: true }), facility('overlap', { x: 95 })])
  const before = structuredClone(p), metrics = calculateMetrics(p), budget = estimateProject(p, generatedAt)
  const html = buildProjectReport(p, generatedAt)
  assert.deepEqual(p, before)
  assert.equal(metric(html, 'siteArea'), metrics.siteArea)
  assert.equal(metric(html, 'occupiedArea'), metrics.occupiedArea)
  assert.equal(metric(html, 'buildingArea'), metrics.buildingArea)
  assert.equal(metric(html, 'knownBudget'), budget.total.point)
  assert.ok(html.includes(formatArea(metrics.outOfBoundsArea)))
  assert.ok(html.includes('隐藏（计入核算）'))
  assert.ok(html.includes('界外不会扣减工程预算') || html.includes('越界不会扣减工程预算'))
  assert.ok(html.includes('未配置用地'))
})

test('budget distinguishes unknown fees from explicit zero and records assumptions and tax uncertainty', () => {
  const p = project([facility('hotel')])
  p.budget = { ...getBudgetSettings(p), landAmount: null, siteAmount: 0, connectionAmount: 10, openingAmount: 0 }
  const html = buildProjectReport(p, generatedAt)
  assert.ok(html.includes('<td>土地费用</td><td class="number">未报价（未计入）</td>'))
  assert.ok(html.includes('<td>场地工程费用</td><td class="number">¥0.00</td>'))
  assert.ok(html.includes('<td>市政接入费用</td><td class="number">¥10.00</td>'))
  assert.ok(html.includes('部分设施税费口径待核实'))
  assert.ok(html.includes('可调整假设'))
  assert.ok(html.includes('非准确率'))
  assert.ok(html.includes('不是统计置信区间'))
})

test('supplier quotation replaces baseline, taxes once, preserves source date and scope', () => {
  const f = facility('quote', { unitCost: 999999, pricing: { mode: 'quotation', items: [], quote: { amount: 1000, taxMode: 'excluded', taxRate: 9, supplier: '供应商 A', date: '2026-01-01', scope: '仅含装修工程', url: 'https://example.com/quote?x=1&y=2' } } })
  const p = project([f])
  p.budget = { ...getBudgetSettings(p), designRate: 0, supervisionRate: 0, reserveRate: 0, landAmount: 0, siteAmount: 0, connectionAmount: 0, openingAmount: 0 }
  const html = buildProjectReport(p, generatedAt)
  assert.equal(estimateFacility(f, generatedAt).point, 1090)
  assert.equal(metric(html, 'knownBudget'), 1090)
  assert.ok(html.includes(money(1090)))
  assert.ok(html.includes('另计税额 ¥90.00'))
  assert.ok(html.includes('供应商 A'))
  assert.ok(html.includes('2026-01-01'))
  assert.ok(html.includes('仅含装修工程'))
  assert.ok(html.includes('1 项设施的用户报价日期超过 90 天'))
  assert.ok(html.includes('用户报价，未独立核验'))
  assert.ok(!html.includes('999,999'))
})

test('already inclusive quotation has no added tax and mixed evidence remains explicit', () => {
  const f = facility('included', { pricing: { mode: 'items', items: [
    { id: 'a', label: '含税报价', basis: 'count', unitPrice: 200, lowUnitPrice: 200, highUnitPrice: 200, taxMode: 'included', taxRate: 9, evidence: { kind: 'quotation', name: '厂家', date: '2026-10-01', scope: '全部含税', url: 'https://example.com' } },
    { id: 'b', label: '参考', basis: 'manual', quantity: 2, unit: '套', unitPrice: 50, lowUnitPrice: 45, highUnitPrice: 60, taxMode: 'unknown', evidence: { kind: 'reference', name: '资料', scope: '材料价，非成套工程价' } },
  ] } })
  const p = project([f]), html = buildProjectReport(p, generatedAt)
  assert.equal(metric(html, 'knownBudget'), estimateProject(p, generatedAt).total.point)
  assert.ok(html.includes('已含税'))
  assert.ok(html.includes('另计税额 ¥0.00'))
  assert.ok(html.includes('公开参考'))
  assert.ok(html.includes('材料价，非成套工程价'))
})

test('static SVG shows hidden and far rotated outside facilities with unclipped viewBox', () => {
  const p = project([facility('far', { x: -1000, y: -1000, width: 1000, depth: 1000, visible: false, rotation: 90 }), facility('rotated', { x: 1000, y: 1000, width: 500, depth: 1000, rotation: 90, visible: false })])
  const html = buildProjectReport(p, generatedAt)
  const match = html.match(/<svg[^>]+id="report-site-plan"[^>]+viewBox="([^"]+)"/)
  assert.ok(match)
  const [x, y, width, height] = match[1].split(' ').map(Number)
  assert.ok(x <= -4000 && y <= -4000)
  assert.ok(x + width >= 8000 && y + height >= 6000)
  assert.ok(html.includes('data-facility-id="far"'))
  assert.ok(html.includes('data-facility-id="rotated"'))
  assert.ok(!html.includes('role="button"'))
  assert.ok(html.includes('全部设施与建材（含隐藏与界外部分）'))
})

test('all text and source URLs are safely escaped, no script or remote resources required', () => {
  const payload = '</title><script>alert(1)</script><img src="https://evil.test/x" onerror="alert(2)">'
  const f = facility('safe', { name: payload, pricing: { mode: 'quotation', items: [], quote: { amount: 10, taxMode: 'included', supplier: payload, date: '2026-10-01', scope: payload, url: 'javascript:alert(1)' } } })
  const p = project([f]); p.name = payload; p.location = payload; p.id = payload
  const html = buildProjectReport(p, generatedAt)
  assert.ok(html.startsWith('<!doctype html>'))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!/<script\b|<img\b|<iframe\b|<link\b/i.test(html))
  assert.ok(!/<[a-z][^>]*\son\w+=["']/i.test(html))
  assert.ok(!html.includes('href="javascript:'))
  assert.ok(!html.includes('@import'))
  assert.ok(!/url\(https?:/i.test(html))
  assert.ok(html.includes('@media print'))
})

test('room report shows allocation, example area and actual area deficit', () => {
  const f = facility('客房不足', { width: 10, depth: 10, floors: 1, rooms: 8, roomMix: { standard: 3, deluxe: 3, suite: 2 } })
  const html = buildProjectReport(project([f]), generatedAt)
  assert.ok(html.includes('<td>3</td><td>3</td><td>2</td>'))
  assert.ok(html.includes('缺口 214.00'))
  assert.ok(html.includes('客房示例净面积超出建筑面积 214.00 ㎡'))
  assert.ok(html.includes('标准间 28 ㎡'))
})

test('same fixed date generates identical reports and Beijing timestamp', () => {
  const p = project([facility('hotel')])
  assert.equal(buildProjectReport(p, generatedAt), buildProjectReport(p, generatedAt))
  const html = buildProjectReport(p, generatedAt)
  assert.ok(html.includes('2026/10/03 10:30:00（北京时间）'))
  assert.ok(html.includes('2026-10-03T02:30:00.000Z'))
  assert.throws(() => buildProjectReport(p, new Date('invalid')), /报告生成日期无效/)
})

test('all 51 presets render offline with complete IDs and unchanged saved data', () => {
  const p = project()
  p.siteWidth = 1000; p.siteDepth = 1000
  for (const preset of FACILITY_PRESETS) p.facilities.push(createPresetFacility(preset.id, p))
  const snapshot = structuredClone(p)
  const html = buildProjectReport(p, generatedAt)
  assert.equal(p.facilities.length, 51)
  for (const f of p.facilities) assert.ok(html.includes(`data-facility-id="${f.id}"`), f.presetId ?? f.id)
  assert.equal((html.match(/data-report-facility=/g) ?? []).length, 51)
  assert.deepEqual(p, snapshot)
})

test('200 overlapping facilities create bounded grouped issue rows, not all pair messages', () => {
  const p = project(Array.from({ length: 200 }, (_, index) => facility(`facility-${index}`, { type: 'landscape', rooms: 0, floors: 1 })))
  const html = buildProjectReport(p, generatedAt)
  assert.ok(html.includes('19900 对设施发生占地重叠'))
  assert.equal((html.match(/与 199 项设施重叠/g) ?? []).length, 200)
  assert.ok(html.length < 1200000, `Report size ${html.length}`)
})
