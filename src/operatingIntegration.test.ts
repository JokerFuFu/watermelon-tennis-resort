import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject } from './model'
import { getOperatingSettings } from './operating'
import { estimateProject } from './pricing'
import { buildBudgetCSV } from './budgetExport'
import { buildProjectReport } from './projectReport'
import { inspectProject } from './projectChecks'

function example(){
  const project=createProject('餐食消耗示例','blank')
  project.facilities=[{id:'hotel',type:'hotel',name:'客房楼',x:0,y:0,width:10,depth:10,floors:1,rooms:10,unitCost:100,rotation:0}]
  project.budget={construction:'new',grade:'standard',designRate:3,supervisionRate:1,reserveRate:10,landAmount:0,siteAmount:0,connectionAmount:0,openingAmount:0}
  const settings=getOperatingSettings(project)
  settings.enabled=true;settings.days=5;settings.occupancyRate=50;settings.guestsPerRoom=2;settings.staffCount=2
  const names=new Set(['drinking-water','guest-breakfast','guest-lunch','guest-dinner','room-toiletries','staff-meals'])
  settings.items=settings.items.filter(item=>names.has(item.id)).map(item=>({...item,taxMode:'included'}))
  project.operating=settings
  return project
}

test('CSV construction and period totals reconcile with independent meal and water arithmetic',()=>{
  const p=example(),before=structuredClone(p)
  const csv=buildBudgetCSV(p)
  // Water 60 person-days ×2×2, guest meals 50×90, toiletries 25×8, staff meals 10×2×20.
  assert.equal(240+4500+200+400,5340)
  assert.match(csv,/"期间运营已计合计","","","","","","5340"/)
  assert.match(csv,/"建设已计预算合计","","","","","","11440"/)
  assert.match(csv,/"建设加期间运营已计合计","","","","","","16780"/)
  assert.ok(csv.includes('宾客人天'));assert.ok(csv.includes('入住房晚'))
  assert.deepEqual(p,before)
})
test('offline report keeps operating and construction metrics separate and escapes custom consumables',()=>{
  const p=example()
  p.operating!.items[0].label='<script>unsafe</script>饮用水'
  const html=buildProjectReport(p,new Date('2026-10-03T00:00:00Z'))
  assert.match(html,/data-report-metric="knownBudget" data-value="11440"/)
  assert.match(html,/data-report-metric="operatingBudget" data-value="5340"/)
  assert.match(html,/data-report-metric="combinedBudget" data-value="16780"/)
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;饮用水'))
  assert.ok(!html.includes('<script>unsafe'))
  assert.equal(estimateProject(p).reserveAmount,1040)
})
test('disabled or absent operating data creates no operating tasks or implicit spending',()=>{
  const p=example();delete p.operating
  const old=structuredClone(p)
  const csv=buildBudgetCSV(p)
  assert.match(csv,/"运营预算状态","未启用/)
  assert.ok(!inspectProject(p).some(check=>check.id.startsWith('operating-')))
  assert.deepEqual(p,old)
  p.operating=getOperatingSettings(p);p.operating.enabled=true
  assert.ok(inspectProject(p).some(check=>check.id==='operating-unpriced'))
  p.operating.enabled=false
  assert.ok(!inspectProject(p).some(check=>check.id.startsWith('operating-')))
})
