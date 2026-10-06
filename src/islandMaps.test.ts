import test from 'node:test'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {ADDITIONAL_ISLAND_PRESETS,generateAdditionalIslandMap} from './islandMaps'
import {applySurvivalAction,createSurvivalGame,generateIslandMap,ISLAND_PRESETS,parseSurvivalGame} from './survival'
import {readSurvivalSlot,writeSurvivalSlot,SURVIVAL_SLOT_KEYS} from './survivalStorage'
import type {IslandPreset,SurvivalAction,SurvivalGameState} from './survivalTypes'

const seeds=[1,2,17,20261003,2147483647]
const oldHashes:Record<string,string[]>={
  lagoon:['512556c1a02260abac6bd35d0782d352b2147ee992932f9822fdae9fc3bb6fee','5ab78e5b90ac50c434509cc3ad1160f3806c8a3fa664d61a95062ab0b0d1f77e','2476e89666eadb7dbc4b72845615a03090c3e08f01b89785927c149c11ce0c1a','9d9386c905c7e44b19493512ef53872079326b4f708523c7a7745ebe05ab9b97','eb05028be4fcf57ff314211c19d487c05ed5980f12d5e73028eda03580f1b981'],
  jungle:['3c606a79ad791fa57df71d673b9c2e0079b7c1b708110df8adfd30ac7e244677','c03d8595906c2069a71fa690b3411b503da793c89f57faca7e08f82f5f30f0b1','16ae0be5b8e2e782172ba70247a63c0bedb13147fb68aaaebcc9067e6b87551e','fd9454abf8d2c7b4757f3e67e29daf319661edc1f837cbe248ff9d52e2c86773','6c98ec1c9d838acbc5bd8a0c86149119d797fcced6e8a75be284eebb2d2564be'],
  highlands:['ced5f28a3a1ac9a3af37fbc2788f5c6a5f23fad3d24608b7891a34d53e930ea0','af84bd5b297d43abff899552dfc6504d54c00f053d43399bd09fc702de66c51f','368115957526eadfe0862fcd0a5288a8551fc5d4170d0e13c9615e9161e82e8c','25ea9e9312a730e6d408ca80d32dc402fc1e0286d4bbeca7bcd57b82ce8e2220','3fcce39951dead90457c2275876c50f005e3f27fa12b37c466b7d418d80c2fdb'],
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')

// Navigation tests use graph search over the generated world, independently of profile formulas.
function routes(game:SurvivalGameState){
  const {width,height,tiles}=game.world,start=game.player.y*width+game.player.x
  const queue=[start],previous=new Map<number,number>([[start,-1]])
  for(let cursor=0;cursor<queue.length;cursor++){
    const current=queue[cursor],tile=tiles[current]
    for(const destination of tiles.filter(t=>Math.abs(t.x-tile.x)+Math.abs(t.y-tile.y)===1)){
      const next=destination.y*width+destination.x
      if(next<0||next>=width*height||destination.terrain==='sea'||previous.has(next))continue
      previous.set(next,current);queue.push(next)
    }
  }
  return {previous,route(x:number,y:number){
    const target=y*width+x;assert.ok(previous.has(target),`${game.preset}: (${x},${y}) reachable`)
    const path:number[]=[];for(let cursor=target;cursor!==start;cursor=previous.get(cursor)!)path.unshift(cursor)
    return path.map(index=>({x:index%width,y:Math.floor(index/width)}))
  }}
}

test('exactly 17 additional named maps append to the unchanged three originals',()=>{
  assert.equal(ADDITIONAL_ISLAND_PRESETS.length,17);assert.equal(ISLAND_PRESETS.length,20)
  assert.equal(new Set(ISLAND_PRESETS.map(p=>p.id)).size,20);assert.equal(new Set(ISLAND_PRESETS.map(p=>p.name)).size,20)
  assert.deepEqual(ISLAND_PRESETS.slice(0,3),[
    {id:'lagoon',name:'碧海湾',description:'沙滩环绕的海湾，内陆有树林和淡水。'},
    {id:'jungle',name:'密林岛',description:'茂密丛林与古老遗迹，纤维和食物丰富。'},
    {id:'highlands',name:'岩峰岛',description:'岩地与山间淡水，石头和铁矿集中。'},
  ])
})

test('legacy world bytes match all 15 SHA256 baselines captured before this update',()=>{
  for(const [id,hashes] of Object.entries(oldHashes))seeds.forEach((seed,i)=>assert.equal(hash(generateIslandMap(id as IslandPreset,seed)),hashes[i],`${id}:${seed}`))
})

test('all 20 maps have unique terrain and coastline signatures at the same seed',()=>{
  for(const seed of seeds){
    const worlds=ISLAND_PRESETS.map(p=>generateIslandMap(p.id,seed))
    assert.equal(new Set(worlds.map(w=>w.tiles.map(t=>t.terrain).join(','))).size,20,`terrain ${seed}`)
    // Legacy maps intentionally share the original coast. Additional profiles each have a different coastline.
    assert.equal(new Set(worlds.slice(3).map(w=>w.tiles.map(t=>t.terrain==='sea'?'~':'.').join(''))).size,17,`coast ${seed}`)
  }
})

test('100 seeded worlds have seven terrains, fully reachable land, six resources and three distinct chest tiers',()=>{
  for(const preset of ISLAND_PRESETS)for(const seed of seeds){
    const game=createSurvivalGame(preset.id,seed),{world}=game,{previous}=routes(game)
    assert.equal(world.width,18);assert.equal(world.height,14);assert.equal(world.tiles.length,252)
    assert.equal(new Set(world.tiles.map(t=>t.terrain)).size,7,`${preset.id}:${seed}`)
    assert.deepEqual(world.camp,{x:4,y:2})
    for(const tile of world.tiles){
      assert.equal(tile.x+tile.y*18,world.tiles.indexOf(tile))
      if(tile.terrain!=='sea')assert.ok(previous.has(tile.x+tile.y*18),`${preset.id}: land at ${tile.x},${tile.y}`)
      else {assert.equal(tile.resource,null);assert.equal(tile.chest,null);assert.equal(tile.remaining,0)}
      assert.ok(tile.remaining>=0&&tile.remaining<=200)
    }
    const resources=['wood','stone','fiber','food','water','iron'] as const
    resources.forEach((resource,i)=>{const node=world.tiles[3*18+4+i];assert.equal(node.resource,resource);assert.equal(node.remaining,100);assert.ok(previous.has(3*18+4+i))})
    const chests=world.tiles.filter(t=>t.chest)
    assert.equal(chests.length,3);assert.equal(new Set(chests.map(t=>t.chest!.id)).size,3)
    assert.deepEqual(chests.map(t=>t.chest!.tier).sort(),['golden','silver','wooden'])
    assert.ok(chests.every(t=>!t.chest!.opened&&t.resource===null&&t.remaining===0&&previous.has(t.y*18+t.x)))
    assert.deepEqual(parseSurvivalGame(JSON.stringify(game)),game)
    assert.deepEqual(generateIslandMap(preset.id,seed),world)
  }
})

test('new maps are deterministic while seed changes alter resource/minor terrain data',()=>{
  const catalogue=JSON.stringify(ADDITIONAL_ISLAND_PRESETS)
  for(const preset of ADDITIONAL_ISLAND_PRESETS){
    const one=generateAdditionalIslandMap(preset.id,1)
    assert.deepEqual(generateAdditionalIslandMap(preset.id,1),one)
    assert.notDeepEqual(generateAdditionalIslandMap(preset.id,2),one)
    one.tiles[0].terrain='grass';assert.equal(generateAdditionalIslandMap(preset.id,1).tiles[0].terrain,'sea')
  }
  assert.equal(JSON.stringify(ADDITIONAL_ISLAND_PRESETS),catalogue)
  for(const bad of ['unknown','__proto__','constructor'])assert.throws(()=>generateIslandMap(bad as IslandPreset,1))
  for(const seed of [0,-1,NaN,1.5,2147483648])assert.throws(()=>generateAdditionalIslandMap('twin-lakes',seed))
})

test('saved worlds stay authoritative, including depleted nodes and opened legacy chests',()=>{
  const memory=new Map<string,string>(),storage={getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>{memory.set(key,value)}}
  const legacy=createSurvivalGame('lagoon',17);legacy.world.tiles[3*18+6].remaining=37
  legacy.world.tiles.find(t=>t.chest)!.chest!.opened=true;legacy.world.tiles[3*18+6].terrain='grass'
  const saved=writeSurvivalSlot(storage,1,legacy)
  for(const preset of ISLAND_PRESETS){
    const game=createSurvivalGame(preset.id,2147483647);game.world.tiles[3*18+6].remaining=12
    writeSurvivalSlot(storage,2,game)
    assert.deepEqual(readSurvivalSlot(storage,2).game,game)
    assert.equal(storage.getItem(SURVIVAL_SLOT_KEYS[1]),saved)
    assert.deepEqual(readSurvivalSlot(storage,1).game,legacy)
    const unknown=JSON.parse(JSON.stringify(game));unknown.preset='ocean';assert.throws(()=>parseSurvivalGame(JSON.stringify(unknown)))
  }
})

test('all 20 maps support gathering, chest exploration, all five recipes and escape through actual actions',()=>{
  for(const preset of ISLAND_PRESETS){
    let game=createSurvivalGame(preset.id,20261003)
    const raw=(action:SurvivalAction)=>{
      const old=JSON.stringify(game),result=applySurvivalAction(game,action)
      assert.equal(result.accepted,true,`${preset.id}: ${result.message}`)
      assert.equal(JSON.stringify(game),old,'reducer input preserved');game=result.state
      assert.notEqual(game.status,'downed',`${preset.id}: survival maintained`)
    }
    const act=(action:SurvivalAction)=>{
      if(game.player.thirst<45)raw({type:'consume',item:'water'})
      if(game.player.hunger<40)raw({type:'consume',item:'food'})
      if(game.player.energy<10)raw({type:'rest'})
      raw(action)
    }
    const travel=(x:number,y:number)=>{for(const step of routes(game).route(x,y))act({type:'move',...step})}
    travel(8,3);for(let i=0;i<10;i++)act({type:'gather'})
    travel(7,3);for(let i=0;i<10;i++)act({type:'gather'})
    travel(4,2);for(let i=0;i<10;i++)act({type:'gather'})
    travel(5,3);for(let i=0;i<9;i++)act({type:'gather'})
    travel(6,3);for(let i=0;i<2;i++)act({type:'gather'})
    for(const tile of game.world.tiles.filter(t=>t.chest)){travel(tile.x,tile.y);act({type:'openChest'})}
    travel(4,2);for(const recipe of ['axe','pickaxe','camp','rope','raft'] as const)act({type:'craft',recipe})
    travel(9,3);act({type:'gather'});assert.ok(game.stats.gathered.iron>=1)
    travel(4,2);act({type:'escape'})
    assert.equal(game.status,'escaped');assert.ok(game.world.tiles.filter(t=>t.chest).every(t=>t.chest!.opened))
    assert.deepEqual(parseSurvivalGame(JSON.stringify(game)),game)
  }
})
