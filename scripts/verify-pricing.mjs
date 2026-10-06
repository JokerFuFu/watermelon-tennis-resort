import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

// All mutations occur through controls in a fresh browser context. Storage,
// persisted prices, geometry and rendered totals are inspected read-only.
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
const button = name => page.getByRole('button', { name, exact: true })
const dialog = () => page.getByRole('dialog')
const number = (name, root = page) => root.getByRole('spinbutton', { name, exact: true })
const text = (name, root = page) => root.getByRole('textbox', { name, exact: true })
const active = () => page.evaluate(() => JSON.parse(localStorage.getItem('courtside-projects-v1')).find(p => p.id === localStorage.getItem('courtside-active-v1')))
const facility = async id => (await active()).facilities.find(f => f.id === id)
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100
function quantity(item, f) {
  switch (item.basis) {
    case 'grossArea': return f.width * f.depth * ((f.type === 'hotel' || f.type === 'restaurant') ? f.floors : 1)
    case 'footprint': return f.width * f.depth
    case 'rooms': return f.rooms
    case 'perimeter': return 2 * (f.width + f.depth)
    case 'count': return 1
    case 'manual': return item.quantity
    default: throw new Error('Unknown pricing basis: ' + item.basis)
  }
}
function amount(f) {
  if (!f.pricing) return f.type === 'court' ? f.unitCost : f.width * f.depth * ((f.type === 'hotel' || f.type === 'restaurant') ? f.floors : 1) * f.unitCost
  if (f.pricing.mode === 'quotation') {
    const q = f.pricing.quote
    return cents(q.amount * (q.taxMode === 'excluded' && q.taxRate !== undefined ? 1 + q.taxRate / 100 : 1))
  }
  return cents(f.pricing.items.reduce((sum, item) => sum + cents(quantity(item, f) * item.unitPrice * (item.taxMode === 'excluded' && item.taxRate !== undefined ? 1 + item.taxRate / 100 : 1)), 0))
}
async function settled() {
  await page.waitForFunction(() => !document.querySelector('.save-status.pending'))
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}
async function check(name, action) {
  try { await action(); results.push(name); console.log('PASS ' + name); return true }
  catch (error) {
    const trace = String(error.stack || error).split('\n')
    const position = trace.find(line => line.includes('verify-pricing.mjs:'))?.trim() || 'scripts/verify-pricing.mjs'
    failures.push({ name, assertion: String(error.message || error), position, keyLines: trace.slice(0, 20) })
    console.error('FAIL ' + name + '\n' + trace.slice(0, 20).join('\n'))
    await page.screenshot({ path: `test-results/pricing-failure-${failures.length}.png`, fullPage: false }).catch(() => {})
    return false
  }
}
async function nav(name) { await page.locator('.desktop-nav').getByRole('button', { name, exact: true }).click() }
async function locate(id) {
  await nav('场地设计'); await button('设施管理').click()
  await page.locator(`[data-manager-id="${id}"] .fm-location`).click(); await settled()
}
async function download(action, filename) {
  const pending = page.waitForEvent('download'); await action(); const d = await pending
  const path = `test-results/${filename}`; await d.saveAs(path); return readFileSync(path, 'utf8')
}
async function createBlank() {
  await button('切换项目').click(); await button('新建项目').click()
  await text('项目名称', dialog()).fill('西瓜预算 2.2 隔离验收')
  await dialog().getByRole('button', { name: /空白场地/ }).click(); await button('创建方案').click()
}
async function editPricing(f) {
  await nav('投资估算')
  await button('编辑' + f.name + '计价明细').click(); await dialog().waitFor()
}
async function savePricing() { await dialog().getByRole('button', { name: '保存计价明细', exact: true }).click(); await dialog().waitFor({ state: 'hidden' }); await settled() }
async function assertRenderedFacility(id, expected) {
  const actual = Number(await page.locator(`[data-cost-facility="${id}"]`).getAttribute('data-cost-point'))
  assert.ok(Math.abs(actual - expected) < .011, `Rendered facility ${id}: expected ${expected}, got ${actual}`)
}
async function assertKnownTotal(expected) {
  const actual = Number(await page.locator('[data-budget-total]').getAttribute('data-budget-total'))
  assert.ok(Math.abs(actual - expected) < .011, `Rendered project total: expected ${expected}, got ${actual}`)
}
function knownTotal(project) {
  const e = cents(project.facilities.reduce((sum, f) => sum + amount(f), 0))
  const b = project.budget || { designRate: 3, supervisionRate: 1, reserveRate: 10, landAmount: null, siteAmount: null, connectionAmount: null, openingAmount: null }
  const d = cents(e * b.designRate / 100), s = cents(e * b.supervisionRate / 100)
  const r = cents((e + d + s + (b.siteAmount || 0) + (b.connectionAmount || 0)) * b.reserveRate / 100)
  return cents(e + d + s + r + (b.landAmount || 0) + (b.siteAmount || 0) + (b.connectionAmount || 0) + (b.openingAmount || 0))
}
let hotel, court, hotelBaseline, courtBaseline, archive
try {
  await page.goto(url)
  await button('更多设施').waitFor()
  const setup = await check('UI creates isolated legacy-price project without touching another browser context', async () => {
    await createBlank()
    await button('添加酒店客房').click(); await settled(); hotel = (await active()).facilities.at(-1)
    await number('宽度').fill('10'); await number('进深').fill('20'); await settled()
    await button('添加网球场').click(); await settled(); court = (await active()).facilities.at(-1)
    await nav('客房规划'); await number(hotel.name + '客房数量').fill('10'); await number(hotel.name + '楼层').fill('2'); await settled()
    await nav('投资估算'); await number(hotel.name + '参考单价').fill('100'); await number(court.name + '参考单价').fill('200000'); await settled()
    hotel = await facility(hotel.id); court = await facility(court.id)
    assert.equal(hotel.pricing, undefined); assert.equal(court.pricing, undefined)
    assert.equal(amount(hotel), 40000); assert.equal(amount(court), 200000)
    await assertRenderedFacility(hotel.id, 40000); await assertRenderedFacility(court.id, 200000)
    await assertKnownTotal(274560)
    hotelBaseline = amount(hotel); courtBaseline = amount(court)
  })
  if (!setup) throw new Error('Setup failed; dependent pricing checks cannot run.')

  await check('opening and cancelling a component draft preserves legacy rates and saved project', async () => {
    const before = await active(); await editPricing(hotel)
    await dialog().getByRole('button', { name: '从原综合价生成分项草案', exact: true }).click()
    assert.equal(await dialog().locator('.ce-price-item').count(), 4)
    assert.match(await dialog().textContent(), /内部假设/)
    await dialog().getByRole('button', { name: '取消', exact: true }).click()
    assert.deepEqual(await active(), before)
  })
  await check('applying hotel and court component drafts retains exact original engineering amounts', async () => {
    for (const f of [hotel, court]) {
      await editPricing(f); await dialog().getByRole('button', { name: '从原综合价生成分项草案', exact: true }).click(); await savePricing()
      const saved = await facility(f.id); assert.equal(saved.pricing.mode, 'items'); assert.ok(saved.pricing.items.length >= 3)
      assert.equal(saved.unitCost, f.unitCost); assert.ok(saved.pricing.items.every(item => item.evidence.kind === 'assumption'))
      assert.ok(Math.abs(amount(saved) - (f.id === hotel.id ? hotelBaseline : courtBaseline)) < .011)
      await assertRenderedFacility(f.id, amount(saved))
    }
    await assertKnownTotal(274560)
  })
  await check('hotel room change increases only the furniture quantity, leaving persisted component unit rates intact', async () => {
    const before = await facility(hotel.id); const rates = before.pricing.items
    const furniture = rates.find(item => item.basis === 'rooms'); assert.ok(furniture, 'Hotel needs room-priced furniture')
    await nav('客房规划'); await number(hotel.name + '客房数量').fill('12'); await settled()
    const after = await facility(hotel.id); assert.equal(after.rooms, 12); assert.deepEqual(after.pricing.items, rates)
    assert.equal(amount(after), cents(amount(before) + furniture.unitPrice * 2))
    await nav('投资估算'); await assertRenderedFacility(hotel.id, amount(after)); await assertKnownTotal(knownTotal(await active()))
  })
  await check('court width updates area and fence quantities while fixed lighting equipment stays unchanged', async () => {
    const before = await facility(court.id), rows = before.pricing.items
    assert.ok(rows.some(item => item.basis === 'footprint')); assert.ok(rows.some(item => item.basis === 'perimeter'))
    assert.ok(rows.some(item => item.basis === 'manual'))
    await locate(court.id); await number('宽度').fill('20'); await settled()
    const after = await facility(court.id); assert.equal(after.width, 20); assert.deepEqual(after.pricing.items, rows)
    assert.ok(amount(after) > amount(before)); assert.equal(quantity(rows.find(item => item.basis === 'manual'), after), quantity(rows.find(item => item.basis === 'manual'), before))
    await nav('投资估算'); await assertRenderedFacility(court.id, amount(after)); await assertKnownTotal(knownTotal(await active()))
  })
  await check('invalid low / adopted / high unit-price order cannot replace valid stored pricing', async () => {
    const before = await facility(hotel.id); await editPricing(hotel)
    const adopted = before.pricing.items[0].unitPrice
    await number('费用项1低位单价', dialog()).fill(String(adopted + 1))
    await dialog().getByRole('button', { name: '保存计价明细', exact: true }).click()
    assert.equal(await dialog().isVisible(), true); await dialog().getByRole('alert').waitFor()
    assert.deepEqual(await facility(hotel.id), before)
    await dialog().getByRole('button', { name: '取消', exact: true }).click()
  })
  await check('supplier quotation requires supplier, date and scope before application', async () => {
    const before = await facility(court.id); await editPricing(court)
    await dialog().getByRole('button', { name: '供应商总报价', exact: true }).click()
    await number('供应商报价总额', dialog()).fill('100000')
    for (const missing of ['供应商名称', '报价日期', '报价包含范围']) {
      const values = { 供应商名称: '验收供应商', 报价日期: '2026-09-01', 报价包含范围: '基础、面层、围网、照明、安装，土地费用另计' }
      for (const [key, value] of Object.entries(values)) await dialog().locator(`input[aria-label="${key}"]`).fill(key === missing ? '' : value)
      await dialog().getByRole('button', { name: '保存计价明细', exact: true }).click()
      assert.equal(await dialog().isVisible(), true); assert.deepEqual(await facility(court.id), before)
    }
    await dialog().getByRole('button', { name: '取消', exact: true }).click()
  })
  await check('supplier total replaces existing components and adds known excluded tax exactly once', async () => {
    const before = await facility(court.id); await editPricing(court)
    await dialog().getByRole('button', { name: '供应商总报价', exact: true }).click()
    await number('供应商报价总额', dialog()).fill('100000'); await text('供应商名称', dialog()).fill('验收供应商')
    await dialog().locator('input[aria-label="报价日期"]').fill('2020-01-01')
    await text('报价包含范围', dialog()).fill('基础、面层、围网、照明、安装，土地费用另计')
    await dialog().getByRole('combobox', { name: '报价税口径', exact: true }).selectOption('excluded')
    await number('报价税率', dialog()).fill('9'); await savePricing()
    const after = await facility(court.id); assert.equal(after.pricing.mode, 'quotation'); assert.equal(amount(after), 109000)
    assert.deepEqual(after.pricing.items, before.pricing.items); assert.equal(after.unitCost, before.unitCost)
    await assertRenderedFacility(court.id, 109000)
    await assertKnownTotal(knownTotal(await active()))
    assert.match(await page.locator(`[data-cost-facility="${court.id}"]`).textContent(), /用户|报价/)
    assert.match(await page.locator('.budget-page').textContent(), /90 天|90天/)
  })
  await check('quote-to-items-to-quote switch restores all valid unit rates, quantities, evidence and quotation fields', async () => {
    const before = await facility(court.id); await editPricing(court)
    await dialog().getByRole('button', { name: '分项工程量', exact: true }).click()
    assert.equal(await dialog().locator('.ce-price-item').count(), before.pricing.items.length)
    for (const [index, item] of before.pricing.items.entries()) {
      assert.equal(Number(await number(`费用项${index + 1}单价`, dialog()).inputValue()), item.unitPrice)
      assert.equal(Number(await number(`费用项${index + 1}低位单价`, dialog()).inputValue()), item.lowUnitPrice)
      assert.equal(Number(await number(`费用项${index + 1}高位单价`, dialog()).inputValue()), item.highUnitPrice)
      if (item.basis === 'manual') assert.equal(Number(await number(`费用项${index + 1}工程量`, dialog()).inputValue()), item.quantity)
      const evidence = dialog().locator('.ce-evidence').nth(index); await evidence.locator('summary').click()
      assert.equal(await text(`费用项${index + 1}来源名称`, dialog()).inputValue(), item.evidence.name)
      assert.equal(await text(`费用项${index + 1}包含范围`, dialog()).inputValue(), item.evidence.scope)
    }
    await savePricing(); const itemMode = await facility(court.id)
    assert.equal(itemMode.pricing.mode, 'items'); assert.deepEqual(itemMode.pricing.items, before.pricing.items); assert.deepEqual(itemMode.pricing.quote, before.pricing.quote)
    assert.notEqual(amount(itemMode), amount(before)); await assertRenderedFacility(court.id, amount(itemMode)); await assertKnownTotal(knownTotal(await active()))
    await editPricing(court); await dialog().getByRole('button', { name: '供应商总报价', exact: true }).click()
    assert.equal(await text('供应商名称', dialog()).inputValue(), before.pricing.quote.supplier)
    assert.equal(Number(await number('供应商报价总额', dialog()).inputValue()), before.pricing.quote.amount)
    assert.equal(Number(await number('报价税率', dialog()).inputValue()), before.pricing.quote.taxRate)
    assert.equal(await dialog().locator('input[aria-label="报价日期"]').inputValue(), before.pricing.quote.date)
    assert.equal(await text('报价包含范围', dialog()).inputValue(), before.pricing.quote.scope)
    await savePricing(); assert.deepEqual((await facility(court.id)).pricing, before.pricing)
    await assertRenderedFacility(court.id, 109000); await assertKnownTotal(knownTotal(await active()))
  })
  await check('invalid unsaved item draft does not block quote save and retains last valid component prices and evidence', async () => {
    const before = await facility(court.id); await editPricing(court)
    await dialog().getByRole('button', { name: '分项工程量', exact: true }).click()
    await number('费用项1单价', dialog()).fill('')
    await dialog().locator('.ce-evidence').first().locator('summary').click()
    await text('费用项1来源名称', dialog()).fill('')
    await dialog().getByRole('button', { name: '供应商总报价', exact: true }).click(); await savePricing()
    const after = await facility(court.id); assert.deepEqual(after.pricing, before.pricing)
    await assertRenderedFacility(court.id, 109000); await assertKnownTotal(knownTotal(await active()))
  })
  await check('invalid unsaved quote draft does not block component save and retains last valid supplier quotation', async () => {
    const before = await facility(court.id); await editPricing(court)
    await number('供应商报价总额', dialog()).fill(''); await text('供应商名称', dialog()).fill('')
    await dialog().locator('input[aria-label="报价日期"]').fill('')
    await dialog().getByRole('button', { name: '分项工程量', exact: true }).click(); await savePricing()
    const after = await facility(court.id); assert.equal(after.pricing.mode, 'items'); assert.deepEqual(after.pricing.items, before.pricing.items); assert.deepEqual(after.pricing.quote, before.pricing.quote)
    await assertRenderedFacility(court.id, amount(after)); await assertKnownTotal(knownTotal(await active()))
    await editPricing(court); await dialog().getByRole('button', { name: '供应商总报价', exact: true }).click(); await savePricing()
    assert.deepEqual((await facility(court.id)).pricing, before.pricing); await assertRenderedFacility(court.id, 109000)
  })
  await check('unknown quote tax rate remains unresolved instead of silently adding a default rate', async () => {
    await editPricing(court); await number('报价税率', dialog()).fill(''); await savePricing()
    const saved = await facility(court.id); assert.equal(saved.pricing.quote.taxRate, undefined); assert.equal(amount(saved), 100000)
    await assertRenderedFacility(court.id, 100000)
    assert.match(await page.locator('.budget-page').textContent(), /税.*未|未.*税/)
    await editPricing(court); await number('报价税率', dialog()).fill('9'); await savePricing()
  })
  await check('project fees and separately supplied amounts use the disclosed reserve base', async () => {
    for (const [name, value] of [['设计费率', 2], ['监理费率', 1], ['预备费率', 5], ['土地费用', 50000], ['场地工程费用', 1000], ['市政接入费用', 2000], ['开办费用', 4000]]) {
      await number(name).fill(String(value)); await number(name).press('Tab')
    }
    await settled(); const p = await active()
    assert.equal(p.budget.designRate, 2); assert.equal(p.budget.reserveRate, 5)
    assert.equal(p.budget.landAmount, 50000); assert.equal(p.budget.siteAmount, 1000); assert.equal(p.budget.connectionAmount, 2000); assert.equal(p.budget.openingAmount, 4000)
    await assertKnownTotal(knownTotal(p))
  })
  await check('blank supplemental amount persists null while explicit zero means included zero', async () => {
    await number('土地费用').fill(''); await number('土地费用').press('Tab'); await settled()
    assert.equal((await active()).budget.landAmount, null); await assertKnownTotal(knownTotal(await active()))
    assert.match(await page.locator('.ce-missing').textContent(), /土地/)
    await number('土地费用').fill('0'); await number('土地费用').press('Tab'); await settled()
    assert.equal((await active()).budget.landAmount, 0)
    assert.doesNotMatch(await page.locator('.ce-missing').textContent(), /土地费用/)
    await assertKnownTotal(knownTotal(await active()))
  })
  await check('locked facility prevents both legacy and component price edits', async () => {
    await locate(hotel.id); await button('锁定' + hotel.name).click(); await settled(); assert.equal((await facility(hotel.id)).locked, true)
    const before = await facility(hotel.id); await nav('投资估算')
    assert.equal(await button('编辑' + hotel.name + '计价明细').isDisabled(), true); assert.deepEqual(await facility(hotel.id), before)
    await locate(hotel.id); await button('解锁' + hotel.name).click(); await settled()
  })
  await check('save and actual reload preserve component prices, quote evidence, tax and project fees', async () => {
    await nav('投资估算'); const before = await active(); await button('保存方案').click(); await page.reload(); await page.getByTestId('project-estimate-total').waitFor()
    assert.deepEqual(await active(), before); await nav('投资估算'); await assertKnownTotal(knownTotal(before))
  })
  await check('downloaded JSON roundtrip restores all facility pricing and budget settings', async () => {
    const before = await active(); await button('导出方案').click()
    archive = JSON.parse(await download(() => button('方案文件 (.json)').click(), 'pricing-project.json'))
    assert.deepEqual(archive.facilities, before.facilities); assert.deepEqual(archive.budget, before.budget)
    await page.locator('input[type=file]').setInputFiles({ name: 'pricing-roundtrip.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(archive)) })
    await page.getByRole('status').filter({ hasText: '已导入' }).waitFor(); await settled()
    const restored = await active(); assert.notEqual(restored.id, before.id); assert.deepEqual(restored.facilities, before.facilities); assert.deepEqual(restored.budget, before.budget)
    await nav('投资估算'); await assertKnownTotal(knownTotal(restored))
  })
  await check('CSV contains component quantities, evidence, quote tax and a known subtotal equal to the page', async () => {
    const project = await active(); const csv = await download(() => button('导出估算表').click(), 'pricing-estimate.csv')
    for (const label of [project.facilities[0].pricing.items[0].label, '验收供应商', '2020-01-01', '未独立核验', '规划', '税', '设计', '监理', '预备']) assert.ok(csv.includes(label), `CSV missing ${label}`)
    assert.ok(csv.includes('109000'), 'CSV missing tax-adjusted quote amount')
    assert.ok(csv.includes(String(knownTotal(project))), `CSV known total does not match ${knownTotal(project)}`)
    await assertKnownTotal(knownTotal(project))
  })
  await check('mobile pricing page and editable quote modal fit 390 px viewport', async () => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(new URL('/mobile', url).href); await button('更多设施').waitFor()
    if (await button('返回项目导航').count()) await button('返回项目导航').click()
    await button('打开菜单').click(); await page.locator('.main-nav').getByRole('button', { name: '投资估算', exact: true }).click()
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await button('编辑' + court.name + '计价明细').click(); await dialog().waitFor()
    const bounds = await dialog().boundingBox(); assert.ok(bounds.width <= 390); assert.ok(bounds.x >= 0); assert.ok(bounds.x + bounds.width <= 390)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: 'test-results/pricing-mobile.png', fullPage: false })
    await dialog().getByRole('button', { name: '取消', exact: true }).click()
    await page.setViewportSize({ width: 1512, height: 982 }); await page.goto(url); await button('更多设施').waitFor(); await nav('投资估算')
    await page.screenshot({ path: 'test-results/pricing-desktop.png', fullPage: true })
  })
  await check('no runtime errors occurred across draft, quote, save, import, export and mobile flows', async () => { assert.deepEqual(runtimeErrors, []) })
} catch (error) {
  await check('pricing acceptance setup', async () => { throw error })
} finally {
  const report = { total: results.length + failures.length + skipped.length, passed: results.length, failed: failures.length, skipped: skipped.length, checks: results, failures, runtimeErrors, exitCode: failures.length ? 1 : 0 }
  writeFileSync('test-results/pricing-results.json', JSON.stringify(report, null, 2))
  console.log(`Pricing acceptance: total ${report.total}, passed ${report.passed}, failed ${report.failed}, skipped ${report.skipped}; exit ${report.exitCode}`)
  await browser.close()
  process.exitCode = report.exitCode
}
