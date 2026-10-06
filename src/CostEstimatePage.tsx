import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, Calculator, Download, FileCheck2, LockKeyhole, Wallet } from 'lucide-react'
import { formatNumber } from './model'
import { getFacilityLabel } from './facilityCatalog'
import { getFacilityIcon } from './FacilityIcons'
import { estimateFacility, estimateProject, getBudgetSettings } from './pricing'
import { COST_REFERENCES } from './costReferences'
import FacilityPricingEditor from './FacilityPricingEditor'
import OperatingBudgetPanel from './OperatingBudgetPanel'
import MaterialPurchasePanel from './MaterialPurchasePanel'
import type { BudgetSettings, Facility, Project, OperatingSettings } from './types'
import { formatArea } from './area'
import './cost-estimate.css'

interface Props {project:Project;update:(id:string,patch:Partial<Facility>)=>void;updateBudget:(settings:BudgetSettings)=>void;updateOperating:(settings:OperatingSettings)=>void;updateMaterialBudget:(value:boolean)=>void;onOpenMaterials:()=>void;onExport:()=>void;editFacilityId?:string|null;editToken?:number;onEditRequestHandled?:()=>void;operatingFocusToken?:number}
const SOURCES={legacy:'原综合价 · 内部假设',items:'分项工程量',quotation:'用户总报价 · 未核验'}
const money=(value:number)=>`¥ ${formatNumber(value,2)}`
const wan=(value:number)=>formatNumber(value/10000,2)

