import type { IslandPreset, IslandTerrain, IslandTile, SurvivalAction, SurvivalActionResult, SurvivalGameState, SurvivalItem, SurvivalQuest, SurvivalRecipeDefinition, SurvivalResource, SurvivalShopItem } from './survivalTypes'
import {ADDITIONAL_ISLAND_PRESETS,generateAdditionalIslandMap} from './islandMaps'

export const SURVIVAL_RESOURCE_LABELS:Record<SurvivalResource,string>={wood:'木头',stone:'石头',fiber:'纤维',iron:'铁矿',food:'食物',water:'饮水'}
export const TERRAIN_LABELS:Record<IslandTerrain,string>={sea:'深海',beach:'沙滩',grass:'草地',forest:'森林',rock:'岩地',freshwater:'淡水',ruins:'遗迹'}
export const ISLAND_PRESETS:{id:IslandPreset;name:string;description:string;category?:string;feature?:string}[]=[
  {id:'lagoon',name:'碧海湾',description:'沙滩环绕的海湾，内陆有树林和淡水。'},
  {id:'jungle',name:'密林岛',description:'茂密丛林与古老遗迹，纤维和食物丰富。'},
  {id:'highlands',name:'岩峰岛',description:'岩地与山间淡水，石头和铁矿集中。'},
  ...ADDITIONAL_ISLAND_PRESETS,
]
export const SURVIVAL_RECIPES:SurvivalRecipeDefinition[]=[
  {id:'axe',name:'石斧',description:'采集木头时每次最多获得 5 份。',cost:{wood:4,stone:3}},
  {id:'pickaxe',name:'石镐',description:'采石每次最多 4 份，并可开采铁矿。',cost:{wood:3,stone:5}},
  {id:'camp',name:'营地',description:'在起点搭建营地，休息可恢复健康和更多体力。',cost:{wood:8,stone:4}},
  {id:'rope',name:'草绳',description:'6 份纤维合成 2 根草绳，可重复制作。',cost:{fiber:6}},
  {id:'raft',name:'木筏',description:'建好营地后，带木筏到沙滩即可离岛。',cost:{wood:12,stone:6,rope:2}},
]
export const SURVIVAL_SHOP:SurvivalShopItem[]=[
  {id:'wood',name:'木头',buyPrice:8,sellPrice:3},{id:'stone',name:'石头',buyPrice:10,sellPrice:4},
  {id:'fiber',name:'纤维',buyPrice:6,sellPrice:2},{id:'iron',name:'铁矿',buyPrice:25,sellPrice:10},
  {id:'food',name:'食物',buyPrice:20,sellPrice:null},{id:'water',name:'饮水',buyPrice:15,sellPrice:null},
]
const RESOURCES=Object.keys(SURVIVAL_RESOURCE_LABELS) as SurvivalResource[]
const ITEMS:SurvivalItem[]=[...RESOURCES,'rope']
const WIDTH=18,HEIGHT=14,MAX_ITEM=99999,MAX_COINS=9999999,MAX_DIAMONDS=99999,MAX_TURN=1000000
const integer=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=min&&value<=max
const validPreset=(value:unknown):value is IslandPreset=>ISLAND_PRESETS.some(p=>p.id===value)
function generator(seed:number){let value=seed>>>0;return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/4294967296}}

