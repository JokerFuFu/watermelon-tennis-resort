import { memo } from 'react'
import type { ReactNode } from 'react'
import type { MaterialPiece } from './types'
import { MATERIAL_PRESET_BY_ID } from './materialCatalog'

type Point3 = [number, number, number]
interface Props {
  piece: MaterialPiece
  mode: '2d' | '3d'
  projectPoint: (x: number, y: number, z?: number) => [number, number]
  selected?: boolean
}

const tint = (hex: string, amount: number) => {
  const base = hex.replace('#', '')
  const full = base.length === 3 ? base.split('').map(c => c + c).join('') : base
  const channels = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
  return '#' + channels.map(c => Math.round(amount > 0 ? c + (255 - c) * amount : c * (1 + amount)).toString(16).padStart(2, '0')).join('')
}

/** Coordinates stay inside the piece's local box, so dimensions and rotation share one contract. */
function MaterialShapes({ piece, mode, projectPoint, selected = false }: Props) {
  const shape = MATERIAL_PRESET_BY_ID[piece.materialId].shape
  const color = piece.color, light = tint(color, .25), dark = tint(color, -.3)
  const edge = selected ? '#d96857' : tint(color, -.48)
  const is3d = mode === '3d'
  const axes = piece.axisOrder ?? 'xyz'
  const reorder = ([u, v, t]: Point3): Point3 => {
    const source = { x: u, y: v, z: t }
    return axes.split('').map(axis => source[axis as 'x' | 'y' | 'z']) as Point3
  }
  const p = ([u, v, t]: Point3) => {
    const [a, b, c] = reorder([u, v, t])
    const x = a * piece.width, y = b * piece.depth
    return piece.rotation === 90
      ? projectPoint(piece.x + piece.depth - y, piece.y + x, is3d ? piece.z + c * piece.height : 0)
      : projectPoint(piece.x + x, piece.y + y, is3d ? piece.z + c * piece.height : 0)
  }
  const visibleFace = (normal: Point3) => {
    const [a, b, c] = reorder(normal)
    const x = a / piece.width, y = b / piece.depth, z = c / piece.height
    const [nx, ny] = piece.rotation === 90 ? [-y, x] : [x, y]
    return (is3d ? nx + ny + z : z) > 1e-10
  }
  const polygon = (vertices: Point3[], fill = color, props: { opacity?: number; stroke?: string; feature?: string } = {}) => (
    <polygon points={vertices.map(v => p(v).join(',')).join(' ')} fill={fill} stroke={props.stroke ?? edge}
      opacity={props.opacity} vectorEffect="non-scaling-stroke" strokeWidth={.7} strokeLinejoin="round" data-material-feature={props.feature} />
  )
  const line = (vertices: Point3[], stroke = dark, feature?: string) => (
    <polyline points={vertices.map(v => p(v).join(',')).join(' ')} fill="none" stroke={stroke}
      vectorEffect="non-scaling-stroke" strokeWidth={.65} strokeLinejoin="round" strokeLinecap="round" data-material-feature={feature} />
  )
  const prism = (outline: [number, number][], bottom = 0, top = 1, fill = color, opacity = 1) => (
    <g opacity={opacity}>
      {outline.map(([u, v], i) => {
        const [a, b] = outline[(i + 1) % outline.length]
        // Transform outward normals too: standing a board can turn its original edge into its physical top.
        if (!visibleFace([b - v, u - a, 0])) return null
        return <g key={i}>{polygon([[u, v, bottom], [a, b, bottom], [a, b, top], [u, v, top]], i % 2 ? tint(fill, -.22) : tint(fill, -.1))}</g>
      })}
      {visibleFace([0, 0, 1]) && polygon(outline.map(([u, v]) => [u, v, top]), tint(fill, .18))}
    </g>
  )
  const box = (u = 0, v = 0, width = 1, depth = 1, bottom = 0, top = 1, fill = color, opacity = 1) =>
    prism([[u, v], [u + width, v], [u + width, v + depth], [u, v + depth]], bottom, top, fill, opacity)
  const circle = (axis: 'x' | 'y' | 'z', center: Point3, radiusA: number, radiusB: number, n = 24): Point3[] =>
    Array.from({ length: n }, (_, i) => {
      const a = Math.cos(i * Math.PI * 2 / n) * radiusA, b = Math.sin(i * Math.PI * 2 / n) * radiusB
      return axis === 'x' ? [center[0], center[1] + a, center[2] + b]
        : axis === 'y' ? [center[0] + a, center[1], center[2] + b]
          : [center[0] + a, center[1] + b, center[2]]
    })
  const cylinder = (axis: 'x' | 'y' | 'z', start: Point3, end: Point3, a: number, b: number, fill = color) => {
    const from = circle(axis, start, a, b), to = circle(axis, end, a, b)
    const vertical = reorder(axis === 'x' ? [1, 0, 0] : axis === 'y' ? [0, 1, 0] : [0, 0, 1])[2] === 1
    return <g>
      {is3d && from.map((q, i) => <g key={i}>{polygon([q, from[(i + 1) % from.length], to[(i + 1) % to.length], to[i]], i < 12 ? fill : tint(fill, -.2))}</g>)}
      {is3d || vertical ? polygon(to, tint(fill, .18)) : box(0, 0, 1, 1, 0, .5, fill)}
    </g>
  }
  const beam = (cross: [number, number][]) => {
    const front: Point3[] = cross.map(([v, t]) => [1, v, t])
    if (!is3d && reorder([1, 0, 0])[2] === 1) return polygon(front, light, { feature: 'steel-section-symbol' })
    return <g>
      {is3d ? <>
        {cross.map(([v, t], i) => {
          const [a, b] = cross[(i + 1) % cross.length]
          return <g key={i}>{polygon([[0, v, t], [1, v, t], [1, a, b], [0, a, b]], i % 2 ? dark : light)}</g>
        })}
        {polygon(front, light)}
      </> : <>{box()}{line([[0, .22, 1], [1, .22, 1]], dark, 'steel-profile')}{line([[0, .78, 1], [1, .78, 1]])}
        {polygon(cross.map(([v, t]) => [.78 + t * .18, .12 + v * .76, 1]), light, { feature: 'steel-section-symbol' })}
      </>}
    </g>
  }
  let body: ReactNode
  switch (shape) {
    case 'box':
      body = <>{box()}{piece.materialId === 'red-brick' && <>
        {line([[0, .5, 1], [1, .5, 1]], light, 'brick-joint')}
        {line([[.5, 0, 1], [.5, .5, 1]], light)}
        {line([[.25, .5, 1], [.25, 1, 1]], light)}
      </>}</>
      break
    case 'hollowBlock':
      body = <>{box()}{[.24, .62].map((u, i) => <g key={i}>
        {polygon([[u, .24, 1], [u + .2, .24, 1], [u + .2, .76, 1], [u, .76, 1]], dark, { feature: 'hollow-core' })}
        {line([[u, .24, 1], [u, .76, .65], [u + .2, .76, .65]], light)}
      </g>)}</>
      break
    case 'plank':
      body = <>{box()}{[.22, .48, .75].map((v, i) => <g key={i}>
        {line([[.04, v, 1], [.3, v + .06, 1], [.62, v - .06, 1], [.95, v, 1]], dark, 'wood-grain')}
      </g>)}</>
      break
    case 'iBeam':
      body = beam([[0, 0], [1, 0], [1, .16], [.6, .16], [.6, .84], [1, .84], [1, 1], [0, 1], [0, .84], [.4, .84], [.4, .16], [0, .16]])
      break
    case 'angle':
      body = beam([[0, 0], [1, 0], [1, .17], [.17, .17], [.17, 1], [0, 1]])
      break
    case 'channel':
      body = beam([[0, 0], [1, 0], [1, .16], [.17, .16], [.17, .84], [1, .84], [1, 1], [0, 1]])
      break
    case 'squareTube':
      body = <>{box()}{is3d || reorder([1, 0, 0])[2] === 1 ? <>
        {polygon([[1, .18, .18], [1, .82, .18], [1, .82, .82], [1, .18, .82]], dark, { feature: 'tube-opening' })}
        {line([[1, .18, .18], [.75, .18, .18], [.75, .82, .18]], light)}
      </> : <>{line([[0, .18, 1], [1, .18, 1]], dark, 'tube-opening')}{line([[0, .82, 1], [1, .82, 1]])}</>}</>
      break
    case 'tube':
      body = <>{cylinder('x', [0, .5, .5], [1, .5, .5], .5, .5)}
        {is3d || reorder([1, 0, 0])[2] === 1 ? polygon(circle('x', [1, .5, .5], .35, .35), dark, { feature: 'round-opening' })
          : line([[.02, .32, .5], [.98, .32, .5]], light, 'round-opening')}
      </>
      break
    case 'rebar':
      body = <>{cylinder('x', [0, .5, .5], [1, .5, .5], .43, .43)}
        {Array.from({ length: 10 }, (_, i) => <g key={i}>{line([[i / 11, .1, .55], [(i + .6) / 11, .5, .94], [(i + 1) / 11, .9, .55]], light, 'rebar-rib')}</g>)}
      </>
      break
    case 'panel':
      body = <>{box()}{piece.materialId === 'plywood' ? <>
        {[.18, .4, .68].map((v, i) => <g key={i}>{line([[.03, v, 1], [.42, v + .04, 1], [.95, v, 1]], dark, 'plywood-grain')}</g>)}
        {is3d && [.25, .5, .75].map((t, i) => <g key={i}>{line([[0, 1, t], [1, 1, t]], light, 'laminate-layer')}</g>)}
      </> : <>{line([[.03, .03, 1], [.97, .03, 1], [.97, .97, 1]], light, 'panel-edge')}
        {piece.materialId === 'rock-wool' && [.2, .45, .7].map((v, i) => <g key={i}>{line([[.08, v, 1], [.28, v + .12, 1], [.5, v, 1], [.75, v + .12, 1], [.92, v, 1]], dark, 'mineral-fibre')}</g>)}
      </>}</>
      break
    case 'glass':
      body = <>{box(0, 0, 1, 1, 0, 1, color, .35)}
        {line([[.08, .9, 1], [.7, .08, 1]], '#e8faff', 'glass-reflection')}
        {line([[.28, .92, 1], [.9, .1, 1]], '#e8faff')}
      </>
      break
    case 'roofTile': {
      const arch = Array.from({ length: 17 }, (_, i) => [i / 16, .12 + .88 * Math.sin(i / 16 * Math.PI)] as [number, number])
      body = <>{beam([...arch, [1, 0], [0, 0]])}{line([[.05, .1, .39], [.95, .1, .39]], light, 'tile-overlap')}
        {!is3d && line([[0, .5, 1], [1, .5, 1]], dark, 'tile-arch')}
      </>
      break
    }
    case 'corrugated':
      body = <>{Array.from({ length: 8 }, (_, i) => <g key={i}>
        {polygon([[0, i / 8, .12], [1, i / 8, .12], [1, (i + .5) / 8, 1], [0, (i + .5) / 8, 1]], i % 2 ? light : color, { feature: 'corrugation' })}
        {polygon([[0, (i + .5) / 8, 1], [1, (i + .5) / 8, 1], [1, (i + 1) / 8, .12], [0, (i + 1) / 8, .12]], dark)}
      </g>)}</>
      break
    case 'tile':
      body = <>{box()}{line([[.04, .04, 1], [.96, .04, 1], [.96, .96, 1], [.04, .96, 1], [.04, .04, 1]], light, 'tile-bevel')}
        {line([[.13, .86, 1], [.5, .13, 1]], light)}
      </>
      break
    case 'elbow':
      body = <>{prism([[0, .32], [.5, .32], [.5, 0], [1, 0], [1, .5], [.9, .8], [.68, 1], [0, 1]], .12, .88)}
        {line([[0, .5, .88], [.54, .5, .88], [.76, .34, .88], [.76, 0, .88]], light, 'elbow-bend')}
        {is3d && polygon([[.55, 0, .28], [.92, 0, .28], [.92, 0, .72], [.55, 0, .72]], dark, { feature: 'elbow-mouth' })}
      </>
      break
    case 'roll':
      body = <>{cylinder('y', [.5, 0, .5], [.5, 1, .5], .5, .5)}
        {is3d ? <>
          {[.37, .26, .15].map((r, i) => <g key={i}>{polygon(circle('y', [.5, 1, .5], r, r), i % 2 ? color : dark, { feature: 'roll-layer' })}</g>)}
        </> : <>{line([[.3, 0, .8], [.3, 1, .8]], dark, 'roll-layer')}{line([[.68, 0, .8], [.68, 1, .8]], light)}</>}
      </>
      break
    case 'bag':
      body = <>{prism([[.12, 0], [.88, 0], [1, .15], [1, .85], [.88, 1], [.12, 1], [0, .85], [0, .15]], 0, .75)}
        {polygon([[.2, .25, .76], [.8, .25, .76], [.8, .75, .76], [.2, .75, .76]], '#f3ecdb', { feature: 'cement-label' })}
        {[.38, .5, .62].map((v, i) => <g key={i}>{line([[.3, v, .77], [.7, v, .77]], dark)}</g>)}
        {line([[.14, .07, .75], [.86, .07, .75]], light)}
        {line([[.14, .93, .75], [.86, .93, .75]], light)}
      </>
      break
    case 'aggregate':
      body = <>
        {polygon([[0, .45, 0], [.2, 0, 0], [.77, 0, 0], [1, .55, 0], [.8, 1, 0], [.15, 1, 0]], color)}
        {is3d && <>
          {polygon([[0, .45, 0], [.2, 0, 0], [.48, .48, 1]], light)}
          {polygon([[.2, 0, 0], [.77, 0, 0], [1, .55, 0], [.48, .48, 1]], color)}
          {polygon([[1, .55, 0], [.8, 1, 0], [.15, 1, 0], [0, .45, 0], [.48, .48, 1]], dark)}
        </>}
        {Array.from({ length: 22 }, (_, i) => {
          const u = .12 + ((i * 7) % 19) / 25, v = .12 + ((i * 11) % 19) / 25
          const t = is3d ? Math.max(0, 1 - Math.max(Math.abs(u - .48), Math.abs(v - .48)) * 2.1) : 0
          const r = piece.materialId === 'gravel-pile' ? .024 : .008
          return <g key={i}>{polygon([[u - r, v, t], [u, v - r, t], [u + r, v, t], [u, v + r, t]], i % 2 ? light : dark, { stroke: 'none', feature: 'aggregate-grain' })}</g>
        })}
      </>
      break
    case 'bucket':
      body = <>{cylinder('z', [.5, .5, 0], [.5, .5, .92], .46, .46)}
        {polygon(circle('z', [.5, .5, .94], .5, .5), light, { feature: 'bucket-lid' })}
        {line([[.15, .5, .94], [.2, .5, 1], [.8, .5, 1], [.85, .5, .94]], dark, 'bucket-handle')}
        {is3d && polygon([[.3, .95, .22], [.7, .95, .22], [.7, .95, .62], [.3, .95, .62]], '#f0e7d6', { feature: 'paint-label' })}
      </>
      break
    case 'bolt':
      body = <>{is3d || reorder([1, 0, 0])[2] === 1 ? <>
        {cylinder('x', [0, .5, .5], [.76, .5, .5], .21, .21)}
        {[.12, .25, .38, .51, .64].map((u, i) => <g key={i}>{line(circle('x', [u, .5, .5], .22, .22), light, 'bolt-thread')}</g>)}
        {circle('x', [.76, .5, .5], .5, .5, 6).map((q, i, vertices) => {
          const r = vertices[(i + 1) % vertices.length]
          return <g key={i}>{polygon([q, r, [1, r[1], r[2]], [1, q[1], q[2]]], i % 2 ? dark : color)}</g>
        })}
        {polygon(circle('x', [1, .5, .5], .5, .5, 6), light, { feature: 'bolt-head' })}
      </> : <>{box(0, .28, .76, .44, 0, .7)}{box(.76, 0, .24, 1)}
        {line([[.85, .2, 1], [.85, .8, 1]], light, 'bolt-head')}
        {[.12, .25, .38, .51, .64].map((u, i) => <g key={i}>{line([[u, .28, .7], [u + .025, .72, .7]], light, 'bolt-thread')}</g>)}
      </>}</>
      break
    case 'door':
      body = <>{box()}{is3d ? <>
        {polygon([[.1, 1, .08], [.9, 1, .08], [.9, 1, .92], [.1, 1, .92]], light, { feature: 'door-panel' })}
        {line([[.78, 1, .48], [.88, 1, .48]], dark, 'door-handle')}
      </> : <>{line([[.1, .1, 1], [.1, .9, 1], [.9, .9, 1]], dark, 'door-panel')}{line([[.7, .55, 1], [.9, .55, 1]], dark, 'door-handle')}</>}</>
      break
    case 'window':
      body = <>{is3d ? <>
        {box(0, 0, .1, 1)}{box(.9, 0, .1, 1)}{box(.1, 0, .8, 1, 0, .1)}{box(.1, 0, .8, 1, .9, 1)}
        {polygon([[.1, .6, .1], [.9, .6, .1], [.9, .6, .9], [.1, .6, .9]], '#b0d9db', { opacity: .38, feature: 'window-glass' })}
        {box(.47, 0, .06, 1, .1, .9)}
        {line([[.2, .6, .18], [.75, .6, .85]], '#ecfbff')}
      </> : <>{box()}{polygon([[.1, .15, 1], [.9, .15, 1], [.9, .85, 1], [.1, .85, 1]], '#b0d9db', { opacity: .55, feature: 'window-glass' })}
        {line([[.5, .15, 1], [.5, .85, 1]], dark, 'window-mullion')}
      </>}</>
      break
  }
  return <g data-material-piece-id={piece.id} data-material-preset={piece.materialId} data-material-shape={shape} pointerEvents="none">
    <title>{piece.name}</title>{body}
  </g>
}

export default memo(MaterialShapes)
