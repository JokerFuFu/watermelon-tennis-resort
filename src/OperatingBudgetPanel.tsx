import { useEffect, useState } from 'react'
import { CircleDollarSign, Droplets, Plus, Trash2, Utensils } from 'lucide-react'
import { formatNumber } from './model'
import { estimateCombinedBudget, estimateOperating, getOperatingSettings, validateOperatingSettings } from './operating'
import type { OperatingBasis, OperatingItem, OperatingSettings, Project, TaxMode } from './types'
import './operating-budget.css'

interface Props {project:Project;onChange:(settings:OperatingSettings)=>void}
const BASIS_LABELS:Record<OperatingBasis,string>={guestDay:'宾客人天',staffDay:'员工人天',personDay:'所有服务人天',roomDay:'入住房晚',day:'天',period:'整个期间',manual:'手填总数量'}
const money=(n:number)=>`¥ ${formatNumber(n,2)}`
const number=(n:number)=>formatNumber(n,2)

export default function OperatingBudgetPanel({project,onChange}:Props){
  const [draft,setDraft]=useState<OperatingSettings>(()=>getOperatingSettings(project))
  const [error,setError]=useState('')
  useEffect(()=>{setDraft(getOperatingSettings(project));setError('')},[project.operating])
  const isNew=project.operating===undefined
  const previewProject={...project,operating:{...draft,enabled:true}}
  const preview=estimateOperating(previewProject)
  const accepted=estimateOperating(project)
  const combined=estimateCombinedBudget(project)
  const included=accepted.enabled
  // A rejected source/date/amount edit may remain visible, but is never an accepted total.
  const estimate=error?accepted:preview
  function commit(next:OperatingSettings){
    setDraft(next)
    try{const valid=validateOperatingSettings(next);setError('');if(!isNew||valid.enabled)onChange(valid)}catch(e){setError(e instanceof Error?e.message:'请核实输入的运营预算。')}
  }
  function patch(p:Partial<OperatingSettings>){commit({...draft,...p})}
  function patchItem(id:string,p:Partial<OperatingItem>){patch({items:draft.items.map(item=>item.id===id?{...item,...p}:item)})}
  function add(){if(draft.items.length>=30)return;patch({items:[...draft.items,{id:crypto.randomUUID(),label:'自定义日常费用',included:true,basis:'period',quantity:1,unit:'项',unitPrice:null,taxMode:'unknown',evidence:{kind:'assumption',name:'用户待填写',scope:'请填写采购或消耗范围'}}]})}
  return <section className="surface ob-panel" aria-label="餐饮与日常运营预算" data-testid="operating-panel">
    <div className="section-heading"><div><h2><Droplets size={19}/> 餐饮与日常运营预算</h2><p>饮用水、三餐、日用品与员工消耗，按选定经营期间计算。</p></div><span className="subtle-tag">采购与消耗成本 · 元</span></div>
    <div className="ob-body">
      <div className={`ob-enable ${included?'ob-enabled':''}`}>
        <div><strong>{error?'存在未保存修改 · 合计保持有效配置':included?'已计入综合资金需求':isNew?'示例预览 · 尚未计入预算':'运营预算已暂停计入'}</strong><p>{error?'请补齐错误内容；目前合计和导出仍按上次有效配置计算。':isNew?'默认草案为 30 天、70% 假设入住率、每间 2 位宾客、0 位员工。启用后保存到当前方案。':'停用保留全部配置，重新启用可继续按原口径计算。'}</p></div>
        {isNew?<button className="button primary" data-testid="operating-enable" onClick={()=>patch({enabled:true})}>启用并计入运营预算</button>:<label className="ob-switch"><input type="checkbox" aria-label="计入运营预算" data-testid="operating-enabled" checked={included} onChange={e=>patch({enabled:e.target.checked})}/><span>计入运营预算</span></label>}
      </div>
      <div className="ob-summary">
        <div><span><Utensils size={16}/> {error?'运营已计金额（不含未保存修改）':included?'期间运营已计金额':'期间运营示例预览'}</span><strong data-testid="operating-total" data-operating-total={accepted.total}>{money(estimate.total)}</strong><small>{estimate.days} 天 · {included?'包含已启用且已报价的项目':'未启用，未加到综合合计'}</small></div>
        <div><span>每日均摊</span><strong data-testid="operating-per-day">{money(estimate.perDay)}</strong><small>期间已计金额 ÷ 天数</small></div>
        <div><span><CircleDollarSign size={16}/> 建设 + 所选期间合计</span><strong data-testid="combined-total" data-combined-total={combined.total.point}>{money(combined.total.point)}</strong><small>建设已计金额 + 已启用运营费用</small></div>
      </div>
      <p className="ob-note">以下初始单价为内部示例采购成本，可按实际询价修改，不是北京市场报价，也不是餐饮售价或收入。运营费用单独核算，不加建设设计、监理或预备费；综合合计不代表全生命周期成本。</p>
      <div className="ob-parameters">
        <AmountInput label="经营期间天数" value={draft.days} min={1} max={3650} integer unit="天" onCommit={v=>patch({days:v??1})}/>
        <label>宾客人数口径<select aria-label="宾客人数口径" data-testid="operating-guest-mode" value={draft.guestMode} onChange={e=>patch({guestMode:e.target.value as OperatingSettings['guestMode']})}><option value="rooms">按客房与入住率推算</option><option value="manual">手填每日服务人数</option></select></label>
        <AmountInput label="假设入住率" value={draft.occupancyRate} max={100} unit="%" onCommit={v=>patch({occupancyRate:v??0})}/>
        {draft.guestMode==='rooms'?<AmountInput label="每间入住宾客数" value={draft.guestsPerRoom} max={10} unit="人/间" onCommit={v=>patch({guestsPerRoom:v??0})}/>:<AmountInput label="平均每日服务宾客数" value={draft.dailyGuests} max={1000000} unit="人" onCommit={v=>patch({dailyGuests:v??0})}/>}
        <AmountInput label="每日员工人数" value={draft.staffCount} max={100000} integer unit="人" onCommit={v=>patch({staffCount:v??0})}/>
      </div>
      <div className="ob-bases" data-testid="operating-bases"><span>平均宾客 <strong>{number(estimate.averageGuests)} 人/天</strong></span><span>宾客人天 <strong>{number(estimate.guestDays)}</strong></span><span>员工人天 <strong>{number(estimate.staffDays)}</strong></span><span>入住房晚 <strong>{number(estimate.roomNights)}</strong></span></div>
      <p className="ob-note">平均人数与入住间数允许小数，属于规划平均值。手填宾客数替代客房推算人数；房晚仍独立按客房 × 假设入住率 × 天数计算。员工餐单列，不重复计入宾客三餐。</p>
      {(estimate.unpricedItems.length>0||estimate.taxUnresolvedItems.length>0)&&<div className="ob-missing" role="status" data-testid="operating-missing">{estimate.unpricedItems.length>0&&<p><strong>尚未报价：</strong>{estimate.unpricedItems.join('、')}。未加到期间已计金额；填写 0 表示明确按零计。</p>}{estimate.taxUnresolvedItems.length>0&&<p><strong>税费待核实：</strong>{estimate.taxUnresolvedItems.join('、')}。未填税率时不会自动加税。</p>}</div>}
      {error&&<p className="ob-error" role="alert" data-testid="operating-error">本次修改尚未保存：{error}。合计和导出不包含这些未保存修改。</p>}
      <div className="ob-items-heading"><h3>日常费用明细 <small>{draft.items.length} / 30 项</small></h3><button className="button secondary" disabled={draft.items.length>=30} onClick={add} aria-label="添加自定义运营费用"><Plus size={15}/>添加费用</button></div>
      <div className="ob-items">{draft.items.map((item,index)=>{
        const row=estimate.rows.find(r=>r.id===item.id)
        return <article className={`ob-item ${item.included?'':'ob-item-disabled'}`} key={item.id} data-operating-item={item.id} data-operating-label={item.label}>
          <header><label className="ob-switch"><input type="checkbox" aria-label={`计入${item.label}`} checked={item.included} onChange={e=>patchItem(item.id,{included:e.target.checked})}/><span>计入合计</span></label><button className="ob-delete" aria-label={`删除${item.label}`} onClick={()=>patch({items:draft.items.filter(i=>i.id!==item.id)})}><Trash2 size={15}/></button></header>
          <div className="ob-item-fields"><label className="ob-full">费用名称<input aria-label={`第${index+1}项运营费用名称`} maxLength={100} value={item.label} onChange={e=>patchItem(item.id,{label:e.target.value})}/></label>
            <label>数量基数<select aria-label={`${item.label}数量基数`} value={item.basis} onChange={e=>patchItem(item.id,{basis:e.target.value as OperatingBasis})}>{Object.entries(BASIS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            <AmountInput label={item.basis==='manual'?`${item.label}总数量`:`${item.label}每单位用量`} shortLabel={item.basis==='manual'?'期间总数量':'每基数用量'} value={item.quantity} max={1000000} unit={item.unit} onCommit={v=>patchItem(item.id,{quantity:v??0})}/>
            <label>用量单位<input aria-label={`${item.label}用量单位`} maxLength={20} value={item.unit} onChange={e=>patchItem(item.id,{unit:e.target.value})}/></label>
            <AmountInput label={`${item.label}单价`} shortLabel="单价" nullable value={item.unitPrice} max={1000000} unit={`元/${item.unit}`} onCommit={v=>patchItem(item.id,{unitPrice:v})}/>
            <label>税费口径<select aria-label={`${item.label}税费口径`} value={item.taxMode} onChange={e=>patchItem(item.id,{taxMode:e.target.value as TaxMode})}><option value="unknown">税费待核实</option><option value="included">单价已含税</option><option value="excluded">单价未含税</option></select></label>
            {item.taxMode==='excluded'&&<AmountInput label={`${item.label}税率`} shortLabel="税率（留空待核实）" nullable value={item.taxRate??null} max={100} unit="%" onCommit={v=>patchItem(item.id,{taxRate:v??undefined})}/>}
          </div>
          <div className="ob-calculation"><span>{row?`${number(row.baseQuantity)} ${BASIS_LABELS[item.basis]} × ${number(item.quantity)} ${item.unit}`:'按填写口径计算'}{item.basis==='manual'&&'（总数，不再乘天数）'}</span><strong data-operating-row-amount={row?.amount??''}>{!item.included?'未计入':row?.amount==null?'待报价':money(row.amount)}</strong>{row&&row.taxAmount>0&&<small>已加税 {money(row.taxAmount)}</small>}</div>
          <details className="ob-evidence"><summary>单价来源 · {item.evidence.kind==='quotation'?'用户报价，未独立核验':item.evidence.kind==='reference'?'参考资料，需复核':'内部假设，待询价'}</summary><div className="ob-item-fields">
            <label>来源类型<select aria-label={`${item.label}来源类型`} value={item.evidence.kind} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,kind:e.target.value as OperatingItem['evidence']['kind']}})}><option value="assumption">内部假设</option><option value="reference">参考资料</option><option value="quotation">用户录入报价</option></select></label>
            <label>来源或供应商<input aria-label={`${item.label}来源名称`} maxLength={200} value={item.evidence.name} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,name:e.target.value}})}/></label>
            <label>报价日期{item.evidence.kind==='quotation'?'（必填）':'（可选）'}<input type="date" aria-label={`${item.label}报价日期`} value={item.evidence.date??''} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,date:e.target.value||undefined}})}/></label>
            <label>资料链接（可选）<input type="url" aria-label={`${item.label}来源链接`} maxLength={1000} placeholder="https://…" value={item.evidence.url??''} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,url:e.target.value||undefined}})}/></label>
            <label className="ob-full">采购与服务范围<input aria-label={`${item.label}采购范围`} maxLength={1000} value={item.evidence.scope} onChange={e=>patchItem(item.id,{evidence:{...item.evidence,scope:e.target.value}})}/></label>
          </div></details>
        </article>
      })}</div>
      <p className="ob-note">每项总数量 = 对应基数 × 用量。按“整个期间”录入水电燃气等总额时不再乘天数；手填数量也是期间总数。已含税单价直接计入，未含税且填写税率时只加税一次。完整经营预算还需逐项核实工资、租赁、维护、保险等实际费用，可自行添加。</p>
    </div>
  </section>
}

