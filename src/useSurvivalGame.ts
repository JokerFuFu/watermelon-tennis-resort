import { useCallback, useEffect, useRef, useState } from 'react'
import { applySurvivalAction, createSurvivalGame, parseSurvivalGame } from './survival'
import { backupSurvivalSlot, readSurvivalSlot, SURVIVAL_ACTIVE_KEY, SURVIVAL_BACKUP_KEYS, SURVIVAL_SLOT_KEYS, writeSurvivalSlot, type SurvivalSlot } from './survivalStorage'
import type { IslandPreset, SurvivalAction, SurvivalGameState } from './survivalTypes'

function initialGame(){
  let slot:SurvivalSlot=1
  try{const active=window.localStorage.getItem(SURVIVAL_ACTIVE_KEY);if(active==='2'||active==='3')slot=Number(active) as SurvivalSlot;return {slot,...readSurvivalSlot(window.localStorage,slot)}}
  catch{return {slot,game:createSurvivalGame('lagoon',20261004,'旅行者1'),raw:null,protected:true,error:'此浏览器暂时无法读取游戏存档。当前游戏不会覆盖原数据。'}}
}
export function useSurvivalGame(){
  const [initial]=useState(initialGame)
  const [game,setGame]=useState(initial.game),[slot,setSlot]=useState<SurvivalSlot>(initial.slot)
  const [message,setMessage]=useState('先在脚下采集木材，再探索树林、岩石和淡水。')
  const [storageError,setStorageError]=useState<string|null>(initial.error)
  const [saved,setSaved]=useState(initial.raw!==null&&!initial.protected)
  const [backupAvailable,setBackupAvailable]=useState(false)
  const current=useRef({...initial,saved:initial.raw!==null&&!initial.protected})
  const rawForExport=useRef<string|null>(initial.protected?initial.raw:null)
  function update(next:SurvivalGameState){current.current.game=next;setGame(next)}
  const persist=useCallback((explicit=false)=>{
    const record=current.current
    if(record.protected){setStorageError(record.raw===null?'此浏览器暂时无法保存游戏，当前进度可以导出为游戏文件。':'原游戏存档仍受保护，请先导出原始文件，或新建冒险保留备份。');return false}
    try{
      const actual=window.localStorage.getItem(SURVIVAL_SLOT_KEYS[record.slot])
      if(actual!==record.raw){
        if(!explicit){setSaved(false);record.saved=false;setStorageError('另一页面已更新此存档。当前进度保留，点击保存会先备份另一版本。');return false}
        backupSurvivalSlot(window.localStorage,record.slot,actual);setBackupAvailable(actual!==null)
      }
      record.raw=writeSurvivalSlot(window.localStorage,record.slot,record.game);record.saved=true
      setSaved(true);setStorageError(null);return true
    }catch(error){record.saved=false;setSaved(false);setStorageError(error instanceof Error?error.message:'游戏未能保存，请先导出当前进度。');return false}
  },[])
  useEffect(()=>{if(!current.current.protected&&current.current.raw===null)persist();try{setBackupAvailable(window.localStorage.getItem(SURVIVAL_BACKUP_KEYS[current.current.slot])!==null)}catch{/* The error is shown by the game storage handler. */}},[persist])
  const act=useCallback((action:SurvivalAction)=>{
    const record=current.current
    if(record.protected){
      if(record.raw!==null){setMessage('请先选择可用存档槽，或新建冒险并保留旧档备份。');return}
      const result=applySurvivalAction(record.game,action)
      setMessage(result.message)
      if(result.accepted){update(result.state);record.saved=false;setSaved(false);setStorageError('此浏览器暂时无法保存，当前游戏可继续试玩并导出进度。')}
      return
    }
    try{
      const actual=window.localStorage.getItem(SURVIVAL_SLOT_KEYS[record.slot])
      if(actual!==record.raw&&actual!==null){
        if(!record.saved){setStorageError('另一页面更新了此存档，当前进度保留。请保存备份或导出后再继续。');return}
        const fresh=parseSurvivalGame(actual);record.raw=actual;update(fresh)
      }
      const result=applySurvivalAction(record.game,action)
      setMessage(result.message)
      if(!result.accepted)return
      update(result.state);record.saved=false;setSaved(false);persist()
    }catch(error){setStorageError(error instanceof Error?error.message:'动作未能完成，进度保留。')}
  },[persist])
  const save=useCallback(()=>{const ok=persist(true);if(ok)setMessage('游戏已保存到当前浏览器。');return ok},[persist])
  const changeSlot=useCallback((next:SurvivalSlot)=>{
    if(![1,2,3].includes(next)||next===current.current.slot)return
    if(!current.current.protected&&!current.current.saved&&!persist(true))return
    try{
      const loaded=readSurvivalSlot(window.localStorage,next)
      current.current={...loaded,slot:next,saved:loaded.raw!==null&&!loaded.protected}
      rawForExport.current=loaded.protected?loaded.raw:null
      setSlot(next);setGame(loaded.game);setSaved(current.current.saved);setStorageError(loaded.error)
      setMessage(`已切换到存档 ${next}，每个槽位独立记录背包、宝箱和货币。`)
      setBackupAvailable(window.localStorage.getItem(SURVIVAL_BACKUP_KEYS[next])!==null)
      window.localStorage.setItem(SURVIVAL_ACTIVE_KEY,String(next))
      if(loaded.raw===null&&!loaded.protected)persist()
    }catch{setStorageError('无法切换存档，当前游戏进度保留。')}
  },[persist])
  const replace=useCallback((next:SurvivalGameState,text:string)=>{
    const record=current.current
    try{
      const existing=window.localStorage.getItem(SURVIVAL_SLOT_KEYS[record.slot])
      const backup=!record.protected&&!record.saved?JSON.stringify(record.game):existing
      backupSurvivalSlot(window.localStorage,record.slot,backup)
      const raw=writeSurvivalSlot(window.localStorage,record.slot,next)
      current.current={game:next,slot:record.slot,raw,protected:false,error:null,saved:true}
      update(next);setSaved(true);setStorageError(null);rawForExport.current=null
      setBackupAvailable(backup!==null);setMessage(text);return true
    }catch(error){setStorageError(error instanceof Error?error.message:'旧游戏未能备份，原存档保留。');return false}
  },[])
  const importGame=useCallback((text:string)=>{
    try{if(text.length>500000)throw new Error('游戏文件超过500KB');const next=parseSurvivalGame(text);return replace(next,'游戏存档已导入，原冒险已备份。')}
    catch(error){setStorageError(error instanceof Error?error.message:'游戏存档无效，原进度保留。');return false}
  },[replace])
  const newGame=useCallback((preset:IslandPreset)=>{
    const seed=(crypto.getRandomValues(new Uint32Array(1))[0]%2147483646)+1
    return replace(createSurvivalGame(preset,seed,current.current.game.playerName),'新冒险已开始，旧存档可恢复。')
  },[replace])
  const restoreBackup=useCallback(()=>{
    try{
      const record=current.current,raw=window.localStorage.getItem(SURVIVAL_BACKUP_KEYS[record.slot])
      if(raw===null){setMessage('当前槽位没有可恢复的备份。');return false}
      let next:SurvivalGameState
      try{next=parseSurvivalGame(raw)}catch(error){rawForExport.current=raw;throw error}
      return replace(next,'上次冒险已恢复，刚才的进度已备份。')
    }catch(error){setStorageError(error instanceof Error?error.message:'备份无法读取，原始数据保留。');return false}
  },[replace])
  const exportGame=useCallback(()=>JSON.stringify(current.current.game,null,2),[])
  const exportRaw=useCallback(()=>rawForExport.current??(current.current.protected?current.current.raw:null),[])
  useEffect(()=>{
    const receive=(event:StorageEvent)=>{
      const record=current.current
      if(event.key!==SURVIVAL_SLOT_KEYS[record.slot]||event.newValue===null||event.newValue===record.raw)return
      if(!record.saved){setStorageError('另一页面更新了游戏，当前未保存进度仍保留。请保存备份或导出。');return}
      try{const next=parseSurvivalGame(event.newValue);record.raw=event.newValue;record.protected=false;update(next);setSaved(true);setStorageError(null);setMessage('已同步另一页面保存的游戏进度。')}
      catch{record.raw=event.newValue;record.protected=true;record.saved=false;rawForExport.current=event.newValue;setSaved(false);setStorageError('另一页面的游戏存档无法读取，原始数据及当前有效进度保留。可导出后恢复或新建冒险。')}
    }
    window.addEventListener('storage',receive);return()=>window.removeEventListener('storage',receive)
  },[])
  return {game,slot,act,message,storageError,saved,backupAvailable,changeSlot,save,importGame,newGame,restoreBackup,exportGame,exportRaw}
}
