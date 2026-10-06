import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Independent contexts only; no source reducer imports or native browser access.
// Hotel-key monitoring records reads as well as writes. The escape loop obtains
// every crafting ingredient through real map collection, never injected stock.
const TOTAL = 15
const web = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const playURL = new URL(web); playURL.pathname = '/play'; playURL.search = ''
const managerURL = new URL(web); managerURL.searchParams.set('section', 'play')
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
await context.addInitScript(() => {
  window.__hotelOps = []
  const monitored = new Set(['courtside-projects-v1', 'courtside-active-v1'])
  for (const method of ['getItem', 'setItem', 'removeItem']) {
    const original = Storage.prototype[method]
    Storage.prototype[method] = function(key, ...rest) { if (monitored.has(key)) window.__hotelOps.push({ method, key }); return original.call(this, key, ...rest) }
  }
})
const page = await context.newPage(); page.setDefaultTimeout(10000)
const passed = [], failures = [], runtimeErrors = []
page.on('pageerror', e => runtimeErrors.push(e.message))
let currentCheck = 'setup', baseline, hotelSnapshot; const archives = new Map(); let options=[]
mkdirSync('test-results', { recursive: true })
const button = (name, p = page) => p.getByRole('button', { name, exact: true })
const input = (name, p = page) => p.getByRole('textbox', { name, exact: true })
const gameKey = slot => `courtside-survival-slot-${slot}-v1`
const backupKey = slot => `courtside-survival-backup-${slot}-v1`
const game = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem(`courtside-survival-slot-${localStorage.getItem('courtside-survival-active-slot-v1') || '1'}-v1`)))
const rawGame = (p = page) => p.evaluate(() => localStorage.getItem(`courtside-survival-slot-${localStorage.getItem('courtside-survival-active-slot-v1') || '1'}-v1`))
async function ready(p = page) { await p.locator('[data-game-status]').waitFor(); await p.locator('[data-game-tile="4,2"]').waitFor(); await p.waitForFunction(() => [...document.querySelectorAll('.survival-save-state')].some(e => /已保存|需要处理/.test(e.textContent))) }
async function settle() { await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))) }
async function check(name, run) { currentCheck = name; await run(); passed.push(name); console.log('PASS ' + name) }
async function reset(g = baseline) { await page.locator('input[aria-label="选择游戏存档文件"]').setInputFiles({ name: 'survival-isolated.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(g)) }); await page.waitForFunction(expected => localStorage.getItem(`courtside-survival-slot-${localStorage.getItem('courtside-survival-active-slot-v1') || '1'}-v1`) === expected, JSON.stringify(g)); await settle(); assert.deepEqual(await game(), g) }
async function download(action, name) { const wait = page.waitForEvent('download'); await action(); const d = await wait; await d.saveAs(resolve('test-results', name)); return readFileSync(resolve('test-results', name), 'utf8') }
async function wallet(p = page) { const g = await game(p); assert.equal(Number(await p.locator('[data-game-coins]').getAttribute('data-game-coins')), g.wallet.coins); assert.equal(Number(await p.locator('[data-game-diamonds]').getAttribute('data-game-diamonds')), g.wallet.diamonds); assert.ok(g.wallet.coins >= 0 && g.wallet.diamonds >= 0); return g }
async function maintain() {
  for (let n = 0; n < 5; n++) {
    const g = await game()
    if (g.status !== 'playing') throw new Error('Real exploration unexpectedly downed or ended')
    if (g.player.thirst < 35) { if (!g.inventory.water) { await input('物资交易数量').fill('2'); await button('购买饮水').click() }; await button('饮水').click() }
    else if (g.player.hunger < 35) { if (!g.inventory.food) { await input('物资交易数量').fill('2'); await button('购买食物').click() }; await button('进食').click() }
    else if (g.player.energy < 12) await button('休息').click()
    else return
  }
}
function path(g, target) {
  const start = `${g.player.x},${g.player.y}`, end = `${target.x},${target.y}`, queue = [[g.player.x, g.player.y]], previous = new Map([[start, null]])
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i]; if (`${x},${y}` === end) break
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) { const a = x + dx, b = y + dy, key = `${a},${b}`; if (a < 0 || b < 0 || a >= 18 || b >= 14 || previous.has(key) || g.world.tiles[b*18+a].terrain === 'sea') continue; previous.set(key, `${x},${y}`); queue.push([a,b]) }
  }
  assert.ok(previous.has(end), 'Target must be reachable without invented teleportation')
  const steps = []; for (let key = end; key !== start; key = previous.get(key)) steps.unshift(key); return steps
}
async function visit(target) { for (const coordinate of path(await game(), target)) { await maintain(); await page.locator(`[data-game-tile="${coordinate}"]`).click(); const g = await game(); assert.equal(`${g.player.x},${g.player.y}`, coordinate) } }
async function collect(item, count) {
  const g = await game(), node = g.world.tiles.find(t => t.resource === item && t.remaining >= count)
  assert.ok(node, item + ' has a genuine nonexhausted node'); await visit(node)
  for (let i = 0; (await game()).inventory[item] < count; i++) { assert.ok(i < 80); await maintain(); await button('采集当前物资').click() }
}
async function screenshot(name) { await page.locator('.survival-header').scrollIntoViewIfNeeded(); await page.screenshot({ path: resolve('test-results', name), fullPage: false }) }
async function start(preset, p = page) { await p.getByRole('combobox', { name: '新冒险地图' }).selectOption(preset); await button('开始新冒险', p).click(); await p.getByRole('alertdialog').waitFor(); await button('确认开始新冒险', p).click(); await ready(p); await settle() }
const OLD_IDS=['lagoon','jungle','highlands']
const NEW_IDS=['coconut-coast','bamboo-grove','twin-lakes','crescent-bay','rocky-cove','misty-wetland','ancient-ruins','red-cliffs','emerald-valley','pine-ridge','river-delta','golden-dunes','waterfall-basin','volcanic-ridge','mangrove-shore','hidden-harbor','treasure-atoll']
const ALL_IDS=[...OLD_IDS,...NEW_IDS]
const gallery=()=>page.locator('.island-map-gallery')
async function browse(){if(!await gallery().locator('[data-island-card]').count())await gallery().getByRole('button',{name:/浏览全部地图/}).click();assert.equal(await gallery().locator('[data-island-card]').count(),20)}
const terrainSignature=g=>g.world.tiles.map(t=>`${t.terrain}:${t.resource}:${t.chest?.tier??''}`).join('|')
const coastline=g=>g.world.tiles.map(t=>t.terrain==='sea'?'0':'1').join('')
async function fresh(preset){await start(preset);const g=await game();assert.equal(g.preset,preset);assert.equal(await page.locator('.survival-map-heading h2').textContent(),options.find(o=>o.value===preset).name);return g}
async function solve(preset){
  await fresh(preset);const box=(await game()).world.tiles.find(t=>t.chest?.tier==='wooden');await visit(box);await button('开启宝箱').click()
  await collect('wood',27);await collect('stone',18);await collect('fiber',6);await visit((await game()).world.camp)
  for(const [name,cost,gear]of [['石斧',{wood:4,stone:3},'axe'],['石镐',{wood:3,stone:5},'pickaxe'],['营地',{wood:8,stone:4},'camp'],['草绳',{fiber:6},null],['木筏',{wood:12,stone:6,rope:2},'raft']]){await maintain();const before=await game();await button('制作'+name).click();const after=await game();for(const[key,n]of Object.entries(cost))assert.equal(after.inventory[key],before.inventory[key]-n);if(gear)assert.equal(after.gear[gear],true);else assert.equal(after.inventory.rope,before.inventory.rope+2)}
  await maintain();await button('乘木筏离岛').click();assert.equal((await game()).status,'escaped');assert.equal(await page.locator('[data-quest-done="true"]').count(),8)
}
try{
  await page.goto(playURL.href);await ready();baseline=await game()
  await check('catalogue exposes exactly twenty real named map options and twenty distinct 252-cell SVG thumbnails',async()=>{
    options=await page.getByRole('combobox',{name:'新冒险地图'}).locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,name:n.textContent})))
    assert.deepEqual(options.map(o=>o.value).sort(),[...ALL_IDS].sort());assert.equal(new Set(options.map(o=>o.name)).size,20);await browse()
    assert.equal(Number(await gallery().getAttribute('data-map-count')),20);assert.equal(await gallery().locator('svg[data-preview-preset]').count(),20);assert.equal(await gallery().locator('img,image').count(),0)
    const signatures=await gallery().locator('svg[data-preview-preset]').evaluateAll(nodes=>nodes.map(n=>[...n.querySelectorAll('[data-preview-terrain]')].map(r=>r.getAttribute('data-preview-terrain')).join(',')))
    for(const svg of await gallery().locator('svg[data-preview-preset]').all())assert.equal(await svg.locator('[data-preview-terrain]').count(),252)
    assert.equal(new Set(signatures).size,20);assert.deepEqual(await page.evaluate(()=>window.__hotelOps),[])
  })
  await check('selecting every new thumbnail updates the pending choice without resetting the current game, wallet or position',async()=>{
    const before=await rawGame();for(const id of NEW_IDS){await gallery().locator(`[data-island-card="${id}"]`).click();assert.equal(await page.getByRole('combobox',{name:'新冒险地图'}).inputValue(),id);assert.equal(await gallery().locator(`[data-island-card="${id}"]`).getAttribute('aria-pressed'),'true');assert.equal(await rawGame(),before)}
  })
  await check('canceling a selected map adventure and keyboard navigation in the gallery never move the current avatar',async()=>{
    const before=await rawGame();await gallery().locator('[data-island-card="crescent-bay"]').focus();await gallery().locator('[data-island-card="crescent-bay"]').press('ArrowRight');assert.equal(await rawGame(),before)
    await button('开始新冒险').click();await page.keyboard.press('ArrowDown');assert.equal(await rawGame(),before);await button('继续当前冒险').click();assert.equal(await rawGame(),before)
    await gallery().getByRole('button',{name:/收起地图目录/}).click();assert.equal(await gallery().locator('[data-island-card]').count(),0);await browse();assert.equal(await rawGame(),before)
  })
  await check('all twenty options launch actual worlds, keep other slots intact and preserve all mutable fields after save and real reload',async()=>{
    for(const slot of [2,3]){await button('存档 '+slot).click();await ready();await input('玩家昵称').fill('不动存档'+slot);await button('修改昵称').click()}
    const others=await page.evaluate(()=>[localStorage.getItem('courtside-survival-slot-2-v1'),localStorage.getItem('courtside-survival-slot-3-v1')]);await button('存档 1').click();await ready()
    const signatures=[]
    for(const id of ALL_IDS){const previous=await game(),g=await fresh(id);assert.equal(g.world.width,18);assert.equal(g.world.height,14);assert.equal(await page.locator('[data-game-tile]').count(),252);assert.equal(g.playerName,previous.playerName);assert.deepEqual(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),backupKey(1)),previous);signatures.push(terrainSignature(g));await button('保存游戏').click();await page.reload();await ready();assert.deepEqual(await game(),g);archives.set(id,g)}
    assert.equal(new Set(signatures).size,20);assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('courtside-survival-slot-2-v1'),localStorage.getItem('courtside-survival-slot-3-v1')]),others)
  })
  await check('all seventeen new coastlines are different and their six tutorial resources and every chest are reachable from the actual camp',async()=>{
    const coasts=[];for(const id of NEW_IDS){const g=archives.get(id);coasts.push(coastline(g));assert.deepEqual(g.world.camp,{x:4,y:2});for(const[x,y,resource]of [[4,2,'wood'],[4,3,'wood'],[5,3,'stone'],[6,3,'fiber'],[7,3,'food'],[8,3,'water'],[9,3,'iron']]){const tile=g.world.tiles[y*18+x];assert.equal(tile.resource,resource,id+' tutorial resource');assert.ok(tile.remaining>=6);path(g,tile)}for(const tier of ['wooden','silver','golden']){const boxes=g.world.tiles.filter(t=>t.chest?.tier===tier);assert.equal(boxes.length,1);path(g,boxes[0])}}
    assert.equal(new Set(coasts).size,17)
  })
  await check('every real map allows UI walking to the fixed fiber tutorial tile and actual finite fiber collection',async()=>{
    for(const id of ALL_IDS){await reset(archives.get(id));await visit({x:6,y:3});const before=await game();await button('采集当前物资').click();const after=await game();assert.equal(after.inventory.fiber,before.inventory.fiber+3);assert.equal(after.world.tiles[3*18+6].remaining,before.world.tiles[3*18+6].remaining-3);assert.equal(after.stats.gathered.fiber,before.stats.gathered.fiber+3)}
  })
  await check('the three existing map archives preserve changed resource nodes, opened chests, economy and nickname through import and reload',async()=>{
    for(const id of OLD_IDS){await reset(archives.get(id));const box=(await game()).world.tiles.find(t=>t.chest?.tier==='wooden');await visit(box);await button('开启宝箱').click();await visit((await game()).world.camp);await button('采集当前物资').click();await input('玩家昵称').fill('旧图保留-'+id);await button('修改昵称').click();const g=await game();await download(()=>button('导出游戏存档').click(),'old-map-'+id+'.json');await page.reload();await ready();assert.deepEqual(await game(),g);await reset(g);assert.deepEqual(await game(),g);assert.ok(g.world.tiles.some(t=>t.chest?.opened));assert.equal(g.world.tiles[2*18+4].remaining,97)}
  })
  await check('all seventeen expanded map files export and import their exact identities and display their proper island names',async()=>{
    for(const id of NEW_IDS){await reset(archives.get(id));const json=JSON.parse(await download(()=>button('导出游戏存档').click(),'expanded-'+id+'.json'));assert.deepEqual(json,archives.get(id));await reset(json);assert.equal(await page.locator('.survival-map-heading h2').textContent(),options.find(o=>o.value===id).name)}
  })
  await check('crescent bay supports actual gathering, all five crafting recipes and eight completed tasks on escape',async()=>{await solve('crescent-bay');await screenshot('island-crescent-victory.png')})
  await check('river delta supports actual gathering, all five crafting recipes and a legal beach escape',async()=>{await solve('river-delta');await screenshot('island-delta-victory.png')})
  await check('treasure atoll supports actual gathering, all five crafting recipes and a legal beach escape',async()=>{await solve('treasure-atoll');await screenshot('island-atoll-victory.png')})
  await check('new-map wood, silver and gold chests grant exact rewards once even across reloads, with unchanged virtual exchange rules',async()=>{
    await fresh('treasure-atoll');for(const[tier,coin,diamond]of [['wooden',30,0],['silver',90,1],['golden',180,2]]){const box=(await game()).world.tiles.find(t=>t.chest?.tier===tier);await visit(box);await maintain();const before=await game();await button('开启宝箱').click();const after=await game();assert.equal(after.wallet.coins,before.wallet.coins+coin);assert.equal(after.wallet.diamonds,before.wallet.diamonds+diamond);await page.reload();await ready();assert.deepEqual(await game(),after);assert.equal(await button('开启宝箱').isDisabled(),true)}
    assert.deepEqual((await game()).rates,{buy:100,sell:80});await input('货币兑换数量').fill('1');const before=await game();await button('金币兑换钻石').click();await button('钻石兑换金币').click();assert.equal((await game()).wallet.coins,before.wallet.coins-20);assert.equal((await game()).wallet.diamonds,before.wallet.diamonds)
  })
  await check('gallery thumbnails remain stable through game actions and healthy guest UI survives eleven seconds without hotel-key access',async()=>{
    await browse();const signatures=await gallery().locator('svg[data-preview-preset]').evaluateAll(nodes=>nodes.map(n=>n.outerHTML));await button('休息').click();assert.deepEqual(await gallery().locator('svg[data-preview-preset]').evaluateAll(nodes=>nodes.map(n=>n.outerHTML)),signatures)
    const before=await rawGame();await page.waitForTimeout(11000);assert.equal(await rawGame(),before);assert.equal(await page.locator('.survival-game-page').count(),1);assert.equal(await button('重新加载此页').count(),0);assert.deepEqual(await page.evaluate(()=>window.__hotelOps),[])
    await gallery().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/island-gallery-desktop.png',fullPage:false})
  })
  await check('390px gallery selection remains inside the page, confirms the chosen real map and retains a reachable mobile hero',async()=>{
    await page.setViewportSize({width:390,height:844});await browse();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
    const card=gallery().locator('[data-island-card="hidden-harbor"]');await card.scrollIntoViewIfNeeded();const box=await card.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);const before=await rawGame();await card.click();assert.equal(await rawGame(),before);await start('hidden-harbor');assert.equal((await game()).preset,'hidden-harbor');const map=await page.locator('.island-game-map').boundingBox();assert.ok(map.x>=0&&map.x+map.width<=390);await screenshot('island-expanded-mobile.png')
    await browse();await gallery().scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/island-gallery-mobile.png',fullPage:false});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  })
  await check('1100px management entry and a real failed-gallery-module reload preserve game data, while all healthy paths stay error-free',async()=>{
    const saved=await game();await page.setViewportSize({width:1100,height:850});await page.goto(managerURL.href);await ready();assert.equal(await page.locator('.desktop-nav button').count(),6);for(const label of ['保存方案','导出方案','进入屏幕全屏']){const b=await page.locator('.desktop-header').getByRole('button',{name:label,exact:true}).boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=1100&&b.y>=0&&b.y+b.height<=850)}assert.deepEqual(await game(),saved)
    await page.goto(playURL.href);await ready();const current=await game();assert.deepEqual(runtimeErrors,[]);await page.route('**/src/IslandMapGallery.tsx*',route=>route.abort());await page.reload();await button('重新加载此页').waitFor();assert.deepEqual(await game(),current);await page.unroute('**/src/IslandMapGallery.tsx*');await button('重新加载此页').click();await ready();assert.deepEqual(await game(),current)
    // Module abort deliberately emits a loading error, unlike the healthy checks.
    assert.ok(runtimeErrors.every(e=>/fetch|module|Failed|import/i.test(e)),JSON.stringify(runtimeErrors));assert.deepEqual(await page.evaluate(()=>window.__hotelOps),[])
  })
}catch(error){const trace=String(error.stack||error).split('\n');failures.push({name:currentCheck,assertion:String(error.message||error),position:trace.find(s=>s.includes('verify-island-expansion.mjs:'))?.trim()||'scripts/verify-island-expansion.mjs',keyLines:trace.slice(0,20)});console.error('FAIL '+currentCheck+'\n'+trace.slice(0,20).join('\n'));await page.screenshot({path:'test-results/island-expansion-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1}
finally{const result={total:TOTAL,passed:passed.length,failed:failures.length,skipped:Math.max(0,TOTAL-passed.length-failures.length),exitCode:process.exitCode||0,checks:passed,failures,runtimeErrors};writeFileSync('test-results/island-expansion-results.json',JSON.stringify(result,null,2));console.log(`Island expansion verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`);await browser.close()}
