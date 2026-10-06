import type { CourtSurface, Facility, FacilityPresetId, FacilityType, RoomAllocation } from './types'

export type FacilityCategory = 'stay'|'sports'|'wellness'|'dining'|'service'|'outdoors'|'fun'
export interface FacilityPreset {
  id:FacilityPresetId
  type:FacilityType
  label:string
  category:FacilityCategory
  description:string
  width:number
  depth:number
  floors:number
  rooms:number
  unitCost:number
  color:string
  greenArea:boolean
  surface?:CourtSurface
  roomMix?:RoomAllocation
}
export const FACILITY_CATEGORIES:Record<FacilityCategory,{label:string;description:string}>={
  stay:{label:'酒店与住宿',description:'酒店楼、独栋客房与度假住宿'},
  sports:{label:'运动与网球',description:'网球场、训练及球员配套'},
  wellness:{label:'康体与亲子',description:'游泳、健身、理疗与儿童活动'},
  dining:{label:'餐饮与社交',description:'餐厅、咖啡、宴会与户外聚会'},
  service:{label:'公共与后勤',description:'会议、接待、急救与后勤服务'},
  outdoors:{label:'景观与交通',description:'绿地、停车与充电配套'},
  fun:{label:'娱乐与游玩',description:'轻运动、水上娱乐、游戏与亲子活动'},
}

