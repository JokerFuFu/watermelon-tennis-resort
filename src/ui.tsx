import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { X, Minus, Plus } from 'lucide-react'

export function NumberField({label, value, onChange, min=0, max=1000, step=1, unit, disabled=false, integer=false, resetKey}: {label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number;unit?:string;disabled?:boolean;integer?:boolean;resetKey?:string}) {
  const id = useId()
  const [draft,setDraft] = useState(String(value))
  const [notice,setNotice] = useState('')
  const latestValid = useRef(value)
  const emitted = useRef<number|null>(null)
  const previousResetKey = useRef(resetKey)
  const focusValue = useRef(value)
  const skipCommit = useRef(false)
  useEffect(()=>{
    latestValid.current=value
    // Keep the user's spelling (including a trailing decimal point) on our own updates.
    const selectionChanged=previousResetKey.current!==resetKey
    previousResetKey.current=resetKey
    if(selectionChanged)focusValue.current=value
    if(!selectionChanged&&emitted.current!==null&&Object.is(emitted.current,value)){emitted.current=null;return}
    emitted.current=null
    setDraft(String(value))
    setNotice('')
  },[value,resetKey])
  const normalize=(next:number)=>integer?Math.min(max,Math.max(min,Math.round(next))):next
  function publish(next:number){
    next=normalize(next)
    if(Object.is(next,latestValid.current))return
    latestValid.current=next
    emitted.current=next
    onChange(next)
  }
  const draftNumber=Number(draft)
  const invalid=draft===''||!Number.isFinite(draftNumber)||draftNumber<min||draftNumber>max
  return <label className="number-field" htmlFor={id}><span>{label}</span><div className="input-shell"><input id={id} aria-label={label} aria-invalid={invalid||undefined} aria-describedby={notice?`${id}-notice`:undefined} type="number" min={min} max={max} step={step} disabled={disabled} value={draft} onFocus={()=>{focusValue.current=value}} onChange={e=>{
    const input=e.currentTarget
    setDraft(input.value)
    setNotice('')
    const next=Number(input.value)
    if(input.value!==''&&!input.validity.badInput&&Number.isFinite(next)&&next>=min&&next<=max)publish(next)
  }} onBlur={e=>{
    if(skipCommit.current){skipCommit.current=false;return}
    const input=e.currentTarget
    const usable=input.value!==''&&!input.validity.badInput&&Number.isFinite(Number(input.value))
    const raw=Number(input.value)
    const next=normalize(usable?Math.min(max,Math.max(min,raw)):latestValid.current)
    setDraft(String(next))
    setNotice(!usable?`输入无效，已恢复为 ${next}${unit?` ${unit}`:''}`:raw<min||raw>max?`已调整为允许范围 ${min}–${max} 内的 ${next}${unit?` ${unit}`:''}`:integer&&raw!==next?`已按整数取整为 ${next}${unit?` ${unit}`:''}`:'')
    publish(next)
  }} onKeyDown={e=>{
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();e.currentTarget.blur()}
    if(e.key==='Escape'){
      e.preventDefault();e.stopPropagation()
      skipCommit.current=true
      setDraft(String(focusValue.current))
      setNotice('')
      publish(focusValue.current)
      e.currentTarget.blur()
    }
  }}/>{unit && <span className="input-unit">{unit}</span>}</div>{notice&&<small className="number-field-notice" id={`${id}-notice`} role="status">{notice}</small>}</label>
}
export function Stepper({label,value,onChange,min=1,max=30,unit}: {label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;unit?:string}) {
  return <div className="stepper-field"><span>{label}</span><div className="stepper"><button aria-label={`减少${label}`} onClick={()=>onChange(Math.max(min,value-1))} disabled={value<=min}><Minus size={14}/></button><span>{value}<small>{unit}</small></span><button aria-label={`增加${label}`} onClick={()=>onChange(Math.min(max,value+1))} disabled={value>=max}><Plus size={14}/></button></div></div>
}
export function FacilityNameField({value,onCommit,onInvalid}:{value:string;onCommit:(value:string)=>void;onInvalid:()=>void}) {
  const [draft,setDraft]=useState(value)
  const skipCommit=useRef(false)
  useEffect(()=>setDraft(value),[value])
  return <label className="text-field"><span>设施名称</span><input aria-label="设施名称" value={draft} maxLength={60} onChange={e=>setDraft(e.target.value)} onBlur={()=>{if(skipCommit.current){skipCommit.current=false;setDraft(value);return}const name=draft.trim();if(!name){setDraft(value);onInvalid()}else if(name!==value)onCommit(name)}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){e.stopPropagation();skipCommit.current=true;setDraft(value);e.currentTarget.blur()}}}/></label>
}
export function Modal({title,children,onClose,wide=false}: {title:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const ref=useRef<HTMLDivElement>(null)
  const headingId=useId()
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null
    ref.current?.querySelector<HTMLElement>('button,input,select')?.focus()
    function key(e:KeyboardEvent){
      if(e.key==='Escape')onClose()
      if(e.key==='Tab'){
        const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,a[href]')
        if(!nodes?.length)return
        const first=nodes[0],last=nodes[nodes.length-1]
        if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus()}
        if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus()}
      }
    }
    document.addEventListener('keydown',key)
    return ()=>{document.removeEventListener('keydown',key);previous?.focus()}
  },[onClose])
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div ref={ref} className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby={headingId}><div className="modal-heading"><h2 id={headingId}>{title}</h2><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></div>{children}</div></div>
}
