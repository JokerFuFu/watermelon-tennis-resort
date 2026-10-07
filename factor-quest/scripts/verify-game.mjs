import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

const service = process.env.FACTOR_GAME_URL ? null : spawn(process.execPath, ['scripts/server.mjs', '--port', '5184'], { stdio: ['ignore', 'pipe', 'pipe'] })
const origin = process.env.FACTOR_GAME_URL || 'http://127.0.0.1:5184/'
let serviceLog = ''
service?.stdout.on('data', chunk => { serviceLog += chunk })
service?.stderr.on('data', chunk => { serviceLog += chunk })
let browser
const passed = [], errors = []
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (service?.exitCode != null) throw Error(serviceLog)
    try { if ((await fetch(origin)).ok) { ready = true; break } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.ok(ready, serviceLog)
  const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  browser = await chromium.launch({ headless: true, ...(existsSync(chrome) ? { executablePath: chrome } : {}) })
  const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => errors.push(error.message))
  const key = 'factor-quest-save-v1'
  const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
  const button = name => page.getByRole('button', { name, exact: true })
  const inputs = () => page.locator('.fq-factor-input')
  const factors = n => Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0)
  async function fillRound() {
    const state = await read(), round = state.active === 'campaign' ? state.campaign : state.challenge
    const used = new Set(round.revealed.map(i => Number(round.answers[i])))
    const values = factors(round.number).filter(n => !used.has(n)).reverse()
    let j = 0
    for (let i = 0; i < round.answers.length; i++) if (await inputs().nth(i).isEnabled()) await inputs().nth(i).fill(String(values[j++]))
  }
  const check = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
  mkdirSync('test-results', { recursive: true })
  await page.goto(origin)
  await page.locator('.factor-game').waitFor()
  await check('standalone root, metadata, CSS and first round', async () => {
    assert.equal(await inputs().count(), 1)
    assert.match(await page.title(), /因数探险家/)
    assert.equal(await page.locator('.app-shell').count(), 0)
    await page.screenshot({ path: 'test-results/game-desktop.png', fullPage: true })
  })
  await check('wrong answers, ordered 1 through 8, unordered factors and reward only once', async () => {
    await inputs().nth(0).fill('2'); await button('检查答案').click()
    assert.equal((await read()).coins, 0)
    for (let n = 1; n <= 8; n++) {
      assert.equal(await inputs().count(), factors(n).length)
      await fillRound(); await button('检查答案').click()
      const cleared = await read()
      assert.equal(cleared.campaign.cleared, true)
      await page.reload(); await page.locator('.factor-game').waitFor()
      assert.deepEqual(await read(), cleared)
      await button('继续下一关').click()
      assert.equal((await read()).campaign.number, n + 1)
    }
    assert.equal((await read()).coins, 120); assert.equal((await read()).diamonds, 8)
  })
  await check('shop, all four props, random challenge preserves campaign', async () => {
    await button('道具商店').click()
    for (const item of ['hint', 'pair', 'random', 'boost']) await page.locator(`[data-buy="${item}"]`).click()
    assert.equal((await read()).coins, 60); assert.equal((await read()).diamonds, 5)
    await button('闯关冒险').click()
    for (const item of ['hint', 'pair', 'boost']) await page.locator(`[data-use="${item}"]`).click()
    const campaign = (await read()).campaign
    assert.ok(campaign.boosted); assert.ok(campaign.revealed.length >= 2)
    await page.locator('[data-use="random"]').click()
    assert.equal((await read()).active, 'random')
    await fillRound(); await button('检查答案').click()
    assert.ok((await read()).challenge.cleared); assert.equal((await read()).completed, 8)
    await button('回到主线').click(); assert.deepEqual((await read()).campaign, campaign)
    const coins = (await read()).coins
    await fillRound(); await button('检查答案').click()
    assert.equal((await read()).coins, coins + 32)
    await page.getByRole('region', { name: '通关奖励' }).getByRole('button', { name: '退出到营地', exact: true }).click()
    await button('继续冒险').click()
    assert.equal((await read()).campaign.number, 10)
  })
  await check('brand links stay at deployed base and persistence survives two reloads', async () => {
    await inputs().nth(0).fill('1')
    const saved = await read()
    await page.getByRole('link', { name: '因数探险家首页', exact: true }).click()
    await page.locator('.factor-game').waitFor()
    assert.deepEqual(await read(), saved)
    for (let i = 0; i < 2; i++) { await page.reload(); await page.locator('.factor-game').waitFor(); assert.deepEqual(await read(), saved) }
  })
  await check('390px mobile layout and keyboard submission', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    const widths = await page.evaluate(() => ({ inner: innerWidth, outer: document.documentElement.scrollWidth }))
    assert.ok(widths.outer <= widths.inner + 1, JSON.stringify(widths))
    await inputs().nth(1).fill('2'); await inputs().nth(1).press('Enter')
    assert.equal((await read()).campaign.cleared, false)
    await page.screenshot({ path: 'test-results/game-mobile.png', fullPage: true })
    assert.deepEqual(errors, [])
  })
  writeFileSync('test-results/browser.json', JSON.stringify({ passed, errors }, null, 2))
} catch (error) {
  mkdirSync('test-results', { recursive: true })
  writeFileSync('test-results/browser.json', JSON.stringify({ passed, errors, failure: String(error) }, null, 2))
  throw error
} finally {
  if (browser) await browser.close()
  if (service) { service.kill('SIGTERM'); if (service.exitCode === null) await new Promise(resolve => service.once('exit', resolve)) }
}
