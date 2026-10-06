export type IslandPreset='lagoon'|'jungle'|'highlands'
 |'coconut-coast'|'bamboo-grove'|'twin-lakes'|'crescent-bay'|'rocky-cove'
 |'misty-wetland'|'ancient-ruins'|'red-cliffs'|'emerald-valley'|'pine-ridge'
 |'river-delta'|'golden-dunes'|'waterfall-basin'|'volcanic-ridge'
 |'mangrove-shore'|'hidden-harbor'|'treasure-atoll'
export type IslandTerrain='sea'|'beach'|'grass'|'forest'|'rock'|'freshwater'|'ruins'
export type SurvivalResource='wood'|'stone'|'fiber'|'iron'|'food'|'water'
export type SurvivalItem=SurvivalResource|'rope'
export type SurvivalRecipe='axe'|'pickaxe'|'camp'|'rope'|'raft'
export type ChestTier='wooden'|'silver'|'golden'
export interface IslandTile {
  x:number;y:number;terrain:IslandTerrain
  resource:SurvivalResource|null
  remaining:number
  chest:{id:string;tier:ChestTier;opened:boolean}|null
}
export interface SurvivalGameState {
  version:1
  seed:number
  preset:IslandPreset
  playerName:string
  player:{x:number;y:number;health:number;hunger:number;thirst:number;energy:number}
  inventory:Record<SurvivalItem,number>
  wallet:{coins:number;diamonds:number}
  gear:{axe:boolean;pickaxe:boolean;camp:boolean;raft:boolean}
  turn:number
  status:'playing'|'downed'|'escaped'
  world:{width:number;height:number;camp:{x:number;y:number};tiles:IslandTile[]}
  rates:{buy:number;sell:number}
  stats:{gathered:Record<SurvivalResource,number>;ropesCrafted:number}
}
export type SurvivalAction=
 |{type:'move';x:number;y:number}
 |{type:'gather'}
 |{type:'openChest'}
 |{type:'craft';recipe:SurvivalRecipe}
 |{type:'consume';item:'food'|'water'}
 |{type:'rest'}
 |{type:'escape'}
 |{type:'recover'}
 |{type:'buy';item:SurvivalResource;quantity:number}
 |{type:'sell';item:'wood'|'stone'|'fiber'|'iron';quantity:number}
 |{type:'exchange';direction:'buyDiamond'|'sellDiamond';quantity:number}
 |{type:'supplyPack'}
 |{type:'setRates';buy:number;sell:number}
 |{type:'rename';name:string}
export interface SurvivalActionResult {state:SurvivalGameState;accepted:boolean;message:string}
export interface SurvivalQuest {id:string;label:string;done:boolean;detail:string}
export interface SurvivalRecipeDefinition {id:SurvivalRecipe;name:string;description:string;cost:Partial<Record<SurvivalItem,number>>}
export interface SurvivalShopItem {id:SurvivalResource;name:string;buyPrice:number;sellPrice:number|null}
