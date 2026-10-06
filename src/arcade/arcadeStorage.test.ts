import test from 'node:test'
import assert from 'node:assert/strict'
import { arcadeKey,backupArcadeSave,parseArcadeSave,prepareArcadeReset,serializeArcadeSave,writeArcadeSave,type ArcadeStorage } from './arcadeStorage'
const validate=(value:unknown)=>{if(!value||typeof value!=='object'||!Number.isInteger((value as {moves:number}).moves)||(value as {moves:number}).moves<0)throw Error('invalid');return {moves:(value as {moves:number}).moves}}
class Memory implements ArcadeStorage { values=new Map<string,string>(); read:string[]=[];write:string[]=[]; getItem(key:string){this.read.push(key);return this.values.get(key)??null}setItem(key:string,value:string){this.write.push(key);this.values.set(key,value)} }
test('arcade writes and reads only the requested minigame, leaving all other games, island slots and hotel records intact',()=>{
 const s=new Memory();s.values.set('courtside-projects-v1','hotel');s.values.set('courtside-survival-slot-1-v1','island');s.values.set(arcadeKey('chess'),'chess');const raw=writeArcadeSave(s,'sudoku',{moves:1},validate,null)
 assert.deepEqual(s.read,[arcadeKey('sudoku'),arcadeKey('sudoku')]);assert.deepEqual(s.write,[arcadeKey('sudoku')]);assert.equal(s.values.get('courtside-projects-v1'),'hotel');assert.equal(s.values.get('courtside-survival-slot-1-v1'),'island');assert.equal(s.values.get(arcadeKey('chess')),'chess');assert.equal(parseArcadeSave(raw,'sudoku',validate).state.moves,1)
})
test('cross-game, hotel-shaped, future-version and malformed data are rejected before publication',()=>{
 const raw=serializeArcadeSave('sudoku',{moves:4},validate)
 assert.throws(()=>parseArcadeSave(raw,'chess',validate));for(const bad of ['oops','null','[]',JSON.stringify({version:1,facilities:[]}),raw.replace('"version":1','"version":2'),raw.replace('"moves":4','"moves":-1')])assert.throws(()=>parseArcadeSave(bad,'sudoku',validate));assert.throws(()=>arcadeKey('survival'));assert.throws(()=>arcadeKey('../project'))
})
test('concurrent progress blocks automatic overwrite and explicit save first backs up the other version',()=>{
 const s=new Memory(),first=writeArcadeSave(s,'sudoku',{moves:1},validate,null),remote=writeArcadeSave(s,'sudoku',{moves:3},validate,first)
 assert.throws(()=>writeArcadeSave(s,'sudoku',{moves:2},validate,first),/另一页面/);assert.equal(s.getItem(arcadeKey('sudoku')),remote)
 const final=writeArcadeSave(s,'sudoku',{moves:2},validate,first,true);assert.equal(s.getItem(`${arcadeKey('sudoku')}-backup`),remote);assert.equal(parseArcadeSave(final,'sudoku',validate).state.moves,2)
})
test('unverified backup prevents overwriting the original remote progress',()=>{
 const s=new Memory();s.values.set(arcadeKey('sudoku'),'original');s.setItem=(key,raw)=>{if(!key.endsWith('-backup'))s.values.set(key,raw)}
 assert.throws(()=>writeArcadeSave(s,'sudoku',{moves:1},validate,null,true),/备份/);assert.equal(s.getItem(arcadeKey('sudoku')),'original')
})
test('failed write readback is reported, rather than claiming saved progress',()=>{
 const s=new Memory();s.setItem=()=>{};assert.throws(()=>writeArcadeSave(s,'sudoku',{moves:1},validate,null),/回读/)
})
test('corrupt original raw can be preserved exactly in the current game backup',()=>{
 const s=new Memory(),raw='{broken original data';backupArcadeSave(s,'sudoku',raw);assert.equal(s.getItem(`${arcadeKey('sudoku')}-backup`),raw);assert.deepEqual(s.write,[`${arcadeKey('sudoku')}-backup`])
})
test('oversize input and invalid values never write a key',()=>{
 const s=new Memory();assert.throws(()=>parseArcadeSave('x'.repeat(1024*1024+1),'sudoku',validate));assert.throws(()=>writeArcadeSave(s,'sudoku',{moves:-10},validate,null));assert.deepEqual(s.write,[])
})
test('a reset cannot proceed when only the backup key is blocked but the original game key is writable',()=>{
 const s=new Memory(),key=arcadeKey('sudoku'),original=writeArcadeSave(s,'sudoku',{moves:17},validate,null)
 s.setItem=(k,value)=>{if(k.endsWith('-backup'))throw Error('quota');s.values.set(k,value)}
 assert.throws(()=>prepareArcadeReset(s,'sudoku'),/quota/);assert.equal(s.getItem(key),original)
})
