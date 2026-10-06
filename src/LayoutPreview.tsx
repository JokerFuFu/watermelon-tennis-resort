import { useMemo } from 'react'
import { CheckCheck, Layers, LockKeyhole, TriangleAlert } from 'lucide-react'
import { arrangeFacilities } from './layout'
import SiteCanvas from './SiteCanvas'
import { Modal } from './ui'
import type { Project } from './types'
import './workspace-upgrade.css'

export default function LayoutPreview({project,onClose,onApply}:{project:Project;onClose:()=>void;onApply:(project:Project)=>void}){
  const plan=useMemo(()=>arrangeFacilities(project),[project])
  return <Modal title="自动排布预览" onClose={onClose} wide><div className="layout-preview"><div className={`lp-status ${plan.success?'':'failed'}`}>{plan.success?<CheckCheck size={20}/>:<TriangleAlert size={20}/>}<div><strong>{plan.success?'排布方案已生成':'当前策略未找到完整排布'}</strong><p>{plan.message}</p></div></div><div className="lp-stats"><span><Layers size={15}/>{plan.moved} 个设施重新定位</span><span><LockKeyhole size={15}/>{plan.keptLocked} 个锁定设施保持原位</span></div><div className="lp-canvas"><SiteCanvas project={plan.project} selectedId={null} onSelect={()=>{}} onMove={()=>{}} mode="2d" zoom={1} showLabels showGrid={false} tool="select" svgId="layout-preview-svg" interactive={false}/></div><p className="lp-note">未锁定设施保持原尺寸与朝向，按 4 米间距排布并预留 6 米边界。隐藏设施也占用实际场地。点击应用后统一保存，支持撤销。</p><div className="dialog-footer"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!plan.success||plan.moved===0} onClick={()=>onApply(plan.project)}>应用排布</button></div></div></Modal>
}
