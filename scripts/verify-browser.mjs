import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome)?systemChrome:undefined)
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})})
const context=await browser.newContext({viewport:{width:1512,height:982},acceptDownloads:true})
const page=await context.newPage()
page.setDefaultTimeout(7000)
const errors=[]
page.on('pageerror',e=>errors.push(e.message))
const results=[]
mkdirSync('test-results',{recursive:true})
const button=name=>page.getByRole('button',{name,exact:true})
const nameInput=()=>page.getByRole('textbox',{name:'设施名称',exact:true})
const input=name=>page.getByRole('spinbutton',{name,exact:true})
const activeProject=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p=>p.id===localStorage.getItem('courtside-active-v1')))
async function check(label,run){await run();results.push(label);console.log('PASS '+label)}
async function downloaded(action,filename){const wait=page.waitForEvent('download');await action();const d=await wait;await d.saveAs(`test-results/${filename}`);return readFileSync(`test-results/${filename}`,'utf8')}
async function navigate(label){await page.locator('.main-nav').getByRole('button',{name:label,exact:true}).click()}
async function assertFit(){assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)}

try{
  await page.goto(process.env.COURTSIDE_URL||'http://127.0.0.1:5173/')
  await nameInput().waitFor()
  const initial=await activeProject()
  await check('Beijing default and edge-to-edge fullscreen workbench',async()=>{
    assert.equal(initial.location,'北京 · 概念方案')
    const box=await page.locator('.studio-grid').boundingBox()
    assert.equal(box.x,0);assert.equal(box.y,0);assert.equal(box.width,1512);assert.equal(box.height,982)
    assert.match(await page.locator('.fullscreen-location').textContent(),/北京/)
    await page.screenshot({path:'test-results/fullscreen-desktop.png',fullPage:false})
    await button('退出全屏工作台').click();assert.equal(await page.locator('.app-shell.canvas-expanded').count(),0)
  })
  await check('default campus and layout check',async()=>{
    assert.equal(initial.facilities.length,14)
    await button('场地信息').click();assert.match(await page.locator('.checks-clear').textContent(),/未发现重叠/)
    await button('设施属性').click();await assertFit()
  })
  await check('facility create, valid rename, dimensions, undo and redo',async()=>{
    await button('添加网球场').click()
    await nameInput().fill('验收网球场');await nameInput().press('Tab')
    await input('宽度').fill('19')
    await button('撤销').click();assert.equal(await input('宽度').inputValue(),'18.29')
    await button('重做').click();assert.equal(await input('宽度').inputValue(),'19')
    assert.equal((await activeProject()).facilities.length,15)
  })
  await check('invalid empty name and Escape preserve valid stored name',async()=>{
    await nameInput().fill('');await nameInput().press('Tab');assert.equal(await nameInput().inputValue(),'验收网球场')
    await nameInput().fill('should be discarded');await nameInput().press('Escape');assert.equal(await nameInput().inputValue(),'验收网球场')
    assert.ok((await activeProject()).facilities.some(f=>f.name==='验收网球场'))
  })
  await check('save and real reload restore the edited project',async()=>{
    await button('保存方案').click();await page.reload();await nameInput().waitFor()
    const p=await activeProject();assert.equal(p.facilities.length,15);assert.ok(p.facilities.some(f=>f.name==='验收网球场'&&f.width===19))
  })
  await check('2D selection and pointer drag commit with undo',async()=>{
    await button('2D 平面').click()
    const before=(await activeProject()).facilities.find(f=>f.name==='验收网球场')
    const group=page.locator(`[data-facility-id="${before.id}"]`)
    await group.focus();await group.press('Enter')
    const box=await group.locator('polygon').first().boundingBox();assert.ok(box)
    const x=box.x+box.width/2,y=box.y+box.height/2
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+22,y+18,{steps:5});await page.mouse.up()
    const after=(await activeProject()).facilities.find(f=>f.id===before.id)
    assert.ok(after.x!==before.x || after.y!==before.y)
    await button('撤销').click();const restored=(await activeProject()).facilities.find(f=>f.id===before.id)
    assert.equal(restored.x,before.x);assert.equal(restored.y,before.y)
  })
  await check('court surface, rotation, zoom, labels, grid and view reset',async()=>{
    await button('硬地').click();assert.equal((await activeProject()).facilities.find(f=>f.name==='验收网球场').surface,'hard')
    const rotation=(await activeProject()).facilities.find(f=>f.name==='验收网球场').rotation
    await button('旋转设施').click();assert.notEqual((await activeProject()).facilities.find(f=>f.name==='验收网球场').rotation,rotation)
    await button('放大').click();assert.equal(await button('重置缩放').textContent(),'115%')
    await button('缩小').click();assert.equal(await button('重置缩放').textContent(),'100%')
    await button('显示设施名称').click();assert.equal(await button('显示设施名称').getAttribute('aria-pressed'),'false');await button('显示设施名称').click()
    await button('显示参考网格').click();assert.equal(await button('显示参考网格').getAttribute('aria-pressed'),'true');await button('显示参考网格').click()
    await button('3D 总览').click();await button('移动视角').click()
    const box=await page.locator('#site-plan-svg').boundingBox()
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+55,box.y+box.height/2+30,{steps:4});await page.mouse.up()
    await button('适应画布').click();assert.match(await page.locator('#site-plan-svg > g').last().getAttribute('transform'),/translate\(0 0\)/)
    await button('选择工具').click()
  })
  await check('facility duplicate and delete update visible count',async()=>{
    await button('复制设施').click();assert.equal((await activeProject()).facilities.length,16)
    await button('删除选中设施').click();assert.equal((await activeProject()).facilities.length,15)
  })
  await check('hotel room and building floor changes recalculate',async()=>{
    await navigate('客房规划')
    const main=initial.facilities.find(f=>f.type==='hotel')
    await page.getByRole('spinbutton',{name:`${main.name}客房数量`,exact:true}).fill('80')
    await page.getByRole('spinbutton',{name:`${main.name}楼层`,exact:true}).fill('5')
    assert.equal((await activeProject()).facilities.find(f=>f.id===main.id).rooms,80)
    assert.match(await page.locator('.room-summary').textContent(),/128/)
  })
  await check('room-type allocations, integer totals and room-program CSV',async()=>{
    const main=initial.facilities.find(f=>f.type==='hotel')
    await page.getByRole('spinbutton',{name:`${main.name}套房数量`,exact:true}).fill('20')
    const f=(await activeProject()).facilities.find(f=>f.id===main.id)
    assert.equal(f.roomMix.suite,20)
    assert.equal(f.rooms,f.roomMix.standard+f.roomMix.deluxe+f.roomMix.suite)
    const csv=await downloaded(()=>button('导出客房配置').click(),'rooms.csv')
    assert.match(csv,/套房/);assert.match(csv,/20/)
    await page.getByRole('spinbutton',{name:`${main.name}客房数量`,exact:true}).fill('80')
    const updated=(await activeProject()).facilities.find(f=>f.id===main.id)
    assert.equal(updated.rooms,80);assert.equal(updated.rooms,Object.values(updated.roomMix).reduce((a,b)=>a+b,0))
  })
  await check('investment editable price, CSV download and assumptions',async()=>{
    await navigate('投资估算')
    const main=initial.facilities.find(f=>f.type==='hotel')
    await page.getByRole('spinbutton',{name:`${main.name}参考单价`,exact:true}).fill('7000')
    assert.equal((await activeProject()).facilities.find(f=>f.id===main.id).unitCost,7000)
    const csv=await downloaded(()=>button('导出估算表').click(),'estimate.csv')
    assert.match(csv,/合计/);assert.match(csv,/7000/);assert.match(await page.locator('.estimate-note').textContent(),/不含土地/)
  })
  let backup
  await check('standalone SVG and editable JSON downloads',async()=>{
    await navigate('场地设计')
    await button('导出方案').click()
    const svg=await downloaded(()=>button('当前布局图 (.svg)').click(),'layout.svg')
    assert.match(svg,/xmlns="http:\/\/www.w3.org\/2000\/svg"/);assert.match(svg,/width="1600"/);assert.match(svg,/polygon/)
    await button('导出方案').click()
    const json=await downloaded(()=>button('方案文件 (.json)').click(),'project.json')
    backup=JSON.parse(json);assert.equal(backup.facilities.length,15)
  })
  await check('malformed import rejected and valid JSON roundtrip',async()=>{
    const id=(await activeProject()).id
    await page.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{')})
    await page.getByRole('status').filter({hasText:'导入失败'}).waitFor()
    assert.equal((await activeProject()).id,id)
    await page.locator('input[type=file]').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))})
    await page.getByRole('status').filter({hasText:'已导入'}).waitFor()
    assert.notEqual((await activeProject()).id,id);assert.equal((await activeProject()).facilities.length,15)
  })
  await check('new empty project, add facility and preserve earlier projects',async()=>{
    await button('新建项目').click()
    const dialog=page.getByRole('dialog')
    await dialog.getByRole('textbox',{name:'项目名称'}).fill('空白验收项目')
    await dialog.getByRole('button',{name:/空白场地/}).click();await button('创建方案').click()
    assert.equal((await activeProject()).facilities.length,0)
    await button('添加酒店客房').click();assert.equal((await activeProject()).facilities.length,1)
    await page.locator('.workspace-switch').click()
    await page.locator('.project-dropdown').getByRole('button',{name:initial.name}).first().click()
    assert.equal((await activeProject()).facilities.length,15)
  })
  await check('cap at 200 disables adding and duplicating, reload still works',async()=>{
    const capped={...initial,id:'cap-test',name:'设施上限验收',facilities:Array.from({length:200},(_,i)=>({id:`cap-${i}`,type:'landscape',name:`绿地${i+1}`,x:(i%20)*5,y:Math.floor(i/20)*5,width:2,depth:2,floors:1,rooms:0,unitCost:100,rotation:0}))}
    await page.locator('input[type=file]').setInputFiles({name:'capped.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(capped))})
    await page.getByRole('status').filter({hasText:'已导入'}).waitFor()
    assert.equal(await button('添加网球场').isDisabled(),true)
    assert.equal(await button('复制设施').isDisabled(),true)
    await page.reload();assert.equal((await activeProject()).facilities.length,200)
  })
  await check('desktop all navigation views and settings modal',async()=>{
    await page.locator('.workspace-switch').click();await page.locator('.project-dropdown').getByRole('button',{name:initial.name}).first().click()
    for(const n of ['方案总览','客房规划','投资估算','场地设计']){await navigate(n);await assertFit()}
    await button('编辑项目设置').click();await page.getByRole('dialog').getByRole('textbox',{name:'项目名称'}).fill('updated title');await button('取消').click();assert.match(await page.locator('h1').textContent(),new RegExp(initial.name))
    await button('帮助与快捷键').click();assert.match(await page.getByRole('dialog').textContent(),/23.77/);await page.keyboard.press('Escape')
    await page.screenshot({path:'test-results/desktop.png',fullPage:true})
  })
  await check('plan comparison uses saved projects and opens chosen plan',async()=>{
    await button('方案对比').click()
    const dialog=page.getByRole('dialog')
    assert.equal(await dialog.locator('.compare-table thead th').count(),4)
    assert.match(await dialog.locator('.compare-table').textContent(),/128/)
    await dialog.getByRole('button',{name:'返回设计',exact:true}).click()
    await button('方案对比').click()
    await page.getByRole('dialog').getByRole('button',{name:'打开方案',exact:true}).first().click()
    assert.equal(await page.getByRole('dialog').count(),0)
  })
  await check('layout reminders locate an actual overlapping facility',async()=>{
    await button('场地信息').click()
    const warning=page.locator('.warning-facilities button').first()
    assert.ok(await warning.count())
    const label=await warning.getAttribute('aria-label')
    await warning.click()
    assert.equal(await nameInput().inputValue(),label.slice(2))
    assert.equal(await button('2D 平面').getAttribute('class'),'active')
    await button('3D 总览').click()
  })
  await check('desktop sidebar collapse and expand keep the design usable',async()=>{
    await button('收起侧边栏').click();assert.ok(await page.locator('.app-shell.sidebar-collapsed').count())
    await assertFit();await button('展开侧边栏').click();assert.equal(await page.locator('.app-shell.sidebar-collapsed').count(),0)
  })
  await check('mobile 390px navigation, properties and all views fit viewport',async()=>{
    await page.setViewportSize({width:390,height:844})
    assert.equal(await page.locator('.sidebar').isVisible(),false)
    await assertFit();await page.screenshot({path:'test-results/mobile.png',fullPage:true})
    for(const n of ['方案总览','客房规划','投资估算','场地设计']){
      await button('打开菜单').click();await navigate(n);await assertFit()
    }
    await page.getByRole('button',{name:'场地信息',exact:true}).click();await assertFit()
  })
  await check('mobile closed drawer leaves keyboard focus in the visible workspace',async()=>{
    await page.reload();await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(()=>!!document.activeElement.closest('.sidebar')),false)
    await button('打开菜单').click();assert.equal(await page.locator('.sidebar').isVisible(),true)
    await button('关闭侧栏').click({position:{x:365,y:100}});assert.equal(await page.locator('.sidebar').isVisible(),false)
  })
  await check('fullscreen mode is remembered and retains toolbar save/export',async()=>{
    await page.setViewportSize({width:1512,height:982})
    await button('全屏工作台').click();await button('保存方案').click()
    await button('导出方案').click()
    const json=await downloaded(()=>button('方案文件 (.json)').click(),'fullscreen-project.json')
    assert.equal(JSON.parse(json).location,'北京 · 概念方案')
    await page.reload();await button('更多设施').waitFor();assert.equal(await page.locator('.app-shell.canvas-expanded').count(),1)
    const box=await page.locator('.studio-grid').boundingBox();assert.equal(box.x,0);assert.equal(box.y,0);assert.equal(box.height,982)
    await page.setViewportSize({width:390,height:844});await assertFit()
    assert.equal(Math.round((await page.locator('.studio-panel').boundingBox()).height),844)
    await page.screenshot({path:'test-results/fullscreen-mobile.png',fullPage:true})
  })
  assert.deepEqual(errors,[])
  writeFileSync('test-results/browser-results.json',JSON.stringify({passed:results.length,checks:results,runtimeErrors:errors},null,2))
  console.log(`Browser verification: ${results.length} checks passed; no runtime errors.`)
}finally{await browser.close()}
