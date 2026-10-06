import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, CalendarDays, Download, TrendingUp, Wallet } from 'lucide-react'
import { estimateEarnings, getEarningsSettings } from './earnings'
import { getEarningsScenarios } from './earningsScenarios'
import { getOperatingSettings, validateOperatingSettings } from './operating'
import { formatNumber, ROOM_TYPES } from './model'
import MonthlyPlannerPanel from './MonthlyPlannerPanel'
import type { EarningsEstimate, EarningsPeriodId, EarningsSettings, OperatingItem, OperatingSettings, MonthlyPlanSettings, Project, RoomType } from './types'
import './earnings.css'

interface Props {project:Project;onChange:(settings:EarningsSettings)=>void;onChangeOperating:(settings:OperatingSettings)=>void;onOpenOperating:()=>void;onExport:()=>void;onChangeMonthly:(settings:MonthlyPlanSettings)=>void;onExportMonthly:()=>void}
const ROOM_KEYS:RoomType[]=['standard','deluxe','suite']
const PERIODS:{id:EarningsPeriodId;label:string}[]=[{id:'day',label:'日'},{id:'week',label:'周'},{id:'month',label:'月'},{id:'year',label:'年'}]
const money=(value:number|null)=>value===null?'待补齐':`¥ ${formatNumber(value,2)}`
const years=(value:number)=>value<.01?'少于 0.01 年':`${formatNumber(value,2)} 年`

