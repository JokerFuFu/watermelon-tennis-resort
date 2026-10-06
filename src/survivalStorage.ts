import { createSurvivalGame, parseSurvivalGame } from './survival'
import type { SurvivalGameState } from './survivalTypes'

export type SurvivalSlot=1|2|3
export const SURVIVAL_ACTIVE_KEY='courtside-survival-active-slot-v1'
export const SURVIVAL_SLOT_KEYS={1:'courtside-survival-slot-1-v1',2:'courtside-survival-slot-2-v1',3:'courtside-survival-slot-3-v1'} as const
export const SURVIVAL_BACKUP_KEYS={1:'courtside-survival-backup-1-v1',2:'courtside-survival-backup-2-v1',3:'courtside-survival-backup-3-v1'} as const
type GameStorage=Pick<Storage,'getItem'|'setItem'>
export function readSurvivalSlot(storage:GameStorage,slot:SurvivalSlot){
  let raw:string|null=null
  try{raw=storage.getItem(SURVIVAL_SLOT_KEYS[slot]);return {game:raw===null?createSurvivalGame('lagoon',20261003+slot,`旅行者${slot}`):parseSurvivalGame(raw),raw,protected:false,error:null as string|null}}
  catch{return {game:createSurvivalGame('lagoon',20261003+slot,`旅行者${slot}`),raw,protected:true,error:'原游戏存档无法读取，原始数据已保留。可导出原始存档，选择其他槽位，或新建冒险并备份旧档。'}}
}
export function writeSurvivalSlot(storage:GameStorage,slot:SurvivalSlot,game:SurvivalGameState){
  const raw=JSON.stringify(parseSurvivalGame(JSON.stringify(game)))
  storage.setItem(SURVIVAL_SLOT_KEYS[slot],raw)
  if(storage.getItem(SURVIVAL_SLOT_KEYS[slot])!==raw)throw new Error('游戏存档未能完成保存')
  return raw
}
export function backupSurvivalSlot(storage:GameStorage,slot:SurvivalSlot,raw:string|null){
  if(raw===null)return
  storage.setItem(SURVIVAL_BACKUP_KEYS[slot],raw)
  if(storage.getItem(SURVIVAL_BACKUP_KEYS[slot])!==raw)throw new Error('旧冒险未能备份，原存档保留')
}
