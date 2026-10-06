import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

// Every failure injection uses a new browser context. This suite never attaches
// to the user's browser and never changes a project through storage APIs.
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const passed = [], failures = [], skipped = [], observedErrors = []
mkdirSync('test-results', { recursive: true })

const fixture = {
  version: 1, id: 'startup-isolated-fixture', name: '西瓜网球度假酒店 · 启动验收示例', location: '北京 · 隔离验收',
  siteWidth: 1000, siteDepth: 900, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [
    { id: 'startup-hotel', type: 'hotel', name: '验收客房楼', x: 35.25, y: 48.75, width: 12.34, depth: 25.67, floors: 3, rooms: 20, roomMix: { standard: 20, deluxe: 0, suite: 0 }, unitCost: 4321.12, rotation: 0 },
    { id: 'startup-court', type: 'court', name: '验收网球场', x: 70.12, y: 50.34, width: 18.29, depth: 36.57, floors: 1, rooms: 0, unitCost: 167890.12, rotation: 0, surface: 'hard' },
  ],
}

function button(page, name) { return page.getByRole('button', { name, exact: true }) }
function fallback(page) { return page.getByRole('heading', { name: /页面没有完成加载|页面暂时无法显示/ }) }
async function appReady(page) {
  await button(page, '更多设施').waitFor()
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function snapshot(page) {
  return page.evaluate(() => ({ projects: localStorage.getItem('courtside-projects-v1'), active: localStorage.getItem('courtside-active-v1') }))
}
async function importFixture(page) {
  await page.locator('input[type=file]').setInputFiles({ name: 'startup-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) })
  await page.getByRole('status').filter({ hasText: '已导入' }).waitFor()
  await button(page, '保存方案').click()
  await appReady(page)
  const storage = await snapshot(page)
  const saved = JSON.parse(storage.projects).find(project => project.id === storage.active)
  assert.equal(saved.name, fixture.name)
  assert.deepEqual(saved.facilities, fixture.facilities)
  return storage
}
async function assertPreserved(page, before) {
  await appReady(page)
  assert.deepEqual(await snapshot(page), before, 'reload changed saved project JSON or active project')
  const saved = JSON.parse(before.projects).find(project => project.id === before.active)
  assert.deepEqual(saved.facilities, fixture.facilities)
  assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).inputValue(), fixture.facilities[0].name)
  assert.equal(await page.getByRole('spinbutton', { name: '宽度', exact: true }).inputValue(), '12.34')
  assert.equal(await page.getByRole('spinbutton', { name: '进深', exact: true }).inputValue(), '25.67')
}
async function isolated(viewport, action) {
  const context = await browser.newContext({ viewport, acceptDownloads: true })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', error => observedErrors.push(error.message))
  try { return await action(page, context) }
  finally { await context.close() }
}
async function check(name, action) {
  try { await action(); passed.push(name); console.log('PASS ' + name) }
  catch (error) {
    const trace = String(error.stack || error).split('\n')
    const position = trace.find(line => line.includes('verify-startup.mjs:'))?.trim() || 'scripts/verify-startup.mjs'
    failures.push({ name, assertion: String(error.message || error), position, keyLines: trace.slice(0, 20) })
    console.error('FAIL ' + name + '\n' + trace.slice(0, 20).join('\n'))
  }
}
const desktop = { width: 1512, height: 982 }

try {
  await check('normal desktop starts without recovery UI or runtime errors', () => isolated(desktop, async page => {
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(url); await appReady(page)
    assert.equal(await fallback(page).isVisible(), false)
    assert.equal(await button(page, '重新加载此页').isVisible(), false)
    assert.deepEqual(errors, [])
    await page.screenshot({ path: 'test-results/startup-normal-desktop.png', fullPage: false })
  }))

  await check('healthy modal and report download do not trigger blank-page recovery', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    await button(page, '编辑项目设置').click()
    await page.getByRole('dialog').waitFor()
    assert.equal(await fallback(page).isVisible(), false)
    await button(page, '取消').click()
    await page.locator('.desktop-nav').getByRole('button', { name: '方案总览', exact: true }).click()
    const [download] = await Promise.all([page.waitForEvent('download'), button(page, '导出方案报告').click()])
    await download.saveAs('test-results/startup-healthy-report.html')
    assert.equal(await fallback(page).isVisible(), false)
    assert.deepEqual(await snapshot(page), before)
  }))

  await check('entry module abort displays recovery and preserves saved data', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    await page.route('**/src/main.tsx*', route => route.abort())
    await page.reload(); await fallback(page).waitFor()
    assert.equal(await button(page, '重新加载此页').isEnabled(), true)
    assert.deepEqual(await snapshot(page), before)
    await page.screenshot({ path: 'test-results/startup-module-fallback.png', fullPage: false })
  }))

  await check('reload control recovers aborted entry and two real reloads preserve geometry and cost', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    await page.route('**/src/main.tsx*', route => route.abort())
    await page.reload(); await fallback(page).waitFor()
    await page.unroute('**/src/main.tsx*')
    await button(page, '重新加载此页').click()
    await assertPreserved(page, before)
    assert.equal(await fallback(page).isVisible(), false)
    for (let index = 0; index < 2; index++) { await page.reload(); await assertPreserved(page, before) }
  }))

  await check('dependency request abort is caught without replacing stored project', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    await page.route('**/src/App.tsx*', route => route.abort())
    await page.reload(); await fallback(page).waitFor()
    assert.deepEqual(await snapshot(page), before)
    await page.unroute('**/src/App.tsx*')
    await button(page, '重新加载此页').click(); await assertPreserved(page, before)
  }))

  await check('first-run React exception shows explanation and leaves project storage untouched', () => isolated(desktop, async (page, context) => {
    await context.addInitScript(() => { Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true }) })
    await page.goto(url); await fallback(page).waitFor()
    assert.equal(await button(page, '重新加载此页').isEnabled(), true)
    assert.deepEqual(await snapshot(page), { projects: null, active: null })
    await page.screenshot({ path: 'test-results/startup-render-fallback.png', fullPage: false })
  }))

  await check('one-time module evaluation exception recovers through actual reload button', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    let injected = false
    await page.route('**/src/main.tsx*', async route => {
      if (injected) { await route.continue(); return }
      injected = true
      const response = await route.fetch()
      await route.fulfill({ response, body: `throw new Error('isolated startup acceptance failure');\n${await response.text()}` })
    })
    await page.reload(); await fallback(page).waitFor()
    assert.deepEqual(await snapshot(page), before)
    await button(page, '重新加载此页').click(); await assertPreserved(page, before)
    assert.equal(injected, true)
  }))

  await check('lost mounted DOM receives a recoverable panel without storage mutation', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    // Fault injection only in this disposable browser, never the user's tab.
    await page.evaluate(() => document.getElementById('root').replaceChildren())
    await fallback(page).waitFor()
    assert.deepEqual(await snapshot(page), before)
    await button(page, '重新加载此页').click(); await assertPreserved(page, before)
    await page.reload(); await assertPreserved(page, before)
  }))

  await check('healthy repeated UI mutations keep workbench mounted and fallback hidden', () => isolated(desktop, async page => {
    await page.goto(url); await appReady(page)
    const before = await importFixture(page)
    for (let index = 0; index < 4; index++) {
      await button(page, '显示设施名称').click()
      await button(page, '显示设施名称').click()
      await button(page, '编辑项目设置').click()
      await page.getByRole('dialog').waitFor()
      await button(page, '取消').click()
    }
    await appReady(page)
    assert.equal(await fallback(page).isVisible(), false)
    assert.equal(await page.locator('#root').count(), 1)
    assert.deepEqual(await snapshot(page), before)
  }))

  await check('mobile 390px recovery fits viewport and reload returns to usable app', () => isolated({ width: 390, height: 844 }, async page => {
    await page.route('**/src/main.tsx*', route => route.abort())
    await page.goto(url); await fallback(page).waitFor()
    const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }))
    assert.ok(dimensions.scroll <= dimensions.width, JSON.stringify(dimensions))
    const box = await button(page, '重新加载此页').boundingBox()
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y + box.height <= 844)
    await page.screenshot({ path: 'test-results/startup-mobile-fallback.png', fullPage: false })
    await page.unroute('**/src/main.tsx*')
    await button(page, '重新加载此页').click(); await appReady(page)
    assert.equal(await fallback(page).isVisible(), false)
  }))
} finally {
  await browser.close()
  const summary = { total: passed.length + failures.length + skipped.length, passed: passed.length, failed: failures.length, skipped: skipped.length, exitCode: failures.length ? 1 : 0, checks: passed, failures, observedErrors }
  writeFileSync('test-results/startup-results.json', JSON.stringify(summary, null, 2))
  console.log(`Startup verification: total ${summary.total}; passed ${summary.passed}; failed ${summary.failed}; skipped ${summary.skipped}; exit ${summary.exitCode}`)
  process.exitCode = summary.exitCode
}
