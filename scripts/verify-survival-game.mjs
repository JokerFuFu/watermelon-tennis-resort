import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Independent contexts only; no source reducer imports or native browser access.
// Hotel-key monitoring records reads as well as writes. The escape loop obtains
// every crafting ingredient through real map collection, never injected stock.
const TOTAL = 25
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
let currentCheck = 'setup', baseline, escaped, hotelSnapshot
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
try {
  await page.goto(playURL.href); await ready(); baseline = await game()
  await check('standalone guest route neither reads nor writes hotel keys and mounts only a 252-cell game with starter supplies', async () => {
    assert.deepEqual(await page.evaluate(() => window.__hotelOps), [])
    assert.equal(await page.locator('.desktop-header,.app-shell,#site-plan-svg').count(), 0)
    assert.equal(await page.locator('[data-game-tile]').count(), 252)
    const terrains = await page.locator('[data-terrain]').evaluateAll(nodes => [...new Set(nodes.map(n => n.getAttribute('data-terrain')))].sort())
    assert.deepEqual(terrains, ['beach','forest','freshwater','grass','rock','ruins','sea'])
    assert.deepEqual(baseline.wallet, { coins:120, diamonds:1 }); assert.deepEqual(baseline.inventory, { wood:0,stone:0,fiber:0,iron:0,food:3,water:3,rope:0 })
    assert.equal(await page.locator('[data-quest-id]').count(), 8); assert.equal(await input('钻石购买汇率').count(), 0)
    // Outlive the independent ten-second startup watchdog without consuming a turn.
    const idle = await rawGame(); await page.waitForTimeout(10300)
    assert.equal(await page.locator('.survival-game-page').count(), 1); assert.equal(await button('重新加载此页').count(), 0); assert.equal(await rawGame(), idle)
  })
  await check('guest adventure leaves an existing hotel project and active project byte-for-byte unchanged', async () => {
    await page.goto(web); await button('更多设施').waitFor(); await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
    hotelSnapshot = await page.evaluate(() => [localStorage.getItem('courtside-projects-v1'),localStorage.getItem('courtside-active-v1')])
    await page.goto(playURL.href); await ready(); await button('采集当前物资').click(); await wallet()
    assert.deepEqual(await page.evaluate(() => window.__hotelOps), [])
    const after = await page.evaluate(() => [localStorage.getItem('courtside-projects-v1'),localStorage.getItem('courtside-active-v1')]); assert.deepEqual(after, hotelSnapshot)
    await reset()
  })
  await check('adjacent movement consumes one turn while deep-sea and far-cell failures preserve exact saved bytes', async () => {
    await visit({x:4,y:1}); const before = await rawGame(); await page.locator('[data-game-tile="4,0"]').click(); assert.equal(await rawGame(), before)
    assert.match(await page.locator('.survival-live-message').textContent(), /深海|无法/)
    await page.locator('[data-game-tile="14,10"]').click(); assert.equal(await rawGame(), before)
    await reset(); await button('向右移动').click(); const g = await game(); assert.deepEqual([g.player.x,g.player.y,g.turn,g.player.energy,g.player.hunger,g.player.thirst],[5,2,1,99,98,97]); await reset()
  })
  await check('WASD and arrows move only outside editable fields; nickname typing does not move or spend a turn', async () => {
    await input('玩家昵称').fill('WASD旅行者'); await input('玩家昵称').press('ArrowLeft'); const before = await game(); assert.deepEqual(before.player, baseline.player)
    await input('玩家昵称').fill(baseline.playerName); await page.locator('h1').click(); await page.keyboard.press('d'); assert.equal((await game()).player.x,5)
    await page.keyboard.press('ArrowDown'); assert.deepEqual([(await game()).player.x,(await game()).player.y],[5,3]); await reset()
  })
  await check('wooden, silver and golden chests grant their exact one-time rewards with no paid opening or repeat payment', async () => {
    for (const [tier, coins, diamonds, rewards] of [['wooden',30,0,{wood:4,stone:2}],['silver',90,1,{food:2}],['golden',180,2,{iron:3}]]) {
      const chest = (await game()).world.tiles.find(t => t.chest?.tier === tier); await visit(chest); await maintain(); const before = await game()
      await button('开启宝箱').click(); const after = await wallet()
      assert.equal(after.wallet.coins,before.wallet.coins+coins); assert.equal(after.wallet.diamonds,before.wallet.diamonds+diamonds)
      for (const [key,n] of Object.entries(rewards)) assert.equal(after.inventory[key],before.inventory[key]+n)
      assert.equal(after.world.tiles.find(t=>t.chest?.tier===tier).chest.opened,true)
      assert.equal(await button('开启宝箱').isDisabled(),true); const raw=await rawGame(); await button('开启宝箱').evaluate(el=>el.click()); assert.equal(await rawGame(),raw)
    }
    assert.equal((await game()).world.tiles.filter(t=>t.chest?.opened).length,3); await reset()
  })
  await check('a real resource node exhausts after actual collection and cannot supply infinite wood', async () => {
    for(let i=0;(await game()).world.tiles[2*18+4].remaining>0;i++){assert.ok(i<40);await maintain();await button('采集当前物资').click()}
    const g=await game();assert.equal(g.world.tiles[2*18+4].remaining,0);assert.equal(g.inventory.wood,100);assert.equal(g.stats.gathered.wood,100)
    assert.equal(await button('采集当前物资').isDisabled(),true);await reset()
  })
  await check('tool-required iron and insufficient energy are atomic rejected actions without inventory, node or turn changes', async () => {
    await visit({x:9,y:3});let before=await rawGame();await button('采集当前物资').click();assert.equal(await rawGame(),before);assert.match(await page.locator('.survival-live-message').textContent(),/石镐/)
    const tired=structuredClone(baseline);tired.player.energy=0;await reset(tired);before=await rawGame();await button('采集当前物资').click();assert.equal(await rawGame(),before);await reset()
  })
  await check('food, water and rest restore their documented bounded stats and consume only the right supplies and turns', async () => {
    const low=structuredClone(baseline);Object.assign(low.player,{health:40,hunger:20,thirst:10,energy:5});await reset(low)
    await button('进食').click();let g=await game();assert.deepEqual([g.player.hunger,g.player.thirst,g.inventory.food,g.turn],[53,7,2,1])
    await button('饮水').click();g=await game();assert.deepEqual([g.player.hunger,g.player.thirst,g.inventory.water,g.turn],[51,44,2,2])
    await button('休息').click();g=await game();assert.deepEqual([g.player.energy,g.player.hunger,g.player.thirst,g.turn],[40,47,38,4]);await reset()
  })
  await check('shop purchase and resale use integer prices; invalid quantities and insufficient funds never spend or add items', async () => {
    await input('物资交易数量').fill('2');await button('购买木头').click();assert.deepEqual([(await game()).wallet.coins,(await game()).inventory.wood],[104,2])
    await button('出售木头').click();assert.deepEqual([(await game()).wallet.coins,(await game()).inventory.wood],[110,0])
    for(const q of ['-1','0','1.5','NaN','10000']){const before=await rawGame();await input('物资交易数量').fill(q);await button('购买木头').click();assert.equal(await rawGame(),before)}
    await input('物资交易数量').fill('9999');let before=await rawGame();await button('购买铁矿').click();assert.equal(await rawGame(),before)
    await input('物资交易数量').fill('1'); const capped = structuredClone(baseline); capped.inventory.wood = 99999; await reset(capped); before = await rawGame(); await button('购买木头').click(); assert.equal(await rawGame(),before)
    capped.inventory.wood = 1; capped.wallet.coins = 9999999; capped.wallet.diamonds = 99999; await reset(capped); before = await rawGame(); await button('出售木头').click(); assert.equal(await rawGame(),before); await input('货币兑换数量').fill('1'); await button('金币兑换钻石').click(); assert.equal(await rawGame(),before); await reset()
  })
  await check('ten rapid real button clicks cannot overspend a stale wallet or lose successful purchases', async () => {
    await input('物资交易数量').fill('2');await button('购买木头').evaluate(el=>{for(let i=0;i<10;i++)el.click()});await settle()
    const g=await wallet();assert.deepEqual([g.wallet.coins,g.inventory.wood],[8,14]);assert.equal(g.turn,0);await reset()
  })
  await check('default 100/80 exchange roundtrip costs twenty coins and failed or invalid exchanges leave the wallet unchanged', async () => {
    await input('货币兑换数量').fill('1');await button('金币兑换钻石').click();assert.deepEqual((await game()).wallet,{coins:20,diamonds:2})
    await button('钻石兑换金币').click();assert.deepEqual((await game()).wallet,{coins:100,diamonds:1})
    for(const q of ['2','-1','0','1.1','NaN']){const before=await rawGame();await input('货币兑换数量').fill(q);await button('金币兑换钻石').click();assert.equal(await rawGame(),before)}
    await reset()
  })
  await check('fixed diamond supplies debit exactly two diamonds, restore only stated stats and do not provide paid random chests', async () => {
    await input('货币兑换数量').fill('1');await button('金币兑换钻石').click();const low=await game();Object.assign(low.player,{health:20,energy:10,hunger:20,thirst:20});await reset(low)
    await button('购买钻石补给包 · 2 钻石').click();const g=await game();assert.deepEqual([g.wallet.coins,g.wallet.diamonds,g.player.health,g.player.energy,g.player.hunger,g.player.thirst,g.turn],[20,0,60,40,35,35,0]);assert.deepEqual(g.inventory,low.inventory)
    assert.equal(await button('购买钻石补给包 · 2 钻石').isDisabled(),true);await reset()
  })
  await check('real BFS collection, five exact crafting recipes and a beach escape finish all eight tasks without injected resources', async () => {
    const wooden=(await game()).world.tiles.find(t=>t.chest?.tier==='wooden');await visit(wooden);await button('开启宝箱').click()
    await collect('wood',27);await collect('stone',18);await collect('fiber',6)
    // Enough stock off-site must still not allow a camp to be built there.
    const offcamp=await rawGame();await button('制作营地').click();assert.equal(await rawGame(),offcamp)
    await visit((await game()).world.camp)
    const recipes=[['石斧',{wood:4,stone:3},'axe'],['石镐',{wood:3,stone:5},'pickaxe'],['营地',{wood:8,stone:4},'camp'],['草绳',{fiber:6},null],['木筏',{wood:12,stone:6,rope:2},'raft']]
    for(const [name,cost,gear] of recipes){await maintain();const before=await game();await button('制作'+name).click();const after=await game();for(const [key,n]of Object.entries(cost))assert.equal(after.inventory[key],before.inventory[key]-n);if(gear)assert.equal(after.gear[gear],true);else assert.equal(after.inventory.rope,before.inventory.rope+2)}
    await maintain();await button('乘木筏离岛').click();escaped=await game();assert.equal(escaped.status,'escaped'); assert.match(await page.locator('.survival-map-heading').textContent(),new RegExp(`第 ${Math.floor(escaped.turn/24)+1} 天`));assert.equal(await page.locator('[data-quest-done="true"]').count(),8);await screenshot('survival-victory-desktop.png')
  })
  await check('a completed adventure blocks further movement, trades and gathering instead of farming the escaped save', async () => {
    const before=await rawGame();await page.locator('[data-game-tile="4,3"]').click();assert.equal(await rawGame(),before)
    for(const name of ['采集当前物资','购买木头','金币兑换钻石','向右移动'])assert.equal(await button(name).isDisabled(),true)
    assert.equal(await button('制作木筏').isDisabled(),true)
  })
  await check('recovering a legally imported downed save retains actual chest, gear, depleted nodes and sellable stock while charging ten coins', async () => {
    const down=structuredClone(escaped);down.player.health=0;down.status='downed';await reset(down)
    assert.equal(await button('购买木头').isDisabled(),true);await button('回营地恢复').click();const g=await game()
    assert.deepEqual(g.world,down.world);assert.deepEqual(g.gear,down.gear);assert.deepEqual(g.stats,down.stats)
    for(const key of ['wood','stone','fiber','iron','rope'])assert.equal(g.inventory[key],down.inventory[key])
    assert.equal(g.wallet.coins,Math.max(0,down.wallet.coins-10));assert.equal(g.wallet.diamonds,down.wallet.diamonds);assert.equal(g.status,'playing')
    assert.deepEqual([g.player.x,g.player.y,g.player.health,g.player.hunger,g.player.thirst,g.player.energy],[4,2,70,70,70,70])
    await reset()
  })
  await check('all three save slots keep distinct nicknames, wallets and map progress across switching', async () => {
    const slots=[]
    for(let slot=1;slot<=3;slot++){await button('存档 '+slot).click();await ready();await input('玩家昵称').fill('独立旅行者'+slot);await button('修改昵称').click();if(slot===2){await input('物资交易数量').fill('1');await button('购买木头').click()}if(slot===3)await button('向右移动').click();slots.push(await game())}
    for(let slot=1;slot<=3;slot++){await button('存档 '+slot).click();await ready();assert.deepEqual(await game(),slots[slot-1])}
  })
  await check('a still-focused nickname commits before save and JSON export so the file and slot agree', async () => {
    await input('玩家昵称').fill('聚焦导出旅行者');const json=JSON.parse(await download(()=>button('导出游戏存档').click(),'survival-focused-name.json'));assert.equal(json.playerName,'聚焦导出旅行者');assert.deepEqual(json,await game())
    await input('玩家昵称').fill('聚焦保存旅行者');await button('保存游戏').click();assert.equal((await game()).playerName,'聚焦保存旅行者')
  })
  await check('actual JSON roundtrip and two reloads preserve all mutable game fields without offline hunger or thirst decay', async () => {
    const saved=await game(),json=await download(()=>button('导出游戏存档').click(),'survival-roundtrip.json');assert.deepEqual(JSON.parse(json),saved)
    await reset(saved);for(let i=0;i<2;i++){await page.reload();await ready();assert.deepEqual(await game(),saved)}
    assert.deepEqual(await page.evaluate(()=>window.__hotelOps),[])
  })
  await check('three island presets create different real maps, canceled dialogs leave bytes unchanged and new adventures preserve restorable backups', async () => {
    await button('存档 1').click();await ready();const maps=[]
    for(const preset of ['lagoon','jungle','highlands']){const before=await game();await page.getByRole('combobox',{name:'新冒险地图'}).selectOption(preset);await button('开始新冒险').click();await page.keyboard.press('ArrowDown');assert.deepEqual(await game(),before);await button('继续当前冒险').click();assert.deepEqual(await game(),before);await start(preset);const g=await game();assert.equal(g.preset,preset);maps.push(g.world.tiles.map(t=>t.terrain).join(','));const backup=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),backupKey(1));assert.deepEqual(backup,before)}
    assert.equal(new Set(maps).size,3);const backup=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),backupKey(1));await button('恢复上次冒险').click();assert.deepEqual(await game(),backup)
  })
  await check('invalid imported game versions, money, sea positions and inconsistent health never replace the valid slot', async () => {
    const g=await game();for(const mutate of [x=>x.version=2,x=>x.wallet.coins=-1,x=>x.player.x=0,x=>{x.player.health=0;x.status='playing'},x=>x.world.tiles[1].x=10]){const bad=structuredClone(g);mutate(bad);const before=await rawGame();await page.locator('input[aria-label="选择游戏存档文件"]').setInputFiles({name:'invalid-game.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(bad))});await settle();assert.equal(await rawGame(),before)}await button('保存游戏').click()
  })
  await check('a corrupt private slot preserves raw bytes until an explicit new adventure backs them up and never touches hotel keys', async () => {
    const broken='{not-valid-game';const corrupt=await browser.newContext({viewport:{width:1100,height:850},acceptDownloads:true});await corrupt.addInitScript(({key,raw})=>localStorage.setItem(key,raw),{key:gameKey(1),raw:broken});const p=await corrupt.newPage()
    try{await p.goto(playURL.href);await ready(p);await p.getByRole('alert').waitFor();await button('采集当前物资',p).click();await button('保存游戏',p).click();assert.equal(await p.evaluate(key=>localStorage.getItem(key),gameKey(1)),broken);await p.reload();await ready(p);assert.equal(await p.evaluate(key=>localStorage.getItem(key),gameKey(1)),broken);const wait=p.waitForEvent('download');await button('下载原始存档',p).click();const d=await wait;await d.saveAs(resolve('test-results','survival-corrupt-original.json'));assert.equal(readFileSync(resolve('test-results','survival-corrupt-original.json'),'utf8'),broken);await start('jungle',p);assert.equal(await p.evaluate(key=>localStorage.getItem(key),backupKey(1)),broken);assert.equal((await game(p)).preset,'jungle')}finally{await corrupt.close()}
    const denied = await browser.newContext({ viewport: { width:390,height:844 }, acceptDownloads:true })
    await denied.addInitScript(() => { window.__hotelOps=[]; for(const method of ['getItem','setItem']) { const original=Storage.prototype[method]; Storage.prototype[method]=function(key,...rest){ if(key==='courtside-projects-v1'||key==='courtside-active-v1')window.__hotelOps.push({method,key}); if(key.startsWith('courtside-survival-'))throw new DOMException('Storage denied for isolated QA','SecurityError'); return original.call(this,key,...rest) } } })
    const dp = await denied.newPage()
    try { await dp.goto(playURL.href); await ready(dp); await button('向右移动',dp).click(); assert.equal(Number(await dp.locator('[data-player-x]').getAttribute('data-player-x')),5); const downloadWait=dp.waitForEvent('download'); await button('导出游戏存档',dp).click(); const d=await downloadWait; await d.saveAs(resolve('test-results','survival-denied-memory.json')); const memory=JSON.parse(readFileSync(resolve('test-results','survival-denied-memory.json'),'utf8')); assert.equal(memory.player.x,5); assert.equal(memory.turn,1); await button('保存游戏',dp).click(); assert.match(await dp.locator('.survival-live-message').textContent(),/保存失败|失败/); assert.equal(Number(await dp.locator('[data-player-x]').getAttribute('data-player-x')),5); assert.deepEqual(await dp.evaluate(()=>window.__hotelOps),[]) } finally { await denied.close() }
  })
  await check('a failed lazy game module displays recovery and actual reload restores the exact saved game without wiping it', async () => {
    const isolated=await browser.newContext({viewport:{width:1100,height:850}}),p=await isolated.newPage()
    try{await p.goto(playURL.href);await ready(p);await button('向右移动',p).click();const before=await game(p);await p.route('**/src/SurvivalGamePage.tsx*',route=>route.abort());await p.reload();await p.getByRole('button',{name:'重新加载此页',exact:true}).waitFor();assert.deepEqual(await game(p),before);await p.unroute('**/src/SurvivalGamePage.tsx*');await button('重新加载此页',p).click();await ready(p);assert.deepEqual(await game(p),before)}finally{await isolated.close()}
  })
  await check('management can set valid virtual rules, rejects profitable reverse rates, and game shortcuts never save or undo hotel data', async () => {
    await page.goto(managerURL.href);await ready();await reset();await page.locator('.survival-rules summary').click();await input('钻石购买汇率').fill('150');await input('钻石回兑汇率').fill('90');await button('保存游戏兑换规则').click();assert.deepEqual((await game()).rates,{buy:150,sell:90})
    const before=await rawGame();await input('钻石购买汇率').fill('100');await input('钻石回兑汇率').fill('150');await button('保存游戏兑换规则').click();assert.equal(await rawGame(),before)
    await input('货币兑换数量').fill('1');await button('钻石兑换金币').click();assert.deepEqual((await game()).wallet,{coins:210,diamonds:0});await button('金币兑换钻石').click();assert.deepEqual((await game()).wallet,{coins:60,diamonds:1})
    const h=await page.evaluate(()=>[localStorage.getItem('courtside-projects-v1'),localStorage.getItem('courtside-active-v1')]);await page.evaluate(()=>window.__hotelOps=[]);await page.locator('.survival-header h1').click();await page.keyboard.press('ControlOrMeta+s');await page.keyboard.press('ControlOrMeta+z');assert.deepEqual(await page.evaluate(()=>window.__hotelOps.filter(x=>x.method==='setItem')),[]);assert.deepEqual(await page.evaluate(()=>[localStorage.getItem('courtside-projects-v1'),localStorage.getItem('courtside-active-v1')]),h)
    await page.goto(playURL.href);await ready();assert.equal(await input('钻石购买汇率').count(),0);assert.deepEqual((await game()).rates,{buy:150,sell:90})
  })
  await check('1100px management six-way navigation and primary save/export/fullscreen controls remain reachable with the game entry', async () => {
    await page.setViewportSize({width:1100,height:850});await page.goto(managerURL.href);await ready();assert.equal(await page.locator('.desktop-nav button').count(),6)
    for(const label of ['保存方案','导出方案','进入屏幕全屏']){const control=page.locator('.desktop-header').getByRole('button',{name:label,exact:true}),b=await control.boundingBox();assert.ok(b&&b.x>=0&&b.x+b.width<=1100&&b.y>=0&&b.y+b.height<=850,label)}
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await screenshot('survival-management-1100.png')
  })
  await check('390px guest map, direction pad and editable fields work without horizontal overflow or unexpected JavaScript errors', async () => {
    await page.setViewportSize({width:390,height:844});await page.goto(playURL.href);await ready();await reset();await input('玩家昵称').fill('wasd手机旅行者');await input('玩家昵称').press('ArrowRight');assert.deepEqual((await game()).player,baseline.player);await button('修改昵称').click();await button('向右移动').click();assert.equal((await game()).player.x,5)
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const b=await page.locator('.island-game-map').boundingBox();assert.ok(b.x>=0&&b.x+b.width<=390);await screenshot('survival-mobile.png');assert.deepEqual(runtimeErrors,[]);assert.deepEqual(await page.evaluate(()=>window.__hotelOps),[])
    const after=await page.evaluate(()=>[localStorage.getItem('courtside-projects-v1'),localStorage.getItem('courtside-active-v1')]);assert.deepEqual(after,hotelSnapshot)
  })
}catch(error){const trace=String(error.stack||error).split('\n');failures.push({name:currentCheck,assertion:String(error.message||error),position:trace.find(s=>s.includes('verify-survival-game.mjs:'))?.trim()||'scripts/verify-survival-game.mjs',keyLines:trace.slice(0,20)});console.error('FAIL '+currentCheck+'\n'+trace.slice(0,20).join('\n'));await page.screenshot({path:'test-results/survival-failure.png',fullPage:true}).catch(()=>{});process.exitCode=1}
finally{const result={total:TOTAL,passed:passed.length,failed:failures.length,skipped:Math.max(0,TOTAL-passed.length-failures.length),exitCode:process.exitCode||0,checks:passed,failures,runtimeErrors};writeFileSync('test-results/survival-results.json',JSON.stringify(result,null,2));console.log(`Survival verification: total ${result.total} / passed ${result.passed} / failed ${result.failed} / skipped ${result.skipped}; exit ${result.exitCode}.`);await browser.close()}
