import type { ChestTier, IslandPreset, IslandTerrain, IslandTile, SurvivalGameState, SurvivalResource } from './survivalTypes'

type LandTerrain=Exclude<IslandTerrain,'sea'>
type MapProfile={
  id:IslandPreset;name:string;description:string;category:string;feature:string
  land:(x:number,y:number)=>boolean
  featureAt:(x:number,y:number)=>LandTerrain|undefined
  chests:readonly [number,number][]
  forestResources:readonly SurvivalResource[]
}
const ellipse=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>((x-cx)/rx)**2+((y-cy)/ry)**2<=1
const distance=(x:number,y:number,cx:number,cy:number)=>Math.abs(x-cx)+Math.abs(y-cy)
const woods=['wood','fiber','food'] as const

// Profiles change coastlines and large terrain features, independently of the seed.
// Names describe scenery within the existing seven-terrain rules, without new hazards or items.
const PROFILES:MapProfile[]=[
  {id:'coconut-coast',name:'椰风海岸',description:'南侧宽沙滩与沿海树林，内陆有小型淡水池。',category:'海岸',feature:'宽沙滩 · 沿海树林',
    land:(x,y)=>ellipse(x,y,8,6,8,6)&&!(x>=14&&y<=4),featureAt:(x,y)=>y>=9?'beach':y===7&&x>=6&&x<=9?'freshwater':x<=6&&y>=4?'forest':undefined,chests:[[3,5],[10,8],[13,6]],forestResources:['wood','wood','fiber','food']},
  {id:'bamboo-grove',name:'竹影岛',description:'狭长的林间地带与溪水，以现有木头、纤维等物资表现竹林风景。',category:'林地',feature:'林间走廊 · 弯曲溪水',
    land:(x,y)=>x>=2&&x<=15&&y>=1&&y<=12&&!(x<=3&&y>=8)&&!(x>=13&&y<=5),featureAt:(x,y)=>x===9+Math.floor(y/4)&&y>=5?'freshwater':x%4!==0&&y>=4?'forest':undefined,chests:[[4,6],[8,10],[13,9]],forestResources:['fiber','fiber','wood','food']},
  {id:'twin-lakes',name:'双湖岛',description:'中央两座淡水湖之间留有可步行的草地走廊。',category:'水域',feature:'双淡水湖 · 中央走廊',
    land:(x,y)=>ellipse(x,y,8.5,6.5,8,6)&&!(x<=3&&y>=10),featureAt:(x,y)=>ellipse(x,y,6,7,2,2)||ellipse(x,y,12,7,2,2)?'freshwater':y>=10?'forest':undefined,chests:[[3,6],[9,7],[14,9]],forestResources:woods},
  {id:'crescent-bay',name:'月牙湾',description:'东侧月牙海湾切入陆地，沿湾沙滩可通往内陆树林。',category:'海岸',feature:'月牙凹湾 · 弧形海岸',
    land:(x,y)=>ellipse(x,y,8,6.5,8,6)&&!ellipse(x,y,16,7,5,3),featureAt:(x,y)=>x<=6&&y>=5?'forest':x===8&&y>=7?'freshwater':undefined,chests:[[3,5],[8,9],[12,11]],forestResources:woods},
  {id:'rocky-cove',name:'石礁海湾',description:'西南凹湾与东侧大片岩地，湾边仍可沿沙滩步行。',category:'山岩',feature:'石礁海岸 · 岩地平台',
    land:(x,y)=>ellipse(x,y,9,6,8,6)&&!ellipse(x,y,2,10,4,3),featureAt:(x,y)=>x>=9&&y>=4?'rock':x===7&&y>=6&&y<=9?'freshwater':undefined,chests:[[4,5],[9,9],[14,5]],forestResources:woods},
  {id:'misty-wetland',name:'迷雾湿地',description:'淡水洼地交错分布，草地与林地之间有连续通路。',category:'水域',feature:'交错湿地 · 林地通路',
    land:(x,y)=>x>=2&&x<=15&&y>=1&&y<=12&&!(x>=12&&y>=10)&&!(x<=4&&y<=1),featureAt:(x,y)=>y>=5&&(x+y)%4<2?'freshwater':y>=5&&x%3===0?'forest':undefined,chests:[[3,7],[9,10],[13,7]],forestResources:['fiber','food','wood']},
  {id:'ancient-ruins',name:'古城遗岛',description:'内陆方形遗迹与断续石墙，周边树林藏着宝箱。',category:'遗迹',feature:'方形遗址 · 石墙回廊',
    land:(x,y)=>x>=1&&x<=16&&y>=2&&y<=12&&!(x<=3&&y>=10)&&!(x>=14&&y<=4),featureAt:(x,y)=>x>=6&&x<=13&&y>=5&&y<=10?(x===6||x===13||y===5||y===10?'rock':'ruins'):x===4&&y>=6?'freshwater':undefined,chests:[[4,7],[9,7],[12,9]],forestResources:woods},
  {id:'red-cliffs',name:'赤岩断岸',description:'两段岩地台阶跨越岛屿，海岸以曲折岬角呈现。',category:'山岩',feature:'双岩地台阶 · 曲折岬角',
    land:(x,y)=>x>=2&&x<=16&&y>=1&&y<=12&&!(x>=13&&y>=8)&&!(x<=4&&y>=10)&&!(x===16&&y<=5),featureAt:(x,y)=>y===6||y===9||x===12&&y>=4?'rock':x===7&&y>=7?'freshwater':undefined,chests:[[3,5],[10,7],[12,11]],forestResources:woods},
  {id:'emerald-valley',name:'翡翠谷',description:'草地谷底夹在两侧树林之间，谷底淡水流向南岸。',category:'林地',feature:'中央草谷 · 两翼树林',
    land:(x,y)=>ellipse(x,y,8,6.5,7,6)||x>=13&&x<=16&&y>=4&&y<=8,featureAt:(x,y)=>y>=5&&x===8?'freshwater':y>=4&&(x<=6||x>=10)?'forest':y>=5&&x===7?'grass':undefined,chests:[[4,8],[9,10],[14,6]],forestResources:['food','wood','fiber']},
  {id:'pine-ridge',name:'松林山脊',description:'斜向岩地山脊穿过松林，两侧林间分布饮水。',category:'林地',feature:'斜向山脊 · 松林两翼',
    land:(x,y)=>ellipse(x,y,8.5,6.5,8,5.5)&&!(x>=14&&y>=9),featureAt:(x,y)=>y>=4&&Math.abs(x-(y+2))<=1?'rock':y>=5&&x===5?'freshwater':y>=4?'forest':undefined,chests:[[3,6],[9,10],[14,6]],forestResources:['wood','wood','food','fiber']},
  {id:'river-delta',name:'河口三角洲',description:'三条分流汇入南岸，河间草地形成连续三角洲。',category:'水域',feature:'三支分流 · 南岸三角洲',
    land:(x,y)=>y<=5?x>=3&&x<=13:x>=Math.max(1,7-y)&&x<=Math.min(16,8+y),featureAt:(x,y)=>y>=5&&(x===8||y>=7&&(x===8-(y-6)||x===8+(y-6)))?'freshwater':y>=10?'beach':undefined,chests:[[4,6],[8,11],[14,9]],forestResources:woods},
  {id:'golden-dunes',name:'金沙丘',description:'沙地覆盖岛屿南部，北侧绿洲提供树林与淡水。',category:'海岸',feature:'大片沙地 · 北侧绿洲',
    land:(x,y)=>ellipse(x,y,8.5,6.5,8,6)&&!(x>=14&&y>=10)&&!(x<=3&&y<=4),featureAt:(x,y)=>y>=7?'beach':x>=10&&x<=12&&y>=4?'freshwater':x>=5&&x<=8&&y>=4?'forest':undefined,chests:[[4,7],[10,10],[14,6]],forestResources:['food','fiber','wood']},
  {id:'waterfall-basin',name:'瀑布湖盆',description:'岩地围绕圆形淡水湖盆，湖盆北侧有一条淡水流。',category:'水域',feature:'圆形湖盆 · 北侧水流',
    land:(x,y)=>ellipse(x,y,9,6.5,8,6)&&!(x<=3&&y>=9)&&!(x>=14&&y<=3),featureAt:(x,y)=>ellipse(x,y,10,8,3,2)?'freshwater':ellipse(x,y,10,8,4,3)?'rock':x===10&&y>=4?'freshwater':undefined,chests:[[4,7],[10,6],[14,9]],forestResources:woods},
  {id:'volcanic-ridge',name:'火山岩岛',description:'岩地环绕中央草地盆地；这里按普通岩地规则探索。',category:'山岩',feature:'环形岩脊 · 草地盆地',
    land:(x,y)=>ellipse(x,y,8.5,6.5,7.5,6)&&!(x<=3&&y<=4),featureAt:(x,y)=>ellipse(x,y,10,7,4,3)&&!ellipse(x,y,10,7,2,1.5)?'rock':x===10&&y===7?'freshwater':y>=10?'forest':undefined,chests:[[4,7],[10,8],[13,5]],forestResources:woods},
  {id:'mangrove-shore',name:'红树林湾',description:'东南树冠与淡水交错，南岸锯齿凹湾保留陆地通路。',category:'林地',feature:'锯齿海岸 · 湿地树林',
    land:(x,y)=>x>=1&&x<=16&&y>=2&&y<=12&&!(y>=10&&x%4<2)&&!(x>=14&&y<=4),featureAt:(x,y)=>y>=5&&x>=7?(x%3===0?'freshwater':'forest'):undefined,chests:[[3,6],[10,9],[14,8]],forestResources:['fiber','wood','food']},
  {id:'hidden-harbor',name:'隐秘港湾',description:'北东海口通向狭窄港湾，港湾西侧的草地可连续步行。',category:'海岸',feature:'狭窄海口 · 内凹港湾',
    land:(x,y)=>ellipse(x,y,8.5,6.5,8,6)&&!(x>=12&&y<=7)&&!ellipse(x,y,11,6,2,2),featureAt:(x,y)=>y>=8&&x>=6&&x<=10?'forest':x===5&&y>=5&&y<=8?'freshwater':undefined,chests:[[3,5],[9,9],[14,10]],forestResources:woods},
  {id:'treasure-atoll',name:'宝藏环礁',description:'可沿沙滩环带步行，中央海水仍不可进入，宝箱散布环带。',category:'遗迹',feature:'环形沙岸 · 中央深海',
    land:(x,y)=>ellipse(x,y,8.5,6.5,8,6)&&!ellipse(x,y,10,7,3,2),featureAt:(x,y)=>y>=9||x>=13?'beach':x===5&&y>=6&&y<=8?'freshwater':x<=4&&y>=5?'forest':undefined,chests:[[4,7],[9,11],[14,6]],forestResources:woods},
]