function AmountInput({label,shortLabel,value,nullable=false,min=0,max,integer=false,unit,onCommit}:{label:string;shortLabel?:string;value:number|null;nullable?:boolean;min?:number;max:number;integer?:boolean;unit:string;onCommit:(n:number|null)=>void}){
  const [text,setText]=useState(value===null?'':String(value))
  const [invalid,setInvalid]=useState(false)
  useEffect(()=>{setText(value===null?'':String(value));setInvalid(false)},[value])
  function valid(raw:string){const n=Number(raw);return raw.trim()!==''&&Number.isFinite(n)&&n>=min&&n<=max&&(!integer||Number.isInteger(n))}
  function change(raw:string){setText(raw);setInvalid(false);if(raw===''&&nullable)onCommit(null);else if(valid(raw))onCommit(Number(raw))}
  function blur(){if(text===''&&nullable){onCommit(null);setInvalid(false)}else if(valid(text)){onCommit(Number(text));setInvalid(false)}else setInvalid(true)}
  return <label className="ob-amount">{shortLabel??label}<div><input aria-label={label} aria-invalid={invalid} type="text" inputMode="decimal" value={text} placeholder={nullable?'未报价':undefined} onChange={e=>change(e.target.value)} onBlur={blur} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><span>{unit}</span></div>{invalid&&<small role="alert">请填写 {min} 至 {number(max)} 的{integer?'整数':'数值'}。</small>}</label>
}
