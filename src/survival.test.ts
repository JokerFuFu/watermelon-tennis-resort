import test from 'node:test'
import assert from 'node:assert/strict'
import {applySurvivalAction,createSurvivalGame,generateIslandMap,getCurrentSurvivalTile,getSurvivalDay,getSurvivalQuests,ISLAND_PRESETS,parseSurvivalGame,SURVIVAL_RECIPES,SURVIVAL_SHOP} from './survival'
import type {SurvivalAction,SurvivalGameState,SurvivalResource} from './survivalTypes'

const blank=()=>createSurvivalGame()
function apply(g:SurvivalGameState,a:SurvivalAction){const result=applySurvivalAction(g,a);assert.equal(result.accepted,true,result.message);return result.state}
function reject(g:SurvivalGameState,a:SurvivalAction){const before=JSON.stringify(g),result=applySurvivalAction(g,a);assert.equal(result.accepted,false);assert.strictEqual(result.state,g);assert.equal(JSON.stringify(g),before);return result.message}
function path(g:SurvivalGameState,x:number,y:number){
  const start=g.player.y*18+g.player.x,target=y*18+x,queue=[start],previous=new Map<number,number>([[start,-1]])
  for(let i=0;i<queue.length&&!previous.has(target);i++)for(const d of [-1,1,-18,18]){
    const current=queue[i],next=current+d
    if(next<0||next>=252||Math.abs(next%18-current%18)+Math.abs(Math.floor(next/18)-Math.floor(current/18))!==1||g.world.tiles[next].terrain==='sea'||previous.has(next))continue
    previous.set(next,current);queue.push(next)
  }
  assert.ok(previous.has(target),'destination reachable')
  const route:number[]=[];for(let t=target;t!==start;t=previous.get(t)!)route.unshift(t)
  return route.map(i=>({x:i%18,y:Math.floor(i/18)}))
}
function positioned(g:SurvivalGameState,resource:SurvivalResource){const tile=g.world.tiles.find(t=>t.resource===resource)!;return {...g,player:{...g.player,x:tile.x,y:tile.y}}}

