import test from 'node:test'
import assert from 'node:assert/strict'
import { inspectProject } from './projectChecks'
import { createProject } from './model'
import type { Facility } from './types'

const facility=(id:string,patch:Partial<Facility>={}):Facility=>({id,type:'hotel',name:id,x:0,y:0,width:10,depth:10,floors:2,rooms:0,unitCost:100,rotation:0,...patch})
const now=new Date('2026-10-03T00:00:00Z')
test('layout intersections are grouped by facility IDs and never parsed from hyphenated names',()=>{
  const p=createProject('检查','blank');p.siteWidth=100;p.siteDepth=100
  p.facilities=[facility('a-b'),facility('c-d',{x:5}),facility('e-f',{x:7})]
  const before=structuredClone(p),checks=inspectProject(p,now)
  const overlaps=checks.filter(c=>c.id.startsWith('intersections-'))
  assert.equal(overlaps.length,3)
  assert.equal(overlaps[0].target.facilityId,'a-b')
  assert.deepEqual(new Set(overlaps[0].facilityIds),new Set(['a-b','c-d','e-f']))
  assert.deepEqual(p,before)
})
test('room capacity uses illustrative net area and full floor area even if hidden or outside',()=>{
  const p=createProject('检查','blank')
  p.facilities=[facility('room',{x:500,rooms:20,visible:false,locked:true})]
  const checks=inspectProject(p,now)
  const room=checks.find(c=>c.id==='room-capacity-room')!
  assert.equal(room.category,'rooms');assert.equal(room.target.facilityId,'room')
  assert.match(room.detail,/560\.00/);assert.match(room.detail,/200\.00/);assert.match(room.detail,/360\.00/)
  assert.ok(checks.some(c=>c.id==='bounds-room'))
})
test('missing fees distinguish zero from null and quoted included tax adds no assumed source task',()=>{
  const p=createProject('检查','blank')
  p.budget={construction:'new',grade:'standard',designRate:0,supervisionRate:0,reserveRate:0,landAmount:0,siteAmount:null,connectionAmount:0,openingAmount:0}
  p.facilities=[facility('quoted',{pricing:{mode:'quotation',items:[],quote:{amount:100000,taxMode:'included',supplier:'供方',date:'2026-10-01',scope:'全部安装'}}})]
  const checks=inspectProject(p,now)
  assert.deepEqual(checks.map(c=>c.id),['missing-siteAmount'])
  p.budget.siteAmount=0
  assert.deepEqual(inspectProject(p,now),[])
})
test('source, tax and quote age stay distinct and no quote is declared expired',()=>{
  const p=createProject('检查','blank')
  p.facilities=[facility('assumed'),facility('quoted',{x:20,pricing:{mode:'quotation',items:[],quote:{amount:100000,taxMode:'excluded',supplier:'供方',date:'2025-01-01',scope:'工程'}}})]
  const checks=inspectProject(p,now)
  assert.deepEqual(checks.find(c=>c.id==='price-sources')?.facilityIds,['assumed'])
  assert.deepEqual(checks.find(c=>c.id==='tax-scope')?.facilityIds,['assumed','quoted'])
  assert.equal(checks.find(c=>c.id==='quote-recheck')?.target.facilityId,'quoted')
  assert.match(checks.find(c=>c.id==='quote-recheck')!.detail,/不判定报价已失效/)
})
test('empty plan is a setup task and heavy overlap creates a bounded facility work list',()=>{
  const p=createProject('检查','blank')
  assert.ok(inspectProject(p,now).some(c=>c.id==='empty-plan'))
  p.facilities=Array.from({length:200},(_,i)=>facility(`f-${i}`))
  const checks=inspectProject(p,now)
  assert.equal(checks.filter(c=>c.category==='layout').length,200)
  assert.ok(checks.length<210)
  assert.equal(checks[0].facilityIds.length,200)
})
