import test from 'node:test'
import assert from 'node:assert/strict'
import { createSurvivalGame, applySurvivalAction } from './survival'
import { backupSurvivalSlot, readSurvivalSlot, SURVIVAL_BACKUP_KEYS, SURVIVAL_SLOT_KEYS, writeSurvivalSlot } from './survivalStorage'

function storage(){
  const data=new Map<string,string>(),reads:string[]=[],writes:string[]=[]
  return {data,reads,writes,getItem(key:string){reads.push(key);return data.get(key)??null},setItem(key:string,value:string){writes.push(key);data.set(key,value)}}
}
test('new game storage is detached from hotel settings and reading an empty slot never writes anything',()=>{
  const store=storage();store.data.set('courtside-projects-v1','private hotel plan')
  const loaded=readSurvivalSlot(store,1)
  assert.equal(loaded.game.playerName,'旅行者1');assert.equal(loaded.protected,false);assert.equal(loaded.raw,null)
  assert.deepEqual(store.reads,[SURVIVAL_SLOT_KEYS[1]]);assert.deepEqual(store.writes,[])
  assert.equal(store.data.get('courtside-projects-v1'),'private hotel plan')
})
test('game save reads back exact accepted state while keeping the other two slots and hotel data intact',()=>{
  const store=storage(),one=createSurvivalGame('lagoon',123,'甲'),two=createSurvivalGame('jungle',456,'乙')
  store.data.set('courtside-projects-v1','unchanged');writeSurvivalSlot(store,2,two)
  const gathered=applySurvivalAction(one,{type:'gather'});assert.equal(gathered.accepted,true)
  writeSurvivalSlot(store,1,gathered.state)
  assert.deepEqual(readSurvivalSlot(store,1).game,gathered.state);assert.deepEqual(readSurvivalSlot(store,2).game,two)
  assert.equal(store.data.get(SURVIVAL_SLOT_KEYS[3]),undefined);assert.equal(store.data.get('courtside-projects-v1'),'unchanged')
})
test('corrupt game data is protected with original bytes retained rather than replacing it with an example',()=>{
  const store=storage(),raw='{broken original game';store.data.set(SURVIVAL_SLOT_KEYS[1],raw)
  const loaded=readSurvivalSlot(store,1)
  assert.equal(loaded.protected,true);assert.equal(loaded.raw,raw);assert.ok(loaded.error)
  assert.equal(store.data.get(SURVIVAL_SLOT_KEYS[1]),raw);assert.deepEqual(store.writes,[])
})
test('explicit new adventure backup preserves even unreadable data before a replacement game is written',()=>{
  const store=storage(),raw='broken backup';store.data.set(SURVIVAL_SLOT_KEYS[1],raw)
  backupSurvivalSlot(store,1,raw);writeSurvivalSlot(store,1,createSurvivalGame('highlands',99,'新的冒险'))
  assert.equal(store.data.get(SURVIVAL_BACKUP_KEYS[1]),raw)
  assert.equal(readSurvivalSlot(store,1).protected,false);assert.equal(readSurvivalSlot(store,1).game.preset,'highlands')
})
test('invalid wallet cannot be written or interpreted as a real valid game save',()=>{
  const store=storage(),game=createSurvivalGame();game.wallet.coins=-1
  assert.throws(()=>writeSurvivalSlot(store,1,game));assert.deepEqual(store.writes,[])
})
test('unavailable storage reports a protected error without reading any hotel keys',()=>{
  const reads:string[]=[];const inaccessible={getItem(key:string){reads.push(key);throw new Error('blocked')},setItem(){throw new Error('blocked')}}
  assert.equal(readSurvivalSlot(inaccessible,3).protected,true)
  assert.deepEqual(reads,[SURVIVAL_SLOT_KEYS[3]])
})
test('quota and nonpersistent writes cannot produce a successful save or erase a prior game',()=>{
  const game=createSurvivalGame(),raw=JSON.stringify(game)
  const full={getItem(){return raw},setItem(){throw new Error('quota')}}
  assert.throws(()=>writeSurvivalSlot(full,1,applySurvivalAction(game,{type:'rest'}).state),/quota/)
  const dropped={getItem(){return null},setItem(){}}
  assert.throws(()=>writeSurvivalSlot(dropped,1,game),/未能/)
  assert.throws(()=>backupSurvivalSlot(dropped,1,raw),/备份/)
})
test('saving a restored state keeps opened chests, currency and resource depletion in the game schema',()=>{
  const store=storage(),game=createSurvivalGame('lagoon',234,'恢复测试')
  const moved=applySurvivalAction(game,{type:'gather'}).state
  const changed=applySurvivalAction(moved,{type:'exchange',direction:'buyDiamond',quantity:1}).state
  const raw=writeSurvivalSlot(store,1,changed);backupSurvivalSlot(store,1,raw)
  writeSurvivalSlot(store,1,createSurvivalGame('jungle',235))
  store.setItem(SURVIVAL_SLOT_KEYS[1],store.getItem(SURVIVAL_BACKUP_KEYS[1])!)
  assert.deepEqual(readSurvivalSlot(store,1).game,changed)
  assert.deepEqual(changed.wallet,{coins:20,diamonds:2})
})
