import { useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Trash2 } from 'lucide-react'
import { Modal } from './ui'
import { parseProject, formatNumber } from './model'
import { createFacilityPricing, estimateFacility, validateFacilityPricing } from './pricing'
import type { Facility, FacilityPricing, PriceItem, Project, PricingBasis, TaxMode } from './types'

const BASIS:Record<PricingBasis,string>={grossArea:'建筑面积 · ㎡',footprint:'占地面积 · ㎡',rooms:'客房数量 · 间',perimeter:'设施周长 · m',count:'设施数量 · 个',manual:'手填工程量'}
const TAX:Record<TaxMode,string>={included:'含税',excluded:'不含税',unknown:'税口径未核实'}
const clone=<T,>(value:T):T=>JSON.parse(JSON.stringify(value))

export default function FacilityPricingEditor({project,facility,onClose,onSave}:{project:Project;facility:Facility;onClose:()=>void;onSave:(pricing:FacilityPricing|undefined)=>void}) {
  const [draft,setDraft]=useState<FacilityPricing>(()=>clone(facility.pricing??{mode:'items',items:[]}))
  const [error,setError]=useState('')
  const estimate=estimateFacility({...facility,pricing:draft.mode==='items'&&!draft.items.length?undefined:draft})
  const quote=draft.quote??{amount:0,taxMode:'unknown' as TaxMode,supplier:'',date:'',scope:''}
  function patchItem(id:string,patch:Partial<PriceItem>){setDraft(d=>({...d,items:d.items.map(i=>i.id===id?{...i,...patch}:i)}));setError('')}
  function patchQuote(patch:Partial<typeof quote>){setDraft(d=>({...d,quote:{...(d.quote??quote),...patch}}));setError('')}
  function save(pricing:FacilityPricing|undefined){
    if(facility.locked)return
    try{
      if(pricing?.mode==='items'&&!pricing.items.length)throw new Error('请生成分项草案或添加至少一个费用项。')
      let activePricing:FacilityPricing|undefined
      if(pricing?.mode==='quotation'){
        const active=validateFacilityPricing({mode:'quotation',items:[],quote:pricing.quote})
        let items=facility.pricing?.items??[]
        try{items=validateFacilityPricing({mode:'items',items:pricing.items}).items}catch{/* Retain the saved valid items when the inactive draft is incomplete. */}
        activePricing={...active,items}
      }else if(pricing){
        const active=validateFacilityPricing({mode:'items',items:pricing.items})
        let quote=facility.pricing?.quote
        if(pricing.quote){try{quote=validateFacilityPricing({mode:'quotation',items:[],quote:pricing.quote}).quote}catch{/* Retain the saved valid quote when the inactive draft is incomplete. */}}
        activePricing={...active,...(quote?{quote}:{})}
      }
      const candidate={...project,facilities:project.facilities.map(f=>f.id===facility.id?{...f,pricing:activePricing}:f)}
      parseProject(JSON.stringify(candidate))
      onSave(activePricing)
    }catch(reason){setError(reason instanceof Error?reason.message:'请检查费用、来源和日期后再保存。')}
  }
  return createPortal(<div className="ce-modal-host"><Modal title={`${facility.name} · 计价明细`} onClose={onClose} wide><form className="ce-editor" noValidate onSubmit={e=>{e.preventDefault();save(draft)}}>
    <p className="ce-explanation">分项价格会随实际工程量更新。供应商总报价按整项金额计算；保存后替代原综合价。只计当前模式；已有有效分项或报价参数保留。报价由用户录入，未独立核验。</p>
    <fieldset disabled={!!facility.locked} className="ce-editor-fields">
      <div className="ce-mode" role="group" aria-label="计价方式"><button type="button" aria-pressed={draft.mode==='items'} onClick={()=>setDraft(d=>({...d,mode:'items'}))}>分项工程量</button><button type="button" aria-pressed={draft.mode==='quotation'} onClick={()=>setDraft(d=>({...d,mode:'quotation',quote:d.quote??quote}))}>供应商总报价</button></div>
      {draft.mode==='items'?<>
        <div className="ce-draft-tools"><button type="button" className="button secondary" onClick={()=>{try{const generated=createFacilityPricing(facility);setDraft(d=>({...generated,...(d.quote?{quote:d.quote}:{})}));setError('')}catch(reason){setError(reason instanceof Error?reason.message:'分项草案生成失败，请手动填写费用项。')}}}>从原综合价生成分项草案</button><span>沿用原金额拆分，草案单价仍为内部假设。</span></div>
        {!draft.items.length&&<p className="ce-empty">尚未启用分项计价。可生成草案，再按真实询价逐项更新。</p>}
        <div className="ce-item-list">{draft.items.map((item,index)=><section key={item.id} className="ce-price-item">
          <div className="ce-item-heading"><strong>费用项 {index+1}</strong><button type="button" className="icon-button" aria-label={`删除费用项${index+1}`} onClick={()=>setDraft(d=>({...d,items:d.items.filter(i=>i.id!==item.id)}))}><Trash2 size={16}/></button></div>
          <div className="ce-fields"><label>费用名称<input aria-label={`费用项${index+1}名称`} required maxLength={100} value={item.label} onChange={e=>patchItem(item.id,{label:e.target.value})}/></label><label>计价数量依据<select aria-label={`费用项${index+1}数量依据`} value={item.basis} onChange={e=>patchItem(item.id,{basis:e.target.value as PricingBasis,...(e.target.value==='manual'?{quantity:item.quantity??1,unit:item.unit??'项'}:{})})}>{Object.entries(BASIS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            {item.basis==='manual'&&<><Numeric label={`费用项${index+1}工程量`} caption="手填工程量" value={item.quantity??1} onChange={n=>patchItem(item.id,{quantity:n})}/><label>单位<input aria-label={`费用项${index+1}单位`} required maxLength={20} value={item.unit??'项'} onChange={e=>patchItem(item.id,{unit:e.target.value})}/></label></>}
            <Numeric label={`费用项${index+1}单价`} caption="采用单价（元）" value={item.unitPrice} onChange={n=>patchItem(item.id,{unitPrice:n})}/><Numeric label={`费用项${index+1}低位单价`} caption="规划低位（元）" value={item.lowUnitPrice} onChange={n=>patchItem(item.id,{lowUnitPrice:n})}/><Numeric label={`费用项${index+1}高位单价`} caption="规划高位（元）" value={item.highUnitPrice} onChange={n=>patchItem(item.id,{highUnitPrice:n})}/>
            <label>税口径<select aria-label={`费用项${index+1}税口径`} value={item.taxMode} onChange={e=>patchItem(item.id,{taxMode:e.target.value as TaxMode,taxRate:undefined})}>{Object.entries(TAX).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
            {item.taxMode==='excluded'&&<OptionalNumeric label={`费用项${index+1}税率`} caption="税率（%，未知留空）" max={100} value={item.taxRate} onChange={n=>patchItem(item.id,{taxRate:n})}/>}
          </div>
          <details className="ce-evidence"><summary>价格来源与范围 · {item.evidence.kind==='assumption'?'内部假设':item.evidence.kind==='reference'?'公开参考':'用户报价'}</summary><div className="ce-fields">
            <label>来源类型<select aria-label={`费用项${index+1}来源类型`} value={item.evidence.kind} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,kind:e.target.value as PriceItem['evidence']['kind']}})}><option value="assumption">内部假设</option><option value="reference">公开参考</option><option value="quotation">用户录入报价（未独立核验）</option></select></label>
            <label>来源名称<input aria-label={`费用项${index+1}来源名称`} required maxLength={200} value={item.evidence.name} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,name:e.target.value}})}/></label>
            <label>来源日期<input aria-label={`费用项${index+1}来源日期`} type="date" required={item.evidence.kind==='quotation'} value={item.evidence.date??''} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,date:e.target.value||undefined}})}/></label>
            <label>来源链接<input aria-label={`费用项${index+1}来源链接`} type="url" placeholder="https://…（可选）" maxLength={1000} value={item.evidence.url??''} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,url:e.target.value||undefined}})}/></label>
            <label className="ce-span">包含范围<input aria-label={`费用项${index+1}包含范围`} required maxLength={1000} value={item.evidence.scope} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,scope:e.target.value}})}/></label>
          </div></details>
          {estimate.rows.find(row=>row.id===item.id)&&<div className="ce-row-result">工程量 {formatNumber(estimate.rows.find(row=>row.id===item.id)!.quantity,2)} {estimate.rows.find(row=>row.id===item.id)!.unit}<strong>{Number.isFinite(estimate.rows.find(row=>row.id===item.id)!.amount)?`¥ ${formatNumber(estimate.rows.find(row=>row.id===item.id)!.amount,2)}`:'请补齐金额'}</strong></div>}
        </section>)}</div>
        <button type="button" className="button secondary" disabled={draft.items.length>=20} onClick={()=>setDraft(d=>({...d,items:[...d.items,{id:crypto.randomUUID(),label:'新增费用',basis:'manual',quantity:1,unit:'项',unitPrice:0,lowUnitPrice:0,highUnitPrice:0,taxMode:'unknown',evidence:{kind:'assumption',name:'待询价',scope:'请填写本项包含范围'}}]}))}><Plus size={15}/>添加费用项</button>
      </>:<section className="ce-quote"><div className="ce-fields">
        <Numeric label="供应商报价总额" caption="整项报价总额（元）" value={quote.amount} onChange={n=>patchQuote({amount:n})}/><label>供应商名称<input aria-label="供应商名称" required maxLength={200} value={quote.supplier} onChange={e=>patchQuote({supplier:e.target.value})}/></label>
        <label>报价日期<input aria-label="报价日期" type="date" required value={quote.date} onChange={e=>patchQuote({date:e.target.value})}/></label><label>报价税口径<select aria-label="报价税口径" value={quote.taxMode} onChange={e=>patchQuote({taxMode:e.target.value as TaxMode,taxRate:undefined})}>{Object.entries(TAX).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        {quote.taxMode==='excluded'&&<OptionalNumeric label="报价税率" caption="税率（%，未知留空）" max={100} value={quote.taxRate} onChange={n=>patchQuote({taxRate:n})}/>}
        <label>报价链接<input aria-label="报价链接" type="url" maxLength={1000} placeholder="https://…（可选）" value={quote.url??''} onChange={e=>patchQuote({url:e.target.value||undefined})}/></label>
        <label className="ce-span">报价包含范围<input aria-label="报价包含范围" required maxLength={1000} placeholder="例如：基础、面层、围网与照明，含安装" value={quote.scope} onChange={e=>patchQuote({scope:e.target.value})}/></label>
      </div><p className="ce-explanation">总报价会替代该设施全部分项，不重复加上原参考价。总报价不随尺寸或客房数变化，请核对报价范围。未列入报价范围的工程仍需补充核实。</p></section>}
    </fieldset>
    <div className="ce-editor-total"><span>当前设施工程估算</span><strong>{Number.isFinite(estimate.point)?`¥ ${formatNumber(estimate.point,2)}`:'请补齐金额'}</strong><small>{Number.isFinite(estimate.low)&&Number.isFinite(estimate.high)?`规划情景范围 ¥ ${formatNumber(estimate.low,2)} – ${formatNumber(estimate.high,2)}`:'请填写完整的规划低位和高位价格'}</small>{estimate.taxUnresolved&&<small className="ce-caution">税费尚未完整核实，未自动补计。</small>}{estimate.staleQuote&&<small className="ce-caution">报价距今超过 90 天，请向供应商复核。</small>}</div>
    {error&&<p className="ce-error" role="alert">{error}</p>}{facility.locked&&<p className="ce-caution">该设施已锁定，请先解除锁定再编辑价格。</p>}
    <div className="dialog-footer ce-editor-footer"><button type="button" className="ce-revert" disabled={!!facility.locked||!facility.pricing} onClick={()=>save(undefined)}>恢复原综合价</button><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={!!facility.locked}>保存计价明细</button></div>
  </form></Modal></div>,document.body)
}

function Numeric({label,caption,value,onChange,max=100000000}:{label:string;caption:string;value:number;onChange:(n:number)=>void;max?:number}){return <label>{caption}<input aria-label={label} type="number" min={0} max={max} step="any" required value={Number.isFinite(value)?value:''} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value))}/></label>}
function OptionalNumeric({label,caption,value,onChange,max=100000000}:{label:string;caption:string;value:number|undefined;onChange:(n:number|undefined)=>void;max?:number}){return <label>{caption}<input aria-label={label} type="number" min={0} max={max} step="any" placeholder="未核实" value={value??''} onChange={e=>onChange(e.target.value===''?undefined:Number(e.target.value))}/></label>}
