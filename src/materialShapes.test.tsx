import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import MaterialShapes from './MaterialShapes'
import { MATERIAL_PRESETS } from './materialCatalog'
import type { MaterialPiece } from './types'

const makePiece = (preset: typeof MATERIAL_PRESETS[number]): MaterialPiece => ({
  id: 'shape-test-' + preset.id, materialId: preset.id, name: preset.name,
  x: 13.2, y: 17.8, z: 4.1, width: preset.width, depth: preset.depth,
  height: preset.height, rotation: 0, color: preset.color, unitPrice: null,
  priceBasis: preset.priceBasis, taxMode: 'unknown',
  evidence: { kind: 'assumption', name: 'test', scope: 'test' },
})

test('every material renders finite SVG vertices inside edited dimensions in both views and rotations', () => {
  const shapes = new Set(MATERIAL_PRESETS.map(p => p.shape))
  assert.equal(shapes.size, 22)
  let cases = 0
  for (const preset of MATERIAL_PRESETS) {
    for (const mode of ['2d', '3d'] as const) {
      for (const rotation of [0, 90] as const) {
        const piece = Object.freeze({ ...makePiece(preset), rotation, width: preset.width * 1.37, depth: preset.depth * .83, height: preset.height * 1.51 })
        const before = JSON.stringify(piece)
        const coords: [number, number, number][] = []
        const markup = renderToStaticMarkup(<svg><MaterialShapes piece={piece} mode={mode} projectPoint={(x, y, z = 0) => {
          coords.push([x, y, z])
          return mode === '3d' ? [(x - y) * 4, (x + y) * 2 - z * 4] : [x * 4, y * 4]
        }} /></svg>)
        assert.ok(coords.length > 0, preset.id + ' has geometry')
        const w = rotation === 90 ? piece.depth : piece.width, d = rotation === 90 ? piece.width : piece.depth
        for (const [x, y, z] of coords) {
          assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z), preset.id + ' finite')
          assert.ok(x >= piece.x - 1e-9 && x <= piece.x + w + 1e-9, `${preset.id} ${mode} ${rotation}: x inside footprint`)
          assert.ok(y >= piece.y - 1e-9 && y <= piece.y + d + 1e-9, `${preset.id} ${mode} ${rotation}: y inside footprint`)
          assert.ok(mode === '2d' ? z === 0 : z >= piece.z - 1e-9 && z <= piece.z + piece.height + 1e-9, preset.id + ' height within bounds')
        }
        assert.ok(markup.includes(`data-material-shape="${preset.shape}"`))
        assert.ok(markup.includes(`data-material-piece-id="${piece.id}"`))
        assert.ok(markup.includes('pointer-events="none"'))
        assert.ok(!/NaN|Infinity|<image|<script|https?:/.test(markup), preset.id + ' self-contained finite SVG')
        assert.equal(JSON.stringify(piece), before, 'renderer does not mutate source')
        cases++
      }
    }
  }
  assert.equal(cases, MATERIAL_PRESETS.length * 4)
})

test('cross-section symbols distinguish the three structural steel forms in plan view', () => {
  const ids = ['steel-i-beam', 'steel-angle', 'steel-channel']
  const profiles = ids.map(id => {
    const preset = MATERIAL_PRESETS.find(p => p.id === id)!
    const markup = renderToStaticMarkup(<MaterialShapes piece={makePiece(preset)} mode="2d" projectPoint={(x, y) => [x, y]} />)
    assert.ok(markup.includes('steel-section-symbol'))
    return markup.match(/<polygon[^>]*data-material-feature="steel-section-symbol"[^>]*>/)?.[0]
  })
  assert.equal(new Set(profiles).size, 3)
})

test('glass remains translucent and form-specific details survive rendering', () => {
  const expected: Record<string, string> = {
    'hollow-block': 'hollow-core', 'wood-plank': 'wood-grain', 'square-steel-tube': 'tube-opening',
    'round-steel-tube': 'round-opening', rebar: 'rebar-rib', 'glass-panel': 'glass-reflection',
    'color-steel-sheet': 'corrugation', 'pipe-elbow': 'elbow-mouth', 'waterproof-roll': 'roll-layer',
    'cement-bag': 'cement-label', 'sand-pile': 'aggregate-grain', 'paint-bucket': 'bucket-handle',
    bolt: 'bolt-head', 'door-panel': 'door-handle', 'window-frame': 'window-glass',
  }
  for (const [id, feature] of Object.entries(expected)) {
    const preset = MATERIAL_PRESETS.find(p => p.id === id)!
    const markup = renderToStaticMarkup(<MaterialShapes piece={makePiece(preset)} mode="3d" projectPoint={(x, y, z = 0) => [x - y, x + y - z]} />)
    assert.ok(markup.includes(feature), id + ' shows its common physical feature')
    if (id === 'glass-panel') assert.ok(markup.includes('opacity="0.35"'))
  }
})

