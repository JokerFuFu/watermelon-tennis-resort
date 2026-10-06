import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const TOTAL_PRESETS=51
const EXPECTED_CATEGORIES=[['酒店与住宿',4],['运动与网球',8],['康体与亲子',5],['餐饮与社交',7],['公共与后勤',7],['景观与交通',3],['娱乐与游玩',17]]
const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(existsSync(systemChrome)?systemChrome:undefined)
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})})
const context=await browser.newContext({viewport:{width:1512,height:982},acceptDownloads:true})
const page=await context.newPage()
page.setDefaultTimeout(8000)
const errors=[],checks=[]
page.on('pageerror',e=>errors.push(e.message))
mkdirSync('test-results',{recursive:true})
const button=name=>page.getByRole('button',{name,exact:true})
const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p=>p.id===localStorage.getItem('courtside-active-v1')))
const dialog=()=>page.getByRole('dialog')
const search=()=>dialog().getByRole('textbox',{name:'搜索设施',exact:true})
async function check(label,run){await run();checks.push(label);console.log('PASS '+label)}
async function openLibrary(){await button('更多设施').click();await dialog().waitFor();await page.waitForFunction(()=>getComputedStyle(document.querySelector('.fl-modal-host .modal-backdrop')).opacity==='1')}
async function assertCount(count){await page.waitForFunction(n=>{const p=JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p=>p.id===localStorage.getItem('courtside-active-v1'));return p.facilities.length===n},count);assert.equal(await page.locator('[data-facility-preset]').count(),count)}
async function download(action,path){const pending=page.waitForEvent('download');await action();const downloaded=await pending;await downloaded.saveAs(path);return readFileSync(path,'utf8')}
let labels,backup
const added=[]
try{
  await page.goto(process.env.COURTSIDE_URL||'http://127.0.0.1:5173/web')
  await button('更多设施').waitFor()
  await check('create an isolated blank 1000 × 900 m project through the desktop UI',async()=>{
    await button('切换项目').click();await button('新建项目').click()
    await dialog().getByRole('textbox',{name:'项目名称'}).fill('设施库验收')
    await dialog().getByRole('button',{name:/空白场地/}).click();await button('创建方案').click()
    await assertCount(0)
    await button('编辑项目设置').click()
    await dialog().getByRole('spinbutton',{name:'用地宽度',exact:true}).fill('1000')
    await dialog().getByRole('spinbutton',{name:'用地进深',exact:true}).fill('900')
    await button('保存设置').click()
    const p=await active();assert.equal(p.siteWidth,1000);assert.equal(p.siteDepth,900)
  })
  await check(`${TOTAL_PRESETS} real cards in seven categories, and the modal covers the desktop header`,async()=>{
    await openLibrary();assert.equal(await dialog().locator('.fl-card').count(),TOTAL_PRESETS)
    labels=await dialog().locator('.fl-card h3').allTextContents()
    assert.equal(new Set(labels).size,TOTAL_PRESETS)
    assert.equal(await page.evaluate(()=>Boolean(document.elementFromPoint(10,10)?.closest('.modal-backdrop'))),true)
    for(const [name,count] of EXPECTED_CATEGORIES){
      await dialog().getByRole('button',{name,exact:true}).click()
      assert.equal(await dialog().locator('.fl-card').count(),count)
    }
    await dialog().getByRole('button',{name:'全部',exact:true}).click()
    const columns=await dialog().locator('.fl-cards').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length)
    assert.equal(columns,4)
    await page.screenshot({path:'test-results/facility-library-desktop.png',fullPage:false})
  })
  await check('search keeps focus, finds SPA, and empty results can clear all filters',async()=>{
    await search().fill('SPA')
    assert.equal(await search().evaluate(el=>document.activeElement===el),true)
    assert.equal(await dialog().locator('.fl-card').count(),1)
    assert.equal(await dialog().locator('.fl-card h3').textContent(),'SPA 理疗')
    await search().pressSequentially('xxx')
    assert.equal(await search().evaluate(el=>document.activeElement===el),true)
    assert.equal(await dialog().locator('.fl-card').count(),0)
    await dialog().getByRole('button',{name:'清空筛选，查看全部',exact:true}).click()
    assert.equal(await dialog().locator('.fl-card').count(),TOTAL_PRESETS)
    await page.keyboard.press('Escape');assert.equal(await dialog().count(),0)
  })
  await check(`all ${TOTAL_PRESETS} card buttons create their actual distinct facility presets`,async()=>{
    for(const [index,label] of labels.entries()){
      await openLibrary();await search().fill(label)
      await dialog().getByRole('button',{name:`添加${label}`,exact:true}).click()
      assert.equal(await dialog().count(),0)
      await assertCount(index+1)
      const p=await active(),facility=p.facilities.at(-1)
      assert.ok(facility.presetId)
      assert.ok(facility.name.startsWith(label))
      assert.equal(await page.locator(`[data-facility-id="${facility.id}"]`).getAttribute('data-facility-preset'),facility.presetId)
      assert.equal(await page.getByRole('textbox',{name:'设施名称',exact:true}).inputValue(),facility.name)
      added.push({label,id:facility.presetId,facilityId:facility.id})
    }
    assert.equal(new Set(added.map(f=>f.id)).size,TOTAL_PRESETS)
    console.log('ADDED '+added.map(f=>f.id).join(', '))
  })
  await check('hard court surface changes keep identity, default name, and editable price consistent',async()=>{
    const hard=added.find(f=>f.id==='hard-court')
    await page.locator(`[data-facility-id="${hard.facilityId}"]`).focus()
    await page.locator(`[data-facility-id="${hard.facilityId}"]`).press('Enter')
    const price=(await active()).facilities.find(f=>f.id===hard.facilityId).unitCost
    await button('草地').click()
    const grass=(await active()).facilities.find(f=>f.id===hard.facilityId)
    assert.equal(grass.presetId,'grass-court');assert.equal(grass.surface,'grass');assert.match(grass.name,/^草地网球场 /);assert.equal(grass.unitCost,price)
    await button('硬地').click()
    assert.equal((await active()).facilities.find(f=>f.id===hard.facilityId).presetId,'hard-court')
  })
  await check('a gym duplicate retains its preset, rotates, and deletes without changing the original',async()=>{
    const gym=added.find(f=>f.id==='fitness')
    await page.locator(`[data-facility-id="${gym.facilityId}"]`).focus()
    await page.locator(`[data-facility-id="${gym.facilityId}"]`).press('Enter')
    await button('复制设施').click();await assertCount(TOTAL_PRESETS+1)
    const clone=(await active()).facilities.at(-1);assert.equal(clone.presetId,'fitness')
    await button('旋转设施').click()
    assert.notEqual((await active()).facilities.find(f=>f.id===clone.id).rotation,clone.rotation)
    await button('删除选中设施').click();await assertCount(TOTAL_PRESETS)
    assert.ok((await active()).facilities.some(f=>f.id===gym.facilityId))
  })
  await check('investment table shows every actual facility type and correct pricing units',async()=>{
    await page.locator('.desktop-nav').getByRole('button',{name:'投资估算',exact:true}).click()
    const rows=page.locator('.budget-table tbody tr');assert.equal(await rows.count(),TOTAL_PRESETS)
    const project=await active()
    for(const [index,facility] of project.facilities.entries()){
      const cells=rows.nth(index).locator('td'),item=added.find(f=>f.id===facility.presetId)
      assert.equal(await cells.nth(0).locator('strong').textContent(),facility.name)
      assert.equal(await cells.nth(0).locator('.ce-subtext').textContent(),item.label)
      const quantity=facility.type==='court'?1:facility.width*facility.depth*((facility.type==='hotel'||facility.type==='restaurant')?facility.floors:1)
      const unit=facility.type==='court'?'片':'㎡'
      const quantityText=await cells.nth(1).evaluate(el=>[...el.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent).join(''))
      const expectedQuantity=facility.type==='court'?'1':new Intl.NumberFormat('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}).format(quantity)
      assert.equal(quantityText,`${expectedQuantity} ${unit}`)
      assert.equal(await cells.nth(2).locator('.budget-price small').textContent(),`/${unit}`)
      assert.equal(Number(await cells.nth(2).getByRole('spinbutton',{name:`${facility.name}参考单价`,exact:true}).inputValue()),facility.unitCost)
      const expectedAmount=quantity*facility.unitCost
      assert.ok(Math.abs(Number(await rows.nth(index).getAttribute('data-cost-point'))-expectedAmount)<.000001,`${facility.name}: wrong engineering amount`)
      const renderedAmount=Number((await cells.nth(3).locator('strong').textContent()).replace(/[^0-9.]/g,''))
      assert.equal(renderedAmount,Math.round(expectedAmount*100)/100)
    }
    assert.match(await page.locator('.estimate-note').textContent(),/示例单价.*真实询价/)
    await page.locator('.desktop-nav').getByRole('button',{name:'场地设计',exact:true}).click()
  })
  await check(`JSON export preserves ${TOTAL_PRESETS} identities, explicit save and real reload restore them`,async()=>{
    await button('保存方案').click()
    await button('导出方案').click()
    backup=JSON.parse(await download(()=>button('方案文件 (.json)').click(),'test-results/facility-library-project.json'))
    assert.equal(backup.facilities.length,TOTAL_PRESETS)
    assert.equal(new Set(backup.facilities.map(f=>f.presetId)).size,TOTAL_PRESETS)
    await page.reload();await button('更多设施').waitFor();await assertCount(TOTAL_PRESETS)
    assert.deepEqual((await active()).facilities.map(f=>f.presetId),backup.facilities.map(f=>f.presetId))
  })
  await check(`UI JSON import roundtrip restores every preset and renders all ${TOTAL_PRESETS}`,async()=>{
    const before=(await active()).id
    await page.locator('input[type=file]').setInputFiles({name:'facility-library.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
    await page.getByRole('status').filter({hasText:'已导入'}).waitFor()
    await assertCount(TOTAL_PRESETS);assert.notEqual((await active()).id,before)
    assert.deepEqual((await active()).facilities.map(f=>f.presetId),backup.facilities.map(f=>f.presetId))
  })
  await check('390px mobile library has two columns, no overflow, and modal keys preserve the background plan',async()=>{
    await page.setViewportSize({width:390,height:844})
    await page.goto((process.env.COURTSIDE_URL||'http://127.0.0.1:5173/web').replace(/\/web\/?$/,'/mobile'))
    await button('更多设施').waitFor();await assertCount(TOTAL_PRESETS)
    assert.equal(await page.locator('.app-shell.canvas-expanded').count(),1)
    await openLibrary()
    assert.equal(await dialog().locator('.fl-cards').evaluate(el=>getComputedStyle(el).gridTemplateColumns.split(' ').length),2)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    const box=await dialog().boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390)
    await page.keyboard.press('Delete');await assertCount(TOTAL_PRESETS)
    await dialog().getByRole('button',{name:'康体与亲子',exact:true}).click()
    assert.equal(await dialog().locator('.fl-card').first().evaluate(el=>{const box=el.getBoundingClientRect();return Boolean(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2)?.closest('.fl-card'))}),true)
    await page.screenshot({path:'test-results/facility-library-mobile.png',fullPage:false})
    await page.keyboard.press('Escape')
    assert.equal(await dialog().count(),0);assert.equal(await page.locator('.app-shell.canvas-expanded').count(),1)
    await assertCount(TOTAL_PRESETS)
  })
  assert.deepEqual(errors,[])
  console.log(`Facility library verification: ${checks.length} checks passed; ${TOTAL_PRESETS} actual UI additions; no runtime errors.`)
}catch(error){
  writeFileSync('test-results/facility-library-results.json',JSON.stringify({passed:checks.length,checks,presets:added,runtimeErrors:errors,failure:String(error)},null,2))
  await page.screenshot({path:'test-results/facility-library-failure.png',fullPage:true}).catch(()=>{})
  throw error
}finally{
  if(checks.length===10)writeFileSync('test-results/facility-library-results.json',JSON.stringify({passed:checks.length,checks,presets:added,runtimeErrors:errors},null,2))
  await browser.close()
}