export default function EarningsPage({project,onChange,onChangeOperating,onOpenOperating,onExport,onChangeMonthly,onExportMonthly}:Props){
  const settings=useMemo(()=>getEarningsSettings(project),[project])
  const estimate=useMemo(()=>estimateEarnings(project),[project])
  const operating=useMemo(()=>getOperatingSettings(project),[project])
  const scenarios=useMemo(()=>getEarningsScenarios(project),[project])
  const [view,setView]=useState<'annual'|'monthly'>(()=>{const requested=new URLSearchParams(window.location.search).get('earningsView');return requested==='annual'||requested==='monthly'?requested:project.monthlyPlan?.enabled?'monthly':'annual'})
  function changeView(next:'annual'|'monthly'){const active=document.activeElement;if(active instanceof HTMLInputElement||active instanceof HTMLTextAreaElement)active.blur();setView(next);const url=new URL(window.location.href);url.searchParams.set('earningsView',next);window.history.replaceState(null,'',url)}
  const viewTabs=<div className="earnings-model-tabs" role="group" aria-label="经营测算模式"><button aria-pressed={view==='annual'} onClick={()=>changeView('annual')}>年度简算</button><button aria-pressed={view==='monthly'} onClick={()=>changeView('monthly')}>月度经营</button><span>{project.monthlyPlan?.enabled?'总览采用月度计划':'总览采用年度恒定情景'}</span></div>
  const [periodId,setPeriodId]=useState<EarningsPeriodId>('year')
  const [error,setError]=useState('')
  const [operatingError,setOperatingError]=useState('')
  const selected=estimate.periods.find(period=>period.id===periodId)??estimate.periods[0]
  const annual=estimate.periods.find(period=>period.id==='year')!
  const roomTotal=ROOM_KEYS.reduce((sum,key)=>sum+estimate.availableRooms[key],0)
  function patch(update:Partial<EarningsSettings>){try{onChange({...settings,...update});setError('')}catch(e){setError(e instanceof Error?e.message:'请核实收益参数。')}}
  function patchOperating(update:Partial<OperatingSettings>){try{onChangeOperating(validateOperatingSettings({...operating,...update}));setOperatingError('')}catch(e){setOperatingError(e instanceof Error?e.message:'请核实运营费用。')}}
  function patchCost(id:string,update:Pick<Partial<OperatingItem>,'unitPrice'|'included'>){patchOperating({items:operating.items.map(item=>item.id===id?{...item,...update}:item)})}
  const payoff=estimate.paybackStatus==='ready'&&estimate.paybackYears!==null?years(estimate.paybackYears):estimate.paybackStatus==='nonpositive'?'当前假设下无法回本':estimate.paybackStatus==='no-investment'?'请填写建设投入':'待补齐收入与成本'
  if(view==='monthly')return <div className="earnings-page">{viewTabs}<MonthlyPlannerPanel key={project.id} project={project} onChange={onChangeMonthly} onOpenAnnual={()=>changeView('annual')} onOpenOperating={onOpenOperating} onExport={onExportMonthly}/></div>
  return <div className="earnings-page" aria-label="收益与回本" data-testid="earnings-page">{viewTabs}
    <div className="earnings-heading"><div><span className="earnings-eyebrow"><TrendingUp size={16}/> 酒店经营测算</span><h2>收益与回本</h2><p>把客房收入、日常支出和建设投入放在一起，查看现金回收进度。</p></div><button className="button secondary" onClick={onExport}><Download size={16}/>导出收益测算</button></div>
    <section className="surface earnings-summary">
      <div className="earnings-summary-top"><div><CalendarDays size={18}/><strong>按{PERIODS.find(p=>p.id===periodId)?.label}查看</strong></div><div className="earnings-period-tabs" role="group" aria-label="收益查看周期">{PERIODS.map(period=><button key={period.id} aria-label={`查看${period.label}收益`} aria-pressed={periodId===period.id} onClick={()=>setPeriodId(period.id)}>{period.label}</button>)}</div></div>
      <div className="earnings-summary-grid" data-selected-earnings-period={periodId}>
        <article><span>营业收入</span><strong data-earnings-revenue={selected.totalRevenue??undefined}>{money(selected.totalRevenue)}</strong><small>客房 {money(selected.roomRevenue)} + 其他 {money(selected.otherRevenue)}</small>{selected.totalRevenue===null&&<small>已填收入 {money(selected.knownRevenue)}</small>}</article>
        <article><span>已填成本与费用</span><strong data-earnings-cost={selected.knownCosts}>{money(selected.knownCosts)}</strong><small>日常运营、额外支出及营业额费用预留</small>{estimate.missingItems.length>0&&<small className="earnings-caution">待补项仍未包含在内</small>}</article>
        <article className="earnings-cash-card"><span>经营现金结余</span><strong data-earnings-cash={selected.cashSurplus??undefined}>{money(selected.cashSurplus)}</strong><small>{selected.cashSurplus===null?`已填范围结余 ${money(selected.knownSurplus)}`:'营业收入 − 全部已填经营成本与费用'}</small><small>用于计算回本；不等同于会计净利润</small></article>
      </div>
      <p className="earnings-note">按全年 365 天、每周 7 天、平均每月 365 ÷ 12 天换算。假设房价、入住率全年不变，平均月并非某个自然月的实际收入；各分项按分舍入，月×12与年合计可能有舍入差额。</p>
    </section>

    <section className="surface earnings-period-section"><div className="section-heading"><div><h2>日、周、月、年对照</h2><p>同一套经营假设，各周期采用一致的费用均摊口径。</p></div><span className="subtle-tag">人民币 · 元</span></div><div className="earnings-table-scroll"><table className="earnings-table"><thead><tr><th>周期</th><th>营业收入</th><th>已填成本与费用</th><th>经营现金结余</th></tr></thead><tbody>{estimate.periods.map(period=><tr key={period.id} data-earnings-period={period.id}><th scope="row">{period.label}<small>{formatNumber(period.days,2)} 天</small></th><td data-earnings-revenue={period.totalRevenue??undefined}>{money(period.totalRevenue)}{period.totalRevenue===null&&<small>已填 {money(period.knownRevenue)}</small>}</td><td data-earnings-cost={period.knownCosts}>{money(period.knownCosts)}</td><td data-earnings-cash={period.cashSurplus??undefined}><strong>{money(period.cashSurplus)}</strong>{period.cashSurplus===null&&<small>已填范围结余 {money(period.knownSurplus)}</small>}</td></tr>)}</tbody></table></div></section>

    <div className="earnings-payback-grid">
      <section className="surface earnings-investment"><div className="earnings-card-title"><Wallet size={19}/><h2>投入多少，多久回本</h2></div><span className="earnings-muted">回本初始投资</span><strong className="earnings-investment-value" data-earnings-investment={estimate.investment??undefined}>{money(estimate.investment)}</strong><label className="earnings-select">投资口径<select aria-label="回本投资口径" value={settings.investmentMode} onChange={e=>patch({investmentMode:e.target.value as EarningsSettings['investmentMode']})}><option value="construction">使用建设已计投资</option><option value="manual">手填完整初始投资</option></select></label>{settings.investmentMode==='manual'&&<AmountInput label="完整初始投资" value={settings.manualInvestment} nullable max={1e12} unit="元" onCommit={n=>patch({manualInvestment:n})}/>}
        <p className="earnings-note">{settings.investmentMode==='construction'?'沿用投资估算中的建设已计金额，含已选择另计的建材采购；不使用“建设 + 所选期间运营”合计。':'填写建设、土地、开办及其他实际初始投入总额，避免遗漏或重复计入。'}</p>
        <div className="earnings-payback-result" data-payback-status={estimate.paybackStatus} data-payback-years={estimate.paybackYears??undefined}><span>静态回本年限</span><strong>{payoff}</strong>{estimate.investmentIncomplete&&<small>按已计建设投资暂估 · 建设缺项补齐后会变化</small>}<small>初始投资 ÷ 年度经营现金结余</small></div>
      </section>
      <section className="surface earnings-curve"><div className="earnings-card-title"><TrendingUp size={19}/><h2>累计现金回收</h2></div>{annual.cashSurplus!==null&&annual.cashSurplus>0&&estimate.investment!==null&&estimate.investment>0?<PaybackChart estimate={estimate} annualCash={annual.cashSurplus}/>:<div className="earnings-chart-empty"><TrendingUp size={30}/><strong>{estimate.paybackStatus==='nonpositive'?'年度现金结余需转正才能回收投资':'补齐收入、成本和初始投资后显示'}</strong><p>图表按恒定年度现金结余累计；当前不显示未经补齐的回收曲线。</p></div>}</section>
    </div>

    <section className="surface earnings-scenario-section"><div className="section-heading"><div><h2>入住率情景对比</h2><p>在当前入住率上下各调整 10 个百分点，查看收入与回本的变化。</p></div><span className="subtle-tag">临时对比 · 不覆盖方案</span></div><div className="earnings-scenarios">{scenarios.map(scenario=>{
      const year=scenario.estimate.periods.find(period=>period.id==='year')!
      const result=scenario.estimate
      const scenarioPayback=result.paybackStatus==='ready'&&result.paybackYears!==null?years(result.paybackYears):result.paybackStatus==='nonpositive'?'当前假设下无法回本':result.paybackStatus==='no-investment'?'请填写初始投资':'待补齐收入与成本'
      return <article key={scenario.id} data-earnings-scenario={scenario.id} data-scenario-occupancy={scenario.occupancyRate} className={scenario.id==='base'?'earnings-scenario-current':undefined}><header><h3>{scenario.label}</h3><strong>{formatNumber(scenario.occupancyRate,2)}<small>%</small></strong></header><dl><div><dt>年营业收入</dt><dd data-scenario-revenue={year.totalRevenue??undefined}>{money(year.totalRevenue)}</dd></div><div><dt>年经营现金结余</dt><dd data-scenario-cash={year.cashSurplus??undefined}>{money(year.cashSurplus)}</dd></div><div><dt>静态回本</dt><dd data-scenario-payback={result.paybackYears??undefined} data-scenario-payback-status={result.paybackStatus}>{scenarioPayback}</dd></div></dl>{year.cashSurplus===null&&<p>有 {result.missingItems.length} 项收入或成本待补齐</p>}{result.investmentIncomplete&&<p>按已计建设投资暂估</p>}</article>
    })}</div><p className="earnings-note earnings-scenario-note">入住率限制在 0% 至 100%。各情景共用原房价和费用设置，沿用同一测算方法；这是假设对比，不是市场预测，也不会自动保存为当前入住率。</p></section>

    <section className="surface earnings-assumptions"><div className="section-heading"><div><h2>客房收入与经营假设</h2><p>可售 {formatNumber(roomTotal)} 间 · 平均入住 {formatNumber(estimate.occupiedRooms,2)} 间 / 天</p></div><span className="subtle-tag">{project.earnings?'已保存到方案':'示例预览 · 修改后保存'}</span></div><div className="earnings-assumption-body"><p className="earnings-note">初始房价为内部情景示例：标准间 500 元、景观房 700 元、套房 1,000 元。请按自己的实际售价调整，这些不是北京市场报价。留空表示未知，明确填 0 表示按零计。</p><div className="earnings-room-grid">{ROOM_KEYS.map(key=><article className="earnings-room-card" key={key}><header><i style={{background:ROOM_TYPES[key].color}}/><h3>{ROOM_TYPES[key].label}</h3><span>规划 {formatNumber(estimate.roomCounts[key])} 间</span></header><AmountInput label={`${ROOM_TYPES[key].label}每晚房价`} value={settings.roomRates[key]} nullable max={1000000} unit="元/房晚" onCommit={n=>patch({roomRates:{...settings.roomRates,[key]:n}})}/><AmountInput label={`${ROOM_TYPES[key].label}停用房数`} value={settings.unavailableRooms[key]} integer max={estimate.roomCounts[key]} unit="间" onCommit={n=>patch({unavailableRooms:{...settings.unavailableRooms,[key]:n??0}})}/><p>可售 <strong>{formatNumber(estimate.availableRooms[key])}</strong> 间</p></article>)}</div><div className="earnings-input-grid"><AmountInput label="收益测算入住率" value={settings.occupancyRate} max={100} unit="%" onCommit={n=>patch({occupancyRate:n??0})}/><AmountInput label="收益测算每间宾客数" value={settings.guestsPerRoom} max={10} unit="人/间" onCommit={n=>patch({guestsPerRoom:n??0})}/><AmountInput label="其他每日营业收入" value={settings.extraDailyRevenue} nullable max={1000000} unit="元/天" onCommit={n=>patch({extraDailyRevenue:n})}/><AmountInput label="其他每月运营支出" value={settings.extraMonthlyCost} nullable max={1000000} unit="元/月" onCommit={n=>patch({extraMonthlyCost:n})}/><AmountInput label="营业额费用预留比例" value={settings.revenueDeductionRate} nullable max={100} unit="%" onCommit={n=>patch({revenueDeductionRate:n})}/></div><p className="earnings-note">其他收入可填写餐饮、场地租赁、棋牌等每日营业额。其他月支出只填写现有日常费用里未包含的部分；税费、平台抽成等可按营业额预留，比例由你填写，不自动套用税率。</p>{error&&<p className="earnings-error" role="alert">本次参数尚未保存：{error}。测算仍使用上次有效配置。</p>}</div></section>

    <section className="surface earnings-cost-section"><div className="section-heading"><div><h2>年度经营成本来源</h2><p>在此补齐单价或选择费用项，保存后同步日常运营预算。</p></div><button className="button secondary" onClick={onOpenOperating}>编辑日常运营成本<ArrowUpRight size={15}/></button></div><div className="earnings-operating-toggle"><label><input aria-label="收益页计入运营预算" type="checkbox" checked={operating.enabled} onChange={e=>patchOperating({enabled:e.target.checked})}/>收益页计入运营预算</label>{!operating.enabled&&<button className="button secondary" onClick={()=>patchOperating({enabled:true})}>启用日常运营预算</button>}<p>{operating.enabled?'原运营费用已计入本页测算。':'尚未启用；改单价只保存费用配置。启用后才能计算完整现金结余。'}</p></div><div className="earnings-table-scroll"><table className="earnings-table earnings-quick-cost-table"><thead><tr><th>费用项 / 来源</th><th>计入</th><th>采购单价</th><th>年度金额</th><th>原用量与换算口径</th></tr></thead><tbody>{operating.items.map(item=>{
      const cost=estimate.costItems.find(row=>row.id===item.id)
      const tax=item.taxMode==='included'?'含税':item.taxMode==='excluded'?item.taxRate===undefined?'未税 · 税率待核实':`未税 · 税率 ${formatNumber(item.taxRate,2)}%`:'税口径待核实'
      return <tr key={item.id} data-earnings-quick-cost={item.id} data-earnings-cost-item={item.id}><th scope="row">{item.label}<small>{item.evidence.name}</small><small>{tax}</small></th><td><input aria-label={`快捷计入${item.label}`} type="checkbox" checked={item.included} onChange={e=>patchCost(item.id,{included:e.target.checked})}/></td><td><AmountInput label={`${item.label}快捷单价`} value={item.unitPrice} nullable max={1000000} unit={`元/${item.unit}`} onCommit={n=>patchCost(item.id,{unitPrice:n})}/></td><td data-quick-annual-cost={cost?.annualAmount??undefined}>{cost?cost.annualAmount===null?'待报价':money(cost.annualAmount):'未计入'}</td><td className="earnings-basis">{operatingBasis(item,operating.days)}<small>来源、税率、数量与原运营期间可在高级编辑中核实。</small></td></tr>
    })}{estimate.costItems.slice(-2).map(item=><tr key={item.id} data-earnings-cost-item={item.id}><th scope="row">{item.label}</th><td>本页设置</td><td>—</td><td>{item.annualAmount===null?'待填写':money(item.annualAmount)}</td><td className="earnings-basis">{item.basis}</td></tr>)}</tbody></table></div>{operatingError&&<p className="earnings-error earnings-operating-error" role="alert">本次费用尚未保存：{operatingError}。测算仍使用上次有效配置。</p>}<p className="earnings-note earnings-cost-note">原运营期间为 {operating.days} 天。期间或手填费用按原期间“用量 × 单价”均摊到日、周、平均月和年；客房及宾客消耗按本页可售客房数与入住率换算。快捷编辑保留原天数、用量、人数、税率和来源，不改变建设投资，留空仍表示待报价。</p></section>
    {(estimate.missingItems.length>0||estimate.reviewItems.length>0)&&<section className="earnings-checks" aria-label="收益待核实事项">{estimate.missingItems.length>0&&<div className="earnings-missing" role="status"><strong>补齐后才能计算完整结余与回本</strong><ul>{estimate.missingItems.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}{estimate.reviewItems.length>0&&<details open><summary>测算依据与待核实事项</summary><ul>{estimate.reviewItems.map((item,index)=><li key={index}>{item}</li>)}</ul></details>}</section>}
    <p className="earnings-footnote">静态测算忽略资金时间价值、融资、折旧和逐年现金流变化。显示的是经营假设下的现金回收时间，不代表已经实现的利润或保证回报。</p>
  </div>
}

function operatingBasis(item:OperatingItem,days:number){
  if(item.basis==='period'||item.basis==='manual')return `原 ${days} 天${item.basis==='manual'?'手填':'期间'}用量 ${formatNumber(item.quantity,2)} ${item.unit} × 单价，按天数均摊`
  const bases={guestDay:'每宾客人天',staffDay:'每员工人天',personDay:'每宾客及员工人天',roomDay:'每入住房晚',day:'每营业天'}
  return `${bases[item.basis]} ${formatNumber(item.quantity,2)} ${item.unit} × 单价`
}

function AmountInput({label,value,nullable=false,max,integer=false,unit,onCommit}:{label:string;value:number|null;nullable?:boolean;max:number;integer?:boolean;unit:string;onCommit:(value:number|null)=>void}){
  const [text,setText]=useState(value===null?'':String(value))
  const [invalid,setInvalid]=useState(false)
  useEffect(()=>{setText(value===null?'':String(value));setInvalid(false)},[value])
  function valid(raw:string){const n=Number(raw);return raw.trim()!==''&&Number.isFinite(n)&&n>=0&&n<=max&&(!integer||Number.isInteger(n))}
  function change(raw:string){setText(raw);setInvalid(false);if(raw===''&&nullable)onCommit(null);else if(valid(raw))onCommit(Number(raw))}
  function blur(){if(text===''&&nullable){setInvalid(false);onCommit(null)}else if(valid(text)){setInvalid(false);onCommit(Number(text))}else setInvalid(true)}
  return <label className="earnings-amount">{label}<div><input aria-label={label} type="text" inputMode={integer?'numeric':'decimal'} value={text} aria-invalid={invalid} placeholder={nullable?'待填写':undefined} onChange={e=>change(e.target.value)} onBlur={blur} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur()}}/><span>{unit}</span></div>{invalid&&<small role="alert">请填 0 至 {formatNumber(max)} 的{integer?'整数':'数值'}。</small>}</label>
}

