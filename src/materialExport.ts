import { estimateMaterialPurchase, materialBounds } from './materials'
import { MATERIAL_PRESET_BY_ID } from './materialCatalog'
import type { Project } from './types'

export function buildMaterialCSV(project:Project):string{
  const preview=estimateMaterialPurchase({...project,materialBudgetIncluded:true})
  const rows:(string|number)[][]=[['项目',project.name],['建材采购是否另计',project.materialBudgetIncluded===true?'已计入建设合计':'未另计，避免重复设施价'],['材料','商品类型','X米','Y米','Z米','宽米','深米','高米','旋转度','轴方向','计量数量','单位','单价元','已知金额元','组合','状态','来源','范围']]
  for(const piece of project.materials??[]){
    const quote=preview.rows.find(row=>row.id===piece.id)!
    const assembly=project.materialAssemblies?.find(group=>group.pieceIds.includes(piece.id))
    rows.push([piece.name,MATERIAL_PRESET_BY_ID[piece.materialId].name,piece.x,piece.y,piece.z,piece.width,piece.depth,piece.height,piece.rotation,piece.axisOrder??'xyz',quote.quantity,quote.unit,piece.unitPrice??'',quote.amount??'',assembly?.name??'',`${piece.visible===false?'隐藏':'显示'} / ${piece.locked?'锁定':'未锁定'}`,piece.evidence.name,piece.evidence.scope])
  }
  rows.push(['清单已知采购金额',preview.total],['待报价',preview.unpricedItems.join('；')||'无'],['已纳入建设预算',project.materialBudgetIncluded===true?preview.total:0],['计量说明','每件、长边米、最大板面或外包体积，不折算空心净料、重量和施工损耗。'])
  const cell=(value:string|number)=>{const raw=String(value);const safe=/^[=+\-@\t\r]/.test(raw)?"'"+raw:raw;return `"${safe.replaceAll('"','""')}"`}
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n')
}