export const ADDITIONAL_ISLAND_PRESETS=PROFILES.map(({id,name,description,category,feature})=>({id,name,description,category,feature}))
const WIDTH=18,HEIGHT=14
const tiers:ChestTier[]=['wooden','silver','golden']

export function generateAdditionalIslandMap(preset:IslandPreset,seed:number):SurvivalGameState['world']{
  const profile=PROFILES.find(p=>p.id===preset)
  if(!profile||!Number.isSafeInteger(seed)||seed<1||seed>2147483647)throw new Error('岛屿类型或种子无效')
  let randomState=seed>>>0
  const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296}
  const camp={x:4,y:2}
  const tiles:IslandTile[]=Array.from({length:WIDTH*HEIGHT},(_,index)=>{
    const x=index%WIDTH,y=Math.floor(index/WIDTH)
    const land=x>0&&x<WIDTH-1&&y>0&&y<HEIGHT-1&&profile.land(x,y)
    return {x,y,terrain:land?'grass':'sea',resource:null,remaining:0,chest:null}
  })
  const at=(x:number,y:number)=>tiles[y*WIDTH+x]
  // The familiar tutorial corridor is preserved on every map, including the fiber at (6,3).
  for(let x=4;x<=9;x++)for(let y=2;y<=3;y++)at(x,y).terrain='grass'
  at(4,4).terrain='grass'
  // Remove isolated offshore pixels, rather than introducing invisible teleport paths.
  const reachable=new Set<number>([camp.y*WIDTH+camp.x]),queue=[camp.y*WIDTH+camp.x]
  for(let i=0;i<queue.length;i++){
    const tile=tiles[queue[i]]
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const x=tile.x+dx,y=tile.y+dy,index=y*WIDTH+x
      if(x<0||x>=WIDTH||y<0||y>=HEIGHT||reachable.has(index)||at(x,y).terrain==='sea')continue
      reachable.add(index);queue.push(index)
    }
  }
  for(let i=0;i<tiles.length;i++)if(!reachable.has(i))tiles[i].terrain='sea'
  const isSea=(x:number,y:number)=>x<0||x>=WIDTH||y<0||y>=HEIGHT||at(x,y).terrain==='sea'
  for(const tile of tiles){
    if(tile.terrain==='sea')continue
    const {x,y}=tile
    const coast=[[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dy])=>isSea(x+dx,y+dy))
    const feature=profile.featureAt(x,y)
    if(coast)tile.terrain='beach'
    else if(feature)tile.terrain=feature
    else {const roll=random();tile.terrain=roll<.18?'forest':roll<.3?'rock':'grass'}
    if(tile.terrain==='forest')tile.resource=profile.forestResources[Math.floor(random()*profile.forestResources.length)]
    else if(tile.terrain==='rock')tile.resource=random()<.3?'iron':'stone'
    else if(tile.terrain==='freshwater')tile.resource='water'
    if(tile.resource)tile.remaining=60+Math.floor(random()*61)
  }
  const set=(x:number,y:number,terrain:LandTerrain,resource:SurvivalResource|null,remaining=100)=>Object.assign(at(x,y),{terrain,resource,remaining:resource?remaining:0})
  set(4,2,'beach','wood')
  set(4,3,'forest','wood');set(5,3,'rock','stone');set(6,3,'forest','fiber')
  set(7,3,'forest','food');set(8,3,'freshwater','water');set(9,3,'rock','iron')
  set(4,4,'grass',null)
  const used=new Set<number>()
  profile.chests.forEach(([cx,cy],i)=>{
    const options=tiles.filter(t=>t.terrain!=='sea'&&!used.has(t.y*WIDTH+t.x)&&!(t.y<=4&&t.x>=4&&t.x<=9))
      .sort((a,b)=>distance(a.x,a.y,cx,cy)-distance(b.x,b.y,cx,cy)||a.y-b.y||a.x-b.x)
    const tile=options[0],tier=tiers[i]
    used.add(tile.y*WIDTH+tile.x)
    Object.assign(tile,{terrain:tier==='wooden'?'beach':'ruins',resource:null,remaining:0,chest:{id:`${preset}-${seed}-${tier}`,tier,opened:false}})
  })
  return {width:WIDTH,height:HEIGHT,camp,tiles}
}
