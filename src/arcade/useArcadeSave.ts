import { useCallback, useEffect, useRef, useState } from 'react'
import { arcadeKey, backupArcadeSave, parseArcadeSave, prepareArcadeReset, serializeArcadeSave, writeArcadeSave } from './arcadeStorage'

export function useArcadeSave<T>(gameId:string,create:()=>T,validate:(value:unknown)=>T) {
  const factory=useRef(create),validator=useRef(validate)
  factory.current=create;validator.current=validate
  const [initial]=useState(()=>{
    let raw:string|null=null
    try{
      raw=localStorage.getItem(arcadeKey(gameId))
      return {state:raw===null?create():parseArcadeSave(raw,gameId,validate).state,raw,protected:false,error:null as string|null}
    }catch{return {state:create(),raw,protected:raw!==null,error:raw===null?'此浏览器暂时无法读取存档，可继续游玩并导出进度。':'原游戏存档无法读取，原文已保留。重新开始会先备份旧数据。'}}
  })
  const [state,renderState]=useState<T>(initial.state)
  const [error,setError]=useState<string|null>(initial.error)
  const [saved,setSaved]=useState(initial.raw!==null&&!initial.protected)
  const [canUndo,setCanUndo]=useState(false)
  const current=useRef({state:initial.state,raw:initial.raw,protected:initial.protected,past:[] as T[]})
  const persist=useCallback((force=false)=>{
    const record=current.current
    if(record.protected){setError('原存档受保护，请下载原始存档，或重新开始并保留备份。');return false}
    try{
      record.raw=writeArcadeSave(localStorage,gameId,record.state,validator.current,record.raw,force)
      setSaved(true);setError(null);return true
    }catch(e){setSaved(false);setError(e instanceof Error?e.message:'游戏暂未保存，请导出进度');return false}
  },[gameId])
  useEffect(()=>{if(initial.raw===null&&!initial.protected)persist()},[persist,initial])
  const setState=useCallback((edit:T|((previous:T)=>T))=>{
    const record=current.current
    if(record.protected){setError('原存档受保护，请先重新开始并保留备份。');return}
    try{
      const candidate=typeof edit==='function'?(edit as (p:T)=>T)(structuredClone(record.state)):edit
      const next=validator.current(candidate)
      if(JSON.stringify(next)===JSON.stringify(record.state))return
      record.past=[...record.past.slice(-59),structuredClone(record.state)]
      record.state=next;renderState(next);setCanUndo(true);setSaved(false);persist()
    }catch(e){setError(e instanceof Error?e.message:'这个动作未能完成，进度保持')}
  },[persist])
  const undo=useCallback(()=>{
    const record=current.current
    if(!record.past.length||record.protected)return
    record.state=record.past.pop()!;renderState(record.state);setCanUndo(record.past.length>0);setSaved(false);persist()
  },[persist])
  const reset=useCallback(()=>{
    const record=current.current
    try{
      const raw=prepareArcadeReset(localStorage,gameId)
      record.raw=raw;record.protected=false
    }catch(e){
      setError('旧档读取或备份未成功，已保留当前进度。请导出存档后重试。');return
    }
    try{
      const next=validator.current(factory.current())
      record.past=[...record.past.slice(-59),structuredClone(record.state)]
      record.state=next;renderState(next);setCanUndo(true);setSaved(false);persist()
    }catch(e){setError(e instanceof Error?e.message:'新局未能生成')}
  },[gameId,persist])
  const importSave=useCallback((raw:string)=>{
    const record=current.current
    try{
      const next=parseArcadeSave(raw,gameId,validator.current).state
      const old=localStorage.getItem(arcadeKey(gameId))
      backupArcadeSave(localStorage,gameId,old)
      const written=writeArcadeSave(localStorage,gameId,next,validator.current,old)
      record.past=[...record.past.slice(-59),structuredClone(record.state)]
      record.state=next;record.raw=written;record.protected=false
      renderState(next);setCanUndo(true);setSaved(true);setError(null);return true
    }catch(e){setError(e instanceof Error?e.message:'导入失败，原进度已保留');return false}
  },[gameId])
  const exportSave=useCallback(()=>serializeArcadeSave(gameId,current.current.state,validator.current),[gameId])
  const exportRaw=useCallback(()=>current.current.protected?current.current.raw:null,[])
  const save=useCallback(()=>persist(true),[persist])
  return {state,setState,undo,canUndo,reset,save,error,saved,exportSave,importSave,exportRaw}
}
