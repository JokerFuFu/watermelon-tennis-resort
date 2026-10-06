import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Fresh context only: no mutations to the user's browser or imported application calculators.
const url = process.env.COURTSIDE_URL || 'http://127.0.0.1:5173/web'
const systemChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || (existsSync(systemChrome) ? systemChrome : undefined)
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) })
const context = await browser.newContext({ viewport: { width: 1512, height: 982 }, acceptDownloads: true })
const page = await context.newPage()
page.setDefaultTimeout(8000)
const results = [], failures = [], skipped = [], runtimeErrors = []
page.on('pageerror', error => runtimeErrors.push(error.message))
mkdirSync('test-results', { recursive: true })
const button = (name, root = page) => root.getByRole('button', { name, exact: true })
const field = (name, root = page) => root.locator(`input[aria-label="${name}"]`)
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const money = n => Math.round((n + Number.EPSILON) * 100) / 100
const fixture = {
  version: 1, id: 'operating-acceptance-fixture', name: '餐饮运营预算隔离验收示例', location: '北京', siteWidth: 100, siteDepth: 100, updatedAt: '2026-10-03T00:00:00.000Z',
  facilities: [{ id: 'operating-hotel', type: 'hotel', presetId: 'hotel', name: '验收客房楼', x: 20, y: 20, width: 10, depth: 10, floors: 1, rooms: 10, roomMix: { standard: 10, deluxe: 0, suite: 0 }, unitCost: 100, rotation: 0 }],
  budget: { construction: 'simulation', grade: 'standard', designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: 0, siteAmount: 0, connectionAmount: 0, openingAmount: 0 },
}
function construction(p) {
  const e = p.facilities.reduce((sum, f) => sum + (f.type === 'court' ? f.unitCost : f.width * f.depth * ((f.type === 'hotel' || f.type === 'restaurant') ? f.floors : 1) * f.unitCost), 0)
  const b = p.budget, d = money(e * b.designRate / 100), s = money(e * b.supervisionRate / 100)
  const r = money((e + d + s + (b.siteAmount || 0) + (b.connectionAmount || 0)) * b.reserveRate / 100)
  return money(e + d + s + r + (b.landAmount || 0) + (b.siteAmount || 0) + (b.connectionAmount || 0) + (b.openingAmount || 0))
}
function independent(p) {
  const s = p.operating
  if (!s?.enabled) return { total: 0, rows: [] }
  const occupied = p.facilities.filter(f => f.type === 'hotel').reduce((sum, f) => sum + f.rooms, 0) * s.occupancyRate / 100
  const guests = s.guestMode === 'manual' ? s.dailyGuests : occupied * s.guestsPerRoom
  const bases = { guestDay: guests * s.days, staffDay: s.staffCount * s.days, personDay: (guests + s.staffCount) * s.days, roomDay: occupied * s.days, day: s.days, period: 1, manual: 1 }
  const rows = s.items.map(i => ({ ...i, amount: !i.included || bases[i.basis] * i.quantity === 0 ? 0 : i.unitPrice === null ? null : money(bases[i.basis] * i.quantity * i.unitPrice * (i.taxMode === 'excluded' && i.taxRate !== undefined ? 1 + i.taxRate / 100 : 1)) }))
  return { total: money(rows.reduce((sum, i) => sum + (i.amount ?? 0), 0)), rows }
}
async function settled() { await page.waitForFunction(() => !document.querySelector('.save-status.pending')); await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))) }
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function set(name, value) { await field(name).fill(String(value)); await field(name).press('Tab'); await settled() }
async function importProject(p) { await page.locator('input[type=file]').setInputFiles({ name: 'operating-fixture.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(p)) }); await settled() }
async function totals(expected) {
  const p = await active(), o = independent(p)
  if (expected !== undefined) assert.equal(o.total, expected, 'Independent operating fixture math')
  assert.equal(Number(await page.locator('[data-operating-total]').getAttribute('data-operating-total')), o.total)
  assert.equal(Number(await page.locator('[data-budget-total]').getAttribute('data-budget-total')), construction(p), 'Construction budget must stay separate')
  assert.equal(Number(await page.locator('[data-combined-total]').getAttribute('data-combined-total')), money(construction(p) + o.total))
  for (const row of o.rows) assert.equal(await page.locator(`[data-operating-item="${row.id}"] [data-operating-row-amount]`).getAttribute('data-operating-row-amount'), row.amount === null ? '' : String(row.amount), row.label + ' rendered row')
}
async function download(action, filename) { const pending = page.waitForEvent('download'); await action(); const d = await pending, path = resolve('test-results', filename); await d.saveAs(path); return { path, content: readFileSync(path, 'utf8') } }
function csvRows(csv) { return csv.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""', '"'))) }
async function check(name, action) {
  try { await action(); results.push(name); console.log('PASS ' + name); return true }
  catch (error) {
    const trace = String(error.stack || error).split('\n'), position = trace.find(line => line.includes('verify-operating.mjs:'))?.trim() || 'scripts/verify-operating.mjs'
    failures.push({ name, assertion: String(error.message || error), position, keyLines: trace.slice(0, 20) }); console.error('FAIL ' + name + '\n' + trace.slice(0, 20).join('\n'))
    await page.screenshot({ path: `test-results/operating-failure-${failures.length}.png`, fullPage: false }).catch(() => {}); return false
  }
}
let saved, archive, csv, report, originalId
try {
  await page.goto(url); await button('更多设施').waitFor()
  const setup = await check('legacy project keeps engineering and known construction budget unchanged until operating is enabled', async () => {
    await importProject(fixture); await nav('投资估算'); await page.getByTestId('operating-panel').waitFor()
    assert.equal((await active()).operating, undefined); await totals(0)
    assert.equal(construction(await active()), 11440)
    assert.match(await page.getByTestId('operating-panel').textContent(), /尚未计入预算/)
    assert.match(await page.getByTestId('operating-panel').textContent(), /不是北京市场报价/)
    await nav('方案总览'); await button('方案检查').click(); assert.equal(await page.getByRole('dialog').locator('[data-check-id^=operating-]').count(), 0); await button('返回设计', page.getByRole('dialog')).click(); await nav('投资估算')
  })
  if (!setup) throw new Error('Setup failed; dependent operating checks cannot run.')
  await check('five days / ten guest rooms / half occupancy derives separate guest, staff and room-night consumption', async () => {
    await button('启用并计入运营预算').click(); await settled()
    for (const [name, value] of [['经营期间天数', 5], ['假设入住率', 50], ['每间入住宾客数', 2], ['每日员工人数', 2]]) await set(name, value)
    const keep = ['饮用水', '宾客早餐', '宾客午餐', '宾客晚餐', '洗漱用品', '员工餐', '员工工资', '水电燃气']
    for (const i of (await active()).operating.items) {
      if (!keep.includes(i.label)) await page.getByRole('checkbox', { name: '计入' + i.label, exact: true }).uncheck()
      await page.getByRole('combobox', { name: i.label + '税费口径', exact: true }).selectOption('included')
    }
    await settled(); await totals(5340)
    const b = await page.getByTestId('operating-bases').textContent(); assert.match(b, /10(?:\.0+)? 人\/天/); assert.match(b, /宾客人天\s*50/); assert.match(b, /员工人天\s*10/); assert.match(b, /入住房晚\s*25/)
    assert.equal(Number(await page.locator('[data-operating-item="drinking-water"] [data-operating-row-amount]').getAttribute('data-operating-row-amount')), 240)
    assert.equal(Number(await page.locator('[data-operating-item="room-toiletries"] [data-operating-row-amount]').getAttribute('data-operating-row-amount')), 200)
    assert.deepEqual((await active()).facilities, fixture.facilities)
  })
  await check('manual guests replace room-derived guests while room nights and staff meal counts remain independent', async () => {
    await page.getByRole('combobox', { name: '宾客人数口径', exact: true }).selectOption('manual'); await set('平均每日服务宾客数', 20); await totals(10040)
    assert.match(await page.getByTestId('operating-bases').textContent(), /宾客人天\s*100/); assert.match(await page.getByTestId('operating-bases').textContent(), /入住房晚\s*25/)
    assert.equal(independent(await active()).rows.find(i => i.id === 'staff-meals').amount, 400)
    await page.getByRole('combobox', { name: '宾客人数口径', exact: true }).selectOption('rooms'); await settled(); await totals(5340)
  })
  await check('unknown salary and utilities stay unpriced instead of becoming a complete zero-cost budget', async () => {
    assert.equal((await active()).operating.items.find(i => i.id === 'staff-wages').unitPrice, null)
    assert.match(await page.getByTestId('operating-missing').textContent(), /员工工资/); assert.match(await page.getByTestId('operating-missing').textContent(), /水电燃气/)
    await nav('方案总览'); await button('方案检查').click(); await page.getByRole('dialog').locator('[data-check-id=operating-unpriced]').waitFor(); await button('返回设计', page.getByRole('dialog')).click(); await nav('投资估算')
    await set('员工工资单价', 0); assert.doesNotMatch(await page.getByTestId('operating-missing').textContent(), /员工工资/)
    await page.getByRole('checkbox', { name: '计入水电燃气', exact: true }).uncheck(); await settled(); assert.equal(await page.getByTestId('operating-missing').count(), 0); await totals(5340)
  })
  await check('supplier evidence requires date and known excluded tax is added to water exactly once', async () => {
    const row = page.locator('[data-operating-item="drinking-water"]'); await row.locator('summary').click()
    const before = (await active()).operating
    await page.getByRole('combobox', { name: '饮用水来源类型', exact: true }).selectOption('quotation')
    await page.getByTestId('operating-error').waitFor(); assert.deepEqual((await active()).operating, before)
    await field('饮用水报价日期').fill('2026-10-03'); await field('饮用水来源名称').fill('隔离验收饮水供应商'); await field('饮用水采购范围').fill('5 天瓶装水采购，单价不含税，送货包含'); await settled()
    await page.getByRole('combobox', { name: '饮用水税费口径', exact: true }).selectOption('excluded'); await set('饮用水税率', 10); await totals(5364)
    const q = (await active()).operating.items.find(i => i.id === 'drinking-water'); assert.equal(q.evidence.kind, 'quotation'); assert.equal(q.taxRate, 10)
    assert.match(await row.textContent(), /用户报价，未独立核验/)
  })
  await check('blank tax and unit price remain unresolved and excluded rows retain configuration without adding cost', async () => {
    await set('饮用水税率', ''); await totals(5340); assert.match(await page.getByTestId('operating-missing').textContent(), /饮用水/)
    await set('饮用水单价', ''); await totals(5100); assert.match(await page.getByTestId('operating-missing').textContent(), /尚未报价/)
    await page.getByRole('checkbox', { name: '计入饮用水', exact: true }).uncheck(); await settled(); assert.equal(await page.getByTestId('operating-missing').count(), 0)
    await page.getByRole('checkbox', { name: '计入饮用水', exact: true }).check(); await set('饮用水单价', 2); await set('饮用水税率', 10); await totals(5364)
  })
  await check('custom period, manual and daily items apply their bases once and persist source fields', async () => {
    for (const [label, basis, qty, rate] of [['期间保险', 'period', 1, 100], ['活动一次用品', 'manual', 10, 3], ['每日接驳', 'day', 1, 15]]) {
      await button('添加自定义运营费用').click(); const count = (await active()).operating.items.length
      await field(`第${count}项运营费用名称`).fill(label); await field(`第${count}项运营费用名称`).press('Tab')
      await page.getByRole('combobox', { name: label + '数量基数', exact: true }).selectOption(basis)
      await set(label + (basis === 'manual' ? '总数量' : '每单位用量'), qty); await set(label + '单价', rate)
      await page.getByRole('combobox', { name: label + '税费口径', exact: true }).selectOption('included'); await settled()
    }
    await totals(5569)
    const rows = independent(await active()).rows; assert.equal(rows.find(i => i.label === '期间保险').amount, 100); assert.equal(rows.find(i => i.label === '活动一次用品').amount, 30); assert.equal(rows.find(i => i.label === '每日接驳').amount, 75)
  })
  await check('construction reserve changes only construction and never scales food, water or other operating expenditure', async () => {
    const old = independent(await active()).total; await set('预备费率', 25); await totals(old)
    assert.equal(construction(await active()), 13000); await set('预备费率', 10); await totals(5569)
  })
  await check('save, JSON download, two reloads and copy preserve operating prices, bases, geometry and legacy unit cost', async () => {
    await button('保存方案').click(); await settled(); saved = await active(); originalId = saved.id
    await button('导出方案').click(); archive = await download(() => button('方案文件 (.json)').click(), 'operating-saved.json'); assert.deepEqual(JSON.parse(archive.content), saved)
    for (let i = 0; i < 2; i++) { await page.reload(); await page.getByTestId('operating-panel').waitFor(); await nav('投资估算'); assert.deepEqual(await active(), saved); await totals(5569) }
    await button('另存为新方案').click(); await field('新方案名称').fill('运营预算副本验收'); await button('保存副本').click(); await settled()
    const copy = await active(); assert.notEqual(copy.id, saved.id); assert.deepEqual(copy.operating, saved.operating); assert.deepEqual(copy.facilities, saved.facilities)
    await nav('投资估算'); await totals(5569)
  })
  await check('undo and redo restore operating parameter edits without modifying facility geometry', async () => {
    const before = await active(); await set('经营期间天数', 6); assert.equal((await active()).operating.days, 6)
    await nav('场地设计'); await button('撤销').click(); await settled(); assert.deepEqual((await active()).operating, before.operating); assert.deepEqual((await active()).facilities, before.facilities)
    await button('重做').click(); await settled(); assert.equal((await active()).operating.days, 6)
    await nav('投资估算'); await set('经营期间天数', 5); await totals(5569)
  })
  await check('disabling the budget excludes it from combined funding and retains all fields for re-enabling', async () => {
    const before = (await active()).operating; await page.getByRole('checkbox', { name: '计入运营预算', exact: true }).uncheck(); await settled(); await totals(0)
    assert.deepEqual((await active()).operating, { ...before, enabled: false })
    await nav('方案总览'); await button('方案检查').click(); assert.equal(await page.getByRole('dialog').locator('[data-check-id^=operating-]').count(), 0); await button('返回设计', page.getByRole('dialog')).click(); await nav('投资估算')
    await page.getByRole('checkbox', { name: '计入运营预算', exact: true }).check(); await settled(); assert.deepEqual((await active()).operating, before); await totals(5569)
  })
  await check('invalid imported operating schema is rejected and preserves the current complete project', async () => {
    const before = await active()
    for (const mutation of [p => { p.operating.days = 0 }, p => { p.operating.items[0].unitPrice = -1 }, p => { p.operating.items.push({ ...p.operating.items[0] }) }]) {
      const bad = structuredClone(before); bad.id = 'invalid-operating-import'; mutation(bad)
      await importProject(bad); assert.deepEqual(await active(), before)
    }
  })
  await check('unblurred water price is included identically in screen, persisted project, JSON and CSV exports', async () => {
    await field('饮用水单价').fill('2.5')
    csv = await download(() => button('导出估算表').click(), 'operating-estimate.csv'); await settled(); await totals(5635)
    await button('导出方案').click(); const json = await download(() => button('方案文件 (.json)').click(), 'operating-current.json'); assert.deepEqual(JSON.parse(json.content).operating, (await active()).operating)
    const rows = csvRows(csv.content); const op = rows.find(r => r[0] === '期间运营已计合计'); const combined = rows.find(r => r[0] === '建设加期间运营已计合计')
    assert.ok(op, 'CSV operating subtotal row'); assert.ok(combined, 'CSV combined subtotal row'); assert.ok(op.includes('5635')); assert.ok(combined.includes('17075'))
    assert.ok(rows.some(r => r.includes('饮用水') && r.includes('330') && r.includes('隔离验收饮水供应商')))
    assert.match(csv.content, /2026-10-03/); assert.match(csv.content, /运营/)
  })
  await check('offline HTML report reproduces construction, operating and combined amounts and supplier evidence without requests', async () => {
    await nav('方案总览'); report = await download(() => button('导出方案报告').click(), 'operating-report.html')
    const offline = await context.newPage(), requests = []; offline.on('request', r => { if (/^https?:/.test(r.url())) requests.push(r.url()) })
    try {
      await context.setOffline(true); await offline.goto(pathToFileURL(report.path).href)
      for (const [key, value] of [['knownBudget', 11440], ['operatingBudget', 5635], ['combinedBudget', 17075]]) assert.equal(Number(await offline.locator(`[data-report-metric="${key}"]`).getAttribute('data-value')), value, key)
      const body = await offline.locator('body').textContent(); assert.match(body, /隔离验收饮水供应商/); assert.match(body, /2026-10-03/); assert.match(body, /5 天|5天/); assert.equal(await offline.locator('script').count(), 0); assert.deepEqual(requests, [])
      await offline.screenshot({ path: 'test-results/operating-report.png', fullPage: false })
    } finally { await context.setOffline(false); await offline.close() }
  })
  await check('comparison distinguishes selected operating periods instead of claiming different intervals are equal budgets', async () => {
    await nav('投资估算'); await set('经营期间天数', 6); await nav('方案总览'); await button('方案对比').click(); const dialog = page.getByRole('dialog')
    const original = dialog.getByRole('button', { name: fixture.name, exact: false }); if (!(await original.getAttribute('aria-pressed') === 'true')) await original.click()
    const body = await dialog.textContent(); assert.match(body, /运营/); assert.match(body, /期间|天数/); assert.match(body, /5|6/)
    await button('返回设计', dialog).click(); await nav('投资估算'); await set('经营期间天数', 5); await totals(5635)
  })
  await check('390 pixel mobile budget has usable numeric controls, matching totals, no blank recovery screen and no runtime errors', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(new URL('/mobile', url).href); await button('更多设施').waitFor(); if (await button('返回项目导航').isVisible()) await button('返回项目导航').click(); await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name: '投资估算', exact: true }).click(); await page.getByTestId('operating-panel').waitFor()
    assert.equal(Number(await page.locator('[data-operating-total]').getAttribute('data-operating-total')), 5635)
    await set('每日员工人数', 3); await totals()
    const overflowing = await page.locator('.ob-panel input, .ob-panel select').evaluateAll(inputs => inputs.filter(i => { const r = i.getBoundingClientRect(); return r.width > 0 && (r.left < -1 || r.right > innerWidth + 1) }).map(i => i.getAttribute('aria-label')))
    assert.deepEqual(overflowing, []); assert.equal(await page.locator('.startup-recovery').count(), 0); assert.deepEqual(runtimeErrors, [])
    await page.getByTestId('operating-panel').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/operating-mobile.png', fullPage: false })
    await page.setViewportSize({ width: 1512, height: 982 }); await page.goto(url); await nav('投资估算'); await set('每日员工人数', 2); await totals(5635)
    await page.getByTestId('operating-panel').scrollIntoViewIfNeeded(); await page.screenshot({ path: 'test-results/operating-desktop.png', fullPage: false })
  })
  await check('unconfigured invalid supplier draft cannot enable operating or change formal totals, CSV or saved schema', async () => {
    const restore = await active()
    try {
      await importProject({ ...structuredClone(fixture), id: 'invalid-unconfigured-draft', name: '未启用来源草稿隔离验收' }); await nav('投资估算')
      const before = await active(), row = page.locator('[data-operating-item="drinking-water"]')
      await row.locator('summary').click(); await page.getByRole('combobox', { name: '饮用水来源类型', exact: true }).selectOption('quotation')
      await field('饮用水单价').fill('999'); await button('启用并计入运营预算').click()
      await page.getByTestId('operating-error').waitFor(); await settled()
      assert.deepEqual(await active(), before); assert.equal((await active()).operating, undefined)
      assert.equal(Number(await page.locator('[data-operating-total]').getAttribute('data-operating-total')), 0)
      assert.equal(Number((await page.getByTestId('operating-total').textContent()).replace(/[¥,\s]/g, '')), 0)
      assert.equal(Number(await page.locator('[data-combined-total]').getAttribute('data-combined-total')), 11440)
      assert.doesNotMatch(await page.locator('.ob-enable').textContent(), /已计入综合资金需求/)
      assert.match(await page.locator('.ob-enable').textContent(), /未保存/)
      const d = await download(() => button('导出估算表').click(), 'operating-invalid-disabled.csv'), rows = csvRows(d.content)
      assert.ok(rows.find(r => r[0] === '期间运营已计合计').includes('0')); assert.ok(rows.find(r => r[0] === '建设加期间运营已计合计').includes('11440'))
      await button('导出方案').click(); const json = await download(() => button('方案文件 (.json)').click(), 'operating-invalid-disabled.json')
      assert.equal(JSON.parse(json.content).operating, undefined); assert.deepEqual(await active(), before)
    } finally {
      await button('切换项目').click(); await page.locator('.desktop-project-dropdown').getByRole('button', { name: restore.name, exact: true }).click(); await nav('投资估算'); assert.equal((await active()).id, restore.id)
    }
  })
  await check('enabled invalid supplier draft keeps accepted totals and CSV until date is repaired then survives reload', async () => {
    const restore = await active()
    try {
      const quoted = {
        ...structuredClone(fixture), id: 'invalid-enabled-draft', name: '已启用来源草稿隔离验收',
        operating: { enabled: true, days: 5, guestMode: 'rooms', occupancyRate: 50, guestsPerRoom: 2, dailyGuests: 0, staffCount: 2,
          items: [{ id: 'drinking-water', label: '饮用水', included: true, basis: 'personDay', quantity: 2, unit: '瓶', unitPrice: 2, taxMode: 'included', evidence: { kind: 'quotation', name: '有效饮水供应商', date: '2026-10-03', scope: '瓶装水含税配送报价' } }] },
      }
      await importProject(quoted); await nav('投资估算'); await totals(240)
      const before = await active(), row = page.locator('[data-operating-item="drinking-water"]'); await row.locator('summary').click()
      await field('饮用水报价日期').fill(''); await field('饮用水单价').fill('888'); await field('饮用水单价').press('Tab'); await page.getByTestId('operating-error').waitFor(); await settled()
      assert.deepEqual(await active(), before); await totals(240)
      assert.equal(Number((await page.getByTestId('operating-total').textContent()).replace(/[¥,\s]/g, '')), 240)
      const d = await download(() => button('导出估算表').click(), 'operating-invalid-enabled.csv'), rows = csvRows(d.content)
      assert.ok(rows.find(r => r[0] === '期间运营已计合计').includes('240')); assert.ok(rows.find(r => r[0] === '建设加期间运营已计合计').includes('11680'))
      assert.ok(rows.some(r => r[0] === '饮用水' && r.includes('240') && r.includes('有效饮水供应商'))); assert.deepEqual(await active(), before)
      await field('饮用水报价日期').fill('2026-10-03'); await settled(); await totals(106560)
      const accepted = await active(); assert.equal(accepted.operating.items[0].unitPrice, 888); assert.equal(await page.getByTestId('operating-error').count(), 0)
      await page.reload(); await page.getByTestId('operating-panel').waitFor(); await nav('投资估算'); await totals(106560); assert.deepEqual(await active(), accepted)
    } finally {
      await button('切换项目').click(); await page.locator('.desktop-project-dropdown').getByRole('button', { name: restore.name, exact: true }).click(); await nav('投资估算'); assert.equal((await active()).id, restore.id); await totals(5635)
    }
  })
} catch (error) { if (!failures.length) failures.push({ name: 'operating suite setup or teardown', assertion: String(error.message || error), position: 'scripts/verify-operating.mjs', keyLines: String(error.stack || error).split('\n').slice(0, 20) }) }
finally {
  const output = { total: results.length + failures.length + skipped.length, passed: results.length, failed: failures.length, skipped: skipped.length, exitCode: failures.length ? 1 : 0, failures, runtimeErrors }
  writeFileSync('test-results/operating-results.json', JSON.stringify(output, null, 2)); console.log(JSON.stringify(output)); await browser.close(); process.exitCode = output.exitCode
}