test('factory initializes only independent game fields and stable deterministic seeded maps',()=>{
  const g=blank();assert.deepEqual(g.player,{x:4,y:2,health:100,hunger:100,thirst:100,energy:100});assert.deepEqual(g.wallet,{coins:120,diamonds:1});assert.equal(g.inventory.food,3);assert.equal(g.inventory.water,3);assert.equal(g.turn,0);assert.equal(g.status,'playing');assert.deepEqual(g,blank());assert.equal('facilities'in g,false);assert.equal('operating'in g,false)
  assert.deepEqual(parseSurvivalGame(JSON.stringify(g)),g);assert.equal(ISLAND_PRESETS.length,20);assert.equal(SURVIVAL_RECIPES.length,5);assert.equal(SURVIVAL_SHOP.length,6)
})
test('every seeded template has seven terrains, finite resources and three reachable chest tiers',()=>{
  for(const preset of ISLAND_PRESETS)for(const seed of [1,20261003,2147483647]){
    const g=createSurvivalGame(preset.id,seed)
    assert.equal(g.world.tiles.length,252);assert.equal(new Set(g.world.tiles.map(t=>t.terrain)).size,7)
    for(const resource of ['wood','stone','fiber','iron','food','water'] as const){const tile=g.world.tiles.find(t=>t.resource===resource)!;assert.ok(tile.remaining>0&&tile.remaining<=200);path(g,tile.x,tile.y)}
    const chests=g.world.tiles.filter(t=>t.chest);assert.equal(chests.length,3);assert.equal(new Set(chests.map(t=>t.chest!.tier)).size,3);chests.forEach(t=>path(g,t.x,t.y))
    assert.equal(getCurrentSurvivalTile(g).resource,'wood');assert.equal(g.world.tiles.filter(t=>t.resource==='wood').reduce((s,t)=>s+t.remaining,0)>=27,true)
    assert.deepEqual(generateIslandMap(preset.id,seed),g.world)
  }
})
test('presets and different seeds visibly alter terrain and chest/resource placement',()=>{assert.notDeepEqual(generateIslandMap('lagoon',1),generateIslandMap('jungle',1));assert.notDeepEqual(generateIslandMap('jungle',1),generateIslandMap('highlands',1));assert.notDeepEqual(generateIslandMap('lagoon',1),generateIslandMap('lagoon',2));assert.throws(()=>generateIslandMap('sea' as never,1));assert.throws(()=>createSurvivalGame('lagoon',0));assert.throws(()=>createSurvivalGame('lagoon',1,' '))})
test('move is one adjacent walkable tile, spends terrain energy and one turn without mutating input',()=>{const g=blank(),before=JSON.stringify(g),m=apply(g,{type:'move',x:4,y:3});assert.equal(m.player.energy,99);assert.equal(m.player.hunger,98);assert.equal(m.player.thirst,97);assert.equal(m.turn,1);assert.equal(JSON.stringify(g),before);const rock=apply(m,{type:'move',x:5,y:3});assert.equal(rock.player.energy,97)})
test('teleport, sea, out of bounds and insufficient energy reject atomically',()=>{
  const g=blank();for(const a of [{type:'move',x:15,y:2},{type:'move',x:-1,y:2},{type:'move',x:4.5,y:2}] as SurvivalAction[])reject(g,a)
  const coast={...g,player:{...g.player,x:4,y:1}};assert.match(reject(coast,{type:'move',x:4,y:0}),/深海/)
  assert.match(reject({...g,player:{...g.player,energy:0}},{type:'gather'}),/体力/)
})
test('gather harvests only current node with finite remainder and cumulative quest count',()=>{let g=blank();g.world.tiles[2*18+4].remaining=4;g=apply(g,{type:'gather'});assert.equal(g.inventory.wood,3);assert.equal(getCurrentSurvivalTile(g).remaining,1);assert.equal(g.stats.gathered.wood,3);g=apply(g,{type:'gather'});assert.equal(g.inventory.wood,4);assert.equal(getCurrentSurvivalTile(g).remaining,0);reject(g,{type:'gather'});assert.equal(g.turn,2)})
test('axe and pickaxe increase yield; iron requires pickaxe and water uses less energy',()=>{
  let g=blank();g.gear.axe=true;assert.equal(apply(g,{type:'gather'}).inventory.wood,5)
  g=positioned(blank(),'stone');g.gear.pickaxe=true;assert.equal(apply(g,{type:'gather'}).inventory.stone,4)
  g=positioned(blank(),'iron');reject(g,{type:'gather'});g.gear.pickaxe=true;assert.equal(apply(g,{type:'gather'}).inventory.iron,1)
  g=positioned(blank(),'water');const water=apply(g,{type:'gather'});assert.equal(water.inventory.water,6);assert.equal(water.player.energy,98)
})
test('all recipes deduct exact costs, rope creates two and tools cannot repeat',()=>{
  let g=blank();Object.assign(g.inventory,{wood:100,stone:100,fiber:12});
  for(const recipe of SURVIVAL_RECIPES){const old={...g.inventory};g=apply(g,{type:'craft',recipe:recipe.id});for(const [item,n] of Object.entries(recipe.cost))assert.equal(g.inventory[item as keyof typeof old],old[item as keyof typeof old]-n!);if(recipe.id==='rope')assert.equal(g.inventory.rope,2);else{assert.equal(g.gear[recipe.id],true);reject(g,{type:'craft',recipe:recipe.id})}}
  g=apply(g,{type:'craft',recipe:'rope'});assert.equal(g.inventory.rope,2);assert.equal(g.stats.ropesCrafted,4)
})
test('camp crafting requires original camp and missing materials never partially spend',()=>{let g=blank();Object.assign(g.inventory,{wood:8,stone:3});reject(g,{type:'craft',recipe:'camp'});g.inventory.stone=4;g=apply(g,{type:'move',x:4,y:3});assert.match(reject(g,{type:'craft',recipe:'camp'}),/起点/)})
test('rest consumes two hunger/thirst turns and camp rest heals with higher energy recovery',()=>{let g=blank();Object.assign(g.player,{energy:0,health:80,hunger:80,thirst:80});const wild=apply(g,{type:'rest'});assert.deepEqual([wild.turn,wild.player.energy,wild.player.health,wild.player.hunger,wild.player.thirst],[2,35,80,76,74]);g.gear.camp=true;const camp=apply(g,{type:'rest'});assert.deepEqual([camp.player.energy,camp.player.health],[60,90])})
test('consumption restores specified stat then spends survival turn; missing supplies reject',()=>{const g=blank();g.player.hunger=20;g.player.thirst=20;const food=apply(g,{type:'consume',item:'food'});assert.equal(food.inventory.food,2);assert.equal(food.player.hunger,53);const water=apply(g,{type:'consume',item:'water'});assert.equal(water.inventory.water,2);assert.equal(water.player.thirst,57);g.inventory.food=0;reject(g,{type:'consume',item:'food'})})
test('starvation causes downed and only recovery may perform gameplay afterwards',()=>{const g=blank();Object.assign(g.player,{health:5,hunger:0,thirst:0});const downed=apply(g,{type:'rest'});assert.equal(downed.status,'downed');assert.equal(downed.player.health,0);reject(downed,{type:'buy',item:'food',quantity:1});reject(downed,{type:'rest'});reject(downed,{type:'rename',name:'新名字'});reject(downed,{type:'setRates',buy:10,sell:5});assert.deepEqual(parseSurvivalGame(JSON.stringify(downed)),downed)})
test('recovery preserves depleted nodes, loot, gear and sellable stock without farming currency',()=>{
  let g=blank();g.inventory.wood=10;g.inventory.food=0;g.inventory.water=0;g.gear.axe=true;g.wallet.coins=6;g.world.tiles.find(t=>t.chest)!.chest!.opened=true;getCurrentSurvivalTile(g).remaining=2;Object.assign(g.player,{health:0,hunger:0,thirst:0});g.status='downed'
  const recovered=apply(g,{type:'recover'});assert.deepEqual([recovered.inventory.wood,recovered.wallet.coins,recovered.inventory.food,recovered.inventory.water],[10,0,2,2]);assert.equal(recovered.gear.axe,true);assert.equal(getCurrentSurvivalTile(recovered).remaining,2);assert.equal(recovered.world.tiles.find(t=>t.chest)!.chest!.opened,true);assert.equal(recovered.player.health,70);assert.equal(recovered.turn,0);reject(recovered,{type:'recover'});reject(recovered,{type:'sell',item:'food',quantity:1} as never)
})
test('all chest tiers give exact fixed free rewards once and remain opened across save/restore',()=>{
  for(const [tier,coins,diamonds] of [['wooden',30,0],['silver',90,1],['golden',180,2]] as const){let g=blank();const t=g.world.tiles.find(t=>t.chest?.tier===tier)!;g.player.x=t.x;g.player.y=t.y;g=apply(g,{type:'openChest'});assert.deepEqual(g.wallet,{coins:120+coins,diamonds:1+diamonds});assert.equal(g.turn,1);assert.equal(g.player.energy,96);if(tier==='wooden'){assert.equal(g.inventory.wood,4);assert.equal(g.inventory.stone,2)}if(tier==='silver')assert.equal(g.inventory.food,5);if(tier==='golden')assert.equal(g.inventory.iron,3);g=parseSurvivalGame(JSON.stringify(g));reject(g,{type:'openChest'})}
  reject(blank(),{type:'openChest'})
})
test('shop buys and sells exact amounts atomically without advancing starvation clock',()=>{const g=blank(),bought=apply(g,{type:'buy',item:'wood',quantity:10});assert.deepEqual([bought.wallet.coins,bought.inventory.wood,bought.turn],[40,10,0]);const sold=apply(bought,{type:'sell',item:'wood',quantity:10});assert.deepEqual([sold.wallet.coins,sold.inventory.wood,sold.turn],[70,0,0]);for(const item of ['stone','fiber','iron'] as const){const s=blank();s.inventory[item]=2;assert.equal(apply(s,{type:'sell',item,quantity:2}).wallet.coins,120+SURVIVAL_SHOP.find(row=>row.id===item)!.sellPrice!*2)}})
test('trade rejects empty, fractional, negative, NaN, huge, insufficient and overflowing transactions',()=>{
  const g=blank();for(const quantity of [0,-1,1.5,NaN,Infinity,10000]){reject(g,{type:'buy',item:'wood',quantity});reject(g,{type:'sell',item:'wood',quantity});reject(g,{type:'exchange',direction:'buyDiamond',quantity})}
  reject(g,{type:'buy',item:'iron',quantity:10});reject(g,{type:'sell',item:'wood',quantity:1});const full=blank();full.inventory.wood=99999;reject(full,{type:'buy',item:'wood',quantity:1});full.wallet.coins=9999999;reject(full,{type:'sell',item:'wood',quantity:1});full.wallet.diamonds=99999;reject(full,{type:'exchange',direction:'buyDiamond',quantity:1});
})
test('100 to 1 diamond and 1 to 80 coin exchange conserves exact balances with no free arbitrage',()=>{let g=blank();g=apply(g,{type:'exchange',direction:'buyDiamond',quantity:1});assert.deepEqual(g.wallet,{coins:20,diamonds:2});g=apply(g,{type:'exchange',direction:'sellDiamond',quantity:1});assert.deepEqual(g.wallet,{coins:100,diamonds:1});assert.equal(g.turn,0);reject(g,{type:'exchange',direction:'sellDiamond',quantity:2})})
test('rate changes require safe integer prices and non-arbitrage spread, and do not award currency',()=>{const g=blank();for(const rates of [{buy:0,sell:0},{buy:100,sell:101},{buy:NaN,sell:0},{buy:1000001,sell:1},{buy:20,sell:-1},{buy:10.5,sell:10}])reject(g,{type:'setRates',...rates});const changed=apply(g,{type:'setRates',buy:200,sell:150});assert.deepEqual(changed.wallet,g.wallet);assert.equal(changed.turn,0);assert.deepEqual(changed.rates,{buy:200,sell:150});assert.equal(apply(g,{type:'setRates',buy:1,sell:0}).rates.sell,0)})
test('100 repeated diamond buy/sell attempts cannot overdraw or inflate wallet',()=>{let g=blank();g.wallet.coins=500;for(let i=0;i<100;i++){for(const direction of ['buyDiamond','sellDiamond'] as const){const before=JSON.stringify(g),r=applySurvivalAction(g,{type:'exchange',direction,quantity:1});if(r.accepted)g=r.state;else assert.equal(JSON.stringify(r.state),before);assert.ok(g.wallet.coins>=0&&g.wallet.diamonds>=0);assert.ok(g.wallet.coins+g.wallet.diamonds*80<=580)}}})
test('diamond supply costs two and restores capped stats without adding sellable inventory',()=>{const g=blank();reject(g,{type:'supplyPack'});g.wallet.diamonds=2;Object.assign(g.player,{health:80,energy:80,hunger:95,thirst:95});const supplied=apply(g,{type:'supplyPack'});assert.deepEqual(supplied.wallet,{coins:120,diamonds:0});assert.deepEqual([supplied.player.health,supplied.player.energy,supplied.player.hunger,supplied.player.thirst],[100,100,100,100]);assert.deepEqual(supplied.inventory,g.inventory);assert.equal(supplied.turn,0)})
test('escape requires camp, raft and beach and ends all ordinary actions',()=>{let g=blank();reject(g,{type:'escape'});g.gear.camp=true;reject(g,{type:'escape'});g.gear.raft=true;const interior=apply(g,{type:'move',x:4,y:3});reject(interior,{type:'escape'});g=apply(g,{type:'escape'});assert.equal(g.status,'escaped');for(const a of [{type:'gather'},{type:'recover'},{type:'buy',item:'water',quantity:1}] as SurvivalAction[])reject(g,a);assert.deepEqual(parseSurvivalGame(JSON.stringify(g)),g)})
test('nickname, quests and day remain deterministic and derived from stored progress',()=>{let g=blank();g=apply(g,{type:'rename',name:' 小西瓜 '});assert.equal(g.playerName,'小西瓜');assert.equal(g.turn,0);reject(g,{type:'rename',name:''});reject(g,{type:'rename',name:'x'.repeat(25)});assert.equal(getSurvivalDay(g),1);g.turn=24;assert.equal(getSurvivalDay(g),2);assert.equal(getSurvivalQuests(g).length,8);g.stats.gathered.wood=8;assert.equal(getSurvivalQuests(g).find(q=>q.id==='wood')!.done,true)})
test('complete survival route harvests, manages food and energy, crafts gear and escapes on all maps',()=>{
  for(const preset of ISLAND_PRESETS){let g=createSurvivalGame(preset.id)
    const raw=(a:SurvivalAction)=>{g=apply(g,a);assert.equal(g.status==='downed',false,`${preset.id}: kept healthy`)}
    const sustain=()=>{if(g.player.thirst<45)raw({type:'consume',item:'water'});if(g.player.hunger<40)raw({type:'consume',item:'food'});if(g.player.energy<10)raw({type:'rest'})}
    const act=(a:SurvivalAction)=>{sustain();raw(a)}
    const travel=(x:number,y:number)=>{for(const step of path(g,x,y))act({type:'move',...step})}
    // Fetch enough drinking water and food first; every following step uses the actual reducer.
    travel(8,3);for(let i=0;i<6;i++)act({type:'gather'});travel(7,3);for(let i=0;i<6;i++)act({type:'gather'})
    travel(4,2);for(let i=0;i<10;i++)act({type:'gather'});travel(5,3);for(let i=0;i<9;i++)act({type:'gather'});travel(6,3);for(let i=0;i<2;i++)act({type:'gather'})
    travel(4,2);for(const recipe of ['axe','pickaxe','camp','rope','raft'] as const)act({type:'craft',recipe});assert.equal(g.gear.raft,true);assert.equal(g.gear.camp,true);act({type:'escape'});assert.equal(g.status,'escaped');assert.ok(g.turn>0);assert.deepEqual(parseSurvivalGame(JSON.stringify(g)),g)
  }
})
test('strict parser rejects missing/unknown nested keys and malformed numeric state',()=>{
  const mutations:((g:any)=>void)[]=[g=>g.extra=true,g=>delete g.inventory.rope,g=>g.player.extra=1,g=>g.seed=0,g=>g.seed=2147483648,g=>g.playerName=' ',g=>g.playerName='x'.repeat(25),g=>g.wallet.coins=-1,g=>g.wallet.diamonds=100000,g=>g.inventory.wood=1.5,g=>g.inventory.stone=100000,g=>g.rates.sell=101,g=>g.rates.buy=0,g=>g.turn=1000001,g=>g.gear.axe='yes',g=>g.stats.gathered.wood=-1,g=>g.status='won',g=>g.player.health=0,g=>g.status='downed',g=>g.version=2,g=>g.preset='ocean',g=>g.stats.ropesCrafted=Infinity]
  for(const mutate of mutations){const g=blank();mutate(g);assert.throws(()=>parseSurvivalGame(JSON.stringify(g)))}
  assert.throws(()=>parseSurvivalGame('null'));assert.throws(()=>parseSurvivalGame('{'))
})
test('strict parser rejects broken tile coordinates, resources, seas and duplicate chests',()=>{
  const mutations:((g:SurvivalGameState)=>void)[]=[g=>g.world.width=19,g=>g.world.tiles.pop(),g=>g.world.tiles[0].x=1,g=>g.world.tiles[0].remaining=1,g=>g.world.tiles[0].resource='wood',g=>g.world.tiles[0].terrain='ocean' as never,g=>g.world.tiles[40].remaining=201,g=>g.player.x=0,g=>g.world.camp.y=0,g=>{const chests=g.world.tiles.filter(t=>t.chest);chests[1].chest!.id=chests[0].chest!.id},g=>g.world.tiles.find(t=>t.chest)!.chest!.opened='yes' as never,g=>g.world.tiles.find(t=>t.chest)!.chest!.tier='platinum' as never,g=>g.status='escaped']
  for(const mutate of mutations){const g=blank();mutate(g);assert.throws(()=>parseSurvivalGame(JSON.stringify(g)))}
})
test('accepted reducer calls are replayable and never mutate arrays or nested input records',()=>{let g=blank();for(const action of [{type:'gather'},{type:'move',x:4,y:3},{type:'buy',item:'stone',quantity:3},{type:'exchange',direction:'sellDiamond',quantity:1},{type:'rest'}] as SurvivalAction[]){const frozen=JSON.stringify(g),one=applySurvivalAction(g,action),two=applySurvivalAction(g,action);assert.deepEqual(one,two);assert.equal(JSON.stringify(g),frozen);if(one.accepted)g=one.state}})
test('cap overflow in chest or crafting rejects whole action without marking reward or spending parts',()=>{const g=blank(),t=g.world.tiles.find(t=>t.chest?.tier==='wooden')!;g.player.x=t.x;g.player.y=t.y;g.wallet.coins=9999999;reject(g,{type:'openChest'});g.inventory.fiber=6;g.inventory.rope=99999;reject(g,{type:'craft',recipe:'rope'})})