export function generateIslandMap(preset:IslandPreset,seed:number):SurvivalGameState['world']{
  if(!validPreset(preset)||!integer(seed,1,2147483647))throw new Error('岛屿类型或种子无效')
  if(preset!=='lagoon'&&preset!=='jungle'&&preset!=='highlands')return generateAdditionalIslandMap(preset,seed)
  const random=generator(seed),tiles:IslandTile[]=[]
  for(let y=0;y<HEIGHT;y++)for(let x=0;x<WIDTH;x++){
    const edge=x===0||y===0||x===WIDTH-1||y===HEIGHT-1
    const corner=(x<3||x>14)&&(y<3||y>10)
    let terrain:IslandTerrain=edge||corner?'sea':x<3||x>14||y<3||y>10?'beach':'grass'
    let resource:SurvivalResource|null=null,remaining=0
    if(terrain==='grass'){
      const roll=random()
      if(roll<(preset==='jungle'?.64:preset==='lagoon'?.35:.18)){terrain='forest';resource=random()<.5?'wood':random()<.55?'fiber':'food'}
      else if(roll<(preset==='highlands'?.79:.78)){terrain='rock';resource=random()<.25?'iron':'stone'}
      if(resource)remaining=40+Math.floor(random()*61)
    }
    tiles.push({x,y,terrain,resource,remaining,chest:null})
  }
  const at=(x:number,y:number)=>tiles[y*WIDTH+x]
  const camp={x:4,y:2}
  Object.assign(at(camp.x,camp.y),{terrain:'beach',resource:'wood',remaining:100})
  const nodes:[number,number,IslandTerrain,SurvivalResource][]=[
    [4,3,'forest','wood'],[5,3,'rock','stone'],[6,3,'forest','fiber'],[7,3,'forest','food'],[8,3,'freshwater','water'],[9,3,'rock','iron'],
  ]
  for(const [x,y,terrain,resource] of nodes)Object.assign(at(x,y),{terrain,resource,remaining:100})
  const pondX=preset==='lagoon'?11:preset==='jungle'?7:12,pondY=preset==='lagoon'?7:preset==='jungle'?9:5
  for(const [dx,dy] of [[0,0],[1,0],[0,1]])Object.assign(at(pondX+dx,pondY+dy),{terrain:'freshwater',resource:'water',remaining:120})
  const offset=Math.floor(random()*3)
  const chestSites:[number,number,'wooden'|'silver'|'golden'][]=[[3,4+offset,'wooden'],[10,8+offset,'silver'],[14,4+offset,'golden']]
  for(const [x,y,tier] of chestSites)Object.assign(at(x,y),{terrain:tier==='wooden'?'beach':'ruins',resource:null,remaining:0,chest:{id:`${preset}-${seed}-${tier}`,tier,opened:false}})
  return {width:WIDTH,height:HEIGHT,camp,tiles}
}

export function createSurvivalGame(preset:IslandPreset='lagoon',seed=20261003,playerName='旅行者'):SurvivalGameState{
  const name=playerName.trim()
  if(!name||name.length>24)throw new Error('玩家昵称需要 1–24 个字符')
  const world=generateIslandMap(preset,seed)
  return {version:1,seed,preset,playerName:name,player:{...world.camp,health:100,hunger:100,thirst:100,energy:100},inventory:{wood:0,stone:0,fiber:0,iron:0,food:3,water:3,rope:0},wallet:{coins:120,diamonds:1},gear:{axe:false,pickaxe:false,camp:false,raft:false},turn:0,status:'playing',world,rates:{buy:100,sell:80},stats:{gathered:{wood:0,stone:0,fiber:0,iron:0,food:0,water:0},ropesCrafted:0}}
}
export function getCurrentSurvivalTile(game:SurvivalGameState):IslandTile{return game.world.tiles[game.player.y*game.world.width+game.player.x]}
export function getSurvivalDay(game:SurvivalGameState):number{return Math.floor(game.turn/24)+1}
export function getSurvivalQuests(game:SurvivalGameState):SurvivalQuest[]{return [
  {id:'wood',label:'采集木头',done:game.stats.gathered.wood>=8,detail:`已采集 ${game.stats.gathered.wood} / 8 份`},
  {id:'stone',label:'采集石头',done:game.stats.gathered.stone>=6,detail:`已采集 ${game.stats.gathered.stone} / 6 份`},
  {id:'fiber',label:'采集纤维',done:game.stats.gathered.fiber>=6,detail:`已采集 ${game.stats.gathered.fiber} / 6 份`},
  {id:'tools',label:'制作斧头和镐',done:game.gear.axe&&game.gear.pickaxe,detail:'石斧提高伐木效率；石镐可开采铁矿。'},
  {id:'camp',label:'搭建营地',done:game.gear.camp,detail:'回起点用 8 木头和 4 石头搭建。'},
  {id:'rope',label:'制作草绳',done:game.stats.ropesCrafted>=2,detail:'6 份纤维合成 2 根草绳。'},
  {id:'chest',label:'发现并开启宝箱',done:game.world.tiles.some(t=>t.chest?.opened),detail:'走到宝箱所在格，免费领取一次性奖励。'},
  {id:'escape',label:'乘木筏离岛',done:game.status==='escaped',detail:'建好营地和木筏，在任意沙滩选择离岛。'},
]}

