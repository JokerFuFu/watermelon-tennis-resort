import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, calculateMetrics, parseProject } from './model'
import { createMaterialPiece, createMaterialAssembly } from './materials'
import { estimateProject } from './pricing'
import { estimateCombinedBudget, getOperatingSettings } from './operating'
import { buildBudgetCSV } from './budgetExport'
import { buildMaterialCSV } from './materialExport'
import { buildProjectReport } from './projectReport'
import { inspectProject } from './projectChecks'

function example(){
  const p=createProject('建材与酒店共存','blank')
  p.siteWidth=100;p.siteDepth=100
  p.facilities=[{id:'hotel',type:'hotel',name:'客房楼',x:10,y:10,width:10,depth:10,floors:1,rooms:10,unitCost:100,rotation:0}]
  p.budget={construction:'new',grade:'standard',designRate:3,supervisionRate:1,reserveRate:10,landAmount:0,siteAmount:0,connectionAmount:0,openingAmount:0}
  p.materials=[{...createMaterialPiece('plywood',p),x:0,y:0,width:3,depth:2,height:.5,unitPrice:10,taxMode:'excluded',taxRate:10}]
  const settings=getOperatingSettings(p)
  settings.enabled=true;settings.days=5;settings.occupancyRate=50;settings.guestsPerRoom=2;settings.staffCount=2
  settings.items=settings.items.filter(i=>i.id==='drinking-water'||i.id==='guest-breakfast').map(i=>({...i,taxMode:'included'}))
  p.operating=settings
  return p
}
const metric=(html:string,key:string)=>Number(html.match(new RegExp(`data-report-metric="${key}" data-value="([^"]+)"`))?.[1])

test('material procurement is optional and adds exactly once outside the facility fee bases and operating calculations',()=>{
  const p=example(),off=estimateProject(p),before=structuredClone(p)
  assert.equal(off.total.point,11440);assert.equal(off.materialsAmount,0)
  const enabled={...p,materialBudgetIncluded:true},on=estimateProject(enabled)
  assert.equal(on.materialsAmount,66) // 3 × 2 × ¥10 plus ¥6 tax.
  assert.equal(on.total.point,11506)
  assert.equal(on.total.low-off.total.low,66);assert.equal(on.total.high-off.total.high,66)
  assert.deepEqual([on.designAmount,on.supervisionAmount,on.reserveAmount],[300,100,1040])
  const offCombined=estimateCombinedBudget(p),onCombined=estimateCombinedBudget(enabled)
  assert.deepEqual(onCombined.operating,offCombined.operating)
  assert.equal(onCombined.total.point-offCombined.total.point,66)
  assert.deepEqual(p,before)
})

test('unknown material prices remain missing rather than free while explicit zero stays confirmed zero',()=>{
  const p=example();p.materials![0].unitPrice=null
  assert.ok(!estimateProject(p).missingItems.some(i=>i.includes('建材')))
  p.materialBudgetIncluded=true
  assert.equal(estimateProject(p).materialsAmount,0)
  assert.equal(estimateProject(p).materialUnpricedItems.length,1)
  assert.ok(inspectProject(p).some(i=>i.id==='material-unpriced'))
  p.materials![0].unitPrice=0;p.materials![0].taxMode='included'
  assert.equal(estimateProject(p).materialUnpricedItems.length,0)
  assert.ok(!inspectProject(p).some(i=>i.id==='material-unpriced'))
})

test('material CSV, budget CSV, report and reload agree on procurement and preserve the source project',()=>{
  const p=example();p.materialBudgetIncluded=true
  const before=structuredClone(p),budget=buildBudgetCSV(p),materials=buildMaterialCSV(p),html=buildProjectReport(p,new Date('2026-10-03T00:00:00Z'))
  assert.match(materials,/"清单已知采购金额","66"/)
  assert.match(materials,/"已纳入建设预算","66"/)
  assert.match(budget,/"已纳入建材采购金额","","","","","","66"/)
  assert.match(budget,/"建设已计预算合计","","","","","","11506"/)
  assert.equal(metric(html,'knownBudget'),11506)
  assert.equal(metric(html,'combinedBudget'),estimateCombinedBudget(p).total.point)
  assert.ok(html.includes(`data-report-material="${p.materials![0].id}"`))
  assert.deepEqual(parseProject(JSON.stringify(p)),p)
  assert.deepEqual(p,before)
})

test('hidden and far outside material remains in the complete offline plan without interactive markup or unsafe text',()=>{
  const p=example(),m=p.materials![0]
  Object.assign(m,{x:1000,y:1000,width:20,depth:30,rotation:90,visible:false,name:'=SUM(1,2)<script>unsafe</script>'})
  const before=structuredClone(p),html=buildProjectReport(p),csv=buildMaterialCSV(p)
  assert.ok(html.includes(`data-material-piece-id="${m.id}"`))
  const [x,y,w,h]=html.match(/<svg[^>]+id="report-site-plan"[^>]+viewBox="([^"]+)"/)![1].split(' ').map(Number)
  assert.ok(x+w>=4120&&y+h>=4080)
  assert.ok(!html.includes('role="button"'))
  assert.ok(!html.includes('<script>unsafe'))
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'))
  assert.ok(csv.includes('"\'=SUM(1,2)<script>unsafe</script>"'))
  assert.deepEqual(p,before)
})

test('assembled materials affect occupied area through their envelope without adding hotel building area or guests',()=>{
  const p=example();p.materials![0]={...p.materials![0],x:0,y:0,width:1,depth:2,height:1}
  p.materials!.push({...p.materials![0],id:'second',x:3,z:2})
  const g=createMaterialAssembly(p,p.materials!.map(m=>m.id),'小廊架')
  const metrics=calculateMetrics(g)
  assert.equal(metrics.materialArea,8);assert.equal(metrics.occupiedArea,108)
  assert.equal(metrics.buildingArea,100);assert.equal(metrics.roomCount,10)
  assert.equal(metrics.overlapArea,0)
  const html=buildProjectReport(g)
  assert.equal(metric(html,'occupiedArea'),108);assert.equal(metric(html,'buildingArea'),100)
  assert.ok(html.includes('小廊架'))
  assert.deepEqual(g.operating,p.operating)
})