test('edited color and selection apply without external style dependencies', () => {
  const preset = MATERIAL_PRESETS.find(p => p.id === 'custom-block')!
  const piece = { ...makePiece(preset), color: '#123456' }
  const render = (selected: boolean) => renderToStaticMarkup(<MaterialShapes piece={piece} mode="3d" selected={selected} projectPoint={(x, y, z = 0) => [x - y, x + y - z]} />)
  assert.notEqual(render(false), render(true))
  assert.ok(render(true).includes('#d96857'))
})

test('all six axis orders preserve edited physical bounds under both rotations and views', () => {
  const orders = ['xyz', 'xzy', 'yxz', 'yzx', 'zxy', 'zyx'] as const
  let cases = 0
  for (const preset of MATERIAL_PRESETS) {
    for (const axisOrder of orders) {
      const source = { x: preset.width, y: preset.depth, z: preset.height }
      const [width, depth, height] = axisOrder.split('').map(axis => source[axis as keyof typeof source])
      for (const mode of ['2d', '3d'] as const) {
        for (const rotation of [0, 90] as const) {
          const piece = Object.freeze({ ...makePiece(preset), width, depth, height, rotation, axisOrder })
          const coords: [number, number, number][] = []
          const markup = renderToStaticMarkup(<MaterialShapes piece={piece} mode={mode} projectPoint={(x, y, z = 0) => {
            coords.push([x, y, z]); return [x - y, x + y - z]
          }} />)
          const w = rotation === 90 ? depth : width, d = rotation === 90 ? width : depth
          assert.ok(coords.length > 0)
          for (const [x, y, z] of coords) {
            const label = `${preset.id}/${axisOrder}/${mode}/${rotation}`
            assert.ok([x, y, z].every(Number.isFinite), label + ' finite')
            assert.ok(x >= piece.x - 1e-9 && x <= piece.x + w + 1e-9, label + ' physical x')
            assert.ok(y >= piece.y - 1e-9 && y <= piece.y + d + 1e-9, label + ' physical y')
            assert.ok(mode === '2d' ? z === 0 : z >= piece.z - 1e-9 && z <= piece.z + height + 1e-9, label + ' physical z')
          }
          assert.ok(!/NaN|Infinity/.test(markup))
          cases++
        }
      }
    }
  }
  assert.equal(cases, MATERIAL_PRESETS.length * 24)
})

test('omitting axisOrder gives exactly the legacy xyz rendering', () => {
  const piece = makePiece(MATERIAL_PRESETS[0])
  const render = (p: MaterialPiece) => renderToStaticMarkup(<MaterialShapes piece={p} mode="3d" projectPoint={(x, y, z = 0) => [x - y, x + y - z]} />)
  assert.equal(render(piece), render({ ...piece, axisOrder: 'xyz' }))
})

test('standing beam and pipe retain actual cross sections in plan view', () => {
  for (const id of ['steel-i-beam', 'steel-angle', 'steel-channel', 'round-steel-tube']) {
    const preset = MATERIAL_PRESETS.find(p => p.id === id)!
    const piece: MaterialPiece = { ...makePiece(preset), axisOrder: 'zyx', width: preset.height, height: preset.width }
    const markup = renderToStaticMarkup(<MaterialShapes piece={piece} mode="2d" projectPoint={(x, y) => [x, y]} />)
    assert.ok(markup.includes(id === 'round-steel-tube' ? 'round-opening' : 'steel-section-symbol'))
    const firstPolygon = markup.match(/<polygon points="([^"]+)"/)
    assert.ok(firstPolygon, id + ' has a physical top face')
    const points = firstPolygon[1].split(' ').map(pair => pair.split(',').map(Number))
    assert.ok(Math.max(...points.map(p => p[0])) - Math.min(...points.map(p => p[0])) > 0, id + ' noncollapsed x')
    assert.ok(Math.max(...points.map(p => p[1])) - Math.min(...points.map(p => p[1])) > 0, id + ' noncollapsed y')
  }
})

test('standing board still has its narrow physical top rather than losing faces', () => {
  const preset = MATERIAL_PRESETS.find(p => p.id === 'plywood')!
  const piece: MaterialPiece = { ...makePiece(preset), axisOrder: 'xzy', depth: preset.height, height: preset.depth }
  const coords: [number, number][] = []
  const markup = renderToStaticMarkup(<MaterialShapes piece={piece} mode="2d" projectPoint={(x, y) => {
    coords.push([x, y]); return [x, y]
  }} />)
  assert.ok(markup.includes('<polygon'))
  assert.ok(Math.abs(Math.max(...coords.map(p => p[0])) - Math.min(...coords.map(p => p[0])) - preset.width) < 1e-9)
  assert.ok(Math.abs(Math.max(...coords.map(p => p[1])) - Math.min(...coords.map(p => p[1])) - preset.height) < 1e-9)
})
