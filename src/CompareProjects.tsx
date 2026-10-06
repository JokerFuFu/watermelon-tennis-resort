import { useState } from 'react'
import { ArrowRight, Check, Copy, Layers, Minus, Plus } from 'lucide-react'
import { calculateMetrics, formatNumber } from './model'
import { estimateProject } from './pricing'
import { estimateCombinedBudget } from './operating'
import { Modal } from './ui'
import type { Project } from './types'
import './comparison.css'

export default function CompareProjects({projects,current,onClose,onOpen,onClone}:{projects:Project[];current:Project;onClose:()=>void;onOpen:(p:Project)=>void;onClone:()=>void}){
  const all=projects.map(p=>p.id===current.id?current:p)
  if(!all.some(p=>p.id===current.id))all.push(current)
  const [ids,setIds]=useState(()=>[current.id,...all.filter(p=>p.id!==current.id).slice(-2).map(p=>p.id)])
  const choices=ids.map(id=>all.find(p=>p.id===id)).filter((p):p is Project=>!!p)
  const values=choices.map(p=>calculateMetrics(p))
  const estimates=choices.map(p=>estimateProject(p))
  const combined=choices.map(p=>estimateCombinedBudget(p))
  const base=values[0]
  const metrics=[
    {label:'总用地面积',unit:'m²',values:values.map(m=>m.siteArea),digits:2},
    {label:'建筑各层面积',unit:'m²',values:values.map(m=>m.buildingArea),digits:2},
    {label:choices.some(p=>p.materials?.length)?'界内总占地（含自建物）':'界内设施占地（去重）',unit:'m²',values:values.map(m=>m.occupiedArea),digits:2},
    {label:'未配置面积',unit:'m²',values:values.map(m=>m.unallocatedArea),digits:2},
    {label:'界内重叠区域',unit:'m²',values:values.map(m=>m.overlapArea),digits:2},
    {label:'界外占地（去重）',unit:'m²',values:values.map(m=>m.outOfBoundsArea),digits:2},
    {label:'客房数量',unit:'间',values:values.map(m=>m.roomCount),digits:0},
    {label:'网球场数量',unit:'片',values:values.map(m=>m.courtCount),digits:0},
    {label:'建筑覆盖率',unit:'%',values:values.map(m=>m.coverageRatio*100),digits:2},
    {label:'已配置绿地率',unit:'%',values:values.map(m=>m.landscapeRatio*100),digits:2},
    {label:'设施工程小计',unit:'万元',values:estimates.map(m=>m.engineering.point/10000),digits:1},
    {label:'已计预算合计',unit:'万元',values:estimates.map(m=>m.total.point/10000),digits:1},
    {label:'已纳入建材采购',unit:'万元',values:estimates.map(m=>m.materialsAmount/10000),digits:2},
    {label:'运营期间（未启用为0）',unit:'天',values:combined.map(m=>m.operating.enabled?m.operating.days:0),digits:0},
    {label:'期间运营已计合计',unit:'万元',values:combined.map(m=>m.operating.total/10000),digits:2},
    {label:'建设加期间运营',unit:'万元',values:combined.map(m=>m.total.point/10000),digits:2},
    {label:'待确认费用',unit:'项',values:estimates.map(m=>m.missingItems.length),digits:0},
  ]
  function toggle(id:string){setIds(list=>list.includes(id)?list.filter(x=>x!==id):list.length<3?[...list,id]:list)}
  return <Modal title="把不同的设计，放在一起看" onClose={onClose} wide><div className="compare-content"><div className="compare-intro"><p>选择最多 3 个方案。第一个方案作为对照基准。</p><button className="button secondary" onClick={onClone}><Copy size={14}/>复制当前方案</button></div><div className="compare-choices">{all.map(p=><button key={p.id} aria-pressed={ids.includes(p.id)} className={ids.includes(p.id)?'selected':''} disabled={!ids.includes(p.id)&&ids.length>=3} onClick={()=>toggle(p.id)}><span>{ids.includes(p.id)&&<Check size={10}/>}</span>{p.name}{p.id===current.id&&<small>当前</small>}</button>)}</div>{choices.length>=2?<><div className="compare-table-wrap"><table className="compare-table"><thead><tr><th>方案指标</th>{choices.map((p,i)=><th key={p.id}><span className={`compare-plan-mark plan-${i}`}><Layers size={14}/></span><strong>{p.name}</strong><small>{i===0?'对照基准':'与基准比较'}</small></th>)}</tr></thead><tbody>{metrics.map(row=><tr key={row.label}><td>{row.label}</td>{row.values.map((value,i)=>{const delta=value-row.values[0];return <td key={choices[i].id}><strong>{formatNumber(value,row.digits)}<small> {row.unit}</small></strong>{i>0&&<span className="compare-delta">{Math.abs(delta)<.001?<><Minus size={10}/>一致</>:<>{delta>0?<Plus size={10}/>:<Minus size={10}/>} {formatNumber(Math.abs(delta),row.digits)} {row.unit}</>}</span>}</td>})}</tr>)}</tbody><tfoot><tr><td>继续完善</td>{choices.map(p=><td key={p.id}><button onClick={()=>onOpen(p)}>打开方案<ArrowRight size={12}/></button></td>)}</tr></tfoot></table></div><div className="compare-cost-bars"><h3>建设已计预算规模</h3>{choices.map((p,i)=><div className="compare-cost-row" key={p.id}><span>{p.name}</span><div><i className={`plan-${i}`} style={{width:`${estimates[i].total.point/Math.max(1,...estimates.map(m=>m.total.point))*100}%`}}/></div><strong>{formatNumber(estimates[i].total.point/10000,1)}<small> 万元</small></strong></div>)}</div><p className="compare-note">建设费用与选定期间的运营费用分别计算；不同运营天数、服务人数和入住率的方案不可直接按综合金额判断优劣。建材采购按另计开关单列，先核对是否已包含在设施综合价；工程分项、录入报价与项目费用共同计入建设预算。各方案未报价的费用不计入合计，应核对范围后比较；用户报价未经独立核验。面积按旋转矩形计算；界内占地去重，可用绿地扣除非绿地覆盖，未配置空地不自动计绿地。</p></>:<div className="compare-empty"><Layers size={34} strokeWidth={1.1}/><strong>{!choices.length?'选择至少两个方案':'再选择一个方案开始比较'}</strong><p>{all.length<2?'复制当前方案后调整布局或客房，就能比较两种设计方向。':'点击上方的方案名称，选择你想并排查看的设计。'}</p>{all.length<2&&<button className="button primary" onClick={onClone}><Copy size={14}/>复制当前方案</button>}</div>}<div className="compare-footer"><span>{choices.length} / 3 个已选方案</span>{base&&<span>基准：{choices[0].name}</span>}<button className="button secondary" onClick={onClose}>返回设计</button></div></div></Modal>
}
