import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { Facility, PriceBreakdown, Project, TaxMode } from './types'
import SiteCanvas from './SiteCanvas'
import { calculateMetrics, calculateRoomProgram, getLayoutWarnings, getRoomMix, ROOM_TYPES } from './model'
import { facilitySiteArea, formatArea } from './area'
import { getFacilityLabel } from './facilityCatalog'
import { estimateFacility, estimateProject } from './pricing'
import { estimateCombinedBudget, getOperatingSettings } from './operating'
import { estimateMaterialPurchase, materialBounds, materialObstacles } from './materials'
import { MATERIAL_PRESET_BY_ID } from './materialCatalog'
import { COST_REFERENCES } from './costReferences'
import EarningsReportSection from './EarningsReportSection'

const currency = new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const amount = (value: number) => `¥${currency.format(value)}`
const percent = (value: number) => `${currency.format(value * 100)}%`
const sourceNames = { legacy: '原综合价假设', items: '分项核算', quotation: '用户总报价' }
const evidenceNames = { assumption: '规划假设', reference: '公开参考', quotation: '用户报价，未独立核验' }
const safeURL = (url?: string): string | undefined => {
  if (!url) return undefined
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.href : undefined } catch { return undefined }
}

function Link({ url, children }: { url?: string; children: ReactNode }) {
  const href = safeURL(url)
  return href ? <a href={href} rel="noreferrer">{children}</a> : <>{children}</>
}

