import { chromium } from 'playwright'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// QA inventory: twelve entertainment cards and searches; real UI addition and
// distinct 2D/3D illustrations; independent cost/greenery/capacity; geometry edit;
// lock/hide/undo/duplicate; download/import/reload; mobile category/search/fit.
// Only UI controls mutate plans. DOM and localStorage evaluation is read-only.
const FUN = [
  ['mini-golf', '迷你高尔夫'], ['pickleball', '匹克球场'],
  ['beach-volleyball', '沙滩排球'], ['splash-pad', '戏水乐园'],
  ['kart-track', '卡丁车赛道'], ['climbing', '攀岩馆'], ['arcade', '游戏厅'],
  ['karaoke', 'KTV 娱乐馆'], ['bowling', '保龄球馆'], ['table-tennis', '乒乓球馆'],
  ['outdoor-cinema', '户外影院'], ['activity-lawn', '活动草坪'],
]
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const checks = [], runtimeErrors = [], added = []
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = name => page.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const current = async id => (await active()).facilities.find(f => f.id === id)
const svg = id => page.locator(`#site-plan-svg [data-facility-id="${id}"]`)
const row = id => page.locator(`[data-manager-id="${id}"]`)
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function check(label, action) { await action(); checks.push(label); console.log('PASS ' + label) }
async function openLibrary() {
  await button('更多设施').click(); await dialog().waitFor()
  await page.waitForFunction(() => getComputedStyle(document.querySelector('.fl-modal-host .modal-backdrop')).opacity === '1')
}
async function funCategory() {
  await dialog().getByRole('button', { name: '娱乐与游玩', exact: true }).click()
  assert.equal(await dialog().locator('.fl-card').count(), 17)
}
async function screenshot(path) {
  if (await button('关闭提示').isVisible()) await button('关闭提示').click()
  await page.evaluate(() => Promise.all([...document.getAnimations()].map(a => a.finished.catch(() => {}))))
  await page.screenshot({ path, fullPage: false })
}
async function assertCount(count) {
  await settled(); assert.equal((await active()).facilities.length, count)
  assert.equal(await page.locator('#site-plan-svg [data-facility-preset]').count(), count)
}
async function locate(id) {
  await button('设施管理').click(); await row(id).locator('.fm-location').click(); await settled()
  assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).inputValue(), (await current(id)).name)
}
async function download(action, path) {
  const pending = page.waitForEvent('download'); await action()
  const file = await pending; await file.saveAs(path); return readFileSync(path, 'utf8')
}
let failure, backup
try {
  await page.goto(url); await button('更多设施').waitFor()
  await check('create blank 1000 × 900 m entertainment plan through UI without altering user storage', async () => {
    await button('切换项目').click(); await button('新建项目').click()
    await dialog().getByRole('textbox', { name: '项目名称' }).fill('西瓜游玩设施验收')
    await dialog().getByRole('button', { name: /空白场地/ }).click(); await button('创建方案').click()
    await button('编辑项目设置').click()
    await dialog().getByRole('spinbutton', { name: '用地宽度', exact: true }).fill('1000')
    await dialog().getByRole('spinbutton', { name: '用地进深', exact: true }).fill('900')
    await button('保存设置').click(); await assertCount(0)
    assert.equal((await active()).siteWidth, 1000); assert.equal((await active()).siteDepth, 900)
  })
  await check('entertainment category retains all twelve original labels and adds five leisure spaces and desktop search keeps correct category', async () => {
    await openLibrary(); assert.equal(await dialog().locator('.fl-card').count(), 51)
    await funCategory()
    const allFunLabels=await dialog().locator('.fl-card h3').allTextContents();assert.equal(allFunLabels.length,17);assert.deepEqual(allFunLabels.slice(0,12),FUN.map(([, label])=>label));assert.deepEqual(allFunLabels.slice(12),['棋牌室','麻将包厢','台球室','桌游活动室','阅读休息室'])
    await screenshot('test-results/entertainment-desktop.png')
    const search = dialog().getByRole('textbox', { name: '搜索设施', exact: true })
    await search.fill('卡丁车'); assert.equal(await dialog().locator('.fl-card').count(), 1)
    assert.equal(await dialog().locator('.fl-card h3').textContent(), '卡丁车赛道')
    await search.fill('不存在的游戏场地'); assert.equal(await dialog().locator('.fl-card').count(), 0)
    await dialog().getByRole('button', { name: '清空筛选，查看全部', exact: true }).click()
    assert.equal(await dialog().locator('.fl-card').count(), 51)
    await page.keyboard.press('Escape')
  })
  await check('all twelve real add controls create distinct identities, editable pricing and scene objects', async () => {
    for (const [index, [id, label]] of FUN.entries()) {
      await openLibrary(); await funCategory()
      await dialog().getByRole('button', { name: `添加${label}`, exact: true }).click()
      await assertCount(index + 1)
      const f = (await active()).facilities.at(-1)
      assert.equal(f.presetId, id); assert.equal(f.name, `${label} 1`)
      assert.ok(f.unitCost > 0)
      assert.equal(await svg(f.id).getAttribute('data-facility-preset'), id)
      assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).inputValue(), f.name)
      assert.ok(await page.getByRole('spinbutton', { name: '参考单价（每平方米）', exact: true }).isEnabled())
      added.push({ id, label, facilityId: f.id })
    }
    assert.equal(new Set((await active()).facilities.map(f => f.id)).size, 12)
    assert.deepEqual((await active()).facilities.map(f => f.presetId), FUN.map(([id]) => id))
  })
  await check('2D and 3D entertainment use distinct preset illustrations for every facility', async () => {
    for (const view of ['2D 平面', '3D 总览']) {
      await button(view).click(); await settled()
      for (const f of added) {
        const art = svg(f.facilityId).locator(`[data-preset-illustration="${f.id}"]`)
        assert.equal(await art.count(), 1, `${view}: ${f.id} missing illustration`)
        assert.ok(await art.locator('path,ellipse,circle,rect,polygon,line').count() >= 3, `${view}: ${f.id} lacks distinct visual detail`)
      }
    }
  })
  await check('visible metrics count zero rooms and zero tennis courts; only natural lawn adds 864 m² green area', async () => {
    const block = label => page.locator('.metric-block').filter({ has: page.locator('span', { hasText: label }) })
    assert.equal(await block('网球场配置').locator('strong').textContent(), '0片')
    assert.equal(await block('规划客房').locator('strong').textContent(), '0间')
    assert.ok(parseFloat((await block('设施工程估算').locator('strong').textContent()).replace(/,/g, '')) > 0)
    await button('场地信息').click()
    const green = page.locator('.site-indicators > div').filter({ has: page.locator('span', { hasText: /^已配置绿地$/ }) })
    assert.equal(await green.locator('strong').textContent(), '864.00 m²')
    await page.locator('.desktop-nav').getByRole('button', { name: '投资估算', exact: true }).click()
    assert.equal(await page.locator('.budget-table tbody tr').count(), 12)
    const project = await active()
    for (const [index, [, label]] of FUN.entries()) {
      const facility = project.facilities[index]
      const row = page.locator('.budget-table tbody tr').nth(index), cells = row.locator('td')
      assert.equal(await cells.nth(0).locator('strong').textContent(), facility.name)
      assert.equal(await cells.nth(0).locator('.ce-subtext').textContent(), label)
      const quantity = facility.width * facility.depth * ((facility.type === 'hotel' || facility.type === 'restaurant') ? facility.floors : 1)
      const quantityText = await cells.nth(1).evaluate(el => [...el.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join(''))
      assert.equal(quantityText, `${new Intl.NumberFormat('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(quantity)} ㎡`)
      assert.equal(await cells.nth(2).locator('.budget-price small').textContent(), '/㎡')
      assert.equal(Number(await cells.nth(2).getByRole('spinbutton', { name: `${facility.name}参考单价`, exact: true }).inputValue()), facility.unitCost)
      const expectedAmount = quantity * facility.unitCost
      assert.ok(Math.abs(Number(await row.getAttribute('data-cost-point')) - expectedAmount) < .000001, `${facility.name}: wrong engineering amount`)
      const renderedAmount = Number((await cells.nth(3).locator('strong').textContent()).replace(/[^0-9.]/g, ''))
      assert.equal(renderedAmount, Math.round(expectedAmount * 100) / 100)
    }
    await page.locator('.desktop-nav').getByRole('button', { name: '场地设计', exact: true }).click()
  })
  await check('new facilities edit dimensions, move and rotate while retaining preset identity', async () => {
    const f = added.find(f => f.id === 'pickleball')
    await locate(f.facilityId)
    await page.getByRole('spinbutton', { name: '宽度', exact: true }).fill('20')
    await page.getByRole('spinbutton', { name: '进深', exact: true }).fill('12')
    await button('旋转设施').click()
    await button('位置与方向').click()
    await page.getByRole('spinbutton', { name: '横向位置', exact: true }).fill('400')
    await page.getByRole('spinbutton', { name: '纵向位置', exact: true }).fill('400')
    await settled()
    const edited = await current(f.facilityId)
    assert.equal(edited.width, 20); assert.equal(edited.depth, 12); assert.equal(edited.rotation, 90)
    assert.equal(edited.x, 400); assert.equal(edited.y, 400); assert.equal(edited.presetId, 'pickleball')
  })
  await check('entertainment supports lock/unlock, hide/undo and duplicate/delete without changing the original', async () => {
    const f = added.find(f => f.id === 'pickleball'), before = await current(f.facilityId)
    await button(`锁定${before.name}`).click(); await settled()
    assert.equal((await current(f.facilityId)).locked, true)
    assert.equal(await page.getByRole('spinbutton', { name: '宽度', exact: true }).isDisabled(), true)
    await button(`解锁${before.name}`).click(); await settled()
    assert.equal(await page.getByRole('spinbutton', { name: '宽度', exact: true }).isEnabled(), true)
    await button('设施管理').click(); await row(f.facilityId).getByRole('button', { name: `隐藏${before.name}`, exact: true }).click(); await settled()
    assert.equal((await current(f.facilityId)).visible, false); assert.equal(await svg(f.facilityId).count(), 0)
    await button('撤销').click(); await settled(); assert.notEqual((await current(f.facilityId)).visible, false)
    await locate(f.facilityId); const original = await current(f.facilityId)
    await button('复制设施').click(); await assertCount(13)
    const clone = (await active()).facilities.at(-1)
    assert.equal(clone.presetId, 'pickleball'); assert.notEqual(clone.id, original.id)
    assert.equal(clone.width, 20); assert.equal(clone.depth, 12); assert.equal(clone.rotation, 90)
    await button('删除选中设施').click(); await assertCount(12)
    assert.deepEqual(await current(f.facilityId), original)
  })
  await check('real JSON download, import and reload preserve all twelve exact IDs and edited values', async () => {
    await button('保存方案').click(); await button('导出方案').click()
    backup = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'test-results/entertainment-project.json'))
    assert.equal(backup.facilities.length, 12)
    assert.deepEqual(backup.facilities.map(f => f.presetId), FUN.map(([id]) => id))
    const before = (await active()).id
    await page.locator('input[type=file]').setInputFiles({ name: 'entertainment.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })
    await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await assertCount(12)
    assert.notEqual((await active()).id, before)
    assert.deepEqual((await active()).facilities, backup.facilities)
    await page.reload(); await button('更多设施').waitFor(); await assertCount(12)
    assert.deepEqual((await active()).facilities, backup.facilities)
  })
  await check('390px mobile entertainment category/search renders two columns without overflow and preserves the plan', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(url.replace(/\/web\/?$/, '/mobile'))
    await button('更多设施').waitFor(); await assertCount(12)
    assert.equal(await page.locator('.app-shell.canvas-expanded').count(), 1)
    await openLibrary(); await funCategory()
    assert.equal(await dialog().locator('.fl-cards').evaluate(el => getComputedStyle(el).gridTemplateColumns.split(' ').length), 2)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const box = await dialog().boundingBox(); assert.ok(box.x >= 0 && box.x + box.width <= 390)
    await screenshot('test-results/entertainment-mobile.png')
    await dialog().getByRole('textbox', { name: '搜索设施', exact: true }).fill('游戏厅')
    assert.equal(await dialog().locator('.fl-card').count(), 1)
    assert.equal(await dialog().locator('.fl-card h3').textContent(), '游戏厅')
    await page.keyboard.press('Delete'); assert.equal((await active()).facilities.length, 12)
    await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 0)
    assert.deepEqual((await active()).facilities, backup.facilities)
  })
  assert.deepEqual(runtimeErrors, [])
  console.log(`Entertainment verification: ${checks.length} checks passed; 12 actual UI additions; no runtime errors.`)
} catch (error) {
  failure = String(error)
  await page.screenshot({ path: 'test-results/entertainment-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  writeFileSync('test-results/entertainment-results.json', JSON.stringify({ passed: checks.length, checks, presets: added, runtimeErrors, ...(failure ? { failure } : {}) }, null, 2))
  await browser.close()
}