export function applySurvivalAction(game:SurvivalGameState,action:SurvivalAction):SurvivalActionResult{
  const reject=(message:string):SurvivalActionResult=>({state:game,accepted:false,message})
  if(!action||typeof action!=='object')return reject('操作无效')
  if(game.status==='downed'&&action.type!=='recover')return reject('你已倒下，请选择回营地恢复')
  // Rules and nickname remain editable after a successfully completed adventure.
  if(action.type==='rename'){
    if(typeof action.name!=='string'||!action.name.trim()||action.name.trim().length>24)return reject('玩家昵称需要 1–24 个字符')
    return {state:{...game,playerName:action.name.trim()},accepted:true,message:'昵称已更新'}
  }
  if(action.type==='setRates'){
    if(!integer(action.buy,1,1000000)||!integer(action.sell,0,action.buy))return reject('兑换价必须为整数，回兑价不可高于购买价')
    return {state:{...game,rates:{buy:action.buy,sell:action.sell}},accepted:true,message:'游戏内兑换规则已更新'}
  }
  if(game.status==='escaped')return reject('你已成功离岛，请开启新冒险')
  if(action.type==='recover'){
    if(game.status!=='downed')return reject('只有倒下后才能回营地恢复')
    const state=clone(game)
    state.player={...state.world.camp,health:70,hunger:70,thirst:70,energy:70}
    state.inventory.food=Math.max(2,state.inventory.food);state.inventory.water=Math.max(2,state.inventory.water)
    state.wallet.coins=Math.max(0,state.wallet.coins-10);state.status='playing'
    return {state,accepted:true,message:'已回到起点恢复；扣除最多 10 金币，保留探索与宝箱进度'}
  }
  const state=clone(game),tile=getCurrentSurvivalTile(state)
  let turns=0,energy=0,message=''
  const addItem=(item:SurvivalItem,quantity:number)=>integer(state.inventory[item]+quantity,0,MAX_ITEM)
  const tradeQuantity=(quantity:unknown)=>integer(quantity,1,9999)
  switch(action.type){
    case 'move':{
      if(!integer(action.x,0,WIDTH-1)||!integer(action.y,0,HEIGHT-1)||Math.abs(action.x-state.player.x)+Math.abs(action.y-state.player.y)!==1)return reject('每次只能向相邻格移动一步')
      const destination=state.world.tiles[action.y*WIDTH+action.x]
      if(destination.terrain==='sea')return reject('深海无法步行，请沿岛屿探索')
      turns=1;energy=destination.terrain==='rock'?2:1
      state.player.x=action.x;state.player.y=action.y;message=`已到达${TERRAIN_LABELS[destination.terrain]}`;break
    }
    case 'gather':{
      if(!tile.resource||tile.remaining===0)return reject('这里没有可采集物资，或资源已经耗尽')
      const resource=tile.resource
      if(resource==='iron'&&!state.gear.pickaxe)return reject('采集铁矿需要先制作石镐')
      const count=Math.min(tile.remaining,resource==='wood'?(state.gear.axe?5:3):resource==='stone'?(state.gear.pickaxe?4:2):resource==='fiber'||resource==='water'?3:resource==='food'?2:1)
      if(!addItem(resource,count)||!integer(state.stats.gathered[resource]+count,0,MAX_TURN))return reject('物资或采集统计已达到上限')
      tile.remaining-=count;state.inventory[resource]+=count;state.stats.gathered[resource]+=count
      turns=1;energy=resource==='water'?2:8;message=`采集到 ${count} 份${SURVIVAL_RESOURCE_LABELS[resource]}`;break
    }
    case 'openChest':{
      if(!tile.chest)return reject('请先走到宝箱所在格')
      if(tile.chest.opened)return reject('这个宝箱已经领取，不能重复开启')
      const tier=tile.chest.tier,coins=tier==='wooden'?30:tier==='silver'?90:180,diamonds=tier==='wooden'?0:tier==='silver'?1:2
      const rewards:Partial<Record<SurvivalItem,number>>=tier==='wooden'?{wood:4,stone:2}:tier==='silver'?{food:2}:{iron:3}
      if(!integer(state.wallet.coins+coins,0,MAX_COINS)||!integer(state.wallet.diamonds+diamonds,0,MAX_DIAMONDS)||Object.entries(rewards).some(([item,n])=>!addItem(item as SurvivalItem,n!)))return reject('余额或物资已达到上限，请先腾出空间')
      state.wallet.coins+=coins;state.wallet.diamonds+=diamonds
      for(const [item,n] of Object.entries(rewards))state.inventory[item as SurvivalItem]+=n!
      tile.chest.opened=true;turns=1;energy=4;message=`宝箱已开启：${coins} 金币${diamonds?`、${diamonds} 钻石`:''}，以及物资奖励`;break
    }
    case 'craft':{
      const recipe=SURVIVAL_RECIPES.find(r=>r.id===action.recipe)
      if(!recipe)return reject('合成配方不存在')
      if(action.recipe!=='rope'&&state.gear[action.recipe])return reject('已经制作过该工具或设施')
      if(action.recipe==='camp'&&(state.player.x!==state.world.camp.x||state.player.y!==state.world.camp.y))return reject('请回到起点搭建营地')
      for(const [item,n] of Object.entries(recipe.cost))if(state.inventory[item as SurvivalItem]<n!)return reject(`制作${recipe.name}还缺${SURVIVAL_RESOURCE_LABELS[item as SurvivalResource]??'草绳'}`)
      if(action.recipe==='rope'&&(!addItem('rope',2)||!integer(state.stats.ropesCrafted+2,0,MAX_TURN)))return reject('草绳数量已达到上限')
      for(const [item,n] of Object.entries(recipe.cost))state.inventory[item as SurvivalItem]-=n!
      if(action.recipe==='rope'){state.inventory.rope+=2;state.stats.ropesCrafted+=2}else state.gear[action.recipe]=true
      turns=1;energy=5;message=`已制作${recipe.name}${action.recipe==='rope'?' × 2':''}`;break
    }
    case 'consume':{
      if(action.item!=='food'&&action.item!=='water')return reject('只能食用食物或饮用水')
      if(state.inventory[action.item]<1)return reject(`背包里没有${SURVIVAL_RESOURCE_LABELS[action.item]}`)
      state.inventory[action.item]-=1
      if(action.item==='food')state.player.hunger=Math.min(100,state.player.hunger+35)
      else state.player.thirst=Math.min(100,state.player.thirst+40)
      turns=1;message=action.item==='food'?'已吃一份食物，恢复饱腹':'已喝一份饮水，缓解口渴';break
    }
    case 'rest':{
      const camp=state.gear.camp&&state.player.x===state.world.camp.x&&state.player.y===state.world.camp.y
      state.player.energy=Math.min(100,state.player.energy+(camp?60:35))
      if(camp)state.player.health=Math.min(100,state.player.health+10)
      turns=2;message=camp?'在营地休息，恢复体力和健康':'稍作休息，恢复体力';break
    }
    case 'escape':
      if(!state.gear.camp||!state.gear.raft)return reject('离岛前需要搭建营地并制作木筏')
      if(tile.terrain!=='beach')return reject('请到沙滩使用木筏离岛')
      turns=1;state.status='escaped';message='成功乘木筏离岛！你的荒岛求生冒险已完成';break
    case 'buy':case 'sell':{
      const shop=SURVIVAL_SHOP.find(row=>row.id===action.item)
      if(!shop||!tradeQuantity(action.quantity))return reject('请选择有效物资，并输入 1–9999 的整数数量')
      if(action.type==='buy'){
        const total=shop.buyPrice*action.quantity
        if(state.wallet.coins<total)return reject('金币不足，未扣款')
        if(!addItem(action.item,action.quantity))return reject('背包数量将超过上限，未扣款')
        state.wallet.coins-=total;state.inventory[action.item]+=action.quantity;message=`购入 ${action.quantity} 份${shop.name}，支付 ${total} 金币`
      }else{
        if(shop.sellPrice===null)return reject('食物和饮水不可出售')
        const total=shop.sellPrice*action.quantity
        if(state.inventory[action.item]<action.quantity)return reject('背包物资不足，交易未完成')
        if(!integer(state.wallet.coins+total,0,MAX_COINS))return reject('金币将超过余额上限，交易未完成')
        state.inventory[action.item]-=action.quantity;state.wallet.coins+=total;message=`出售 ${action.quantity} 份${shop.name}，获得 ${total} 金币`
      }break
    }
    case 'exchange':{
      if(!tradeQuantity(action.quantity)||(action.direction!=='buyDiamond'&&action.direction!=='sellDiamond'))return reject('请选择有效兑换方向，并输入 1–9999 的整数数量')
      if(action.direction==='buyDiamond'){
        const cost=state.rates.buy*action.quantity
        if(state.wallet.coins<cost)return reject('金币不足，兑换未扣款')
        if(!integer(state.wallet.diamonds+action.quantity,0,MAX_DIAMONDS))return reject('钻石将超过余额上限，兑换未完成')
        state.wallet.coins-=cost;state.wallet.diamonds+=action.quantity;message=`支付 ${cost} 金币，兑换 ${action.quantity} 钻石`
      }else{
        const coins=state.rates.sell*action.quantity
        if(state.wallet.diamonds<action.quantity)return reject('钻石不足，兑换未扣款')
        if(!integer(state.wallet.coins+coins,0,MAX_COINS))return reject('金币将超过余额上限，兑换未完成')
        state.wallet.diamonds-=action.quantity;state.wallet.coins+=coins;message=`回兑 ${action.quantity} 钻石，获得 ${coins} 金币`
      }break
    }
    case 'supplyPack':
      if(state.wallet.diamonds<2)return reject('补给需要 2 钻石，余额不足')
      state.wallet.diamonds-=2;state.player.health=Math.min(100,state.player.health+40);state.player.energy=Math.min(100,state.player.energy+30);state.player.hunger=Math.min(100,state.player.hunger+15);state.player.thirst=Math.min(100,state.player.thirst+15)
      message='使用 2 钻石领取补给，恢复健康、体力、饱腹和水分';break
    default:return reject('操作不存在')
  }
  if(state.player.energy<energy)return reject('体力不足，请先休息；同时留意食物和饮水')
  if(state.turn+turns>MAX_TURN)return reject('本次冒险回合已达上限，请开启新冒险')
  state.player.energy-=energy
  for(let i=0;i<turns;i++){
    state.player.hunger=Math.max(0,state.player.hunger-2);state.player.thirst=Math.max(0,state.player.thirst-3)
    if(state.player.hunger===0||state.player.thirst===0)state.player.health=Math.max(0,state.player.health-5)
  }
  state.turn+=turns
  if(state.player.health===0){state.status='downed';message+='；你已倒下，可回营地恢复'}
  return {state,accepted:true,message}
}
function clone(game:SurvivalGameState):SurvivalGameState{return JSON.parse(JSON.stringify(game)) as SurvivalGameState}

