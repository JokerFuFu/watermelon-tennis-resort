export type FacilityType = 'hotel' | 'court' | 'pool' | 'restaurant' | 'landscape' | 'parking'
export type FacilityPresetId = FacilityType | 'villa' | 'cabin' | 'apartment' | 'hard-court' | 'grass-court' | 'training-center' | 'players-lounge' | 'locker-room' | 'sports-shop' | 'basketball' | 'fitness' | 'spa' | 'yoga' | 'kids-play' | 'coffee' | 'bar' | 'banquet' | 'bbq' | 'conference' | 'reception' | 'medical' | 'restroom' | 'security' | 'laundry' | 'storage' | 'ev-parking' | 'mini-golf' | 'pickleball' | 'beach-volleyball' | 'splash-pad' | 'kart-track' | 'climbing' | 'arcade' | 'karaoke' | 'bowling' | 'table-tennis' | 'outdoor-cinema' | 'activity-lawn' | 'card-room' | 'mahjong-room' | 'billiards-room' | 'board-game-room' | 'reading-lounge' | 'tea-lounge' | 'auction-hall'
export type CourtSurface = 'clay' | 'hard' | 'grass'
export type RoomType = 'standard' | 'deluxe' | 'suite'
export interface RoomAllocation {
  standard: number
  deluxe: number
  suite: number
}
export interface Facility {
  id: string
  type: FacilityType
  presetId?: FacilityPresetId
  locked?: boolean
  visible?: boolean
  name: string
  x: number
  y: number
  width: number
  depth: number
  floors: number
  rooms: number
  roomMix?: RoomAllocation
  unitCost: number
  pricing?: FacilityPricing
  surface?: CourtSurface
  rotation: 0 | 90
}
export interface Project {
  version: 1
  id: string
  name: string
  location: string
  siteWidth: number
  siteDepth: number
  facilities: Facility[]
  updatedAt: string
  budget?: BudgetSettings
  operating?: OperatingSettings
  materials?: MaterialPiece[]
  materialAssemblies?: MaterialAssembly[]
  materialBudgetIncluded?: boolean
  earnings?: EarningsSettings
  monthlyPlan?: MonthlyPlanSettings
}
export interface MonthlyPlanEntry {
  month:string
  openDays:number
  occupancyRate:number
  roomRates:Record<RoomType,number|null>
  extraDailyRevenue:number|null
  extraFixedCost:number|null
}
export type FacilityBusinessUnit='hour'|'ticket'|'roomHour'|'session'|'parkingDay'|'serving'|'time'
export interface FacilityBusinessItem {
  id:string
  facilityId:string
  label:string
  included:boolean
  unit:FacilityBusinessUnit
  capacityPerDay:number
  utilizationRates:number[]
  unitPrice:number|null
  directUnitCost:number|null
  fixedMonthlyCost:number|null
  evidence:PriceEvidence
}
export interface MonthlyPlanSettings {
  enabled:boolean
  startMonth:string
  horizonYears:number
  months:MonthlyPlanEntry[]
  facilityItems:FacilityBusinessItem[]
}
export interface MonthlyFacilityResult {
  id:string;facilityId:string;label:string;unit:string;quantity:number
  revenue:number|null;directCost:number|null;knownRevenue:number;knownCost:number
}
export interface MonthlyPlanResult {
  month:string;calendarDays:number;openDays:number;occupancyRate:number
  roomRevenue:number|null;facilityRevenue:number|null;otherRevenue:number|null
  totalRevenue:number|null;knownRevenue:number
  operatingCost:number;facilityCost:number;extraCost:number|null;deductions:number|null
  knownCosts:number;knownSurplus:number;cashSurplus:number|null
  cumulativeCash:number|null;remainingInvestment:number|null
  facilityRows:MonthlyFacilityResult[]
  missingItems:string[]
}
export interface MonthlyPlanEstimate {
  settings:MonthlyPlanSettings
  enabled:boolean
  months:MonthlyPlanResult[]
  annualRevenue:number|null;annualKnownRevenue:number
  annualKnownCosts:number;annualCash:number|null
  investment:number|null;investmentIncomplete:boolean
  paybackStatus:'ready'|'incomplete'|'no-investment'|'not-recovered'
  paybackMonth:string|null;paybackYears:number|null
  forecast:MonthlyPlanResult[]
  missingItems:string[];reviewItems:string[]
}
export interface EarningsSettings {
  roomRates: Record<RoomType,number|null>
  unavailableRooms: RoomAllocation
  occupancyRate:number
  guestsPerRoom:number
  extraDailyRevenue:number|null
  extraMonthlyCost:number|null
  revenueDeductionRate:number|null
  investmentMode:'construction'|'manual'
  manualInvestment:number|null
}
export type EarningsPeriodId='day'|'week'|'month'|'year'
export interface EarningsPeriod {
  id:EarningsPeriodId;label:string;days:number
  roomRevenue:number|null;otherRevenue:number|null;totalRevenue:number|null
  knownRevenue:number;operatingCost:number;extraCost:number|null;deductions:number|null
  knownCosts:number;knownSurplus:number;cashSurplus:number|null
}
export interface EarningsEstimate {
  settings:EarningsSettings
  roomCounts:RoomAllocation
  availableRooms:RoomAllocation
  occupiedRooms:number
  periods:EarningsPeriod[]
  investment:number|null
  investmentIncomplete:boolean
  paybackYears:number|null
  paybackStatus:'ready'|'incomplete'|'nonpositive'|'no-investment'
  missingItems:string[]
  reviewItems:string[]
  costItems:{id:string;label:string;annualAmount:number|null;basis:string}[]
}
export type MaterialShape='box'|'hollowBlock'|'plank'|'iBeam'|'angle'|'channel'|'squareTube'|'tube'|'rebar'|'panel'|'glass'|'roofTile'|'corrugated'|'tile'|'elbow'|'roll'|'bag'|'aggregate'|'bucket'|'bolt'|'door'|'window'
export type MaterialPresetId='red-brick'|'aac-block'|'hollow-block'|'concrete-slab'|'wood-plank'|'wood-batten'|'plywood'|'steel-i-beam'|'steel-angle'|'steel-channel'|'square-steel-tube'|'round-steel-tube'|'rebar'|'glass-panel'|'gypsum-board'|'cement-board'|'rock-wool'|'xps-board'|'roof-tile'|'color-steel-sheet'|'ceramic-tile'|'permeable-brick'|'water-pipe'|'pipe-elbow'|'waterproof-roll'|'cement-bag'|'sand-pile'|'gravel-pile'|'paint-bucket'|'bolt'|'door-panel'|'window-frame'|'custom-block'
export type MaterialCategory='masonry'|'wood'|'metal'|'panels'|'roofFloor'|'utilities'|'bulk'|'openings'
export type MaterialPriceBasis='piece'|'length'|'area'|'volume'
export interface MaterialPreset {
  id:MaterialPresetId;name:string;category:MaterialCategory;shape:MaterialShape;description:string
  width:number;depth:number;height:number;color:string;priceBasis:MaterialPriceBasis
  reference?:string
}
export interface MaterialPiece {
  id:string;materialId:MaterialPresetId;name:string;x:number;y:number;z:number
  width:number;depth:number;height:number;rotation:0|90;color:string
  axisOrder?:'xyz'|'xzy'|'yxz'|'yzx'|'zxy'|'zyx'
  locked?:boolean;visible?:boolean;unitPrice:number|null;priceBasis:MaterialPriceBasis
  taxMode:TaxMode;taxRate?:number;evidence:PriceEvidence
}
export interface MaterialAssembly {id:string;name:string;pieceIds:string[]}
export interface MaterialPurchaseRow {
  id:string;label:string;quantity:number;unit:string;unitPrice:number|null;amount:number|null
  taxAmount:number;taxUnresolved:boolean;evidence:PriceEvidence
}
export interface MaterialPurchaseEstimate {
  included:boolean;total:number;rows:MaterialPurchaseRow[];unpricedItems:string[];taxUnresolvedItems:string[]
}
export type OperatingBasis='guestDay'|'staffDay'|'personDay'|'roomDay'|'day'|'period'|'manual'
export interface OperatingItem {
  id:string
  label:string
  included:boolean
  basis:OperatingBasis
  quantity:number
  unit:string
  unitPrice:number|null
  taxMode:TaxMode
  taxRate?:number
  evidence:PriceEvidence
}
export interface OperatingSettings {
  enabled:boolean
  days:number
  guestMode:'rooms'|'manual'
  occupancyRate:number
  guestsPerRoom:number
  dailyGuests:number
  staffCount:number
  items:OperatingItem[]
}
export interface OperatingRow {
  id:string
  label:string
  included:boolean
  basis:OperatingBasis
  baseQuantity:number
  quantity:number
  unit:string
  unitPrice:number|null
  amount:number|null
  taxAmount:number
  taxUnresolved:boolean
  evidence:PriceEvidence
}
export interface OperatingEstimate {
  enabled:boolean
  days:number
  averageGuests:number
  averageStaff:number
  averagePeople:number
  occupiedRooms:number
  guestDays:number
  staffDays:number
  personDays:number
  roomNights:number
  rows:OperatingRow[]
  total:number
  perDay:number
  unpricedItems:string[]
  taxUnresolvedItems:string[]
  assumedRows:number
}
export interface CombinedEstimate {
  construction:PriceRange
  operating:OperatingEstimate
  total:PriceRange
}
export type PricingBasis = 'grossArea' | 'footprint' | 'rooms' | 'perimeter' | 'count' | 'manual'
export type TaxMode = 'included' | 'excluded' | 'unknown'
export interface PriceEvidence {
  kind:'assumption'|'reference'|'quotation'
  name:string
  url?:string
  date?:string
  scope:string
}
export interface PriceItem {
  id:string
  label:string
  basis:PricingBasis
  quantity?:number
  unit?:string
  unitPrice:number
  lowUnitPrice:number
  highUnitPrice:number
  taxMode:TaxMode
  taxRate?:number
  evidence:PriceEvidence
}
export interface SupplierQuote {
  amount:number
  taxMode:TaxMode
  taxRate?:number
  supplier:string
  date:string
  scope:string
  url?:string
}
export interface FacilityPricing {
  mode:'items'|'quotation'
  items:PriceItem[]
  quote?:SupplierQuote
}
export interface BudgetSettings {
  construction:'new'|'renovation'|'simulation'
  grade:'economy'|'standard'|'premium'
  designRate:number
  supervisionRate:number
  reserveRate:number
  landAmount:number|null
  siteAmount:number|null
  connectionAmount:number|null
  openingAmount:number|null
}
export interface PriceRange {low:number;point:number;high:number}
export interface PriceBreakdown {
  id:string;label:string;quantity:number;unit:string;unitPrice:number;amount:number;low:number;high:number;taxAmount:number;evidence:PriceEvidence;taxUnresolved:boolean
}
export interface FacilityEstimate extends PriceRange {
  source:'legacy'|'items'|'quotation'
  rows:PriceBreakdown[]
  taxUnresolved:boolean
  assumedRows:number
  quotedRows:number
  staleQuote:boolean
}
export interface ProjectEstimate {
  engineering:PriceRange
  total:PriceRange
  settings:BudgetSettings
  designAmount:number
  supervisionAmount:number
  reserveAmount:number
  landAmount:number
  siteAmount:number
  connectionAmount:number
  openingAmount:number
  quoteCoverage:number
  missingItems:string[]
  assumedRows:number
  staleQuotes:number
  materialsAmount:number
  materialUnpricedItems:string[]
}
export interface Metrics {
  siteArea: number
  buildingArea: number
  footprint: number
  rawFacilityArea: number
  occupiedArea: number
  unallocatedArea: number
  overlapArea: number
  outOfBoundsArea: number
  materialArea: number
  roomCount: number
  courtCount: number
  landscapeArea: number
  landscapeRatio: number
  coverageRatio: number
  totalCost: number
  costs: Record<FacilityType, number>
}
export interface LayoutWarning { id: string; message: string; facilityIds: string[] }
export interface LayoutPlan {
  project: Project
  success: boolean
  moved: number
  keptLocked: number
  unplacedIds: string[]
  message: string
}
