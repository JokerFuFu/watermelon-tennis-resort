import type { MaterialCategory, MaterialPreset } from './types'

export const MATERIAL_CATEGORIES: { id: MaterialCategory; label: string }[] = [
  { id: 'masonry', label: '砖石混凝土' }, { id: 'wood', label: '木材' }, { id: 'metal', label: '金属型材' },
  { id: 'panels', label: '板材保温' }, { id: 'roofFloor', label: '屋面地面' }, { id: 'utilities', label: '管件辅材' },
  { id: 'bulk', label: '袋装散料' }, { id: 'openings', label: '门窗构件' },
]
export const MATERIAL_PRESETS: MaterialPreset[] = [
  { id:'red-brick',reference:'https://jsj.yueyang.gov.cn/54027/54028/54044/54178/content_1975135.html',name:'普通砖',category:'masonry',shape:'box',width:.24,depth:.115,height:.053,color:'#b66748',priceBasis:'piece',description:'常见矩形砖块，240 × 115 × 53 mm；示例尺寸可调整。' },
  { id:'aac-block',reference:'https://amr.guizhou.gov.cn/xwzx/tzgg/202112/P020211222595561388037.pdf',name:'加气混凝土砌块',category:'masonry',shape:'box',width:.6,depth:.2,height:.2,color:'#c8c7bd',priceBasis:'piece',description:'600 × 200 × 200 mm 砌块示例。' },
  { id:'hollow-block',name:'空心砌块',category:'masonry',shape:'hollowBlock',width:.39,depth:.19,height:.19,color:'#a5a8a0',priceBasis:'piece',description:'带孔洞的矩形砌块；外包体积不代表净料体积。' },
  { id:'concrete-slab',name:'混凝土预制板',category:'masonry',shape:'panel',width:2,depth:1,height:.12,color:'#b7bab4',priceBasis:'volume',description:'平放预制板建模示例。' },
  { id:'wood-plank',name:'实木板',category:'wood',shape:'plank',width:2,depth:.2,height:.025,color:'#c39a64',priceBasis:'area',description:'有木纹的长条木板建模示例。' },
  { id:'wood-batten',name:'木方',category:'wood',shape:'box',width:2,depth:.05,height:.05,color:'#ad844f',priceBasis:'length',description:'长条方截面木料建模示例。' },
  { id:'plywood',reference:'https://www.linanwood.com/lm1/19.html',name:'胶合板',category:'wood',shape:'plank',width:2.44,depth:1.22,height:.018,color:'#d5b786',priceBasis:'area',description:'2440 × 1220 × 18 mm 整张板示例。' },
  { id:'steel-i-beam',name:'工字钢',category:'metal',shape:'iBeam',width:3,depth:.15,height:.25,color:'#707e87',priceBasis:'length',description:'工字截面的钢梁建模示例。' },
  { id:'steel-angle',name:'角钢',category:'metal',shape:'angle',width:3,depth:.05,height:.05,color:'#6c7b83',priceBasis:'length',description:'L 形截面的长条型钢。' },
  { id:'steel-channel',name:'槽钢',category:'metal',shape:'channel',width:3,depth:.075,height:.15,color:'#7a858b',priceBasis:'length',description:'凹槽截面的长条型钢。' },
  { id:'square-steel-tube',name:'方钢管',category:'metal',shape:'squareTube',width:3,depth:.08,height:.08,color:'#879097',priceBasis:'length',description:'方形空心长管，按外包尺寸示意。' },
  { id:'round-steel-tube',name:'圆钢管',category:'metal',shape:'tube',width:3,depth:.06,height:.06,color:'#819099',priceBasis:'length',description:'圆截面钢管，按外包直径示意。' },
  { id:'rebar',name:'钢筋',category:'metal',shape:'rebar',width:3,depth:.016,height:.016,color:'#676e73',priceBasis:'length',description:'带肋钢筋的短段建模示例。' },
  { id:'glass-panel',name:'玻璃板',category:'panels',shape:'glass',width:1.2,depth:.008,height:2,color:'#8dc7d0',priceBasis:'area',description:'竖立玻璃板；1.2 × 2 m 板面、8 mm 厚建模示例。' },
  { id:'gypsum-board',reference:'https://www.saint-gobain.com.cn/weber-gyproc/product/CN-plaster-board',name:'石膏板',category:'panels',shape:'panel',width:2.4,depth:1.2,height:.012,color:'#e4e1d8',priceBasis:'area',description:'2400 × 1200 × 12 mm 整张板示例。' },
  { id:'cement-board',name:'纤维水泥板',category:'panels',shape:'panel',width:2.4,depth:1.2,height:.01,color:'#b2b8ad',priceBasis:'area',description:'薄型矩形整张板建模示例。' },
  { id:'rock-wool',reference:'https://www.rockwool.com/siteassets/rw-cn/2/产品手册/洛科威岩棉建筑应用手册_20200810.pdf?f=20201025001400',name:'岩棉板',category:'panels',shape:'panel',width:1.2,depth:.6,height:.05,color:'#b7ad6e',priceBasis:'area',description:'1200 × 600 × 50 mm 保温板示例。' },
  { id:'xps-board',name:'挤塑保温板',category:'panels',shape:'panel',width:1.2,depth:.6,height:.03,color:'#8bbfca',priceBasis:'area',description:'彩色矩形保温板建模示例。' },
  { id:'roof-tile',name:'屋面瓦',category:'roofFloor',shape:'roofTile',width:.42,depth:.33,height:.035,color:'#a15f47',priceBasis:'piece',description:'带弧形沟槽的单片屋面瓦。' },
  { id:'color-steel-sheet',name:'彩钢板',category:'roofFloor',shape:'corrugated',width:2,depth:1,height:.04,color:'#6a999c',priceBasis:'area',description:'带平行波纹的屋面板外包示例。' },
  { id:'ceramic-tile',reference:'https://www.dongpeng.net/product/list_11_page_72.html',name:'瓷砖',category:'roofFloor',shape:'tile',width:.6,depth:.6,height:.01,color:'#d6c7ad',priceBasis:'area',description:'600 × 600 mm 方形地砖示例。' },
  { id:'permeable-brick',name:'透水砖',category:'roofFloor',shape:'tile',width:.2,depth:.1,height:.06,color:'#a68569',priceBasis:'piece',description:'矩形地面铺装砖建模示例。' },
  { id:'water-pipe',name:'给水管',category:'utilities',shape:'tube',width:3,depth:.032,height:.032,color:'#dddcd1',priceBasis:'length',description:'3 m 长、32 mm 外径直管建模示例。' },
  { id:'pipe-elbow',name:'管道弯头',category:'utilities',shape:'elbow',width:.1,depth:.1,height:.04,color:'#d4d8d2',priceBasis:'piece',description:'90 度管道接头建模示例。' },
  { id:'waterproof-roll',name:'防水卷材',category:'utilities',shape:'roll',width:1,depth:.25,height:.25,color:'#4c5d59',priceBasis:'piece',description:'卷后 1 m 宽、约 0.25 m 直径建模示例；展开量另行询价。' },
  { id:'cement-bag',name:'袋装水泥',category:'bulk',shape:'bag',width:.6,depth:.4,height:.12,color:'#c5baa0',priceBasis:'piece',description:'袋装材料外形示例；袋重按实际商品核实。' },
  { id:'sand-pile',name:'砂料堆',category:'bulk',shape:'aggregate',width:1,depth:1,height:.5,color:'#cfb689',priceBasis:'volume',description:'散料堆外包示例，外包体积不等于实际采购体积。' },
  { id:'gravel-pile',name:'碎石堆',category:'bulk',shape:'aggregate',width:1,depth:1,height:.5,color:'#90958d',priceBasis:'volume',description:'碎石堆外包示例，实际用量需现场复核。' },
  { id:'paint-bucket',name:'涂料桶',category:'bulk',shape:'bucket',width:.3,depth:.3,height:.36,color:'#d4d8ca',priceBasis:'piece',description:'带提手的圆桶；容量按实际商品核实。' },
  { id:'bolt',name:'螺栓',category:'utilities',shape:'bolt',width:.1,depth:.016,height:.016,color:'#949ea2',priceBasis:'piece',description:'六角头螺栓建模示例。' },
  { id:'door-panel',name:'门板',category:'openings',shape:'door',width:.9,depth:.04,height:2.1,color:'#b89462',priceBasis:'piece',description:'竖立门板与把手示意；实际门洞另核。' },
  { id:'window-frame',name:'窗框',category:'openings',shape:'window',width:1.2,depth:.08,height:1.2,color:'#8db7bd',priceBasis:'piece',description:'竖立框体及玻璃示意。' },
  { id:'custom-block',name:'自定义构件',category:'masonry',shape:'box',width:1,depth:1,height:1,color:'#b9b29e',priceBasis:'piece',description:'可编辑尺寸、颜色与计价方式的自定义块体。' },
]
export const MATERIAL_PRESET_BY_ID = Object.fromEntries(MATERIAL_PRESETS.map(item => [item.id,item])) as Record<MaterialPreset['id'], MaterialPreset>
export function getMaterialPreset(materialId: MaterialPreset['id']): MaterialPreset { return MATERIAL_PRESET_BY_ID[materialId] }