function object(value:unknown,keys:string[],path:string):Record<string,unknown>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${path}需要对象`)
  const record=value as Record<string,unknown>
  if(Object.keys(record).length!==keys.length||keys.some(key=>!Object.hasOwn(record,key))||Object.keys(record).some(key=>!keys.includes(key)))throw new Error(`${path}字段不完整或包含未知字段`)
  return record
}
function number(value:unknown,min:number,max:number,path:string):number{if(!integer(value,min,max))throw new Error(`${path}需要 ${min}–${max} 的整数`);return value}
function bool(value:unknown,path:string):boolean{if(typeof value!=='boolean')throw new Error(`${path}需要布尔值`);return value}
function textValue(value:unknown,max:number,path:string):string{if(typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>max)throw new Error(`${path}文本无效`);return value}
function resourceRecord(value:unknown,keys:string[],max:number,path:string){const record=object(value,keys,path);for(const key of keys)number(record[key],0,max,`${path}.${key}`)}
export function parseSurvivalGame(json:string):SurvivalGameState{
  if(typeof json!=='string'||json.length>1000000)throw new Error('游戏存档过大或内容无效')
  const raw:unknown=JSON.parse(json)
  const g=object(raw,['version','seed','preset','playerName','player','inventory','wallet','gear','turn','status','world','rates','stats'],'游戏存档')
  if(g.version!==1)throw new Error('不支持的游戏存档版本')
  number(g.seed,1,2147483647,'地图种子');if(!validPreset(g.preset))throw new Error('岛屿类型无效')
  textValue(g.playerName,24,'昵称');number(g.turn,0,MAX_TURN,'回合')
  if(!['playing','downed','escaped'].includes(g.status as string))throw new Error('冒险状态无效')
  const player=object(g.player,['x','y','health','hunger','thirst','energy'],'玩家')
  number(player.x,0,WIDTH-1,'玩家坐标');number(player.y,0,HEIGHT-1,'玩家坐标')
  for(const key of ['health','hunger','thirst','energy'])number(player[key],0,100,`玩家.${key}`)
  if((g.status==='downed')!==(player.health===0))throw new Error('健康与倒下状态不一致')
  resourceRecord(g.inventory,ITEMS,MAX_ITEM,'背包')
  const wallet=object(g.wallet,['coins','diamonds'],'钱包');number(wallet.coins,0,MAX_COINS,'金币');number(wallet.diamonds,0,MAX_DIAMONDS,'钻石')
  const gear=object(g.gear,['axe','pickaxe','camp','raft'],'设施');for(const key of Object.keys(gear))bool(gear[key],`设施.${key}`)
  const rates=object(g.rates,['buy','sell'],'兑换规则');number(rates.buy,1,1000000,'钻石购买价');number(rates.sell,0,rates.buy as number,'钻石回兑价')
  const stats=object(g.stats,['gathered','ropesCrafted'],'统计');resourceRecord(stats.gathered,RESOURCES,MAX_TURN,'采集统计');number(stats.ropesCrafted,0,MAX_TURN,'草绳统计')
  const world=object(g.world,['width','height','camp','tiles'],'地图')
  if(world.width!==WIDTH||world.height!==HEIGHT)throw new Error('地图必须为 18 × 14 格')
  const camp=object(world.camp,['x','y'],'起点');number(camp.x,0,WIDTH-1,'起点坐标');number(camp.y,0,HEIGHT-1,'起点坐标')
  if(!Array.isArray(world.tiles)||world.tiles.length!==WIDTH*HEIGHT)throw new Error('地图格子数量不完整')
  const chestIds=new Set<string>()
  world.tiles.forEach((value,index)=>{
    const tile=object(value,['x','y','terrain','resource','remaining','chest'],`格子 ${index}`)
    if(tile.x!==index%WIDTH||tile.y!==Math.floor(index/WIDTH))throw new Error('地图坐标顺序无效')
    if(!Object.hasOwn(TERRAIN_LABELS,tile.terrain as string))throw new Error('地形类型无效')
    if(tile.resource!==null&&!RESOURCES.includes(tile.resource as SurvivalResource))throw new Error('物资类型无效')
    number(tile.remaining,0,200,'资源余量')
    if((tile.resource===null&&tile.remaining!==0)||(tile.terrain==='sea'&&(tile.resource!==null||tile.chest!==null)))throw new Error('资源与地形不一致')
    if(tile.chest!==null){
      const chest=object(tile.chest,['id','tier','opened'],'宝箱');const id=textValue(chest.id,120,'宝箱编号')
      if(chestIds.has(id))throw new Error('宝箱编号重复');chestIds.add(id)
      if(!['wooden','silver','golden'].includes(chest.tier as string))throw new Error('宝箱等级无效')
      bool(chest.opened,'宝箱领取状态')
    }
  })
  const tiles=world.tiles as IslandTile[]
  if(tiles[(player.y as number)*WIDTH+(player.x as number)].terrain==='sea'||tiles[(camp.y as number)*WIDTH+(camp.x as number)].terrain==='sea')throw new Error('玩家和起点不能位于深海')
  if(g.status==='escaped'&&(!gear.camp||!gear.raft||tiles[(player.y as number)*WIDTH+(player.x as number)].terrain!=='beach'))throw new Error('离岛状态必须具备营地、木筏并位于沙滩')
  return raw as SurvivalGameState
}
