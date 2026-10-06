import {chromium} from 'playwright'
import {existsSync} from 'node:fs'
import {spawn} from 'node:child_process'
import {createServer} from 'node:net'
import {dirname,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import assert from 'node:assert/strict'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..')
const probe=createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r))
const service=spawn(process.execPath,[resolve(root,'scripts/server.mjs'),'--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});let logs='';service.stdout.on('data',b=>logs+=b);service.stderr.on('data',b=>logs+=b)
let browser
try{
  const base=`http://127.0.0.1:${port}`,deadline=Date.now()+10000;let ready=false
  while(Date.now()<deadline){if(service.exitCode!==null)throw Error(logs);try{const r=await fetch(base);if(r.ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,100))}assert.equal(ready,true,logs)
  const systemChrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(existsSync(systemChrome)?systemChrome:undefined)
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});const context=await browser.newContext(),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
  for(const path of ['/web','/web?section=rooms','/web?section=earnings','/mobile']){await page.goto(base+path);await page.locator('.app-shell').waitFor();await page.reload();await page.locator('.app-shell').waitFor();console.log('PASS compiled route and reload '+path)}
  await page.goto(base+'/play?game=lobby');await page.locator('.arcade-page').waitFor();await page.getByRole('button',{name:/2048/}).first().click();await page.waitForURL(/game=2048/);await page.reload();await page.locator('.arcade-page').waitFor();console.log('PASS game lobby, 2048 and reload')
  await page.goto(base+'/play');await page.locator('.survival-game-page').waitFor();console.log('PASS original survival route')
  await page.goto(base+'/factors');await page.locator('[data-factor-game]').waitFor();console.log('PASS factor game route')
  assert.deepEqual(errors,[]);console.log('PASS no runtime errors in compiled Web service')
}catch(e){console.error(e);process.exitCode=1}finally{if(browser)await browser.close();service.kill('SIGTERM');await new Promise(r=>{if(service.exitCode!==null)r();else service.once('exit',r)})}
