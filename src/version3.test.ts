import test from 'node:test'
import assert from 'node:assert/strict'
import { readWorkspacePage, workspacePageURL, WORKSPACE_PAGES } from './navigation'
import { createProject } from './model'
import { getOperatingSettings } from './operating'
import { getEarningsSettings } from './earnings'
import { getEarningsScenarios } from './earningsScenarios'
import { inspectProject } from './projectChecks'
import { buildEarningsCSV } from './earningsExport'
import { buildProjectReport } from './projectReport'

function fixture(){
  const p=createProject('全工作台优化验收','blank')
  p.facilities=[{id:'hotel',name:'酒店',type:'hotel',x:0,y:0,width:10,depth:10,floors:1,rooms:10,unitCost:100,rotation:0}]
  p.operating=getOperatingSettings(p);p.operating.enabled=true;p.operating.days=30;p.operating.occupancyRate=50;p.operating.staffCount=2
  p.operating.items=p.operating.items.filter(i=>['drinking-water','staff-wages'].includes(i.id)).map(i=>({...i,unitPrice:i.id==='staff-wages'?3000:2,taxMode:'included'}))
  p.earnings={...getEarningsSettings(p),extraMonthlyCost:0,revenueDeductionRate:0}
  return p
}
test('five workspace sections round-trip as URLs preserving origin, other options and anchors',()=>{
  const original='http://127.0.0.1:5173/web?view=web&lang=zh#saved'
  for(const page of WORKSPACE_PAGES){const url=new URL(workspacePageURL(original,page));assert.equal(readWorkspacePage(url.search),page);assert.equal(url.origin,'http://127.0.0.1:5173');assert.equal(url.pathname,'/web');assert.equal(url.searchParams.get('lang'),'zh');assert.equal(url.hash,'#saved')}
  for(const invalid of ['','?section=unknown','?section=constructor','?section=earnings%26script'])assert.equal(readWorkspacePage(invalid),'design')
})
test('occupancy scenarios use independent income and guest cost arithmetic without changing the saved assumptions',()=>{
  const p=fixture(),before=structuredClone(p),rows=getEarningsScenarios(p)
  assert.deepEqual(rows.map(r=>r.occupancyRate),[40,50,60])
  // At 40/50/60%: income 2000/2500/3000 per day; water 40/48/56 plus wages100.
  assert.deepEqual(rows.map(r=>r.estimate.periods.find(q=>q.id==='year')!.cashSurplus),[678900,858480,1038060])
  assert.deepEqual(p,before)
})
test('scenario bounds remain valid and absent earnings remains absent after preview',()=>{
  const p=fixture();p.earnings!.occupancyRate=3
  assert.deepEqual(getEarningsScenarios(p).map(r=>r.occupancyRate),[0,3,13])
  p.earnings!.occupancyRate=97
  assert.deepEqual(getEarningsScenarios(p).map(r=>r.occupancyRate),[87,97,100])
  delete p.earnings;const before=structuredClone(p);getEarningsScenarios(p);assert.deepEqual(p,before)
})
test('saved earnings missing costs routes a check to the earnings page without creating legacy earnings settings',()=>{
  const p=fixture();p.operating!.items.find(i=>i.id==='staff-wages')!.unitPrice=null
  const task=inspectProject(p).find(c=>c.id==='earnings-incomplete')!
  assert.equal(task.category,'earnings');assert.equal(task.target.page,'earnings');assert.ok(task.detail.includes('员工工资'))
  delete p.earnings;assert.ok(!inspectProject(p).some(c=>c.category==='earnings'));assert.equal(Object.hasOwn(p,'earnings'),false)
})
test('nonpositive cash and missing capital are distinct actionable earnings checks',()=>{
  const p=fixture();p.earnings!.extraMonthlyCost=100000
  assert.ok(inspectProject(p).some(c=>c.id==='earnings-nonpositive'&&c.target.page==='earnings'))
  p.earnings!.investmentMode='manual';p.earnings!.manualInvestment=null
  assert.ok(inspectProject(p).some(c=>c.id==='earnings-investment'))
})
test('CSV and offline report include temporary scenarios while preserving the original operating sources',()=>{
  const p=fixture(),before=structuredClone(p),csv=buildEarningsCSV(p),html=buildProjectReport(p)
  assert.ok(csv.includes('"入住率情景对比"'));assert.ok(csv.includes('678900'));assert.ok(csv.includes('858480'));assert.ok(csv.includes('1038060'))
  assert.equal((html.match(/data-report-earnings-scenario=/g)??[]).length,3)
  assert.ok(html.includes('上下10个百分点的临时经营对比'))
  assert.deepEqual(p,before)
})
