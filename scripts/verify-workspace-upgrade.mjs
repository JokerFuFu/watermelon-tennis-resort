import { chromium } from 'playwright'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import assert from 'node:assert/strict'

// QA inventory: facility management (search/category/locate/lock/hide/copy/delete),
// camera and 1 m snapping, readonly arrange/cancel/apply/undo/failure, independent
// save-as/reload, same-project and different-project cross-tab writes, mobile fit.
// Exceptional paths include locked keyboard/drag edits and an impossible layout.
// All acceptance mutations use UI input. evaluate only reads DOM/storage/geometry.
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 } })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const checks = [], failures = [], runtimeErrors = []
context.on('page', p => p.on('pageerror', e => runtimeErrors.push(e.message)))
page.on('pageerror', e => runtimeErrors.push(e.message))
mkdirSync('test-results', { recursive: true })
const button = (name, p = page) => p.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const library = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')))
const active = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(x => x.id === localStorage.getItem('courtside-active-v1')))
const facility = async id => (await active()).facilities.find(f => f.id === id)
const svgFacility = id => page.locator(`#site-plan-svg [data-facility-id="${id}"]`)
const row = id => page.locator(`[data-manager-id="${id}"]`)
const geometry = project => project.facilities.map(({ id, x, y, width, depth, rotation }) => ({ id, x, y, width, depth, rotation }))
const metadata = project => project.facilities.map(({ x, y, ...rest }) => rest)
async function check(label, action) {
  try { await action(); checks.push(label); console.log('PASS ' + label); return true }
  catch (error) {
    const failure = { label, error: String(error) }; failures.push(failure)
    console.error('FAIL ' + label + '\n' + String(error))
    await page.screenshot({ path: `test-results/workspace-upgrade-failure-${failures.length}.png`, fullPage: false }).catch(() => {})
    return false
  }
}
async function settled(p = page) {
  await p.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await p.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function waitFacility(id, key, value) {
  await page.waitForFunction(({ id, key, value }) => {
    const project = JSON.parse(localStorage.getItem('courtside-projects-v1')).find(x => x.id === localStorage.getItem('courtside-active-v1'))
    return project.facilities.find(x => x.id === id)?.[key] === value
  }, { id, key, value })
}
async function manager() { await button('设施管理').click(); await page.locator('.facility-manager').waitFor() }
async function locate(id) { await manager(); await row(id).locator('.fm-location').click(); await settled() }
async function add(label) {
  await button('更多设施').click(); await dialog().waitFor()
  await dialog().getByRole('textbox', { name: '搜索设施', exact: true }).fill(label)
  await dialog().getByRole('button', { name: `添加${label}`, exact: true }).click()
  await settled(); return (await active()).facilities.at(-1)
}
async function nav(name, p = page) { await p.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function createBlank(name) {
  await button('切换项目').click(); await button('新建项目').click()
  await dialog().getByRole('textbox', { name: '项目名称' }).fill(name)
  await dialog().getByRole('button', { name: /空白场地/ }).click(); await button('创建方案').click()
  await button('编辑项目设置').click()
  await dialog().getByRole('spinbutton', { name: '用地宽度', exact: true }).fill('1000')
  await dialog().getByRole('spinbutton', { name: '用地进深', exact: true }).fill('900')
  await button('保存设置').click(); await settled()
}
// The projected point is inspected, then real mouse input performs the gesture.
async function groundScreen(id, dx = 0, dy = 0) {
  const f = await facility(id)
  return page.locator('#site-plan-svg').evaluate((svg, { f, dx, dy }) => {
    const scene = [...svg.children].find(child => child.tagName.toLowerCase() === 'g' && child.hasAttribute('transform'))
    const pt = svg.createSVGPoint(); pt.x = 4 * (f.x + f.width / 2 + dx); pt.y = 4 * (f.y + f.depth / 2 + dy)
    const screen = pt.matrixTransform(scene.getScreenCTM()); return { x: screen.x, y: screen.y }
  }, { f, dx, dy })
}
let hotel, gym, court, basketball, original, copy
try {
  await page.goto(url); await button('更多设施').waitFor()
  const setup = await check('UI creates isolated 1000 × 900 m project and adds hotel, gym, tennis and basketball', async () => {
    await createBlank('西瓜工作台 2.0 验收')
    hotel = await add('酒店客房'); gym = await add('健身房'); court = await add('网球场'); basketball = await add('篮球场')
    const p = await active(); assert.equal(p.facilities.length, 4); assert.equal(p.siteWidth, 1000); assert.equal(p.siteDepth, 900)
    assert.deepEqual(p.facilities.map(f => f.presetId), ['hotel', 'fitness', 'court', 'basketball'])
    await button('2D 平面').click(); await button('适应画布').click()
  })
  if (!setup) throw new Error('Setup failed; dependent checks cannot run.')

  await check('facility manager searches names and filters actual categories', async () => {
    await manager(); assert.equal(await page.locator('.fm-row').count(), 4)
    await page.getByRole('textbox', { name: '搜索已添加设施' }).fill('健身')
    assert.equal(await page.locator('.fm-row').count(), 1); assert.equal(await row(gym.id).count(), 1)
    await button('清空设施搜索').click(); await page.getByRole('combobox', { name: '设施管理分类' }).selectOption('sports')
    assert.equal(await page.locator('.fm-row').count(), 2)
    await page.getByRole('combobox', { name: '设施管理分类' }).selectOption('all')
  })
  await check('locate centers selected gym and increases useful zoom', async () => {
    await locate(gym.id); assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).inputValue(), gym.name)
    assert.ok(parseInt(await button('重置缩放').textContent()) >= 100)
    const f = await svgFacility(gym.id).boundingBox(), s = await page.locator('#site-plan-svg').boundingBox()
    assert.ok(Math.abs(f.x + f.width / 2 - s.x - s.width / 2) < s.width * .1)
    assert.ok(Math.abs(f.y + f.height / 2 - s.y - s.height / 2) < s.height * .1)
  })
  await check('locking disables properties, delete, arrows and actual drag', async () => {
    await locate(hotel.id); await button('锁定' + hotel.name).click(); await waitFacility(hotel.id, 'locked', true)
    assert.equal(await page.getByRole('textbox', { name: '设施名称', exact: true }).isDisabled(), true)
    assert.equal(await page.getByRole('spinbutton', { name: '宽度', exact: true }).isDisabled(), true)
    assert.equal(await button('删除选中设施').isDisabled(), true)
    const before = await facility(hotel.id)
    await svgFacility(hotel.id).focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Delete')
    const start = await groundScreen(hotel.id), end = await groundScreen(hotel.id, 3, 3)
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y); await page.mouse.up()
    assert.deepEqual(await facility(hotel.id), before)
  })
  await check('locked hotel room-allocation and budget prices are disabled', async () => {
    await nav('客房规划'); assert.equal(await page.getByRole('spinbutton', { name: hotel.name + '客房数量', exact: true }).isDisabled(), true)
    const inputs = page.locator('.rp-hotel-card input'); assert.ok(await inputs.count() >= 5)
    for (let i = 0; i < await inputs.count(); i++) assert.equal(await inputs.nth(i).isDisabled(), true)
    await nav('投资估算'); assert.equal(await page.getByRole('spinbutton', { name: hotel.name + '参考单价', exact: true }).isDisabled(), true)
    await nav('场地设计')
  })
  await check('hiding removes only SVG display; physical dimensions, metrics and cost remain; locate reveals it', async () => {
    const before = await active(), metrics = await page.locator('.metric-strip').textContent()
    await manager(); await row(hotel.id).getByRole('button', { name: '隐藏' + hotel.name, exact: true }).click()
    await waitFacility(hotel.id, 'visible', false); assert.equal(await svgFacility(hotel.id).count(), 0)
    assert.deepEqual(geometry(await active()), geometry(before)); assert.equal(await page.locator('.metric-strip').textContent(), metrics)
    await locate(hotel.id); await waitFacility(hotel.id, 'visible', true); assert.equal(await svgFacility(hotel.id).count(), 1)
    assert.equal((await facility(hotel.id)).locked, true)
  })
  await check('copying locked hidden facility creates visible unlocked clone and deleting clone preserves original', async () => {
    await manager(); await row(hotel.id).getByRole('button', { name: '隐藏' + hotel.name, exact: true }).click(); await waitFacility(hotel.id, 'visible', false)
    await row(hotel.id).getByRole('button', { name: '复制' + hotel.name, exact: true }).click(); await settled()
    const clone = (await active()).facilities.at(-1)
    assert.notEqual(clone.id, hotel.id); assert.equal(clone.locked, false); assert.equal(clone.visible, true); assert.equal(clone.presetId, hotel.presetId)
    assert.equal(await svgFacility(clone.id).count(), 1)
    await button('删除选中设施').click(); await settled(); assert.equal((await active()).facilities.length, 4)
    assert.ok(await facility(hotel.id)); await locate(hotel.id)
  })
  await check('1 m snapping previews during drag, commits only at pointerup and undo restores original geometry', async () => {
    await locate(gym.id); await button('网格吸附').click(); assert.equal(await button('网格吸附').getAttribute('aria-pressed'), 'true')
    const before = await facility(gym.id), start = await groundScreen(gym.id), end = await groundScreen(gym.id, 2.4, 1.7)
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 4 })
    assert.deepEqual(await facility(gym.id), before)
    await page.mouse.up(); await page.waitForFunction(id => {
      const p = JSON.parse(localStorage.getItem('courtside-projects-v1')).find(x => x.id === localStorage.getItem('courtside-active-v1'))
      return p.facilities.find(x => x.id === id).x % 1 === 0 && p.facilities.find(x => x.id === id).y % 1 === 0
    }, gym.id)
    const after = await facility(gym.id); assert.equal(after.x, Math.round(before.x + 2.4)); assert.equal(after.y, Math.round(before.y + 1.7))
    await button('撤销').click(); await waitFacility(gym.id, 'x', before.x); assert.deepEqual(await facility(gym.id), before)
  })
  await check('horizontal wheel preserves zoom; vertical wheel keeps cursor anchor; clamp reaches 1600%; fit keeps 2D', async () => {
    await locate(gym.id); const beforeZoom = await button('重置缩放').textContent()
    const anchor = await groundScreen(gym.id); await page.mouse.move(anchor.x, anchor.y); await page.mouse.wheel(180, 0)
    await settled(); assert.equal(await button('重置缩放').textContent(), beforeZoom)
    await page.mouse.wheel(0, 120); await page.waitForFunction(z => document.querySelector('.zoom-value').textContent !== z, beforeZoom)
    const afterAnchor = await groundScreen(gym.id); assert.ok(Math.abs(anchor.x - afterAnchor.x) < 2 && Math.abs(anchor.y - afterAnchor.y) < 2)
    await page.mouse.wheel(0, -5000); await page.waitForFunction(() => document.querySelector('.zoom-value').textContent === '1600%')
    await button('适应画布').click(); assert.equal(await button('重置缩放').textContent(), '100%')
    assert.match(await page.locator('#site-plan-svg').getAttribute('aria-label'), /二维平面/)
  })
  await check('auto-layout preview is read-only and cancelling leaves entire saved project unchanged', async () => {
    const before = await active(); await button('自动排布').click(); await dialog().waitFor()
    assert.equal(await dialog().locator('#layout-preview-svg').count(), 1)
    assert.equal(await dialog().locator('#layout-preview-svg [role=button],#layout-preview-svg [tabindex]').count(), 0)
    assert.equal(await dialog().getByRole('button', { name: '应用排布', exact: true }).isEnabled(), true)
    await dialog().getByRole('button', { name: '取消', exact: true }).click(); assert.deepEqual(await active(), before)
  })
  await check('apply changes only unlocked coordinates; metadata and locked geometry persist; undo restores all geometry', async () => {
    const before = await active(); await button('自动排布').click(); await button('应用排布').click(); await settled()
    const after = await active(); assert.notDeepEqual(geometry(after), geometry(before)); assert.deepEqual(metadata(after), metadata(before))
    assert.deepEqual(after.facilities.find(f => f.id === hotel.id), before.facilities.find(f => f.id === hotel.id))
    await button('撤销').click(); await settled(); assert.deepEqual(geometry(await active()), geometry(before))
  })
  await check('Ctrl+S commits focused facility-name draft and actual reload restores saved name', async () => {
    await locate(gym.id)
    const input = page.getByRole('textbox', { name: '设施名称', exact: true })
    await input.fill('健身房快捷键保存验收'); assert.equal(await input.evaluate(el => document.activeElement === el), true)
    await page.keyboard.press('Control+s'); await waitFacility(gym.id, 'name', '健身房快捷键保存验收')
    assert.match(await page.getByRole('status').textContent(), /已保存/)
    await page.reload(); await button('更多设施').waitFor(); await locate(gym.id)
    assert.equal(await input.inputValue(), '健身房快捷键保存验收'); gym.name = '健身房快捷键保存验收'
  })
  await check('save-as creates independent identity with all content, preserves original, and survives actual reload', async () => {
    original = await active(); await button('另存为新方案').click(); await dialog().getByRole('textbox', { name: '新方案名称', exact: true }).fill('西瓜工作台独立副本')
    await button('保存副本').click(); await settled(); copy = await active()
    assert.notEqual(copy.id, original.id); assert.equal(copy.name, '西瓜工作台独立副本'); assert.deepEqual(copy.facilities, original.facilities)
    assert.deepEqual((await library()).find(p => p.id === original.id), original)
    await page.reload(); await button('更多设施').waitFor(); assert.deepEqual(await active(), copy)
    await locate(gym.id); await page.getByRole('spinbutton', { name: '宽度', exact: true }).fill(String(gym.width + 1)); await waitFacility(gym.id, 'width', gym.width + 1)
    assert.deepEqual((await library()).find(p => p.id === original.id), original)
  })
  await check('same-project second tab receives edit, undo and redo geometry without conflict warnings', async () => {
    await locate(gym.id); const before = await facility(gym.id)
    const second = await context.newPage(); second.setDefaultTimeout(8000); await second.goto(url); await button('设施管理', second).click()
    await second.locator(`[data-manager-id="${gym.id}"] .fm-location`).click()
    await page.getByRole('spinbutton', { name: '宽度', exact: true }).fill(String(before.width + 2)); await waitFacility(gym.id, 'width', before.width + 2)
    await second.waitForFunction(value => document.querySelector('input[aria-label="宽度"]').value === String(value), before.width + 2)
    await button('撤销').click(); await waitFacility(gym.id, 'width', before.width)
    try {
      await second.waitForFunction(value => document.querySelector('input[aria-label="宽度"]').value === String(value), before.width, { timeout: 3500 })
      assert.equal(await second.getByRole('alert').count(), 0)
      assert.deepEqual(await facility(gym.id), before)
      await button('重做').click(); await waitFacility(gym.id, 'width', before.width + 2)
      await second.waitForFunction(value => document.querySelector('input[aria-label="宽度"]').value === String(value), before.width + 2, { timeout: 3500 })
      assert.equal(await second.getByRole('alert').count(), 0); assert.equal(await page.getByRole('alert').count(), 0)
      assert.deepEqual(await facility(gym.id), { ...before, width: before.width + 2 })
    }
    catch (error) {
      const observed = await second.getByRole('spinbutton', { name: '宽度', exact: true }).inputValue()
      throw new Error(`Cross-tab undo/redo did not synchronize: original width ${before.width}; tab B shows ${observed}; tab A persisted ${(await facility(gym.id)).width}. ${String(error)}`)
    }
    finally { await second.close() }
  })
  await check('different-project tabs can save independently without dropping another project or content', async () => {
    const second = await context.newPage(); second.setDefaultTimeout(8000); await second.goto(url)
    await button('切换项目', second).click(); await second.locator('.desktop-project-dropdown').getByRole('button', { name: original.name, exact: true }).click()
    await button('设施管理', second).click(); await second.locator(`[data-manager-id="${gym.id}"] .fm-location`).click()
    await locate(gym.id); const mine = Number(await page.getByRole('spinbutton', { name: '宽度', exact: true }).inputValue()) + 1
    await page.getByRole('spinbutton', { name: '宽度', exact: true }).fill(String(mine)); await button('保存方案').click()
    await second.getByRole('spinbutton', { name: '宽度', exact: true }).fill(String(gym.width + 3)); await button('保存方案', second).click(); await settled(second)
    const all = await library(); assert.equal(all.find(p => p.id === copy.id).facilities.find(f => f.id === gym.id).width, mine)
    assert.equal(all.find(p => p.id === original.id).facilities.find(f => f.id === gym.id).width, gym.width + 3)
    assert.equal(all.filter(p => p.id === original.id || p.id === copy.id).length, 2)
    await second.close()
    await button('保存方案').click(); await settled()
  })
  await check('impossible small plot disables apply and cancellation preserves original scene', async () => {
    await button('编辑项目设置').click(); await dialog().getByRole('spinbutton', { name: '用地宽度', exact: true }).fill('30'); await dialog().getByRole('spinbutton', { name: '用地进深', exact: true }).fill('30'); await button('保存设置').click(); await settled()
    const before = await active(); await button('自动排布').click(); assert.equal(await button('应用排布').isDisabled(), true)
    assert.match(await dialog().locator('.lp-status').textContent(), /未找到完整排布/)
    await button('取消').click(); assert.deepEqual(await active(), before)
    await button('撤销').click(); await settled(); assert.equal((await active()).siteWidth, 1000)
  })
  await check('desktop manager and new toolbar controls fit viewport and are actual hit targets', async () => {
    await button('适应画布').click(); await manager(); await settled()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    for (const name of ['设施管理', '网格吸附', '自动排布', '另存为新方案']) assert.equal(await button(name).evaluate(el => {
      const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2))
    }), true, name + ' is occluded')
    await page.screenshot({ path: 'test-results/workspace-upgrade-desktop.png', fullPage: false })
  })
  await check('390 px mobile manager sits below canvas with scrollable list, usable controls and no horizontal overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(url.replace(/\/web\/?$/, '/mobile'))
    await button('设施管理').click(); await settled()
    const canvas = await page.locator('.canvas-area').boundingBox(), panel = await page.locator('.properties-panel').boundingBox(), list = await page.locator('.fm-list').boundingBox()
    assert.ok(panel.y >= canvas.y + canvas.height); assert.ok(panel.height >= 480); assert.ok(list.height > 0)
    assert.match(await page.locator('.fm-list').evaluate(el => getComputedStyle(el).overflowY), /auto|scroll/)
    const viewport = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
    assert.ok(viewport.scrollWidth <= viewport.width, `mobile horizontal overflow: viewport ${viewport.width}px, scroll width ${viewport.scrollWidth}px`)
    for (const name of ['设施管理', '网格吸附', '自动排布']) {
      await button(name).scrollIntoViewIfNeeded(); assert.equal(await button(name).evaluate(el => { const b = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) }), true, name + ' is occluded')
    }
    await page.locator('.properties-panel').scrollIntoViewIfNeeded(); await settled()
    await page.screenshot({ path: 'test-results/workspace-upgrade-mobile-manager.png', fullPage: false })
    await button('更多设施').click(); await dialog().waitFor(); await page.keyboard.press('Escape'); assert.equal(await dialog().count(), 0)
    assert.equal(await page.locator('.app-shell.canvas-expanded').count(), 1)
  })
  await check('no browser runtime errors during all exercised flows', async () => { assert.deepEqual(runtimeErrors, []) })
} catch (error) {
  failures.push({ label: 'fatal', error: String(error) }); console.error(String(error))
} finally {
  writeFileSync('test-results/workspace-upgrade-results.json', JSON.stringify({ passed: checks.length, failed: failures.length, checks, failures, runtimeErrors }, null, 2))
  await browser.close()
}
console.log(`Workspace upgrade verification: ${checks.length} passed, ${failures.length} failed, ${runtimeErrors.length} runtime errors.`)
if (failures.length) process.exitCode = 1