export default function CostEstimatePage({project,update,updateBudget,updateOperating,updateMaterialBudget,onOpenMaterials,onExport,editFacilityId,editToken,onEditRequestHandled,operatingFocusToken}:Props){
  const estimate=estimateProject(project)
  const settings=getBudgetSettings(project)
  const [editing,setEditing]=useState<string|null>(null)
  const close=useCallback(()=>setEditing(null),[])
  useEffect(()=>{if(editFacilityId){setEditing(editFacilityId);onEditRequestHandled?.()}},[editFacilityId,editToken,onEditRequestHandled])
  useEffect(()=>{if(operatingFocusToken)document.querySelector('[data-testid="operating-panel"]')?.scrollIntoView({block:'start'})},[operatingFocusToken])
  const facility=project.facilities.find(f=>f.id===editing)
  function patchSettings(patch:Partial<BudgetSettings>){updateBudget({...settings,...patch})}
  return <div className="budget-page ce-page">
    <section className="surface ce-summary"><div className="ce-main-total"><span className="ce-eyebrow"><Wallet size={17}/>建设已计预算合计</span><h2 data-testid="project-estimate-total" data-budget-total={estimate.total.point}>{wan(estimate.total.point)}<small>万元</small></h2><p data-testid="project-estimate-range">规划情景范围 {wan(estimate.total.low)} – {wan(estimate.total.high)} 万元</p><span>已计费用的合计；缺项补齐后总额会变化。</span><button className="button secondary" onClick={onExport}><Download size={15}/>导出估算表</button></div><div className="ce-summary-details"><div><Calculator size={19}/><span>设施工程小计</span><strong data-testid="engineering-estimate" data-engineering-total={estimate.engineering.point}>{wan(estimate.engineering.point)}<small>万元</small></strong></div><div><FileCheck2 size={19}/><span>用户报价金额覆盖率</span><strong>{formatNumber(estimate.quoteCoverage*100,1)}<small>%</small></strong><p>按工程金额统计，报价未独立核验。</p></div><div><span>待复核来源</span><strong>{estimate.assumedRows}<small>项内部假设</small></strong>{estimate.staleQuotes>0&&<p>{estimate.staleQuotes} 项报价超过 90 天，请复核。</p>}</div></div></section>
    <div className="ce-missing" role="status"><strong>{estimate.missingItems.length?'预算仍有待补项':'当前已录入全部费用类别'}</strong><p data-testid="budget-missing-items">{estimate.missingItems.length?estimate.missingItems.join(' · '):'请继续核实工程范围和报价是否覆盖实际建设内容。'}</p><span>未录入费用按未计处理；“0 元”表示明确按零计。规划范围用于比较方案，属于假设情景。</span></div>
    <MaterialPurchasePanel project={project} onInclude={updateMaterialBudget} onOpen={onOpenMaterials}/>
    <OperatingBudgetPanel project={project} onChange={updateOperating}/>
    <section className="surface ce-settings"><div className="section-heading"><div><h2>项目费用与估算口径</h2><p>明确建设范围，补上设施以外的投入。</p></div><span className="subtle-tag">人民币 · 元</span></div><div className="ce-settings-body">
      <div className="ce-context"><label>建设性质<select aria-label="建设性质" value={settings.construction} onChange={e=>patchSettings({construction:e.target.value as BudgetSettings['construction']})}><option value="new">新建</option><option value="renovation">改造</option><option value="simulation">设计模拟</option></select></label><label>建设档次<select aria-label="建设档次" value={settings.grade} onChange={e=>patchSettings({grade:e.target.value as BudgetSettings['grade']})}><option value="economy">经济型</option><option value="standard">中档实用</option><option value="premium">高端度假型</option></select></label><p>记录询价口径，不自动乘价格系数。</p></div>
      <div className="ce-fee-grid"><FeeInput label="设计费率" unit="%" value={settings.designRate} max={100} onCommit={n=>patchSettings({designRate:n??0})}/><FeeInput label="监理费率" unit="%" value={settings.supervisionRate} max={100} onCommit={n=>patchSettings({supervisionRate:n??0})}/><FeeInput label="预备费率" unit="%" value={settings.reserveRate} max={100} onCommit={n=>patchSettings({reserveRate:n??0})}/><FeeInput label="土地费用" unit="元" nullable value={settings.landAmount} onCommit={n=>patchSettings({landAmount:n})}/><FeeInput label="场地工程费用" unit="元" nullable value={settings.siteAmount} onCommit={n=>patchSettings({siteAmount:n})}/><FeeInput label="市政接入费用" unit="元" nullable value={settings.connectionAmount} onCommit={n=>patchSettings({connectionAmount:n})}/><FeeInput label="开办费用" unit="元" nullable value={settings.openingAmount} onCommit={n=>patchSettings({openingAmount:n})}/></div>
      <p className="ce-explanation">默认设计 3%、监理 1%、预备费 10% 为可修改的规划假设，非官方收费标准。设计、监理按设施工程小计计提；预备费以工程、设计、监理、场地工程和市政接入费用之和为基数。不含土地与开办费。</p>
      <div className="ce-fee-totals"><span>设计费 <strong>{money(estimate.designAmount)}</strong></span><span>监理费 <strong>{money(estimate.supervisionAmount)}</strong></span><span>预备费 <strong>{money(estimate.reserveAmount)}</strong></span></div>
    </div></section>
    <section className="surface"><div className="section-heading"><div><h2>设施投资明细</h2><p>按工程量核算分项，或录入供应商整项报价。</p></div><span className="subtle-tag">{project.facilities.length} 个设施</span></div><div className="table-wrap"><table className="budget-table ce-table"><thead><tr><th>设施 / 类型</th><th>计价口径</th><th>参考单价 / 来源</th><th>设施工程估算</th><th>计价明细</th></tr></thead><tbody>{project.facilities.map(f=>{
      const price=estimateFacility(f)
      const Icon=getFacilityIcon(f.presetId??f.type)
      return <tr key={f.id} data-cost-facility={f.id} data-facility-cost-id={f.id} data-cost-point={price.point}><td><span className="table-facility"><Icon size={17}/><strong>{f.name}</strong>{f.locked&&<LockKeyhole size={13} aria-label="已锁定"/>}</span><small className="ce-subtext">{getFacilityLabel(f)}</small></td><td>{price.source==='legacy'?(f.type==='court'?'1 片':`${formatArea(f.width*f.depth*((f.type==='hotel'||f.type==='restaurant')?f.floors:1))} ㎡`):price.source==='quotation'?'整项总报价':`${price.rows.length} 项工程量`}<small className="ce-subtext">{price.taxUnresolved?'税费待核实':'按所填税口径计算'}</small></td><td>{price.source==='legacy'?<div className="budget-price"><span>¥</span><input aria-label={`${f.name}参考单价`} type="number" min={0} max={10000000} value={f.unitCost} disabled={!!f.locked} onChange={e=>{if(e.target.value!==''&&Number.isFinite(+e.target.value))update(f.id,{unitCost:Math.min(10000000,Math.max(0,+e.target.value))})}}/><small>/{f.type==='court'?'片':'㎡'}</small></div>:<span className="ce-source-name">{price.source==='quotation'?f.pricing?.quote?.supplier:'各项单价独立核算'}</span>}<small className={`ce-source ce-source-${price.source}`}>{SOURCES[price.source]}</small>{price.staleQuote&&<small className="ce-subtext ce-caution">超过 90 天，请复核</small>}</td><td><strong>{money(price.point)}</strong><small className="ce-subtext">情景 {wan(price.low)} – {wan(price.high)} 万</small></td><td><button className="ce-edit-button" disabled={!!f.locked} aria-label={`编辑${f.name}计价明细`} onClick={()=>setEditing(f.id)}>编辑计价<ArrowUpRight size={13}/></button></td></tr>
    })}</tbody><tfoot><tr><td colSpan={3}>设施工程小计</td><td colSpan={2}>{money(estimate.engineering.point)}</td></tr></tfoot></table></div>{!project.facilities.length&&<p className="ce-empty">先在场地设计中添加设施，再填写预算。</p>}<div className="estimate-note"><Calculator size={17}/><p>原综合价沿用已有示例单价；生成分项只拆分原金额，需根据真实询价更新。总包报价会替代设施分项。已计合计包含上方录入的项目费用；未录入时不含土地、场地、市政接入和开办费，餐饮与日常消耗在运营预算中单列，其他未录入支出和融资另行核算。</p></div></section>
    <section className="surface ce-references"><div className="section-heading"><div><h2>北京计价资料与参考工程</h2><p>用来核对范围和方法。参考工程条件与本酒店不同，需另行询价。</p></div></div><div className="ce-reference-list">{COST_REFERENCES.map(ref=><article key={ref.url}><div><span>{ref.kind} · {ref.date}</span><a href={ref.url} target="_blank" rel="noreferrer">{ref.title}<ArrowUpRight size={14}/></a></div><p>{ref.summary}</p></article>)}</div></section>
    {facility&&<FacilityPricingEditor key={facility.id} project={project} facility={facility} onClose={close} onSave={pricing=>{update(facility.id,{pricing});close()}}/>}
  </div>
}

function FeeInput({label,unit,value,nullable=false,max=100000000000,onCommit}:{label:string;unit:string;value:number|null;nullable?:boolean;max?:number;onCommit:(n:number|null)=>void}){
  const [draft,setDraft]=useState(value===null?'':String(value))
  const [invalid,setInvalid]=useState(false)
  useEffect(()=>{setDraft(value===null?'':String(value));setInvalid(false)},[value])
  function commit(){if(draft===''&&nullable){setInvalid(false);onCommit(null);return}const n=Number(draft);if(draft===''||!Number.isFinite(n)||n<0||n>max){setInvalid(true);return}setInvalid(false);onCommit(n)}
  return <label className="ce-fee-input">{label}<div><input aria-label={label} aria-invalid={invalid} type="number" min={0} max={max} step="any" placeholder={nullable?'未报价，暂未计入':undefined} value={draft} onChange={e=>{setDraft(e.target.value);setInvalid(false)}} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><span>{unit}</span></div>{invalid&&<small role="alert">请填 0 至 {formatNumber(max)} 的数值。</small>}</label>
}
