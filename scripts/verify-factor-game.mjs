import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'

// The test owns this browser context. It never attaches to personal browsers.
const origin = process.env.FACTOR_GAME_URL || 'http://127.0.0.1:5173'
const executablePath = existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
  ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1360, height: 1000 } })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const errors = [], passed = []
page.on('pageerror', error => errors.push(error.message))
const key = 'factor-quest-save-v1'
const read = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key)
const btn = name => page.getByRole('button', { name, exact: true })
const inputs = () => page.locator('.fq-factor-input')
const factors = n => Array.from({ length: n }, (_, i) => i + 1).filter(d => n % d === 0)
const fill = async values => { for (let i = 0; i < values.length; i++) {
  const input = inputs().nth(i)
  if (await input.isEnabled()) await input.fill(String(values[i]))
} }
const verify = async (name, run) => { await run(); passed.push(name); console.log(`PASS ${name}`) }
mkdirSync('test-results', { recursive: true })
try {
  await page.goto(`${origin}/factors`)
  await page.locator('.factor-game').waitFor()
  await verify('独立入口与第1关', async () => {
    assert.equal(await inputs().count(), 1)
    assert.equal(await page.locator('.app-shell').count(), 0)
    await page.screenshot({ path: 'test-results/factors-desktop.png', fullPage: true })
  })
  await verify('余额不足不扣款', async () => {
    await btn('道具商店').click()
    assert.equal(await page.locator('[data-buy="hint"]').isDisabled(), true)
    await btn('闯关冒险').click()
  })
  await verify('错误答案不结算', async () => {
    await fill([2]); await btn('检查答案').click()
    assert.equal((await read()).campaign.cleared, false)
    assert.equal((await read()).coins, 0)
    assert.ok(await page.getByRole('alert').count())
  })
  await verify('从1到8按顺序、无序答案、完整奖励', async () => {
    for (let n = 1; n <= 8; n++) {
      assert.equal(await inputs().count(), factors(n).length)
      if (n === 2) {
        await fill([1, 1]); await btn('检查答案').click()
        assert.equal((await read()).campaign.cleared, false)
      }
      await fill(factors(n).reverse()); await btn('检查答案').click()
      await page.getByRole('region', { name: '通关奖励' }).waitFor()
      assert.equal((await read()).campaign.cleared, true)
      const balance = (await read()).coins
      await page.reload(); await page.locator('.factor-game').waitFor()
      assert.equal((await read()).coins, balance)
      await btn('继续下一关').click()
      assert.equal((await read()).campaign.number, n + 1)
    }
    assert.equal((await read()).coins, 120)
    assert.equal((await read()).diamonds, 8)
    assert.equal((await read()).completed, 8)
  })
  await verify('商店购买与背包、单格/配对/双倍道具', async () => {
    await btn('道具商店').click()
    for (const item of ['hint', 'pair', 'random', 'boost']) await page.locator(`[data-buy="${item}"]`).click()
    let state = await read()
    assert.equal(state.coins, 60); assert.equal(state.diamonds, 5)
    for (const item of ['hint', 'pair', 'random', 'boost']) assert.equal(state.inventory[item], 1)
    await btn('闯关冒险').click()
    for (const item of ['hint', 'pair', 'boost']) await page.locator(`[data-use="${item}"]`).click()
    state = await read()
    assert.equal(state.campaign.boosted, true)
    assert.ok(state.campaign.revealed.length >= 2)
    assert.equal(state.inventory.hint, 0); assert.equal(state.inventory.pair, 0); assert.equal(state.inventory.boost, 0)
    await page.reload(); await page.locator('.factor-game').waitFor()
    assert.equal((await read()).campaign.boosted, true)
  })
  await verify('随机挑战、退出返回、不跳主线', async () => {
    const campaign = (await read()).campaign
    await page.locator('[data-use="random"]').click()
    let state = await read()
    assert.equal(state.active, 'random'); assert.equal(state.inventory.random, 0)
    const target = state.challenge.number
    assert.ok(target >= 2 && target <= 45)
    await fill(factors(target).reverse()); await btn('检查答案').click()
    assert.equal((await read()).challenge.cleared, true)
    assert.equal((await read()).completed, 8)
    await btn('回到主线').click()
    state = await read()
    assert.deepEqual(state.campaign, campaign)
    await btn('退出到营地').click()
    await btn('继续冒险').click()
    assert.equal((await read()).campaign.number, 9)
  })
  await verify('双倍结算与通关退出恢复', async () => {
    // Preserve revealed positions while filling the remaining missing divisors.
    const state = await read(), used = new Set()
    state.campaign.answers.forEach((v, i) => { if (state.campaign.revealed.includes(i)) used.add(Number(v)) })
    const missing = factors(9).filter(n => !used.has(n)); let j = 0
    for (let i = 0; i < await inputs().count(); i++) if (await inputs().nth(i).isEnabled()) await inputs().nth(i).fill(String(missing[j++]))
    const coins = (await read()).coins
    await btn('检查答案').click()
    assert.equal((await read()).coins, coins + 32)
    await page.getByRole('region', { name: '通关奖励' }).getByRole('button', { name: '退出到营地', exact: true }).click()
    await btn('继续冒险').click()
    assert.equal((await read()).campaign.number, 10)
    await inputs().nth(0).fill('1')
    const saved = await read()
    for (let i = 0; i < 2; i++) {
      await page.reload(); await page.locator('.factor-game').waitFor()
      assert.deepEqual(await read(), saved)
      assert.equal(await inputs().nth(0).inputValue(), '1')
    }
  })
  await verify('窄屏、键盘与启动稳定', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: 'test-results/factors-mobile.png', fullPage: true })
    const size = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }))
    assert.ok(size.width <= size.viewport + 1, JSON.stringify(size))
    await inputs().nth(1).focus(); await page.keyboard.type('2'); await page.keyboard.press('Enter')
    assert.equal((await read()).campaign.cleared, false)
    await page.waitForTimeout(10500)
    assert.equal(await page.locator('[data-startup-recovery]').count(), 0)
    assert.equal(await page.locator('.factor-game').count(), 1)
    assert.deepEqual(errors, [])
  })
  await verify('酒店与游戏大厅入口可加载', async () => {
    await page.goto(`${origin}/play?game=lobby`); await page.locator('.arcade-page').waitFor()
    await page.goto(`${origin}/web`); await page.locator('.app-shell').waitFor()
  })
  writeFileSync('test-results/factors-browser.json', JSON.stringify({ passed, errors }, null, 2))
  console.log(`PASS ${passed.length} 个浏览器验收组`)
} catch (error) {
  writeFileSync('test-results/factors-browser.json', JSON.stringify({ passed, errors, failure: String(error) }, null, 2))
  throw error
} finally { await browser.close() }
