import { useState } from 'react'
import { Copy } from 'lucide-react'
import { Modal } from './ui'
import type { Project } from './types'

export default function SaveProjectCopy({project,onClose,onSave}:{project:Project;onClose:()=>void;onSave:(name:string)=>void}){
  const [name,setName]=useState(`${project.name.slice(0,80)} · 副本`)
  return <Modal title="另存为新方案" onClose={onClose}><form className="settings-form" onSubmit={e=>{e.preventDefault();if(name.trim())onSave(name.trim())}}><p className="dialog-intro">保留当前方案的全部设施和参数，创建一个独立副本。适合备份或尝试不同设计。</p><label className="text-field"><span>新方案名称</span><input aria-label="新方案名称" required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><div className="dialog-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!name.trim()}><Copy size={14}/>保存副本</button></div></form></Modal>
}
