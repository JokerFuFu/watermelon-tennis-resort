export const ARCADE_SAVE_IDS = ['sudoku','minesweeper','2048','fifteen','lights','gomoku','xiangqi','go','chess','reversi','tictactoe','doudizhu','guandan','solitaire'] as const
export type ArcadeSaveId = typeof ARCADE_SAVE_IDS[number]
export interface ArcadeStorage { getItem(key:string):string|null; setItem(key:string,value:string):void }
export interface ArcadeEnvelope<T> { version:1; game:string; updatedAt:string; state:T }
export function arcadeKey(id:string) {
  if (!ARCADE_SAVE_IDS.includes(id as ArcadeSaveId)) throw Error('未知小游戏存档类型')
  return `courtside-arcade-${id}-v1`
}
export function parseArcadeSave<T>(raw:string,id:string,validate:(value:unknown)=>T):ArcadeEnvelope<T> {
  arcadeKey(id)
  if (raw.length > 1024 * 1024) throw Error('小游戏存档不能超过 1 MB')
  const data:unknown=JSON.parse(raw)
  if (!data || typeof data!=='object' || Array.isArray(data)) throw Error('存档格式错误')
  const value=data as Record<string,unknown>
  if (value.version!==1 || value.game!==id || typeof value.updatedAt!=='string' || !Number.isFinite(Date.parse(value.updatedAt)) || !Object.hasOwn(value,'state')) throw Error('这不是当前游戏的有效存档')
  return {version:1,game:id,updatedAt:value.updatedAt,state:validate(value.state)}
}
export function serializeArcadeSave<T>(id:string,state:T,validate:(value:unknown)=>T):string {
  arcadeKey(id)
  return JSON.stringify({version:1,game:id,updatedAt:new Date().toISOString(),state:validate(structuredClone(state))})
}
export function backupArcadeSave(storage:ArcadeStorage,id:string,raw:string|null) {
  if(raw===null)return
  const key=`${arcadeKey(id)}-backup`
  storage.setItem(key,raw)
  if(storage.getItem(key)!==raw)throw Error('旧存档备份未能保存，原数据保持')
}
export function prepareArcadeReset(storage:ArcadeStorage,id:string):string|null {
  const raw=storage.getItem(arcadeKey(id))
  backupArcadeSave(storage,id,raw)
  return raw
}
export function writeArcadeSave<T>(storage:ArcadeStorage,id:string,state:T,validate:(value:unknown)=>T,expected:string|null,force=false):string {
  const key=arcadeKey(id), actual=storage.getItem(key)
  if(actual!==expected){
    if(!force)throw Error('另一页面已更新这个游戏。当前进度保留，点击保存会先备份另一版本。')
    backupArcadeSave(storage,id,actual)
  }
  const raw=serializeArcadeSave(id,state,validate)
  storage.setItem(key,raw)
  if(storage.getItem(key)!==raw)throw Error('游戏保存未通过回读，请导出当前进度')
  return raw
}