function PaybackChart({estimate,annualCash}:{estimate:EarningsEstimate;annualCash:number}){
  const investment=estimate.investment!
  const payback=investment/annualCash
  const horizon=Math.min(40,Math.max(5,Math.ceil(payback*1.2)))
  const maxAmount=Math.max(investment,annualCash*horizon)*1.1
  const x=(year:number)=>64+year/horizon*466
  const y=(amount:number)=>226-amount/maxAmount*172
  const top=Math.max(1e-6,maxAmount)
  const compact=(value:number)=>value>=1e8?`${formatNumber(value/1e8,1)} 亿`:value>=1e4?`${formatNumber(value/1e4,1)} 万`:`${formatNumber(value,0)} 元`
  return <div className="earnings-chart" data-testid="earnings-payback-chart"><svg viewBox="0 0 570 280" role="img" aria-label={`累计现金回收预测，初始投资 ${money(investment)}，每年现金结余 ${money(annualCash)}，显示 ${horizon} 年`}>
    {[0,.5,1].map(t=><g key={t}><line x1="64" x2="530" y1={y(top*t)} y2={y(top*t)} stroke="#e7ecdf"/><text x="56" y={y(top*t)+4} textAnchor="end" fill="#7a856e" fontSize="11">{compact(top*t)}</text></g>)}
    <path d={`M ${x(0)} ${y(0)} L ${x(horizon)} ${y(annualCash*horizon)} L ${x(horizon)} ${y(0)} Z`} fill="#eef4e6"/>
    <line x1={x(0)} x2={x(horizon)} y1={y(investment)} y2={y(investment)} stroke="#c86f76" strokeWidth="2" strokeDasharray="6 5"/>
    <path d={`M ${x(0)} ${y(0)} L ${x(horizon)} ${y(annualCash*horizon)}`} stroke="#587841" strokeWidth="3" fill="none"/>
    {[0,1,2,3,4].map(i=>{const year=horizon*i/4;return <g key={i}><circle cx={x(year)} cy={y(annualCash*year)} r="3" fill="#587841"/><text x={x(year)} y="251" textAnchor="middle" fill="#7a856e" fontSize="11">{formatNumber(year,1)} 年</text></g>})}
    {payback<=horizon&&<g><circle cx={x(payback)} cy={y(investment)} r="5" fill="#fff" stroke="#c86f76" strokeWidth="2"/><text x={Math.min(482,Math.max(120,x(payback)))} y={Math.max(27,y(investment)-12)} textAnchor="middle" fill="#a9525b" fontSize="12">约 {years(payback)} 回本</text></g>}
  </svg><div className="earnings-chart-legend"><span><i/>累计经营现金结余</span><span><i/>初始投资</span></div><p className="earnings-note">{payback>40?'图表最多显示 40 年，当前回本时间超过图表范围。':`显示前 ${horizon} 年，按每年相同的现金结余累计。`}{estimate.investmentIncomplete&&'投资金额尚不完整，曲线为暂估。'}</p></div>
}
