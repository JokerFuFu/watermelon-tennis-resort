import { useRef, useState } from 'react'
import { Download, Save, Upload } from 'lucide-react'
interface Props { save:()=>boolean; exportSave:()=>string; importSave:(raw:string)=>boolean; exportRaw:()=>string|null; error:string|null; saved:boolean }
function download(raw:string,name:string){const url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
export function ArcadeSaveControls({save,exportSave,importSave,exportRaw,error,saved}:Props){
  const file=useRef<HTMLInputElement>(null),[notice,setNotice]=useState('')
  return <section className="arcade-save-controls" aria-label="小游戏存档管理"><div className="arcade-save-row"><span>{saved?'进度已保存':'进度待保存'}</span><button onClick={()=>setNotice(save()?'游戏已保存到此浏览器':'暂未保存，请查看存档提示')}><Save size={15}/>保存游戏</button><button onClick={()=>{try{download(exportSave(),'西瓜小游戏存档.json');setNotice('游戏存档已导出')}catch{setNotice('存档暂时无法导出')}}}><Download size={15}/>导出存档</button><button onClick={()=>file.current?.click()}><Upload size={15}/>导入存档</button><input ref={file} type="file" accept=".json,application/json" aria-label="选择小游戏存档文件" hidden onChange={async e=>{const selected=e.target.files?.[0];e.target.value='';if(!selected)return;if(selected.size>1024*1024){setNotice('存档不能超过 1 MB');return}try{setNotice(importSave(await selected.text())?'存档已导入':'导入失败，原进度保留')}catch{setNotice('无法读取这个文件，原进度保留')}}}/></div>{error&&<div className="arcade-save-error" role="alert"><p>{error}</p>{exportRaw()!==null&&<button onClick={()=>download(exportRaw()!,'西瓜小游戏原始存档.json')}>下载原始存档</button>}</div>}{notice&&<p className="arcade-save-notice" role="status">{notice}</p>}</section>
}
export default ArcadeSaveControls
