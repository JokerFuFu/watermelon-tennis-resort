import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, parseProject } from './model'
import { createMaterialPiece } from './materials'
import { getOperatingSettings, estimateCombinedBudget } from './operating'
import { estimateProject } from './pricing'
import { estimateEarnings, getEarningsSettings } from './earnings'
import { buildEarningsCSV } from './earningsExport'
import { buildProjectReport } from './projectReport'

function fixture(){
  const p=createProject('收益集成示例','blank')
  p.facilities=[{id:'hotel',type:'hotel',name:'酒店',x:0,y:0,width:10,depth:10,floors:1,rooms:7,roomMix:{standard:4,deluxe:2,suite:1},unitCost:100,rotation:0}]
  p.budget={construction:'new',grade:'standard',designRate:3,supervisionRate:1,reserveRate:10,landAmount:0,siteAmount:0,connectionAmount:0,openingAmount:0}
  const op=getOperatingSettings(p)
  op.enabled=true;op.days=30;op.occupancyRate=50;op.guestsPerRoom=2;op.staffCount=0
  op.items=op.items.filter(i=>['drinking-water','staff-wages','utilities'].includes(i.id)).map(i=>({...i,unitPrice:i.id==='staff-wages'?30000:i.id==='utilities'?3000:2,taxMode:'included'}))
  p.operating=op
  p.earnings={...getEarningsSettings(p),extraDailyRevenue:100,extraMonthlyCost:1200,revenueDeductionRate:5}
  return p
}

test('saved earnings, CSV and offline report agree with independent annual cash arithmetic and preserve operating budget',()=>{
  const p=fixture(),before=structuredClone(p),e=estimateEarnings(p)
  // 7 rooms: 4×500+2×700+1×1000 at 50%; 7 guests use ¥28 water/day.
  // Wages/utilities = ¥33000 per original 30 days, fee=5%, other cost=¥1200/month.
  const annual=2300*365-(28*365+33000*365/30)-2300*365*.05-1200*12
  assert.equal(annual,371405)
  assert.equal(e.periods.find(r=>r.id==='year')!.cashSurplus,annual)
  assert.equal(e.investment,11440);assert.equal(e.paybackYears,11440/annual)
  assert.equal(estimateCombinedBudget(p).operating.total,33840)
  const html=buildProjectReport(p,new Date('2026-10-03T00:00:00Z')),csv=buildEarningsCSV(p)
  assert.ok(html.includes('data-report-earnings="true"'))
  assert.match(html,/data-report-earnings-cash="371405"/)
  assert.match(html,/data-report-earnings-investment="11440"/)
  assert.ok(csv.includes('371405'))
  assert.deepEqual(parseProject(JSON.stringify(p)),p)
  assert.deepEqual(p,before)
})

test('accepted materials increase payback capital once, never change room revenue or daily consumption',()=>{
  const p=fixture(),without=estimateEarnings(p)
  p.materials=[{...createMaterialPiece('plywood',p),width:3,depth:2,height:.5,unitPrice:10,taxMode:'excluded',taxRate:10}]
  p.materialBudgetIncluded=true
  const withMaterials=estimateEarnings(p)
  assert.equal(withMaterials.investment,11506)
  assert.equal(withMaterials.investment!-without.investment!,66)
  assert.deepEqual(withMaterials.periods,without.periods)
  assert.equal(withMaterials.paybackYears,11506/371405)
  assert.equal(estimateProject(p).reserveAmount,1040)
})

test('incomplete earnings report retains unknown instead of claiming recovery from turnover or known-only costs',()=>{
  const p=fixture();p.operating!.items.find(i=>i.id==='staff-wages')!.unitPrice=null
  const e=estimateEarnings(p),html=buildProjectReport(p)
  assert.equal(e.paybackYears,null);assert.equal(e.paybackStatus,'incomplete')
  assert.ok(e.periods.every(row=>row.cashSurplus===null))
  assert.ok(!html.includes('data-report-payback-years='))
  assert.ok(!html.includes('data-report-earnings-cash='))
  assert.ok(html.includes('待补齐收入与成本'))
  assert.ok(html.includes('员工工资'))
})

test('legacy project report does not invent saved earnings settings or mutate the original',()=>{
  const p=fixture();delete p.earnings
  const before=structuredClone(p),html=buildProjectReport(p)
  assert.ok(html.includes('尚未保存收益参数'))
  assert.ok(!html.includes('data-report-earnings="true"'))
  assert.deepEqual(p,before);assert.equal(Object.hasOwn(parseProject(JSON.stringify(p)),'earnings'),false)
})

test('manual investment overrides incomplete construction only for payback and keeps original construction reports unchanged',()=>{
  const p=fixture();p.budget!.landAmount=null
  const cap=estimateProject(p).total.point
  assert.equal(estimateEarnings(p).investmentIncomplete,true)
  p.earnings!.investmentMode='manual';p.earnings!.manualInvestment=742810
  const e=estimateEarnings(p)
  assert.equal(e.investmentIncomplete,false);assert.equal(e.paybackYears,2)
  assert.equal(estimateProject(p).total.point,cap)
  const html=buildProjectReport(p)
  assert.match(html,/data-report-metric="knownBudget" data-value="11440"/)
  assert.match(html,/data-report-earnings-investment="742810"/)
  assert.match(html,/data-report-payback-years="2"/)
})