function Table({ heads, children }: { heads: string[]; children: ReactNode }) {
  return <div className="table-scroll"><table><thead><tr>{heads.map(head => <th key={head} scope="col">{head}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
}

function taxLabel(mode?: TaxMode, rate?: number) {
  return mode === 'included' ? '已含税' : mode === 'excluded' ? rate === undefined ? '未含税，税率待核实' : `未含税，另计 ${rate}%` : '税口径待核实'
}

function rowTax(facility: Facility, row: PriceBreakdown) {
  const original = facility.pricing?.mode === 'quotation' ? facility.pricing.quote : facility.pricing?.items.find(item => item.id === row.id)
  return taxLabel(original?.taxMode, original?.taxRate)
}

function planSVG(project: Project) {
  // Rendering a separate display clone includes hidden physical facilities without
  // altering the saved project or depending on the user's current canvas state.
  const displayed = { ...project, facilities: project.facilities.map(f => ({ ...f, visible: true })), materials:(project.materials??[]).map(piece=>({...piece,visible:true})) }
  const markup = renderToStaticMarkup(<SiteCanvas project={displayed} selectedId={null} onSelect={() => {}} onMove={() => {}} mode="2d" zoom={1} showLabels showGrid tool="select" interactive={false} svgId="report-site-plan" />)
  let left = -50, top = -50, right = project.siteWidth * 4 + 50, bottom = project.siteDepth * 4 + 50
  for (const f of project.facilities) {
    const width = f.rotation === 90 ? f.depth : f.width, depth = f.rotation === 90 ? f.width : f.depth
    // Labels also belong to the full static plan; reserve their actual canvas width.
    const labelWidth = Math.max(60, f.name.length * 9 + 25)
    left = Math.min(left, f.x * 4 - 40, (f.x + width / 2) * 4 - labelWidth / 2 - 20)
    right = Math.max(right, (f.x + width) * 4 + 40, (f.x + width / 2) * 4 + labelWidth / 2 + 20)
    top = Math.min(top, f.y * 4 - 40)
    bottom = Math.max(bottom, (f.y + depth) * 4 + 40)
  }
  for(const piece of project.materials??[]){const rect=materialBounds(piece);left=Math.min(left,rect.x*4-30);right=Math.max(right,(rect.x+rect.width)*4+30);top=Math.min(top,rect.y*4-30);bottom=Math.max(bottom,(rect.y+rect.depth)*4+30)}
  const start = markup.indexOf('<svg '), end = markup.lastIndexOf('</svg>')
  if (start < 0 || end < start) throw new Error('无法生成报告场地图')
  return markup.slice(start, end + 6).replace(/viewBox="[^"]*"/, `viewBox="${left} ${top} ${right - left} ${bottom - top}"`)
}

const CSS = `
*{box-sizing:border-box}html{color-scheme:light}body{margin:0;background:#f0f4ef;color:#243b30;font-family:Arial,"PingFang SC","Microsoft YaHei",sans-serif;font-size:14px;line-height:1.65}main{max-width:1180px;margin:32px auto;padding:40px;background:white;border:1px solid #dce7dc;border-radius:18px}header{border-bottom:2px solid #e6eee2;padding-bottom:24px;margin-bottom:26px}h1{font-size:30px;line-height:1.3;margin:8px 0 10px;overflow-wrap:anywhere}h2{font-size:21px;margin:0 0 12px}h3{font-size:16px;margin:20px 0 8px}.brand{color:#347047;font-weight:bold;letter-spacing:1px}.melon{display:inline-block;width:28px;height:15px;border-radius:0 0 25px 25px;border:4px solid #4b8250;border-top:0;background:#ec7a7a;vertical-align:middle;margin-right:9px}.muted,.note{color:#67756c}.note{font-size:12px;margin:10px 0}.metadata{display:flex;gap:8px 22px;flex-wrap:wrap}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:20px 0}.metric{background:#f3f7ef;border:1px solid #e2ebdb;border-radius:10px;padding:16px}.metric small{display:block;color:#647362}.metric strong{display:block;font-size:22px;font-variant-numeric:tabular-nums}.section{margin-top:30px;padding-top:24px;border-top:1px solid #e1e9de}.plan{height:540px;border:1px solid #dfe7d6;background:#f1f2e9;border-radius:10px;overflow:hidden}.plan svg{width:100%;height:100%}.table-scroll{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:12px;text-align:left}th,td{padding:10px;border-bottom:1px solid #e2e8df;vertical-align:top;overflow-wrap:anywhere}th{background:#edf3e8;color:#36553c;white-space:nowrap}td{min-width:68px}td.number{font-variant-numeric:tabular-nums;white-space:nowrap}.warning{background:#fff5e4;border:1px solid #efdab0;border-radius:8px;padding:12px;color:#765624}.badge{font-size:11px;padding:2px 6px;border:1px solid #d5e2d0;border-radius:5px;display:inline-block;white-space:nowrap}.nowrap{white-space:nowrap}a{color:#326748;text-decoration:underline}.sources{padding-left:20px}.sources li{margin-bottom:12px}.quote-scope{max-width:350px}footer{margin-top:32px;border-top:1px solid #e1e9de;padding-top:18px;color:#69756b;font-size:12px}@media(max-width:760px){main{margin:0;padding:20px;border:0;border-radius:0}.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.metric strong{font-size:18px}.plan{height:420px}}@page{size:A4 landscape;margin:13mm}@media print{body{background:white;font-size:11px}main{max-width:none;margin:0;padding:0;border:0;border-radius:0}.metrics{gap:8px}.metric{padding:10px}.metric strong{font-size:18px}.section{margin-top:20px;padding-top:16px}h2,h3{break-after:avoid}.table-scroll{overflow:visible}table{font-size:9px;table-layout:fixed}th,td{padding:6px;min-width:0}th{white-space:normal}td.number{white-space:normal}thead{display:table-header-group}tr,.metric,.warning{break-inside:avoid}.plan{height:145mm;break-inside:avoid}a{color:inherit}footer{font-size:9px}.print-help{display:none}}
`

/** Build a self-contained, script-free report using the same calculations as the app. */
export function buildProjectReport(project: Project, generatedAt = new Date()): string {
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('报告生成日期无效')
  const metrics = calculateMetrics(project), budget = estimateProject(project, generatedAt)
  const materialList=estimateMaterialPurchase({...project,materialBudgetIncluded:true})
  const combined=estimateCombinedBudget(project), operating=combined.operating, operatingSettings=getOperatingSettings(project)
  const operatingBases={guestDay:'宾客人天',staffDay:'员工人天',personDay:'总人天',roomDay:'入住房晚',day:'天数',period:'整个期间',manual:'手填总数'}
  const rows = project.facilities.map(f => ({ f, area: facilitySiteArea(f, project), estimate: estimateFacility(f, generatedAt) }))
  const hotels = project.facilities.filter(f => f.type === 'hotel')
  const warnings = getLayoutWarnings(project)
  const overlapPairs = warnings.filter(warning => warning.id.startsWith('overlap-')).length
  const issues = project.facilities.flatMap(f => {
    const relevant = warnings.filter(w => w.facilityIds.includes(f.id))
    const room = f.type === 'hotel' ? calculateRoomProgram(f) : undefined
    const messages = relevant.filter(w => !w.id.startsWith('overlap-')).map(w => w.message)
    const partners = new Set(relevant.filter(w => w.id.startsWith('overlap-')).flatMap(w => w.facilityIds.filter(id => id !== f.id)))
    if (partners.size) {
      const names = project.facilities.filter(other => partners.has(other.id)).slice(0, 3).map(other => other.name)
      messages.push(`与 ${partners.size} 项设施重叠：${names.join('、')}${partners.size > 3 ? '等' : ''}`)
    }
    if (room && room.remainingArea < 0) messages.push(`客房示例净面积超出建筑面积 ${formatArea(-room.remainingArea)} ㎡`)
    return messages.length ? [{ f, messages }] : []
  })
  const generatedText = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).format(generatedAt)
  const fees = [
    ['设施工程小计', budget.engineering.point, '全部设施工程量，包括隐藏及越界部分'],
    ['另计自建物材料采购',budget.materialsAmount,'按采购开关单列，不追加现有建设三费'],
    ['设计费', budget.designAmount, `工程小计 × ${budget.settings.designRate}%（可调整假设）`],
    ['监理费', budget.supervisionAmount, `工程小计 × ${budget.settings.supervisionRate}%（可调整假设）`],
    ['预备费', budget.reserveAmount, `(工程小计＋设计＋监理＋场地工程＋市政接入) × ${budget.settings.reserveRate}%（可调整假设）`],
    ['土地费用', budget.settings.landAmount, '独立录入，未报价时不计入已计合计'],
    ['场地工程费用', budget.settings.siteAmount, '独立录入，避免与设施分项重复'],
    ['市政接入费用', budget.settings.connectionAmount, '独立录入，未报价时不计入已计合计'],
    ['开办费用', budget.settings.openingAmount, '独立录入，未报价时不计入已计合计'],
  ] as const
  const body = renderToStaticMarkup(<main>
    <header><div className="brand"><span className="melon" aria-hidden="true" />COURTSIDE · 西瓜网球度假酒店设计工作台</div><h1>{project.name} · 方案报告</h1><div className="metadata"><span>地点：{project.location}</span><span>用地：{formatArea(project.siteWidth)} × {formatArea(project.siteDepth)} m</span><span>生成：{generatedText}（北京时间）</span><span>方案更新：{project.updatedAt}</span></div><p className="note print-help">此报告可离线打开；使用浏览器菜单打印，或按 Ctrl / ⌘ + P 保存为 PDF。</p></header>
    <section><h2>方案总览</h2><div className="metrics"><div className="metric" data-report-metric="siteArea" data-value={metrics.siteArea}><small>总用地面积 · ㎡</small><strong>{formatArea(metrics.siteArea)}</strong></div><div className="metric" data-report-metric="occupiedArea" data-value={metrics.occupiedArea}><small>界内去重占地 · ㎡</small><strong>{formatArea(metrics.occupiedArea)}</strong></div><div className="metric" data-report-metric="buildingArea" data-value={metrics.buildingArea}><small>建筑各层面积 · ㎡</small><strong>{formatArea(metrics.buildingArea)}</strong></div><div className="metric" data-report-metric="knownBudget" data-value={budget.total.point}><small>建设已计预算合计 · 元</small><strong>{amount(budget.total.point)}</strong></div></div><p>{project.facilities.length} 项设施 · {metrics.courtCount} 片网球场 · {metrics.roomCount} 间客房。核算与明细包含 {project.facilities.filter(f => f.visible === false).length} 项隐藏设施；隐藏仅影响工作台显示。</p><p className="note">概念方案核算：用地按矩形轮廓计算，界内重叠区域只算一次；建筑面积及工程量保留完整尺寸和楼层，越界不会扣减工程预算。客房净面积为方案配置示例。</p></section>
    <section className="section"><h2>完整场地平面图</h2><div className="plan" dangerouslySetInnerHTML={{ __html: planSVG(project) }} /><p className="note">图中显示全部设施与建材（含隐藏与界外部分），方向与保存方案一致；越界区域已扩展显示。图示道路、树木及其他背景装饰不作为配置设施计入面积或预算。</p></section>
    <section className="section"><h2>面积核算</h2><Table heads={['指标', '面积 / 占比', '计量范围']}>
      {([
        ['总用地面积', `${formatArea(metrics.siteArea)} ㎡`, '用地宽度 × 深度'],
        ['完整设施占地合计', `${formatArea(metrics.rawFacilityArea)} ㎡`, '各设施完整占地累加；包含重复及界外部分'],
        [project.materials?.length?'界内总占地（含自建物）':'界内设施占地（去重）', `${formatArea(metrics.occupiedArea)} ㎡`, '裁剪到用地后取设施与建材、自建组合外包投影并集'],
        ['未配置用地', `${formatArea(metrics.unallocatedArea)} ㎡`, '总用地减界内联合去重占地，不自动算作绿地'],
        ['界内重叠区域', `${formatArea(metrics.overlapArea)} ㎡`, '被两项及以上设施覆盖的区域只算一次'],
        ['界外去重占地', `${formatArea(metrics.outOfBoundsArea)} ㎡`, '界外设施并集；不等于逐项越界面积累加'],
        ['建筑基底（界内去重）', `${formatArea(metrics.footprint)} ㎡`, '住宿及配套建筑的界内基底并集'],
        ['建筑各层面积', `${formatArea(metrics.buildingArea)} ㎡`, '各建筑完整基底 × 楼层累加；保留界外部分'],
        ['界内可用绿地', `${formatArea(metrics.landscapeArea)} ㎡`, '已配置绿地并集，扣除非绿地设施遮盖'],
        ['建筑基底占比', percent(metrics.coverageRatio), '界内建筑基底 / 总用地'],
        ['可用绿地占比', percent(metrics.landscapeRatio), '界内可用绿地 / 总用地'],
      ] as const).map(([label, value, scope]) => <tr key={label}><td>{label}</td><td className="number">{value}</td><td>{scope}</td></tr>)}
    </Table></section>
    <section className="section"><h2>预算核算</h2><p>建设范围：{{ new: '新建', renovation: '改造', simulation: '设计模拟' }[budget.settings.construction]}；配置档次：{{ economy: '经济型', standard: '中档实用', premium: '高端度假型' }[budget.settings.grade]}。范围与档次用于记录需求，不自动调整单价。</p><p><strong>已计预算合计：{amount(budget.total.point)}</strong>；规划情景范围：{amount(budget.total.low)} ～ {amount(budget.total.high)}。</p><p>用户报价金额覆盖率：{percent(budget.quoteCoverage)}（工程金额占比，非准确率）。{budget.assumedRows} 个分项采用规划假设；{budget.staleQuotes} 项设施的用户报价日期超过 90 天，需询价复核。</p>
      {budget.missingItems.length > 0 && <p className="warning">尚未核定：{budget.missingItems.join('、')}。未报价费用不计入已计预算；税口径未明确时不自动补税。</p>}
      <Table heads={['费用', '已计金额（元）', '范围与计费依据']}>{fees.map(([label, value, scope]) => <tr key={label}><td>{label}</td><td className="number">{value === null ? '未报价（未计入）' : amount(value)}</td><td>{scope}</td></tr>)}<tr><td><strong>已计预算合计</strong></td><td className="number"><strong>{amount(budget.total.point)}</strong></td><td>不含尚未核定项目</td></tr></Table>
      <p className="note">示例综合价与原综合价拆分仍属可调整假设；规划情景范围不是统计置信区间。用户供应商报价未独立核验，仅覆盖其填写范围；总报价替代原综合价，不重复叠加。已含税金额保持原值，未含税且税率明确的项目仅加税一次。三项费用比例是规划参数，不代表官方收费标准。</p>
    </section>
    <section className="section"><h2>餐饮与日常消耗预算</h2>
      <div className="metrics"><div className="metric" data-report-metric="operatingBudget" data-value={operating.total}><small>期间运营已计合计 · 元</small><strong>{amount(operating.total)}</strong></div><div className="metric" data-report-metric="combinedBudget" data-value={combined.total.point}><small>建设加期间运营 · 元</small><strong>{amount(combined.total.point)}</strong></div></div>
      {operating.enabled?<>
        <p>期间 {operating.days} 天；平均每日服务宾客 {currency.format(operating.averageGuests)} 人，员工 {currency.format(operating.averageStaff)} 人；入住房晚 {currency.format(operating.roomNights)}。人数口径：{operatingSettings.guestMode==='rooms'?'按客房与假设入住率推算':'手填服务宾客数'}；客房假设入住率 {currency.format(operatingSettings.occupancyRate)}%，每间 {currency.format(operatingSettings.guestsPerRoom)} 位宾客。</p>
        <p>宾客人天 {currency.format(operating.guestDays)}、员工人天 {currency.format(operating.staffDays)}、总人天 {currency.format(operating.personDays)}；期间平均每日已计金额 {amount(operating.perDay)}。</p>
        {operating.unpricedItems.length>0&&<p className="warning">运营未报价、尚未计入：{operating.unpricedItems.join('、')}。</p>}
        {operating.taxUnresolvedItems.length>0&&<p className="note">运营税口径待核实：{operating.taxUnresolvedItems.join('、')}；未自动补税。</p>}
        <Table heads={['费用 / 计入状态','数量基数 × 用量','总数量','采购单价（元）','已计金额（元）','税口径','来源 / 日期 / 采购范围']}>
          {operating.rows.map(row=>{const original=operatingSettings.items.find(item=>item.id===row.id)!;return <tr key={row.id} data-report-operating-item={row.id}><td>{row.label}<br/>{row.included?'计入':'未计入'}</td><td>{operatingBases[row.basis]} {currency.format(row.baseQuantity)} × {currency.format(original.quantity)}</td><td>{currency.format(row.quantity)} {row.unit}</td><td>{row.unitPrice===null?'未报价':amount(row.unitPrice)}</td><td>{!row.included?'未计入':row.amount===null?'待报价':amount(row.amount)}</td><td>{taxLabel(original.taxMode,original.taxRate)}<br/>另加税额 {amount(row.taxAmount)}</td><td className="quote-scope"><span className="badge">{evidenceNames[row.evidence.kind]}</span><br/><Link url={row.evidence.url}>{row.evidence.name}</Link><br/>{row.evidence.date??'日期未提供'}<br/>{row.evidence.scope}</td></tr>})}
        </Table>
      </>:<p>尚未启用餐饮与日常用品预算，未加到综合合计。可在投资估算页配置期间、人数、用量和单价后启用。</p>}
      <p className="note">本节为采购与消耗成本。手填人数替代客房推算；员工餐独立于宾客三餐。手填总数量及按整个期间录入的金额不再乘天数。运营费不追加建设设计、监理或预备费。综合已计合计是建设加所选期间的已录日常消耗，不等同于全生命周期成本；未报价及其他未录入支出仍需补充。示例单价与入住率均为可调整假设。</p>
    </section>
    {project.materials?.length?<section className="section"><h2>建材与自建作品</h2><p>{project.materials.length} 件材料、{project.materialAssemblies?.length??0} 个组合；界内联合外包投影 {formatArea(metrics.materialArea)} ㎡。正常叠放不算设施相交，不自动增加建筑楼面或客房。</p><p>清单已知采购金额 {amount(materialList.total)}；已纳入建设预算 {amount(budget.materialsAmount)}。{project.materialBudgetIncluded?'材料已选择另计，需核对是否包含在已有综合价':'未选择额外计入，避免与既有设施综合价重复'}</p>{materialList.unpricedItems.length>0&&<p className="warning">材料待报价：{materialList.unpricedItems.join('、')}。</p>}<Table heads={['材料 / 商品形态','世界坐标 X/Y/Z','宽 / 深 / 高（m）','组合','采购数量','单价与已知额']}>
      {project.materials.map(piece=>{const row=materialList.rows.find(item=>item.id===piece.id)!;const assembly=project.materialAssemblies?.find(group=>group.pieceIds.includes(piece.id));return <tr key={piece.id} data-report-material={piece.id}><td>{piece.name}<br/>{MATERIAL_PRESET_BY_ID[piece.materialId].name}{piece.visible===false?' · 隐藏（计入）':''}</td><td>{piece.x} / {piece.y} / {piece.z}</td><td>{piece.width} / {piece.depth} / {piece.height}<br/>旋转 {piece.rotation}° · 轴 {piece.axisOrder??'xyz'}</td><td>{assembly?.name??'独立材料'}</td><td>{currency.format(row.quantity)} {row.unit}</td><td>{piece.unitPrice===null?'未报价':amount(piece.unitPrice)}<br/>{row.amount===null?'待报价':amount(row.amount)}<br/>{taxLabel(piece.taxMode,piece.taxRate)}<br/>{piece.evidence.name}</td></tr>})}
      </Table><p className="note">建材按照商品常见形态和可编辑尺寸示意。采购数量按每件、长边、最大板面或外包体积估算，不折算空心净料、实际重量或施工损耗。组合外包范围用于规划避让，不等于建成建筑面积。</p></section>:null}
    <section className="section"><h2>设施明细</h2><Table heads={['设施 / 类型', '尺寸与状态', '完整占地 ㎡', '界内占地 ㎡', '逐项界外 ㎡', '建筑面积 ㎡', '工程估算（元） / 来源']}>
      {rows.map(({ f, area, estimate }) => <tr key={f.id} data-report-facility={f.id}><td>{f.name}<br/><span className="muted">{getFacilityLabel(f)}</span></td><td>{formatArea(f.width)} × {formatArea(f.depth)} m<br/>{f.floors} 层 · {f.rotation}°<br/>{f.visible === false ? '隐藏（计入核算）' : '显示'}{f.locked ? ' · 已锁定' : ''}</td><td className="number">{formatArea(area.completeArea)}</td><td className="number">{formatArea(area.inBoundsArea)}</td><td className="number">{formatArea(area.outOfBoundsArea)}</td><td className="number">{formatArea(area.grossArea)}</td><td>{amount(estimate.point)}<br/><span className="badge">{sourceNames[estimate.source]}</span><br/><span className="muted">{amount(estimate.low)} ～ {amount(estimate.high)}</span></td></tr>)}
      {!rows.length && <tr><td colSpan={7}>尚未添加设施</td></tr>}
    </Table><p className="note">逐项界外面积会重复计入设施间的界外交叠；场地核算中的界外去重占地以并集为准。建筑面积仅计入酒店住宿及餐饮配套建筑。</p></section>
    <section className="section"><h2>价格分项与证据</h2><Table heads={['设施 / 分项', '工程量 × 原单价', '已计金额（元）', '税口径', '来源 / 日期 / 包含范围']}>
      {rows.flatMap(({ f, estimate }) => estimate.rows.map(row => <tr key={`${f.id}-${row.id}`}><td>{f.name}<br/>{row.label}</td><td>{currency.format(row.quantity)} {row.unit} × {amount(row.unitPrice)}</td><td className="number">{amount(row.amount)}<br/><span className="muted">另计税额 {amount(row.taxAmount)}</span></td><td>{rowTax(f, row)}{row.taxUnresolved && <><br/>待核实</>}</td><td className="quote-scope"><span className="badge">{evidenceNames[row.evidence.kind]}</span><br/><Link url={row.evidence.url}>{row.evidence.name}</Link><br/>{row.evidence.date ?? '日期未提供'}<br/>{row.evidence.scope}</td></tr>))}
      {!rows.length && <tr><td colSpan={5}>尚无设施价格分项</td></tr>}
    </Table></section>
    <section className="section"><h2>客房配置</h2><p className="note">示例客房净面积：{Object.values(ROOM_TYPES).map(room => `${room.label} ${room.area} ㎡`).join('；')}。建筑余量仍需容纳走廊、公共区、设备空间及墙体，正余量不代表施工可行性已确认。</p><Table heads={['住宿设施', '标准间', '景观房', '套房', '示例净面积 ㎡', '建筑面积 ㎡', '面积余量 / 缺口 ㎡']}>
      {hotels.map(f => { const mix = getRoomMix(f), program = calculateRoomProgram(f); return <tr key={f.id}><td>{f.name}</td><td>{mix.standard}</td><td>{mix.deluxe}</td><td>{mix.suite}</td><td className="number">{formatArea(program.guestArea)}</td><td className="number">{formatArea(program.grossArea)}</td><td>{program.remainingArea < 0 ? `缺口 ${formatArea(-program.remainingArea)}` : `余量 ${formatArea(program.remainingArea)}`}</td></tr> })}
      {!hotels.length && <tr><td colSpan={7}>尚未配置住宿设施</td></tr>}
    </Table></section>
    <EarningsReportSection project={project}/>
    <section className="section"><h2>布局与配置核查</h2><p>{overlapPairs} 对设施发生占地重叠；按设施归并显示，包含隐藏设施。</p>{issues.length ? <Table heads={['设施', '需调整的配置']}>{issues.map(({ f, messages }) => <tr key={f.id}><td>{f.name}</td><td>{messages.map((message, index) => <div key={index}>{message}</div>)}</td></tr>)}</Table> : <p>当前未发现设施越界、设施重叠、网球场概念占地不足或客房示例净面积超出建筑面积。</p>}<p className="note">本表核查已配置矩形及示例客房工程量；规划图与报告不替代测绘、施工设计或审批材料。</p></section>
    <section className="section"><h2>公开计价参考</h2><p className="note">以下用于计价方法、材料行情与类似项目对照；不自动转换为本酒店的供应商报价。打开链接需要联网，报告正文与场地图可离线查看。</p><ul className="sources">{COST_REFERENCES.map(reference => <li key={reference.url}><Link url={reference.url}>{reference.title}</Link> · {reference.kind} · {reference.date}<br/><span className="muted">{reference.summary}</span></li>)}</ul></section>
    <footer>方案编号：{project.id} · 报告生成时间：{generatedAt.toISOString()} · 所有金额为人民币，显示至分；面积显示至 0.01 ㎡，计算使用保存的完整数值。</footer>
  </main>)
  const title = renderToStaticMarkup(<title>{`${project.name} · 方案报告`}</title>)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>${title}<style>${CSS}</style></head><body>${body}</body></html>`
}
