import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAreaCSV } from './areaExport.ts'
import { createProject } from './model.ts'
import type { Facility } from './types'

function facility(id: string, overrides: Partial<Facility> = {}): Facility {
  return { id, type: 'hotel', name: id, x: 0, y: 0, width: 10.5, depth: 10.2, floors: 3, rooms: 10, unitCost: 100, rotation: 0, ...overrides }
}

test('area export preserves decimal dimensions and separates union coverage from full engineering area', () => {
  const project = createProject('面积导出', 'blank')
  project.siteWidth = 100
  project.siteDepth = 100
  project.facilities = [facility('first'), facility('second', { type: 'landscape', floors: 1, rooms: 0, visible: false, locked: true })]
  const csv = buildAreaCSV(project)
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('"first","酒店客房","10.5","10.2","0","3","107.10","107.10","0.00","321.30"'))
  assert.ok(csv.includes('"second","景观绿地","10.5","10.2","0","1","107.10","107.10","0.00","0.00"'))
  assert.ok(csv.includes('"完整设施占地合计","214.20"'))
  assert.ok(csv.includes('"界内设施占地","107.10"'))
  assert.ok(csv.includes('"未配置用地","9892.90"'))
  assert.ok(csv.includes('"界内重叠区域","107.10"'))
  assert.ok(csv.includes('"界内可用绿地","0.00"'))
  assert.ok(csv.includes('"建筑基底占比（%）","1.07"'))
  assert.ok(csv.includes('"隐藏","锁定"'))
})

test('area export reports rotated clipping, deduplicates outside area, and keeps safe quoted text', () => {
  const project = createProject('=AREA("test")', 'blank')
  project.siteWidth = 20
  project.siteDepth = 20
  project.facilities = [facility('first', { name: '=SUM(1,2)', x: 15, y: 0, width: 10, depth: 20, rotation: 90 }), facility('second', { x: 15, y: 0, width: 10, depth: 20, rotation: 90 })]
  const csv = buildAreaCSV(project)
  assert.ok(csv.includes('"\'=AREA(""test"")"'))
  assert.ok(csv.includes('"\'=SUM(1,2)"'))
  assert.ok(csv.includes('"界内设施占地","50.00"'))
  assert.ok(csv.includes('"界外去重占地","150.00"'))
  assert.ok(csv.includes('"建筑各层面积","1200.00"'))
  assert.ok(csv.includes('"400.00","每项完整占地累加'))
})
