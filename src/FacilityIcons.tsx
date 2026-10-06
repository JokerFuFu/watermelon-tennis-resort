import { Activity, Baby, Building2, Coffee, DoorOpen, Dumbbell, Flame, Flower2, Grid2X2, HeartPulse, Hotel, House, MapPin, ParkingCircle, Presentation, ShieldCheck, Shirt, ShoppingBag, ShowerHead, Sofa, Trees, Users, Utensils, Warehouse, Waves, Wine, Zap, Flag, Gamepad2, Clapperboard, Music2, Car, Mountain, CircleDot, Spade, Dices, BookOpen, Gavel, type LucideIcon } from 'lucide-react'
import type { FacilityPresetId } from './types'

const icons:Record<FacilityPresetId,LucideIcon>={
  hotel:Building2,court:Grid2X2,pool:Waves,restaurant:Utensils,landscape:Trees,parking:ParkingCircle,
  villa:House,cabin:House,apartment:Hotel,'hard-court':Grid2X2,'grass-court':Grid2X2,
  'training-center':Activity,'players-lounge':Sofa,'locker-room':ShowerHead,'sports-shop':ShoppingBag,
  basketball:Activity,fitness:Dumbbell,spa:Flower2,yoga:Activity,'kids-play':Baby,
  coffee:Coffee,bar:Wine,banquet:Users,bbq:Flame,conference:Presentation,reception:MapPin,
  medical:HeartPulse,restroom:DoorOpen,security:ShieldCheck,laundry:Shirt,storage:Warehouse,'ev-parking':Zap,
  'mini-golf':Flag,pickleball:Grid2X2,'beach-volleyball':CircleDot,'splash-pad':Waves,'kart-track':Car,
  climbing:Mountain,arcade:Gamepad2,karaoke:Music2,bowling:CircleDot,'table-tennis':Grid2X2,'outdoor-cinema':Clapperboard,'activity-lawn':Trees,
  'card-room':Spade,'mahjong-room':Grid2X2,'billiards-room':CircleDot,'board-game-room':Dices,'reading-lounge':BookOpen,'tea-lounge':Coffee,'auction-hall':Gavel,
}
export function getFacilityIcon(id:FacilityPresetId):LucideIcon{return icons[id]}
export function FacilityIcon({id,size=22,strokeWidth=1.5,className}:{id:FacilityPresetId;size?:number;strokeWidth?:number;className?:string}){const Icon=icons[id];return <Icon size={size} strokeWidth={strokeWidth} className={className}/>}
