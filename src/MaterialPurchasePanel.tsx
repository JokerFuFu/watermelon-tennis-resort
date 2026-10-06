import { Box, ArrowUpRight } from 'lucide-react'
import { estimateMaterialPurchase } from './materials'
import { MATERIAL_PRESET_BY_ID } from './materialCatalog'
import { formatNumber } from './model'
import type { Project } from './types'

export default function MaterialPurchasePanel({project,onInclude,onOpen}:{project:Project;onInclude:(value:boolean)=>void;onOpen:()=>void}){
  const accepted=estimateMaterialPurchase(project)
  const preview=estimateMaterialPurchase({...project,materialBudgetIncluded:true})
  const names={piece:'件',length:'米（长边）',area:'㎡（最大板面）',volume:'m³（外包体积）'}
  return <section className="surface material-purchase-panel"><div className="section-heading"><div><h2><Box size={17}/> 自建物建材采购</h2><p>按放入方案的材料计算数量，与现有设施综合价分别记录。</p></div><button className="button secondary" onClick={onOpen}>打开建材区<ArrowUpRight size={14}/></button></div><div className="material-purchase-body"><div className="material-purchase-summary"><div><span>清单已知采购金额</span><strong data-material-list-total={preview.total}>¥ {formatNumber(preview.total,2)}</strong></div><div><span>已纳入建设预算</span><strong data-material-budget-total={accepted.total}>¥ {formatNumber(accepted.total,2)}</strong></div><label><input type="checkbox" aria-label="计入建材采购预算" checked={accepted.included} onChange={event=>onInclude(event.target.checked)}/>另计材料采购</label></div><p>若材料已包含在酒店、球场等综合建设单价中，请核对采购范围，避免重复计入。此处不追加现有设计、监理和建设预备费。</p>{preview.unpricedItems.length>0&&<p className="material-purchase-warning">待报价：{preview.unpricedItems.join('、')}。已知金额不包含这些项。</p>}{preview.taxUnresolvedItems.length>0&&<p className="material-purchase-warning">税口径待核实：{preview.taxUnresolvedItems.join('、')}。</p>}{project.materials?.length?<div className="table-wrap"><table><thead><tr><th>材料</th><th>商品形态</th><th>采购数量</th><th>单价（元）</th><th>已知金额（元）</th></tr></thead><tbody>{preview.rows.map(row=>{const piece=project.materials!.find(item=>item.id===row.id)!;return <tr key={row.id} data-material-budget-row={row.id}><td>{row.label}</td><td>{MATERIAL_PRESET_BY_ID[piece.materialId].name}</td><td>{formatNumber(row.quantity,4)} {names[piece.priceBasis]}</td><td>{row.unitPrice===null?'未报价':formatNumber(row.unitPrice,2)}</td><td>{row.amount===null?'待报价':formatNumber(row.amount,2)}</td></tr>})}</tbody></table></div>:<p>尚未放入建材。打开建材区，选取砖块、木板、梁管等材料拼搭自己的作品。</p>}<p>板面取尺寸最大的两面，体积按外包尺寸计算；空心管、散料等实际采购量需按商品核实。尺寸变化会改变按长度、面积或体积计的数量。</p></div></section>
}
