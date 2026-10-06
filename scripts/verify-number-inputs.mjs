import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

// New isolated context: this never reads or writes the user's browser profile.
const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(existsSync(systemChrome)?systemChrome:undefined)
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})})
const context=await browser.newContext({viewport:{width:1512,height:982}})
const page=await context.newPage()
page.setDefaultTimeout(8000)
const passed=[],failures=[],runtimeErrors=[]
page.on('pageerror',error=>runtimeErrors.push(error.message))
mkdirSync('test-results',{recursive:true})
const button=name=>page.getByRole('button',{name,exact:true})
const input=name=>page.getByRole('spinbutton',{name,exact:true})
const active=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('courtside-projects-v1')).find(project=>project.id===localStorage.getItem('courtside-active-v1')))
async function settled(){await page.waitForFunction(()=>!document.querySelector('.save-status.pending'))}
async function type(field,text){await field.focus();await field.press('ControlOrMeta+A');await field.press('Backspace');await field.pressSequentially(text,{delay:60})}
async function importFixture(project){
  const beforeId=(await active()).id
  await page.locator('input[type=file]').setInputFiles({name:'number-input-switch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))})
  await page.waitForFunction(id=>localStorage.getItem('courtside-active-v1')!==id,beforeId)
  await page.getByRole('status').filter({hasText:'已导入'}).waitFor();await settled()
}
async function clickFacility(id){
  const polygon=page.locator(`#site-plan-svg [data-facility-id="${id}"] polygon`).first()
  const box=await polygon.boundingBox();assert.ok(box,'visible facility polygon')
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
}
async function clickEmptyGround(){
  const position=await page.locator('#site-plan-svg').evaluate(svg=>{
    const scene=[...svg.children].find(child=>child.tagName.toLowerCase()==='g'&&child.hasAttribute('transform'))
    const point=svg.createSVGPoint();point.x=200*4;point.y=30*4
    const screen=point.matrixTransform(scene.getScreenCTM());return{x:screen.x,y:screen.y}
  })
  await page.mouse.click(position.x,position.y)
}
async function check(name,action){
  try{await action();passed.push(name);console.log('PASS '+name)}
  catch(error){failures.push({name,error:String(error.stack||error)});console.error('FAIL '+name+'\n'+String(error.stack||error));await page.screenshot({path:`test-results/number-input-failure-${failures.length}.png`}).catch(()=>{})}
}
try{
  await page.goto(process.env.COURTSIDE_URL||'http://127.0.0.1:5173/web');await button('更多设施').waitFor()
  await check('site minimum does not clamp intermediate digits while typing 100',async()=>{
    await button('场地信息').click();const field=input('用地宽度')
    await field.focus();await field.press('ControlOrMeta+A');await field.press('Backspace')
    await field.pressSequentially('1');assert.equal(await field.inputValue(),'1')
    await field.pressSequentially('0');assert.equal(await field.inputValue(),'10')
    await field.pressSequentially('0');assert.equal(await field.inputValue(),'100')
    await field.press('Tab');await settled();assert.equal((await active()).siteWidth,100)
  })
  await check('decimal dimensions retain the decimal point and all digits',async()=>{
    const field=input('用地宽度');await type(field,'100.25');assert.equal(await field.inputValue(),'100.25')
    await field.press('Enter');await settled();assert.equal((await active()).siteWidth,100.25)
    assert.equal(await field.getAttribute('step'),'0.01')
  })
  await check('signed coordinates accept the leading minus and decimal digits',async()=>{
    await button('设施属性').click();await button('位置与方向').click();const field=input('横向位置')
    await field.focus();await field.press('ControlOrMeta+A');await field.press('Backspace');await field.pressSequentially('-')
    assert.equal(await field.evaluate(node=>node.validity.badInput),true)
    await field.pressSequentially('12.34',{delay:60});assert.equal(await field.inputValue(),'-12.34')
    await field.press('Tab');await settled();const project=await active()
    assert.ok(project.facilities.some(facility=>facility.x===-12.34))
  })
  await check('reference price accepts sequential typing and stays a spinbutton',async()=>{
    const field=page.getByRole('spinbutton',{name:/参考单价/});await type(field,'123450');assert.equal(await field.inputValue(),'123450')
    await field.press('Tab');await settled();assert.ok((await active()).facilities.some(facility=>facility.unitCost===123450))
    assert.equal(await field.getAttribute('type'),'number')
  })
  await check('clear and unfinished minus restore the most recent valid coordinate on blur',async()=>{
    const field=input('横向位置');await field.focus();await field.press('ControlOrMeta+A');await field.press('Backspace')
    assert.equal(await field.inputValue(),'');await field.press('Tab');assert.equal(await field.inputValue(),'-12.34')
    await type(field,'-');await field.press('Tab');assert.equal(await field.inputValue(),'-12.34')
  })
  await check('below-minimum and above-maximum values clamp only on blur or Enter',async()=>{
    await button('场地信息').click();const field=input('用地宽度')
    await type(field,'12');assert.equal(await field.inputValue(),'12');await field.press('Tab');assert.equal(await field.inputValue(),'30')
    await type(field,'1200');assert.equal(await field.inputValue(),'1200');await field.press('Enter');assert.equal(await field.inputValue(),'1000')
    await settled();assert.equal((await active()).siteWidth,1000)
  })
  await check('Escape restores the value at focus and leaves focus outside the field',async()=>{
    const field=input('用地宽度');await type(field,'345.67');assert.equal(await field.inputValue(),'345.67')
    await field.press('Escape');assert.equal(await field.inputValue(),'1000');assert.equal(await field.evaluate(node=>document.activeElement===node),false)
    await settled();assert.equal((await active()).siteWidth,1000)
  })
  await check('external undo and redo synchronize draft values',async()=>{
    const field=input('用地宽度');await field.fill('88.88');await field.press('Tab');await settled()
    await button('撤销').click();assert.equal(await field.inputValue(),'1000')
    await button('重做').click();assert.equal(await field.inputValue(),'88.88')
  })
  await check('save shortcut commits pending out-of-range draft before persistence and reload',async()=>{
    const field=input('用地宽度');await type(field,'1400');assert.equal(await field.inputValue(),'1400')
    await field.press('ControlOrMeta+s');await settled();assert.equal((await active()).siteWidth,1000)
    await page.reload();await button('更多设施').waitFor();await button('场地信息').click();assert.equal(await input('用地宽度').inputValue(),'1000')
    assert.ok((await active()).facilities.some(facility=>facility.x===-12.34&&facility.unitCost===123450))
  })
  await check('Escape in a settings modal restores the number without closing the dialog',async()=>{
    await button('编辑项目设置').click();const dialog=page.getByRole('dialog',{name:'项目设置',exact:true})
    const field=dialog.getByRole('spinbutton',{name:'用地宽度',exact:true});await type(field,'123.45')
    await field.press('Escape');assert.equal(await field.inputValue(),'1000');assert.equal(await dialog.count(),1)
    await dialog.getByRole('button',{name:'取消',exact:true}).click();assert.equal((await active()).siteWidth,1000)
  })
  await check('switching projects replaces drafts with the active project geometry',async()=>{
    const original=await active(),fixture={...original,id:'number-input-isolated-switch',name:'数字输入切换验收',siteWidth:555.55,updatedAt:new Date().toISOString()}
    await page.locator('input[type=file]').setInputFiles({name:'number-input-switch.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))})
    await page.getByRole('status').filter({hasText:'已导入'}).waitFor();await settled();await button('场地信息').click()
    assert.equal(await input('用地宽度').inputValue(),'555.55')
    await button('切换项目').click();await page.locator('.desktop-project-dropdown').getByRole('button',{name:original.name,exact:true}).click()
    await button('场地信息').click();assert.equal(await input('用地宽度').inputValue(),'1000')
  })
  let selectionFixture
  await check('unblurred facility name is committed by clicking another actual canvas facility and survives reload',async()=>{
    const original=await active()
    selectionFixture={...original,id:'canvas-commit-isolated-fixture',name:'画布切换提交验收',siteWidth:250,siteDepth:250,updatedAt:new Date().toISOString(),facilities:original.facilities.slice(0,2).map((facility,index)=>({...facility,id:`canvas-commit-${index}`,name:`提交验收设施${index+1}`,x:25+index*100,y:25+index*100,width:40,depth:40}))}
    await importFixture(selectionFixture);await button('设施属性').click();await button('2D 平面').click()
    const name=page.getByRole('textbox',{name:'设施名称',exact:true});await name.fill('未失焦直接切换名称')
    assert.equal(await name.evaluate(node=>document.activeElement===node),true)
    await clickFacility('canvas-commit-1');await settled()
    assert.equal((await active()).facilities.find(facility=>facility.id==='canvas-commit-0').name,'未失焦直接切换名称')
    await page.reload();await button('更多设施').waitFor()
    assert.equal((await active()).facilities.find(facility=>facility.id==='canvas-commit-0').name,'未失焦直接切换名称')
  })
  await check('unblurred facility name is committed by clicking empty ground and survives reload',async()=>{
    await button('2D 平面').click();const name=page.getByRole('textbox',{name:'设施名称',exact:true})
    await name.fill('点空地也保存名称');await clickEmptyGround();await settled()
    assert.equal(await page.locator('.empty-properties').count(),1)
    await page.reload();await button('更多设施').waitFor()
    assert.equal((await active()).facilities.find(facility=>facility.id==='canvas-commit-0').name,'点空地也保存名称')
  })
  await check('out-of-range numeric draft commits before canvas selection changes',async()=>{
    await importFixture(selectionFixture);await button('2D 平面').click();const field=input('宽度')
    await type(field,'1400');assert.equal(await field.inputValue(),'1400')
    await clickFacility('canvas-commit-1');await settled()
    assert.equal((await active()).facilities.find(facility=>facility.id==='canvas-commit-0').width,1000)
    assert.equal(await page.getByRole('textbox',{name:'设施名称',exact:true}).inputValue(),'提交验收设施2')
    await page.reload();await button('更多设施').waitFor()
    assert.equal((await active()).facilities.find(facility=>facility.id==='canvas-commit-0').width,1000)
  })
  await check('empty numeric draft restores its most recent legal value when changing canvas selection',async()=>{
    await importFixture(selectionFixture);await button('2D 平面').click();const field=input('宽度')
    await type(field,'55.55');await field.press('ControlOrMeta+A');await field.press('Backspace');assert.equal(await field.inputValue(),'')
    await clickFacility('canvas-commit-1');await settled()
    assert.equal((await active()).facilities.find(facility=>facility.id==='canvas-commit-0').width,55.55)
    await page.reload();await button('更多设施').waitFor()
    assert.equal(await input('宽度').inputValue(),'55.55')
  })
  await check('integer room count preserves typed 12.2 until blur and stores 12',async()=>{
    const field=input('客房数量');await type(field,'12.2');assert.equal(await field.inputValue(),'12.2')
    await field.press('Tab');assert.equal(await field.inputValue(),'12');await settled()
    const facility=(await active()).facilities.find(facility=>facility.id==='canvas-commit-0')
    assert.equal(facility.rooms,12);assert.equal(Object.values(facility.roomMix).reduce((sum,count)=>sum+count,0),12)
  })
  await check('integer room count preserves typed 12.8 until Enter and stores 13',async()=>{
    const field=input('客房数量');await type(field,'12.8');assert.equal(await field.inputValue(),'12.8')
    await field.press('Enter');assert.equal(await field.inputValue(),'13');await settled()
    const facility=(await active()).facilities.find(facility=>facility.id==='canvas-commit-0')
    assert.equal(facility.rooms,13);assert.equal(Object.values(facility.roomMix).reduce((sum,count)=>sum+count,0),13)
  })
  await check('integer upper bound 1000.2 clamps on save shortcut and survives reload',async()=>{
    const field=input('客房数量');await type(field,'1000.2');assert.equal(await field.inputValue(),'1000.2')
    await field.press('ControlOrMeta+s');await settled();assert.equal(await field.inputValue(),'1000')
    await page.reload();await button('更多设施').waitFor();assert.equal(await input('客房数量').inputValue(),'1000')
    const facility=(await active()).facilities.find(facility=>facility.id==='canvas-commit-0')
    assert.equal(facility.rooms,1000);assert.equal(Object.values(facility.roomMix).reduce((sum,count)=>sum+count,0),1000)
  })
  await check('runtime remains free of page errors',async()=>assert.deepEqual(runtimeErrors,[]))
}finally{
  writeFileSync('test-results/number-input-report.json',JSON.stringify({passed,failures,runtimeErrors},null,2))
  await browser.close()
}
console.log(JSON.stringify({passed:passed.length,failed:failures.length,runtimeErrors},null,2))
if(failures.length)process.exitCode=1
