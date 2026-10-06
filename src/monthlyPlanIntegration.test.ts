import test from 'node:test'
import assert from 'node:assert/strict'
import { createProject, parseProject } from './model'
import { getOperatingSettings } from './operating'
import { getEarningsSettings } from './earnings'
import { createMaterialPiece } from './materials'
import { calendarDays, createFacilityBusinessItem, estimateMonthlyPlan, getMonthlyPlan, setMonthlyStartMonth } from './monthlyPlan'
import { getActiveFinancialProjection } from './financialProjection'
import { buildMonthlyPlanCSV } from './monthlyPlanExport'
import { buildEarningsCSV } from './earningsExport'
import { buildProjectReport } from './projectReport'
import { inspectProject } from './projectChecks'

function fixture(){
  const p=createProject('月度联动验收','blank')
  p.facilities=[{id:'hotel',type:'hotel',name:'酒店',x:0,y:0,width:20,depth:20,floors:1,rooms:7,roomMix:{standard:4,deluxe:2,suite:1},unitCost:100,rotation:0},{id:'court',type:'court',name:'网球场',x:50,y:0,width:20,depth:30,floors:1,rooms:0,unitCost:1000,rotation:0,surface:'clay'}]
  p.budget={construction:'new',grade:'standard',designRate:3,supervisionRate:1,reserveRate:10,landAmount:0,siteAmount:0,connectionAmount:0,openingAmount:0}
  const op=getOperatingSettings(p);op.enabled=true;op.days=30;op.occupancyRate=50;op.guestsPerRoom=2;op.staffCount=2
  op.items=op.items.filter(i=>['drinking-water','staff-wages','utilities'].includes(i.id)).map(i=>({...i,unitPrice:i.id==='drinking-water'?2:3000,taxMode:'included'}));p.operating=op
  p.earnings={...getEarningsSettings(p),extraDailyRevenue:100,extraMonthlyCost:1200,revenueDeductionRate:5}
  p.materials=[{...createMaterialPiece('red-brick',p),unitPrice:500,taxMode:'included'}];p.materialBudgetIncluded=true
  p.monthlyPlan=setMonthlyStartMonth(getMonthlyPlan(p),'2027-01');p.monthlyPlan.enabled=true;p.monthlyPlan.horizonYears=2
  for(const month of p.monthlyPlan.months)month.openDays=calendarDays(month.month)
  p.monthlyPlan.months[0].openDays=15;p.monthlyPlan.months[0].occupancyRate=40
  const item=createFacilityBusinessItem(p,'court');Object.assign(item,{capacityPerDay:4,unitPrice:100,directUnitCost:10,fixedMonthlyCost:200});p.monthlyPlan.facilityItems=[item]
  return p
}
test('monthly revenue, calendar fixed expenses and first recovery reconcile with independent January/February maths',()=>{
  const p=fixture(),before=structuredClone(p),result=estimateMonthlyPlan(p),jan=result.months[0],feb=result.months[1]
  assert.deepEqual([jan.roomRevenue,jan.facilityRevenue,jan.otherRevenue,jan.knownCosts,jan.cashSurplus],[26400,3000,1500,9901,20999])
  assert.deepEqual([feb.totalRevenue,feb.knownCosts,feb.cashSurplus],[70000,12068,57932])
  assert.equal(result.investment,47404);assert.equal(result.paybackMonth,'2027-02')
  assert.equal(result.paybackYears,(1+(47404-20999)/57932)/12)
  assert.equal(result.annualRevenue,865900);assert.equal(result.annualCash,713345)
  assert.deepEqual(p,before)
})
test('active model changes only on explicit enable and old annual settings and operating data stay intact',()=>{
  const p=fixture(),before=structuredClone(p)
  assert.equal(getActiveFinancialProjection(p).model,'monthly');assert.equal(getActiveFinancialProjection(p).annualCash,713345)
  p.monthlyPlan!.enabled=false
  assert.equal(getActiveFinancialProjection(p).model,'annual');assert.equal(getActiveFinancialProjection(p).annualCash,696985)
  assert.deepEqual(p.earnings,before.earnings);assert.deepEqual(p.operating,before.operating)
})
test('JSON, CSV and offline report preserve monthly dates, fees, unknowns and the same first-recovery month',()=>{
  const p=fixture(),before=structuredClone(p),monthly=buildMonthlyPlanCSV(p),all=buildEarningsCSV(p),html=buildProjectReport(p)
  assert.deepEqual(parseProject(JSON.stringify(p)),p)
  assert.match(monthly,/"预计首次回本年月","2027-02"/)
  assert.match(monthly,/"首12月完整现金结余元","713345"/)
  assert.ok(all.includes('"月度计划状态","已用于总览"'))
  assert.match(html,/data-report-monthly-payback-month="2027-02"/)
  assert.match(html,/data-report-monthly-cash="713345"/)
  assert.equal((html.match(/data-report-monthly-row="/g)??[]).length,12)
  assert.deepEqual(p,before)
})
test('unknown active month costs block active summary and route to earnings even without saved annual settings',()=>{
  const p=fixture();p.monthlyPlan!.months[0].extraFixedCost=null;delete p.earnings
  const active=getActiveFinancialProjection(p)
  assert.equal(active.model,'monthly');assert.equal(active.annualCash,null);assert.equal(active.paybackMonth,null)
  assert.ok(inspectProject(p).some(c=>c.id==='earnings-incomplete'&&c.target.page==='earnings'))
  const html=buildProjectReport(p)
  assert.ok(html.includes('data-report-monthly-plan="true"'));assert.ok(!html.includes('data-report-monthly-payback-month='))
})
test('legacy preview adds no monthly settings and unsafe labels remain escaped in report and CSV',()=>{
  const p=fixture();delete p.monthlyPlan
  const before=structuredClone(p);getMonthlyPlan(p);estimateMonthlyPlan(p);assert.deepEqual(p,before)
  assert.equal(Object.hasOwn(parseProject(JSON.stringify(p)),'monthlyPlan'),false)
  p.monthlyPlan=fixture().monthlyPlan
  p.monthlyPlan!.facilityItems[0].label='=SUM(1,2)<script>unsafe</script>'
  const csv=buildMonthlyPlanCSV(p),html=buildProjectReport(p)
  assert.ok(csv.includes('"\'=SUM(1,2)<script>unsafe</script>"'))
  assert.ok(html.includes('&lt;script&gt;unsafe&lt;/script&gt;'));assert.ok(!html.includes('<script>unsafe'))
})
test('latest supported starting month keeps its consecutive next-year labels while rejecting fabricated sequences',()=>{
  const p=fixture();p.monthlyPlan=setMonthlyStartMonth(p.monthlyPlan!,'2200-12')
  assert.equal(p.monthlyPlan.months[11].month,'2201-11')
  assert.deepEqual(parseProject(JSON.stringify(p)),p)
  p.monthlyPlan.months[11].month='2202-01'
  assert.throws(()=>parseProject(JSON.stringify(p)),/连续/)
  assert.throws(()=>setMonthlyStartMonth(fixture().monthlyPlan!,'2201-01'),/月份/)
})