// Concept dimensions and editable sample RMB rates; these are not local quotations.
// All hotel/restaurant base types are building area × floors; courts are per court;
// pool/landscape/parking types are footprint × rate. Only greenArea presets count as green.
const building=(id:FacilityPresetId,label:string,category:FacilityCategory,description:string,width:number,depth:number,unitCost:number,color='#d9c49b'):FacilityPreset=>({id,type:'restaurant',label,category,description,width,depth,floors:1,rooms:0,unitCost,color,greenArea:false})
const lodging=(id:FacilityPresetId,label:string,description:string,width:number,depth:number,floors:number,rooms:number,roomMix:RoomAllocation):FacilityPreset=>({id,type:'hotel',label,category:'stay',description,width,depth,floors,rooms,roomMix,unitCost:6800,color:'#e5ddce',greenArea:false})
export const FACILITY_PRESETS:FacilityPreset[]=[
  lodging('hotel','酒店客房','多层酒店客房楼，支持房型与客房数量配置',30,16,4,40,{standard:24,deluxe:12,suite:4}),
  {id:'court',type:'court',label:'网球场',category:'sports',description:'红土面层，含缓冲区的概念占地',width:18.29,depth:36.58,floors:1,rooms:0,unitCost:380000,color:'#bf7553',greenArea:false,surface:'clay'},
  {id:'pool',type:'pool',label:'泳池',category:'wellness',description:'室外泳池，预留池边休息空间',width:25,depth:15,floors:1,rooms:0,unitCost:2800,color:'#78b5c5',greenArea:false},
  building('restaurant','餐厅会所','dining','餐饮、社交与球员用餐空间',29,15,5500,'#d9b887'),
  {id:'landscape',type:'landscape',label:'景观绿地',category:'outdoors',description:'花园与景观区域，计入配置绿地面积',width:20,depth:20,floors:1,rooms:0,unitCost:450,color:'#97ae83',greenArea:true},
  {id:'parking',type:'parking',label:'停车场',category:'outdoors',description:'酒店访客与住客的地面停车空间',width:35,depth:13,floors:1,rooms:0,unitCost:600,color:'#b7b5ac',greenArea:false},
  lodging('villa','独栋客房','低层独栋住宿，适合安静的度假区域',14,12,1,4,{standard:2,deluxe:1,suite:1}),
  lodging('cabin','度假木屋','小型独立木屋客房，支持自由组合',10,8,1,2,{standard:1,deluxe:1,suite:0}),
  lodging('apartment','公寓式客房','带起居空间的客房楼，适合较长入住',24,14,2,12,{standard:4,deluxe:6,suite:2}),
  {id:'hard-court',type:'court',label:'硬地网球场',category:'sports',description:'硬地面层网球场，含缓冲区的概念占地',width:18.29,depth:36.58,floors:1,rooms:0,unitCost:300000,color:'#799ba5',greenArea:false,surface:'hard'},
  {id:'grass-court',type:'court',label:'草地网球场',category:'sports',description:'草地面层网球场；场地绿地率单独核算',width:18.29,depth:36.58,floors:1,rooms:0,unitCost:420000,color:'#7d9870',greenArea:false,surface:'grass'},
  building('training-center','网球训练中心','sports','训练教学、热身与室内体能空间；比赛场地可另行添加',28,20,5800,'#aebfa1'),
  building('players-lounge','球员休息室','sports','训练与比赛间歇的休息、补水和交流空间',14,10,4200,'#c3cbae'),
  building('locker-room','更衣淋浴','sports','更衣、淋浴与储物的配套建筑',16,10,4800,'#b5cbca'),
  building('sports-shop','器材商店','sports','网球拍、运动用品展示与服务空间',12,8,4000,'#d4c69e'),
  {id:'basketball',type:'landscape',label:'篮球场',category:'sports',description:'户外篮球活动场地，不计入绿地面积',width:32,depth:19,floors:1,rooms:0,unitCost:850,color:'#be947e',greenArea:false},
  building('fitness','健身房','wellness','器械训练、体能锻炼与酒店健身配套',24,16,6200,'#b0c3aa'),
  building('spa','SPA 理疗','wellness','理疗与休闲放松的概念康体空间',20,14,7200,'#d7c8be'),
  building('yoga','瑜伽馆','wellness','团体瑜伽、拉伸与安静活动空间',18,12,4600,'#b4c5ad'),
  {id:'kids-play',type:'landscape',label:'儿童乐园',category:'wellness',description:'儿童户外活动区，计入活动场地，不计入绿地',width:22,depth:18,floors:1,rooms:0,unitCost:1300,color:'#cfb892',greenArea:false},
  building('coffee','咖啡厅','dining','咖啡、轻食与休息交流空间',14,10,4800,'#bdac96'),
  building('bar','休闲酒吧','dining','饮品与休闲社交空间',16,12,5800,'#c2ad9b'),
  building('banquet','宴会厅','dining','团体活动、宴会与聚会的配套建筑',32,22,6000,'#d8c3a1'),
  {id:'bbq',type:'landscape',label:'烧烤野餐区',category:'dining',description:'户外烧烤与聚会场地，不计入绿地面积',width:18,depth:14,floors:1,rooms:0,unitCost:1000,color:'#ceb893',greenArea:false},
  building('conference','会议中心','service','会议、培训与企业团体活动空间',30,20,5500,'#bdc8b6'),
  building('reception','游客接待中心','service','接待、等候与游客信息服务空间',20,12,4800,'#d6c9ae'),
  building('medical','医务急救室','service','项目配套的医务与应急服务概念空间',12,8,5600,'#c5d3ca'),
  building('restroom','公共卫生间','service','独立的公共卫生设施',10,8,4200,'#bacbc8'),
  building('security','门卫安保','service','入口值守与安保管理空间',8,6,3200,'#c9c4ad'),
  building('laundry','洗衣后勤','service','布草、洗衣与客房后勤支持空间',18,12,4600,'#bfc8c2'),
  building('storage','器材仓库','service','场地器材与物资储存空间',16,12,2600,'#bfbba6'),
  {id:'ev-parking',type:'parking',label:'充电停车区',category:'outdoors',description:'含充电配套的停车区域，示例费用按面积估算',width:20,depth:13,floors:1,rooms:0,unitCost:2200,color:'#a6bda8',greenArea:false},
  {id:'mini-golf',type:'landscape',label:'迷你高尔夫',category:'fun',description:'趣味推杆与障碍小游戏场地，示例铺装不计入绿地',width:30,depth:20,floors:1,rooms:0,unitCost:950,color:'#9caf85',greenArea:false},
  {id:'pickleball',type:'landscape',label:'匹克球场',category:'fun',description:'轻量挥拍运动的概念场地，尺寸与缓冲空间可自行调整',width:18,depth:10,floors:1,rooms:0,unitCost:900,color:'#78a79b',greenArea:false},
  {id:'beach-volleyball',type:'landscape',label:'沙滩排球',category:'fun',description:'沙地运动与朋友组队的休闲场地',width:24,depth:16,floors:1,rooms:0,unitCost:650,color:'#d5c08e',greenArea:false},
  {id:'splash-pad',type:'pool',label:'戏水乐园',category:'fun',description:'浅水、喷泉与水滑梯的概念亲子娱乐区',width:28,depth:20,floors:1,rooms:0,unitCost:4500,color:'#78bac5',greenArea:false},
  {id:'kart-track',type:'landscape',label:'卡丁车赛道',category:'fun',description:'休闲赛道与趣味赛车的概念区域，尺寸可扩大调整',width:80,depth:50,floors:1,rooms:0,unitCost:800,color:'#a0a797',greenArea:false},
  building('climbing','攀岩馆','fun','攀岩、抱石与挑战游戏的室内概念空间',22,16,6800,'#c5ac8e'),
  building('arcade','游戏厅','fun','街机、互动屏幕与休闲游戏的娱乐空间',18,14,5400,'#aebdc4'),
  building('karaoke','KTV 娱乐馆','fun','唱歌、音乐与团体聚会的概念建筑',22,16,6200,'#c6a7af'),
  building('bowling','保龄球馆','fun','保龄球与朋友聚会的室内活动空间',36,20,5800,'#cdb895'),
  building('table-tennis','乒乓球馆','fun','乒乓球桌与轻运动的活动空间',18,14,4400,'#a2baa1'),
  {id:'outdoor-cinema',type:'landscape',label:'户外影院',category:'fun',description:'露天电影银幕与休闲观影座席，不计入绿地面积',width:26,depth:18,floors:1,rooms:0,unitCost:1200,color:'#b3bea8',greenArea:false},
  {id:'activity-lawn',type:'landscape',label:'活动草坪',category:'fun',description:'天然草坪上的飞盘、草坪游戏与团体活动，计入绿地',width:36,depth:24,floors:1,rooms:0,unitCost:380,color:'#92b077',greenArea:true},
  building('card-room','棋牌室','fun','打牌、象棋与朋友聚会，布置棋牌桌、座椅和收纳柜',12,10,4200,'#b7c6a6'),
  building('mahjong-room','麻将包厢','fun','独立麻将休闲空间，布置麻将桌、四人座椅和茶水边柜',8,7,4800,'#acc2b0'),
  building('billiards-room','台球室','fun','朋友切磋台球，布置球桌、球杆架并预留出杆空间',18,12,4800,'#b5c4ae'),
  building('board-game-room','桌游活动室','fun','桌游、拼图与团体游戏，布置活动长桌和游戏收纳架',14,10,4200,'#cab993'),
  building('reading-lounge','阅读休息室','fun','安静阅读与休息，布置书架、阅读桌和休闲沙发',16,10,4600,'#c8bfa6'),
  building('tea-lounge','茶艺休闲室','dining','品茶、聊天与茶艺体验，布置茶台、茶具柜和休闲座椅',14,10,4500,'#c4b193'),
  building('auction-hall','拍卖厅','dining','拍卖、展品展示与活动交流，布置拍卖台、展示台和竞拍席',30,20,5600,'#cfbc9d'),
]
export const FACILITY_PRESET_BY_ID=Object.fromEntries(FACILITY_PRESETS.map(p=>[p.id,p])) as Record<FacilityPresetId,FacilityPreset>
export function getFacilityPreset(facility:Facility):FacilityPreset{return FACILITY_PRESET_BY_ID[facility.presetId??facility.type]}
export function getFacilityLabel(facility:Facility):string{return getFacilityPreset(facility).label}
export function isGreenFacility(facility:Facility):boolean{return facility.type==='landscape'&&getFacilityPreset(facility).greenArea}
export const FACILITY_GROUP_LABELS:Record<FacilityType,string>={hotel:'酒店与住宿',court:'网球场',pool:'泳池与水上娱乐',restaurant:'餐饮与配套建筑',landscape:'景观与户外活动',parking:'停车与交通'}
