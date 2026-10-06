import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { Facility, Project, MaterialPiece } from './types'
import { getFacilityLabel, getFacilityPreset } from './facilityCatalog'
import MaterialShapes from './MaterialShapes'
import FacilityDimensions from './FacilityDimensions'
import { materialBounds, materialObstacles } from './materials'
import { moveFacilitySelection } from './facilitySelection'

interface SiteCanvasProps {
  project: Project
  selectedId: string | null
  selectedIds?: readonly string[]
  onSelect: (id: string | null, additive?: boolean) => void
  onMove: (id: string, x: number, y: number) => void
  onMoveSelection?: (ids: readonly string[], dx: number, dy: number) => void
  mode: '3d' | '2d'
  zoom: number
  showLabels: boolean
  showGrid: boolean
  showMeasurements?: boolean
  tool: 'select' | 'move'
  onZoomChange?: (zoom: number) => void
  resetToken?: number
  focusId?: string | null
  focusToken?: number
  focusSelectionIds?: readonly string[]
  focusSelectionToken?: number
  snapToGrid?: boolean
  svgId?: string
  interactive?: boolean
  onSelectMaterial?: (id:string)=>void
}
export const MIN_CANVAS_ZOOM = .25
export const MAX_CANVAS_ZOOM = 16
type Point = [number, number]
type Gesture = { kind: 'facility'; id: string; ids: readonly string[]; members: Facility[]; start: Point; origin: Point; delta: Point; pointer: number } | { kind: 'pan'; start: Point; origin: Point; pointer: number }
const dimensions = (f: Facility): Point => f.rotation === 90 ? [f.depth, f.width] : [f.width, f.depth]
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n))
const leisurePresetIds = new Set(['card-room', 'mahjong-room', 'billiards-room', 'board-game-room', 'reading-lounge', 'tea-lounge'])

export default function SiteCanvas({ project, selectedId, selectedIds, onSelect, onMove, onMoveSelection, mode, zoom, showLabels, showGrid, showMeasurements = false, tool, onZoomChange, resetToken, focusId, focusToken, focusSelectionIds, focusSelectionToken, snapToGrid = false, svgId = 'site-plan-svg', interactive = true, onSelectMaterial }: SiteCanvasProps) {
  const gridId = `${svgId}-dot-grid`, lawnId = `${svgId}-lawn`
  const svgRef = useRef<SVGSVGElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const [pan, setPan] = useState<Point>([0, 0])
  const [preview, setPreview] = useState<Map<string, Facility> | null>(null)
  const selectionIds = selectedIds ?? (selectedId ? [selectedId] : [])
  const selection = new Set(selectionIds)
  useEffect(() => { setPan([0, 0]); cancel() }, [mode, project.id, resetToken])
  const is3d = mode === '3d'
  const scale = clamp(zoom, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
  const W = project.siteWidth, D = project.siteDepth
  const p = useCallback((x: number, y: number, z = 0): Point => is3d ? [(x - y) * 4, (x + y) * 2 - z * 4] : [x * 4, y * 4],[is3d])
  const points = (list: Point[]) => list.map(a => a.join(',')).join(' ')
  const quad = (x: number, y: number, w: number, d: number, z = 0) => points([p(x, y, z), p(x + w, y, z), p(x + w, y + d, z), p(x, y + d, z)])
  const maxHeight = Math.max(12, ...project.facilities.map(f => Math.min(f.floors, 30) * 3.1), ...(project.materials??[]).map(piece=>piece.z+piece.height))
  const bounds = is3d ? [-D * 4 - 66, -maxHeight * 4 - 46, (W + D) * 4 + 132, (W + D) * 2 + maxHeight * 4 + 130] : [-50, -50, W * 4 + 100, D * 4 + 100]
  const center: Point = [bounds[0] + bounds[2] / 2, bounds[1] + bounds[3] / 2]
  const svgPoint = (clientX: number, clientY: number): Point => {
    const svg = svgRef.current
    if (!svg) return [0, 0]
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY
    const matrix = svg.getScreenCTM()
    if (!matrix) return [0, 0]
    const q = pt.matrixTransform(matrix.inverse())
    return [q.x, q.y]
  }
  const groundPoint = (raw: Point): Point => {
    const x = (raw[0] - pan[0] - center[0]) / scale + center[0]
    const y = (raw[1] - pan[1] - center[1]) / scale + center[1]
    return is3d ? [(y / 2 + x / 4) / 2, (y / 2 - x / 4) / 2] : [x / 4, y / 4]
  }
  const cancel = () => {
    const active = gesture.current
    gesture.current = null; setPreview(null)
    if (active && svgRef.current?.hasPointerCapture(active.pointer)) svgRef.current.releasePointerCapture(active.pointer)
  }
  const validMembers = (g: Extract<Gesture, { kind: 'facility' }>) => g.members.every(original => {
    const current = project.facilities.find(f => f.id === original.id)
    return current && !current.locked && current.visible !== false && current.x === original.x && current.y === original.y && current.width === original.width && current.depth === original.depth && current.rotation === original.rotation
  })
  useEffect(() => {
    const active = gesture.current
    if (active?.kind === 'facility' && (!interactive || tool !== 'select' || !validMembers(active) || active.ids.length !== selection.size || active.ids.some(id => !selection.has(id)))) cancel()
  }, [project.facilities, interactive, tool, selectionIds.join('|')])
  useEffect(() => {
    const esc = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) {
        event.preventDefault(); event.stopImmediatePropagation(); cancel()
      }
    }
    window.addEventListener('keydown', esc, true)
    return () => window.removeEventListener('keydown', esc, true)
  }, [])
  const beginFacility = (e: ReactPointerEvent<SVGGElement>, f: Facility) => {
    if (!interactive || e.button !== 0 || tool === 'move') return
    e.stopPropagation()
    if (e.shiftKey) { cancel(); onSelect(f.id, true); return }
    const ids = selection.has(f.id) ? [...selectionIds] : [f.id]
    if (!selection.has(f.id)) onSelect(f.id)
    const members = ids.map(id => project.facilities.find(item => item.id === id))
    if (members.some(item => !item || item.locked || item.visible === false) || (ids.length > 1 && !onMoveSelection)) return
    e.preventDefault()
    const start = groundPoint(svgPoint(e.clientX, e.clientY))
    gesture.current = { kind: 'facility', id: f.id, ids, members: members as Facility[], start, origin: [f.x, f.y], delta: [0, 0], pointer: e.pointerId }
    svgRef.current?.setPointerCapture(e.pointerId)
  }
  const beginCanvas = (e: ReactPointerEvent<SVGSVGElement>) => {
    if (!interactive || (e.button !== 0 && e.button !== 1)) return
    if (tool === 'move' || e.button === 1) {
      e.preventDefault()
      gesture.current = { kind: 'pan', start: svgPoint(e.clientX, e.clientY), origin: pan, pointer: e.pointerId }
      e.currentTarget.setPointerCapture(e.pointerId)
    } else if (e.target === e.currentTarget || (e.target as Element).getAttribute('data-ground') === 'true') onSelect(null)
  }
  const move = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g || e.pointerId !== g.pointer) return
    const raw = svgPoint(e.clientX, e.clientY)
    if (g.kind === 'pan') { setPan([g.origin[0] + raw[0] - g.start[0], g.origin[1] + raw[1] - g.start[1]]); return }
    if (!validMembers(g)) { cancel(); return }
    const next = groundPoint(raw)
    const precision = snapToGrid ? 1 : 10
    const dx = Math.round((g.origin[0] + next[0] - g.start[0]) * precision) / precision - g.origin[0]
    const dy = Math.round((g.origin[1] + next[1] - g.start[1]) * precision) / precision - g.origin[1]
    const result = moveFacilitySelection(project, g.ids, dx, dy)
    if (!result.ok) { cancel(); return }
    g.delta = [result.dx, result.dy]
    setPreview(new Map(result.facilities.filter(item => g.ids.includes(item.id)).map(item => [item.id, item])))
  }
  const finish = (e: ReactPointerEvent<SVGSVGElement>) => {
    const g = gesture.current
    if (!g || g.pointer !== e.pointerId) return
    if (g.kind === 'facility' && validMembers(g) && (g.delta[0] !== 0 || g.delta[1] !== 0)) {
      if (g.ids.length > 1) onMoveSelection?.(g.ids, g.delta[0], g.delta[1])
      else onMove(g.id, g.origin[0] + g.delta[0], g.origin[1] + g.delta[1])
    }
    gesture.current = null; setPreview(null)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }
  useEffect(() => {
    const svg = svgRef.current
    if (!svg || !onZoomChange || !interactive) return
    const wheel = (event: WheelEvent) => {
      if (event.deltaY === 0 || gesture.current) return
      const normalizedDelta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg.clientHeight : 1)
      const nextScale = clamp(scale * Math.pow(1.12, -normalizedDelta / 100), MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
      event.preventDefault()
      if (nextScale === scale) return
      const anchor = svgPoint(event.clientX, event.clientY)
      setPan([anchor[0] - center[0] - (anchor[0] - center[0] - pan[0]) * nextScale / scale, anchor[1] - center[1] - (anchor[1] - center[1] - pan[1]) * nextScale / scale])
      onZoomChange(nextScale)
    }
    svg.addEventListener('wheel', wheel, { passive: false })
    return () => svg.removeEventListener('wheel', wheel)
  })
  useEffect(() => {
    if (focusToken === undefined || !focusId || !onZoomChange) return
    const facility = project.facilities.find(f => f.id === focusId && f.visible !== false)
    const svg = svgRef.current, matrix = svg?.getScreenCTM()
    if (!facility || !svg || !matrix) return
    const [w, d] = dimensions(facility)
    const height = is3d && (facility.type === 'hotel' || facility.type === 'restaurant') ? Math.max(1, Math.min(facility.floors, 30)) * 3.1 + 3 : 0
    const projected = [p(facility.x, facility.y), p(facility.x + w, facility.y), p(facility.x + w, facility.y + d), p(facility.x, facility.y + d)]
    if (height) projected.push(...projected.map(([x, y]): Point => [x, y - height * 4]))
    const left = Math.min(...projected.map(q => q[0])), right = Math.max(...projected.map(q => q[0]))
    const top = Math.min(...projected.map(q => q[1])), bottom = Math.max(...projected.map(q => q[1]))
    const box = svg.getBoundingClientRect(), target = svgPoint(box.left + box.width / 2, box.top + box.height / 2)
    const nextScale = clamp(Math.min(box.width * .5 / Math.max(1, (right - left) * Math.abs(matrix.a)), box.height * .5 / Math.max(1, (bottom - top) * Math.abs(matrix.d))), MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
    cancel()
    setPan([target[0] - center[0] - ((left + right) / 2 - center[0]) * nextScale, target[1] - center[1] - ((top + bottom) / 2 - center[1]) * nextScale])
    onZoomChange(nextScale)
    // Focus is a camera command; ordinary selection and project edits keep the camera stable.
  }, [focusToken, project.id])
  useEffect(() => {
    if (!interactive || !focusSelectionToken || focusSelectionToken < 0 || !onZoomChange) return
    const ids = new Set(focusSelectionIds ?? [])
    const facilities = project.facilities.filter(f => ids.has(f.id) && f.visible !== false)
    const svg = svgRef.current, matrix = svg?.getScreenCTM()
    if (!facilities.length || !svg || !matrix) return
    const projected = facilities.flatMap(f => {
      const [w, d] = dimensions(f)
      const corners = [p(f.x, f.y), p(f.x + w, f.y), p(f.x + w, f.y + d), p(f.x, f.y + d)]
      const height = is3d && (f.type === 'hotel' || f.type === 'restaurant') ? Math.max(1, Math.min(f.floors, 30)) * 3.1 + 3 : 0
      return height ? [...corners, ...corners.map(([x, y]): Point => [x, y - height * 4])] : corners
    })
    const left = Math.min(...projected.map(q => q[0])), right = Math.max(...projected.map(q => q[0]))
    const top = Math.min(...projected.map(q => q[1])), bottom = Math.max(...projected.map(q => q[1]))
    const box = svg.getBoundingClientRect()
    if (!box.width || !box.height) return
    const target = svgPoint(box.left + box.width / 2, box.top + box.height / 2)
    const projectedWidth = (right - left) * Math.abs(matrix.a) + (bottom - top) * Math.abs(matrix.c)
    const projectedHeight = (right - left) * Math.abs(matrix.b) + (bottom - top) * Math.abs(matrix.d)
    const nextScale = clamp(Math.min(box.width * .65 / Math.max(1, projectedWidth), box.height * .65 / Math.max(1, projectedHeight)), MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
    cancel()
    setPan([target[0] - center[0] - ((left + right) / 2 - center[0]) * nextScale, target[1] - center[1] - ((top + bottom) / 2 - center[1]) * nextScale])
    onZoomChange(nextScale)
    // Reframe only for an explicit camera command; selection and ordinary edits do not move the view.
  }, [focusSelectionToken, project.id])
  const physicalFacilities = project.facilities.map(f => preview?.get(f.id) ?? f)
  const visibleFacilities = physicalFacilities.filter(f => f.visible !== false).sort((a, b) => a.x + a.y - b.x - b.y)
  const line = (a: Point, b: Point, stroke: string, width = 1, extra: { key?: string; opacity?: number; strokeDasharray?: string } = {}) => { const { key, ...attributes } = extra; return <line key={key} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={stroke} strokeWidth={width} {...attributes} /> }
  const tree = (x: number, y: number, index: number) => {
    const [sx, sy] = p(x, y), s = 0.85 + (index % 4) * 0.1
    if (!is3d) return <g key={`tree-${index}`} pointerEvents="none"><circle cx={sx + 2} cy={sy + 2} r={8 * s} fill="#50614a" opacity=".12"/><circle cx={sx} cy={sy} r={7 * s} fill={index % 2 ? '#889674' : '#718565'}/><circle cx={sx - 2} cy={sy - 2} r={3 * s} fill="#9da68a"/></g>
    return <g key={`tree-${index}`} pointerEvents="none" transform={`translate(${sx} ${sy}) scale(${s})`}><ellipse cx="8" cy="3" rx="14" ry="5" fill="#46533b" opacity=".16"/><path d="M0 1L0-19M0-13L-5-20M0-10L5-16" fill="none" stroke="#77624d" strokeWidth="2.4"/><ellipse cx="0" cy="-26" rx="12" ry="16" fill="#536c4b"/><ellipse cx="-7" cy="-25" rx="8" ry="12" fill="#68845a"/><ellipse cx="4" cy="-32" rx="9" ry="11" fill="#82976c"/><ellipse cx="-3" cy="-35" rx="6" ry="9" fill="#9aa984"/><ellipse cx="7" cy="-23" rx="6" ry="10" fill="#647d53"/></g>
  }
  const trees: { x: number; y: number; i: number }[] = []
  let ti = 0
  const perimeterSpacing = Math.max(8, (W + D) / 110)
  const interiorSpacingScale = Math.max(1, Math.sqrt(W * D / (23 * 25 * 225)))
  for (let x = 5; x <= W - 4; x += perimeterSpacing) { trees.push({ x, y: 4, i: ti++ }); trees.push({ x: x + 1, y: D - 4, i: ti++ }) }
  for (let y = 12; y <= D - 10; y += perimeterSpacing) { trees.push({ x: 4, y, i: ti++ }); trees.push({ x: W - 4, y, i: ti++ }) }
  for (let x = 21; x < W - 18; x += 23 * interiorSpacingScale) for (let y = 20; y < D - 15; y += 25 * interiorSpacingScale) trees.push({ x: x + ((ti % 3) - 1) * 2, y, i: ti++ })
  const plantedTrees = trees.slice(0, 500)
  const materialFootprints=useMemo(()=>materialObstacles(project),[project.materials,project.materialAssemblies])
  const outsideFootprints = (t: { x: number; y: number }) => !physicalFacilities.some(f => { const [w, d] = dimensions(f); return t.x >= f.x - 5 && t.x <= f.x + w + 5 && t.y >= f.y - 5 && t.y <= f.y + d + 5 }) && !materialFootprints.some(b=>t.x>=b.x-1&&t.x<=b.x+b.width+1&&t.y>=b.y-1&&t.y<=b.y+b.depth+1)
  // Decorative theme only: local coordinates keep every ornament with its facility.
  const facilityPoint = (f: Facility, u: number, v: number, z = 0): Point => f.rotation === 90 ? p(f.x + v, f.y + u, z) : p(f.x + u, f.y + v, z)
  const watermelonOrnament = (f: Facility, u: number, v: number, radius: number, z = 0): ReactNode => {
    const [sx, sy] = facilityPoint(f, u, v, z)
    const size = radius * 4
    return <g data-theme-decoration="watermelon" pointerEvents="none" transform={`translate(${sx} ${sy}) scale(${size / 12})`}>
      {is3d && <ellipse cx="1" cy="2" rx="13" ry="4" fill="#315c46" opacity=".14"/>}
      <path d="M-12-12H12A12 12 0 0 1-12-12Z" fill="#347751" stroke="#245d40" strokeWidth=".7"/>
      <path d="M-10-12H10A10 10 0 0 1-10-12Z" fill="#d7e5a1"/>
      <path d="M-8.5-12H8.5A8.5 8.5 0 0 1-8.5-12Z" fill="#ed776c"/>
      {[-5, 0, 5].map((offset, i) => <ellipse key={`seed-${i}`} cx={offset} cy={i === 1 ? -5.6 : -8} rx=".7" ry="1.2" fill="#394c38" transform={`rotate(${offset * -5} ${offset} ${i === 1 ? -5.6 : -8})`}/>)}
    </g>
  }
  const watermelonParasol = (f: Facility, u: number, v: number, radius: number, baseHeight = 0): ReactNode => {
    const canopyHeight = is3d ? baseHeight + 2.6 : 0
    const edge = (angle: number, r = radius, height = canopyHeight) => facilityPoint(f, u + Math.cos(angle) * r, v + Math.sin(angle) * r, height)
    const rim = Array.from({ length: 25 }, (_, i) => edge(i * Math.PI / 12))
    return <g data-theme-decoration="watermelon" pointerEvents="none">
      {is3d && <>{line(facilityPoint(f, u, v, baseHeight), facilityPoint(f, u, v, canopyHeight + .45), '#a18d70', 1.15)}<polygon points={points(Array.from({ length: 24 }, (_, i) => edge(i * Math.PI / 12, radius, baseHeight)))} fill="#355c49" opacity=".13"/>
        <polygon points={points(Array.from({ length: 16 }, (_, i) => edge(i * Math.PI / 8, radius * .48, baseHeight + .65)))} fill="#e8e1c9" stroke="#b4ae98" strokeWidth=".55"/>
      </>}
      {Array.from({ length: 8 }, (_, i) => <polygon key={`canopy-${i}`} points={points([facilityPoint(f, u, v, canopyHeight + (is3d ? .45 : 0)), edge(i * Math.PI / 4), edge((i + .5) * Math.PI / 4), edge((i + 1) * Math.PI / 4)])} fill={i % 2 ? '#ec7a70' : '#df675d'} stroke="#f3aa94" strokeWidth=".35"/>)}
      <polyline points={points(rim)} fill="none" stroke="#d9e8ac" strokeWidth={Math.max(1.2, radius * .65)} strokeLinejoin="round"/>
      <polyline points={points(rim)} fill="none" stroke="#347752" strokeWidth={Math.max(.8, radius * .34)} strokeLinejoin="round"/>
      {[.45, 1.55, 2.65, 3.75, 4.85, 5.95].map((angle, i) => {
        const [sx, sy] = edge(angle, radius * .62, canopyHeight + (is3d ? .15 : 0))
        return <ellipse key={`canopy-seed-${i}`} cx={sx} cy={sy} rx=".55" ry={is3d ? .85 : 1.1} fill="#354d3d" transform={`rotate(${angle * 180 / Math.PI} ${sx} ${sy})`}/>
      })}
    </g>
  }
  const renderLeisureDetails = (f: Facility, height: number, presetId: string): ReactNode => {
    // Furniture is drawn in facility coordinates, so rotation and report projection stay aligned.
    const fp = (u: number, v: number) => facilityPoint(f, u * f.width, v * f.depth, height + .12)
    const furniture = (u: number, v: number, w: number, d: number, fill: string, stroke = '#638069') => <polygon points={points([fp(u, v), fp(u + w, v), fp(u + w, v + d), fp(u, v + d)])} fill={fill} stroke={stroke} strokeWidth=".55"/>
    const disk = (u: number, v: number, ru: number, rv: number, fill: string, stroke = '#638069') => <polygon points={points(Array.from({ length: 20 }, (_, i) => fp(u + Math.cos(i * Math.PI / 10) * ru, v + Math.sin(i * Math.PI / 10) * rv)))} fill={fill} stroke={stroke} strokeWidth=".5"/>
    const stroke = (coords: Point[], color = '#5b7560', width = .6) => <polyline points={points(coords.map(([u, v]) => fp(u, v)))} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
    const chairs = <>{[[.43, .15], [.43, .7], [.17, .425], [.73, .425]].map(([u, v], i) => <g key={`leisure-chair-${i}`}>{furniture(u, v, .14, .125, '#dce6cb')}{stroke([[u + .025, v + .025], [u + .115, v + .025]], '#5e8365', 1)}</g>)}</>
    const card = (u: number, v: number, red: boolean) => <>{furniture(u, v, .11, .16, '#fffced', '#b4bda7')}<polygon points={points([fp(u + .055, v + .045), fp(u + .085, v + .08), fp(u + .055, v + .115), fp(u + .025, v + .08)])} fill={red ? '#cf7666' : '#355e46'}/></>
    const cup = (u: number, v: number) => <>{disk(u, v, .05, .06, '#fff7df')}{disk(u, v, .027, .034, '#9b7952')}{stroke([[u + .044, v - .02], [u + .074, v - .02], [u + .074, v + .022], [u + .044, v + .022]], '#f0e4c7', .8)}</>
    return <g pointerEvents="none" data-preset-illustration={presetId} data-leisure-preset={leisurePresetIds.has(presetId) ? presetId : undefined} data-auction-preset={presetId === 'auction-hall' ? presetId : undefined}>
      {furniture(.07, .07, .86, .86, '#f4f4e8', '#cfdbc4')}
      {presetId === 'auction-hall' && <g data-auction-furniture="stage-and-bidder-seating">
        <g data-auction-detail="stage">
          {furniture(.14, .12, .72, .18, '#b5976d')}{furniture(.16, .14, .68, .14, '#d9bb89')}
          {furniture(.425, .15, .15, .115, '#80674e')}{furniture(.435, .16, .13, .08, '#eddbb1')}
          {furniture(.745, .155, .075, .1, '#faf0d3')}
          <polygon points={points([fp(.7825, .165), fp(.804, .194), fp(.7825, .223), fp(.761, .194)])} fill="#cf7c66" stroke="#8d6655" strokeWidth=".6"/>
          <g data-auction-detail="gavel">{stroke([[.49, .185], [.54, .233]], '#71563c', 1.1)}{furniture(.455, .168, .065, .034, '#7e5f42', '#624b36')}{disk(.542, .229, .024, .016, '#a07b53', '#72573d')}</g>
        </g>
        {furniture(.465, .355, .07, .51, '#e6e9d8', '#d5dbc5')}
        {[.4, .515, .63, .745].map((v, row) => <g key={`auction-seating-row-${row}`} data-auction-seating-row={row + 1}>
          {[.17, .265, .36, .575, .67, .765].map((u, seat) => <g key={`auction-seat-${row}-${seat}`} data-auction-detail="bidder-seat">
            {furniture(u, v, .065, .075, '#b6ccad')}{furniture(u + .005, v + .052, .055, .018, '#68886a')}
          </g>)}
        </g>)}
      </g>}
      {presetId === 'card-room' && <g data-leisure-furniture="card-table">
        {chairs}{furniture(.32, .3, .36, .36, '#386d4e')}{furniture(.35, .33, .3, .3, '#578463')}
        {card(.38, .385, true)}{card(.515, .445, false)}
        {disk(.585, .38, .018, .022, '#d99178')}{disk(.61, .405, .018, .022, '#fff2d8')}
      </g>}
      {presetId === 'mahjong-room' && <g data-leisure-furniture="mahjong-table">
        {chairs}{furniture(.3, .285, .4, .4, '#dddfc9')}{furniture(.335, .32, .33, .33, '#34764f')}
        {[0, 1, 2, 3, 4].map(i => <g key={`mahjong-tile-${i}`}>
          {furniture(.36 + i * .049, .345, .037, .06, '#fffbea')}{furniture(.36 + i * .049, .572, .037, .06, '#fffbea')}
          {furniture(.348, .42 + i * .027, .047, .021, '#fffbea')}{furniture(.605, .42 + i * .027, .047, .021, '#fffbea')}
          {stroke([[.378 + i * .049, .359], [.378 + i * .049, .39]], i % 2 ? '#b57062' : '#347752', .7)}
        </g>)}
        {furniture(.463, .455, .063, .067, '#eef0da')}{stroke([[.478, .468], [.512, .509], [.478, .509], [.512, .468]], '#c86f62', .65)}
      </g>}
      {presetId === 'billiards-room' && <g data-leisure-furniture="billiards-table">
        {furniture(.16, .25, .66, .48, '#806348')}{furniture(.19, .285, .6, .41, '#397b52')}
        {[[.202, .303], [.49, .303], [.778, .303], [.202, .675], [.49, .675], [.778, .675]].map(([u, v], i) => <g key={`billiards-pocket-${i}`}>{disk(u, v, .019, .027, '#263e30', '#263e30')}</g>)}
        {stroke([[.265, .625], [.745, .372]], '#efd6a1', 1.1)}{stroke([[.2, .81], [.78, .81]], '#a5875c', 1.05)}
        {disk(.345, .51, .013, .019, '#fffbea')}{[[.625, .49], [.654, .47], [.654, .51], [.682, .45], [.682, .49], [.682, .53]].map(([u, v], i) => <g key={`billiards-ball-${i}`}>{disk(u, v, .012, .018, ['#d48666', '#dbbd67', '#84a3a6'][i % 3])}</g>)}
      </g>}
      {presetId === 'board-game-room' && <g data-leisure-furniture="board-game-table">
        {chairs}{disk(.5, .48, .2, .23, '#d5bd8d')}{furniture(.41, .375, .18, .2, '#eff0db')}
        {[0, 1, 2].map(i => <g key={`board-grid-${i}`}>{stroke([[.41, .425 + i * .05], [.59, .425 + i * .05]], '#aebc9b', .45)}{stroke([[.455 + i * .045, .375], [.455 + i * .045, .575]], '#aebc9b', .45)}</g>)}
        {[[.445, .412], [.545, .525], [.535, .455], [.477, .552]].map(([u, v], i) => <g key={`board-token-${i}`}>{disk(u, v, .015, .019, ['#d17b69', '#658caf', '#d5b551', '#769c64'][i])}</g>)}
        {furniture(.555, .595, .065, .065, '#fffbed')}{[[.572, .612], [.604, .612], [.588, .627], [.572, .645], [.604, .645]].map(([u, v], i) => <g key={`dice-pip-${i}`}>{disk(u, v, .005, .006, '#45654b')}</g>)}
      </g>}
      {presetId === 'reading-lounge' && <g data-leisure-furniture="bookshelves-and-seating">
        {furniture(.13, .14, .74, .19, '#9c8768')}
        {Array.from({ length: 14 }, (_, i) => <g key={`reading-book-${i}`}>{furniture(.15 + i * .05, .16, .034, .14, ['#789d7a', '#c68470', '#e2c690', '#8ea8ad'][i % 4])}</g>)}
        {furniture(.16, .5, .17, .24, '#d5ddbe')}{furniture(.67, .5, .17, .24, '#d5ddbe')}
        {stroke([[.18, .53], [.18, .7], [.3, .7]], '#718868', 1)}{stroke([[.82, .53], [.82, .7], [.7, .7]], '#718868', 1)}
        {disk(.5, .6, .105, .135, '#beaa82')}{furniture(.435, .55, .12, .09, '#fff9e8')}{stroke([[.495, .551], [.495, .638]], '#9eaa8c', .7)}
      </g>}
      {presetId === 'tea-lounge' && <g data-leisure-furniture="tea-table">
        {furniture(.24, .34, .52, .31, '#b59d75')}{furniture(.28, .38, .44, .23, '#d7bc8c')}
        {furniture(.285, .18, .14, .105, '#d3dec0')}{furniture(.57, .18, .14, .105, '#d3dec0')}{furniture(.285, .705, .14, .105, '#d3dec0')}{furniture(.57, .705, .14, .105, '#d3dec0')}
        {cup(.36, .48)}{cup(.63, .48)}{disk(.49, .5, .058, .072, '#627e54')}{disk(.49, .483, .031, .039, '#8fa574')}
        {stroke([[.525, .5], [.563, .472], [.573, .45]], '#627e54', 1.5)}{stroke([[.443, .48], [.42, .48], [.42, .54], [.443, .54]], '#627e54', .9)}
        <polygon points={points([fp(.795, .71), fp(.865, .64), fp(.878, .715), fp(.828, .775)])} fill="#769d64" stroke="#527e57" strokeWidth=".5"/>{stroke([[.8, .79], [.855, .685]], '#426e46', .7)}
      </g>}
    </g>
  }
  const renderBuildingDetails = (f: Facility, height: number): ReactNode => {
    const preset = getFacilityPreset(f), { width: w, depth: d } = f
    if (leisurePresetIds.has(preset.id) || preset.id === 'auction-hall') return renderLeisureDetails(f, height, preset.id)
    const fp = (u: number, v: number, z = height) => facilityPoint(f, u, v, z)
    const shape = (coords: Point[], color: string) => <polygon points={points(coords)} fill={color} stroke="#73816a" strokeWidth=".7"/>
    const label = getFacilityLabel(f)
    const roofHeight = is3d ? Math.min(2.8, w * .15, d * .18) : 0
    const [sx, sy] = fp(w * .5, d * .48, height + roofHeight + .12)
    const iconScale = Math.min(2, w * .09, d * .12)
    const glyph = (() => {
      switch (preset.id) {
        case 'villa': return <path d="M-6 0L0-5L6 0M-4-1V5H4V-1M-1 5V1H1V5"/>
        case 'cabin': return <><path d="M-6 1L0-6L6 1M-4 0V5H4V0M-1 5V2H1V5"/><path d="M-4 1H4M-4 3H-1M1 3H4"/></>
        case 'apartment': return <><rect x="-4" y="-6" width="8" height="12"/><path d="M-2-4H2M-2-1H2M-2 2H2M-1 6V4H1V6"/></>
        case 'training-center': case 'sports-shop': return <><ellipse cx="-1" cy="-2" rx="4" ry="5" transform="rotate(-30)"/><path d="M1 2L5 6M-3-4L2-1M-3-1L0 1"/></>
        case 'players-lounge': return <><path d="M-5-1V4H5V-1M-3 4V-4H3V4M-5 5V6M5 5V6"/></>
        case 'locker-room': return <><rect x="-6" y="-5" width="7" height="11"/><path d="M-3-3V-1M4-5V-3H6M2 0V2M4 1V3M6 0V2M2 4V5M6 4V5"/></>
        case 'fitness': return <><path d="M-5-3V3M-3-5V5M3-5V5M5-3V3M-3 0H3"/></>
        case 'spa': return <><path d="M0 5C-7 2-6-2-4-3L0 1M0 5C7 2 6-2 4-3L0 1M0 4C-4-1-2-5 0-6C2-5 4-1 0 4Z"/></>
        case 'yoga': return <><circle cx="0" cy="-4" r="1.4"/><path d="M0-2V2M-5 0L0 2L5 0M-5 5L0 2L5 5Z"/></>
        case 'coffee': return <><path d="M-5-1H3V4H-5ZM3 0H5V3H3M-6 6H5M-3-5V-3M0-5V-3"/></>
        case 'bar': return <path d="M-5-5H5L0 0ZM0 0V5M-3 5H3"/>
        case 'banquet': return <><ellipse cx="0" cy="0" rx="4" ry="3"/><path d="M-6-4H-3M3-4H6M-6 4H-3M3 4H6M-1-5H1M-1 5H1"/></>
        case 'conference': return <><rect x="-3" y="-5" width="6" height="10"/><path d="M-6-3H-4M4-3H6M-6 0H-4M4 0H6M-6 3H-4M4 3H6"/></>
        case 'reception': return <><circle cx="0" cy="-4" r="1"/><path d="M-2-1H0V5M-2 5H2"/></>
        case 'medical': return <path d="M-2-6H2V-2H6V2H2V6H-2V2H-6V-2H-2Z"/>
        case 'restroom': return <><circle cx="-3" cy="-4" r="1"/><circle cx="3" cy="-4" r="1"/><path d="M-3-2V5M-5 0H-1M1 3L3-2L5 3ZM3 3V6"/></>
        case 'security': return <path d="M-5-5H5V0C5 3 2 5 0 6C-2 5-5 3-5 0ZM-2 0L0 2L3-2"/>
        case 'laundry': return <><rect x="-5" y="-6" width="10" height="12"/><circle cx="0" cy="1" r="3"/><path d="M-3-4H-1M1-4H3M-2 1Q0-1 2 1"/></>
        case 'storage': return <><path d="M-6-2L0-6L6-2V6H-6ZM-4 6V0H4V6M-4 2H4M-4 4H4"/></>
        case 'climbing': return <><path d="M-6 5L-1-6L6 5ZM-3 0L-1 1L1-1M1 3L3 2"/><circle cx="-1" cy="-3" r=".7"/><circle cx="-3" cy="3" r=".7"/></>
        case 'arcade': return <><path d="M-4-3H4L6 3Q6 6 3 4L1 2H-1L-3 4Q-6 6-6 3ZM-4-1V2M-5.5.5H-2.5"/><circle cx="3" cy="0" r=".7"/><circle cx="4.5" cy="1.5" r=".7"/></>
        case 'karaoke': return <><rect x="-5" y="-6" width="4" height="7" rx="2" transform="rotate(25 -3 -2)"/><path d="M-3 1L-5 5M2 3V-4L6-5V2M2-2L6-3"/><ellipse cx=".8" cy="3" rx="1.4" ry="1"/><ellipse cx="4.8" cy="2" rx="1.4" ry="1"/></>
        case 'bowling': return <><path d="M-1-5Q-3-5-2-3L-1-1Q-4 5-1 5H1Q4 5 1-1L2-3Q3-5 1-5ZM-1-2H1"/><circle cx="-4" cy="3" r="2"/><circle cx="-4.5" cy="2.5" r=".3"/><path d="M4-4Q2-4 3-2L4 0Q2 4 5 4H6"/></>
        case 'table-tennis': return <><path d="M-6-3H6V4H-6ZM0-3V4M-6 0H6"/><path d="M2-5L4-6L6-5"/><circle cx="-3" cy="-5" r=".7"/></>
        default: return <path d="M-5-5H5V5H-5ZM-3-2H3M-3 1H3"/>
      }
    })()
    const signWidth = Math.min(100, w * 3.2), fontSize = Math.min(8, signWidth / (label.length + 1))
    return <g pointerEvents="none" data-preset-illustration={preset.id}>
      {(preset.id === 'villa' || preset.id === 'cabin') && <>
        {shape([fp(w * .04, d * .04), fp(w * .96, d * .04), fp(w * .96, d * .5, height + roofHeight), fp(w * .04, d * .5, height + roofHeight)], preset.id === 'cabin' ? '#ad7853' : '#c08c72')}
        {shape([fp(w * .04, d * .5, height + roofHeight), fp(w * .96, d * .5, height + roofHeight), fp(w * .96, d * .96), fp(w * .04, d * .96)], preset.id === 'cabin' ? '#805b40' : '#a9705b')}
        {[.25, .5, .75].map((r, i) => <g key={`roof-seam-${i}`}>{line(fp(w * r, d * .04), fp(w * r, d * .5, height + roofHeight), '#d8b394', .6)}{line(fp(w * r, d * .5, height + roofHeight), fp(w * r, d * .96), '#d8b394', .6)}</g>)}
      </>}
      {preset.id === 'apartment' && <>{shape([fp(w * .1, d * .1), fp(w * .9, d * .1), fp(w * .9, d * .25), fp(w * .1, d * .25)], '#a7b9ae')}{is3d && [.35, .65].map((r, i) => <g key={`balcony-${i}`}>{line(fp(w * .06, d, height * r), fp(w * .94, d, height * r), '#f8f3df', 2.4)}</g>)}</>}
      <g transform={`translate(${sx} ${sy}) scale(${iconScale})`} fill="none" stroke="#415d49" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="-8" y="-8" width="16" height="16" rx="3" fill="#fff9e9" fillOpacity=".94" stroke="#d3d7bf" strokeWidth=".5"/>{glyph}</g>
      <g transform={`translate(${sx} ${sy + 12 * iconScale})`}><rect x={-signWidth / 2} y="-5" width={signWidth} height="11" rx="2" fill="#347752"/><text textAnchor="middle" y="3" fontFamily="Arial, PingFang SC, Microsoft YaHei, sans-serif" fontSize={fontSize} fill="#fff8e5">{label}</text></g>
    </g>
  }
  const renderBuilding = (f: Facility, restaurant = false): ReactNode => {
    const [w, d] = dimensions(f), { x, y } = f
    const preset = getFacilityPreset(f), canonical = preset.id === 'hotel' || preset.id === 'restaurant'
    const h = is3d ? Math.max(1, Math.min(f.floors, 30)) * 3.1 : 0
    const a = p(x, y), b = p(x + w, y), c = p(x + w, y + d), e = p(x, y + d)
    const A = p(x, y, h), B = p(x + w, y, h), C = p(x + w, y + d, h), E = p(x, y + d, h)
    const windows: ReactNode[] = []
    if (is3d) {
      const floors = Math.round(h / 3.1)
      const rows = Math.min(12, floors)
      const naturalFrontCount = Math.max(0, Math.ceil((w - 3) / 3.9))
      const naturalSideCount = Math.max(0, Math.ceil((d - 3) / 3.5))
      const frontCount = Math.min(18, naturalFrontCount), sideCount = Math.min(18, naturalSideCount)
      const frontSampled = naturalFrontCount > frontCount, sideSampled = naturalSideCount > sideCount
      const windowHeight = floors > rows ? Math.min(3.8, h / rows * .55) : 1.65
      // Bound exported SVG complexity while retaining the exact default facade detail.
      for (let row = 0; row < rows; row++) {
        const floor = floors > rows ? Math.round(row * (floors - 1) / (rows - 1)) : row
        const z = floor * 3.1 + .75
        const topZ = Math.min(h - .5, z + windowHeight)
        for (let column = 0; column < frontCount; column++) {
          const nx = frontSampled ? 1 + column * (w - 3) / frontCount : 1 + column * 3.9
          const windowWidth = frontSampled ? (w - 3) / frontCount * .55 : 2.2
          const right = Math.min(nx + windowWidth, w - .6)
          const dark = (Math.round(nx) + floor) % 4 === 0
          windows.push(<polygon key={`front-${row}-${column}`} points={points([p(x + nx, y + d + .04, z), p(x + right, y + d + .04, z), p(x + right, y + d + .04, topZ), p(x + nx, y + d + .04, topZ)])} fill={dark ? '#687369' : '#91a29c'} stroke="#d5d4c5" strokeWidth=".7"/>)
          if (!frontSampled && floors <= rows) windows.push(line(p(x + nx + 1.1, y + d + .07, z), p(x + nx + 1.1, y + d + .07, topZ), '#d8d9cb', .65, { key: `mullion-${row}-${column}` }))
        }
        for (let column = 0; column < sideCount; column++) {
          const ny = sideSampled ? 1 + column * (d - 3) / sideCount : 1 + column * 3.5
          const windowWidth = sideSampled ? (d - 3) / sideCount * .55 : 1.8
          const right = Math.min(ny + windowWidth, d - .5)
          windows.push(<polygon key={`side-${row}-${column}`} points={points([p(x + w + .04, y + ny, z), p(x + w + .04, y + right, z), p(x + w + .04, y + right, topZ), p(x + w + .04, y + ny, topZ)])} fill="#54675f" stroke="#bfc4af" strokeWidth=".6"/>)
        }
      }
    }
    return <>
      {is3d && <polygon points={points([a, b, [c[0] + 23, c[1] + 13], [e[0] + 23, e[1] + 13]])} fill="#5c604a" opacity=".17"/>}
      {is3d && <><polygon points={points([B, C, c, b])} fill={restaurant ? '#917f65' : '#b2b09a'}/><polygon points={points([E, C, c, e])} fill={restaurant ? '#c2b497' : '#e1dfcc'}/>{windows}</>}
      <polygon points={points([A, B, C, E])} fill={restaurant ? '#e9e3ce' : '#f3f0df'} stroke="#9a9986" strokeWidth="1.1"/>
      <polygon points={canonical ? quad(x + .7, y + .7, Math.max(0, w - 1.4), Math.max(0, d - 1.4), h + .05) : quad(x + w * .04, y + d * .04, w * .92, d * .92, h + .05)} fill={canonical ? restaurant ? '#d5caae' : '#e8e6d6' : preset.color} stroke="#cfccba" strokeWidth="1"/>
      {!is3d && Math.min(f.width, f.depth) >= 6 && watermelonOrnament(f, f.width * .72, f.depth * .74, Math.min(1.8, f.width * .1, f.depth * .1))}
      {is3d && <><path d={`M${E.join(',')}L${C.join(',')}L${B.join(',')}`} stroke="#fcfaeb" strokeWidth="2.5" fill="none"/>{line(p(x, y + d, h - .45), p(x + w, y + d, h - .45), '#9b9b87', .7)}
        {!restaurant && canonical && <><polygon points={quad(x + w * .32, y + d * .34, w * .38, d * .3, h + 1)} fill="#f3efdc" stroke="#c5c1ab" strokeWidth=".8"/>{[0, 1, 2].map(i => <polygon key={`vent-${i}`} points={quad(x + w * .36 + i * 2.3, y + d * .42, 1.5, 2, h + 1.07)} fill="#b3b3a3" stroke="#8f968b" strokeWidth=".6"/>)}<polygon points={quad(x + w * .43, y + d + .1, w * .21, 2.4, 3)} fill="#e9e5d1" stroke="#b9b59f" strokeWidth=".8"/>{line(p(x + w * .44, y + d + 2.4), p(x + w * .44, y + d + 2.4, 3), '#858873', 1.2)}{line(p(x + w * .63, y + d + 2.4), p(x + w * .63, y + d + 2.4, 3), '#858873', 1.2)}</>}
        {restaurant && Math.min(f.width, f.depth) >= 10 && <>{[.25, .7].slice(0, f.width >= 20 ? 2 : 1).map((r, i) => <g key={`patio-${i}`}>{watermelonParasol(f, f.width * r, f.depth * .72, Math.min(2.1, f.width * .09, f.depth * .16), h + .12)}</g>)}</>}
        {!restaurant && canonical && Math.min(f.width, f.depth) >= 10 && (() => {
          const rotated = f.rotation === 90
          const [sx, sy] = facilityPoint(f, f.width * .5, f.depth - .04, Math.min(h - .4, 3.5))
          const signWidth = Math.min(68, f.width * 2)
          return <g data-theme-decoration="watermelon" pointerEvents="none" transform={`matrix(1 ${rotated ? -.5 : .5} 0 1 ${sx} ${sy})`}><rect x={-signWidth / 2} y="-5" width={signWidth} height="11" rx="2" fill="#347752" stroke="#d9e8ac" strokeWidth=".7"/><text x="0" y="2.7" textAnchor="middle" fontFamily="Arial, PingFang SC, Microsoft YaHei, sans-serif" fontSize={Math.min(7.5, signWidth / 5.6)} fontWeight="600" fill="#fff7e5">西瓜网球</text></g>
        })()}

      </>}
      {!canonical && renderBuildingDetails(f, h)}
    </>
  }
  const renderCourt = (f: Facility): ReactNode => {
    const [w, d] = dimensions(f), { x, y } = f
    const rotated = f.rotation === 90
    const cp = (u: number, v: number, z = 0) => rotated ? p(x + v, y + u, z) : p(x + u, y + v, z)
    const cw = rotated ? d : w, cd = rotated ? w : d
    const playW = Math.min(10.97, cw * .68), playD = Math.min(23.77, cd * .78)
    const left = (cw - playW) / 2, right = left + playW, top = (cd - playD) / 2, bottom = top + playD, mid = cd / 2
    const inset = playW * (10.97 - 8.23) / 10.97 / 2
    const colors = f.surface === 'hard' ? ['#799ba5', '#52808f'] : f.surface === 'grass' ? ['#7d9870', '#6d8960'] : ['#cc8569', '#bb6a4b']
    const border = [cp(.25, .25), cp(cw - .25, .25), cp(cw - .25, cd - .25), cp(.25, cd - .25)]
    return <>
      <polygon points={quad(x - .45, y - .45, w + .9, d + .9)} fill="#a6aa94"/>
      <polygon points={quad(x, y, w, d)} fill={colors[0]} stroke="#818d74" strokeWidth=".7"/>
      <polygon points={points([cp(left, top), cp(right, top), cp(right, bottom), cp(left, bottom)])} fill={colors[1]} stroke="#faf5e9" strokeWidth="1.05"/>
      {[left + inset, right - inset].map((u, i) => <g key={`single-${i}`}>{line(cp(u, top), cp(u, bottom), '#faf5e9', .9)}</g>)}
      {[mid - playD * 6.4 / 23.77, mid + playD * 6.4 / 23.77].map((v, i) => <g key={`service-${i}`}>{line(cp(left + inset, v), cp(right - inset, v), '#faf5e9', .9)}</g>)}
      {line(cp(cw / 2, mid - playD * 6.4 / 23.77), cp(cw / 2, mid + playD * 6.4 / 23.77), '#faf5e9', .9)}
      {line(cp(cw / 2, top), cp(cw / 2, top + .4), '#faf5e9', 1)}{line(cp(cw / 2, bottom), cp(cw / 2, bottom - .4), '#faf5e9', 1)}
      {is3d && <><polygon points={points([cp(left - .65, mid), cp(right + .65, mid), cp(right + .65, mid, .95), cp(left - .65, mid, .95)])} fill="#435448" fillOpacity=".48" stroke="#e2e3ce" strokeWidth=".65"/>{Array.from({ length: 11 }, (_, i) => <g key={`net-${i}`}>{line(cp(left - .55 + i * (playW + 1.1) / 10, mid), cp(left - .55 + i * (playW + 1.1) / 10, mid, .95), '#f0f0db', .3)}</g>)}{line(cp(left - .65, mid), cp(left - .65, mid, 1.15), '#3c4d40', 1.1)}{line(cp(right + .65, mid), cp(right + .65, mid, 1.15), '#3c4d40', 1.1)}
      <polygon points={points([border[0], border[1], cp(cw - .25, .25, 2.7), cp(.25, .25, 2.7)])} fill="#506e53" fillOpacity=".045" stroke="#506b54" strokeWidth=".55"/>
      {[.25, cw * .33, cw * .66, cw - .25].map((u, i) => <g key={`back-fence-${i}`}>{line(cp(u, .25), cp(u, .25, 2.7), '#5c735a', .9)}</g>)}
      {[.25, cd * .25, cd * .5, cd * .75, cd - .25].map((v, i) => <g key={`side-fence-${i}`}>{line(cp(cw - .25, v), cp(cw - .25, v, 2.7), '#5c735a', .85)}</g>)}
      {line(cp(cw - .25, .25, 2.7), cp(cw - .25, cd - .25, 2.7), '#62785b', .7)}
      </>}
      {!is3d && line(cp(left - .5, mid), cp(right + .5, mid), '#344f44', 1.5)}
    </>
  }
  const renderPool = (f: Facility): ReactNode => {
    const [w, d] = dimensions(f), { x, y } = f
    const loungerCount = Math.min(16, Math.max(1, Math.floor(w / 4)))
    const loungerSpacing = Math.floor(w / 4) > 16 ? (w - 5) / (loungerCount - 1) : 3.5
    return <><polygon points={quad(x, y, w, d)} fill="#ece7d4" stroke="#c5c5ad" strokeWidth=".7"/><polygon points={quad(x + 2, y + 2, Math.max(1, w - 4), Math.max(1, d - 4))} fill="#68b7bd" stroke="#f9f6e8" strokeWidth="2.1"/>{[.2, .4, .6, .8].map((r, i) => <g key={`water-${i}`}>{line(p(x + 2.7, y + 2 + (d - 4) * r), p(x + w - 2.7, y + 2 + (d - 4) * r), '#b5e3db', .6, { opacity: .5 })}</g>)}{Array.from({ length: loungerCount }, (_, i) => <g key={`lounger-${i}`}><polygon points={quad(x + 2 + i * loungerSpacing, y + .4, 1.25, 1.9, is3d ? .25 : 0)} fill="#fffbed" stroke="#c9c5b0" strokeWidth=".5"/>{line(p(x + 2 + i * loungerSpacing, y + .9, .3), p(x + 3.25 + i * loungerSpacing, y + .9, .3), '#dbd8c5', .65)}</g>)}{Math.min(f.width, f.depth) >= 6 && [ .25, .72 ].slice(0, f.width >= 15 ? 2 : 1).map((r, i) => <g key={`pool-parasol-${i}`}>{watermelonParasol(f, f.width * r, 1, Math.min(.9, f.width * .08))}</g>)}</>
  }
  const renderParking = (f: Facility): ReactNode => {
    const [w, d] = dimensions(f), { x, y } = f
    const naturalCount = Math.max(1, Math.floor((w - 2) / 3))
    const count = Math.min(20, naturalCount)
    const carSpacing = naturalCount > count ? (w - 2) / count : 3
    return <><polygon points={quad(x, y, w, d)} fill="#c4c4b4" stroke="#a9ae99" strokeWidth=".7"/>{Array.from({ length: count }, (_, i) => <g key={`car-${i}`}>{line(p(x + 1 + i * carSpacing, y + .8), p(x + 1 + i * carSpacing, y + Math.min(d - .8, 5.7)), '#eeecdb', .8)}{i % 4 !== 2 && <><polygon points={quad(x + 1.4 + i * carSpacing, y + 1.3, 1.85, Math.min(3.8, d - 2), is3d ? .55 : 0)} fill={i % 3 === 0 ? '#f2f0df' : i % 3 === 1 ? '#5e726b' : '#8c918b'} stroke="#7f897b" strokeWidth=".5"/><polygon points={quad(x + 1.55 + i * carSpacing, y + 2.3, 1.55, 1.65, is3d ? .82 : 0)} fill="#9eada8" stroke="#778a83" strokeWidth=".5"/></>}</g>)}</>
  }
  const renderCharging = (f: Facility): ReactNode => {
    const count = Math.min(6, Math.max(1, Math.floor(f.width / 3)))
    return <g pointerEvents="none" data-preset-illustration="ev-parking">{Array.from({ length: count }, (_, i) => {
      const u = f.width * (i + .5) / count, v = f.depth * .88
      const [sx, sy] = facilityPoint(f, u, v, is3d ? 1.5 : 0)
      const size = Math.min(1, f.width * .1, f.depth * .12)
      return <g key={`charger-${i}`}>
        {is3d && line(facilityPoint(f, u, v), facilityPoint(f, u, v, 1.5), '#3f6c54', 2.5 * size)}
        <g transform={`translate(${sx} ${sy}) scale(${size})`}><rect x="-3.5" y="-5" width="7" height="10" rx="1" fill="#367b56" stroke="#f0f4ce" strokeWidth=".6"/><path d="M1-4L-2 0H0L-1 4L2-1H0Z" fill="#e8f5b5"/><path d="M3.5-2Q7-2 6 3L4 4" fill="none" stroke="#294f3f" strokeWidth="1"/></g>
      </g>
    })}</g>
  }
  const renderOutdoorActivity = (f: Facility): ReactNode => {
    const { width: w, depth: d } = f, preset = getFacilityPreset(f)
    const fp = (u: number, v: number, z = 0) => facilityPoint(f, u, v, z)
    const rect = (u: number, v: number, width: number, depth: number, color: string, z = 0, stroke = '#e8e7d3') => <polygon points={points([fp(u, v, z), fp(u + width, v, z), fp(u + width, v + depth, z), fp(u, v + depth, z)])} fill={color} stroke={stroke} strokeWidth=".8"/>
    const ring = (u: number, v: number, radius: number, z = 0) => <polyline points={points(Array.from({ length: 25 }, (_, i) => fp(u + Math.cos(i * Math.PI / 12) * radius, v + Math.sin(i * Math.PI / 12) * radius, z)))} fill="none" stroke="#fff6e6" strokeWidth=".85"/>
    if (preset.id === 'basketball') {
      // A 28:15 playing rectangle inside the editable concept footprint.
      const factor = Math.min(w / 32, d / 19), courtW = 28 * factor, courtD = 15 * factor
      const u = (w - courtW) / 2, v = (d - courtD) / 2, mid = d / 2
      return <><polygon points={quad(f.x, f.y, ...dimensions(f))} fill="#bba385" stroke="#83966c" strokeWidth=".8"/>
        <g pointerEvents="none" data-preset-illustration="basketball">
          {rect(u, v, courtW, courtD, '#b87758')}{line(fp(w / 2, v), fp(w / 2, v + courtD), '#fff6e6', .9)}{ring(w / 2, mid, 1.8 * factor)}
          {[0, 1].map(end => {
            const baseline = end ? u + courtW : u, direction = end ? -1 : 1
            const keyEnd = baseline + direction * 5.8 * factor, rimU = baseline + direction * 1.6 * factor
            return <g key={`basket-end-${end}`}>
              {rect(Math.min(baseline, keyEnd), mid - 2.45 * factor, 5.8 * factor, 4.9 * factor, '#679681')}{ring(keyEnd, mid, 1.8 * factor)}
              <polyline points={points(Array.from({ length: 17 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 16; return fp(rimU + direction * Math.cos(a) * 6.4 * factor, mid + Math.sin(a) * 6.4 * factor) }))} fill="none" stroke="#fff6e6" strokeWidth=".85"/>
              {is3d && line(fp(baseline, mid), fp(baseline, mid, 3.4 * factor), '#4a6553', 1.5)}
              {line(fp(baseline + direction * .8 * factor, mid - .9 * factor, is3d ? 3.4 * factor : 0), fp(baseline + direction * .8 * factor, mid + .9 * factor, is3d ? 3.4 * factor : 0), '#eef2d6', 2)}{ring(rimU, mid, .45 * factor, is3d ? 3.05 * factor : 0)}
            </g>
          })}
        </g>
      </>
    }
    if (preset.id === 'kids-play') {
      const unit = Math.min(w / 22, d / 18), equipmentH = is3d ? 2.6 * unit : 0
      return <><polygon points={quad(f.x, f.y, ...dimensions(f))} fill="#d6c5a2" stroke="#a49d7b" strokeWidth=".8"/>
        <g pointerEvents="none" data-preset-illustration="kids-play">
          {rect(w * .08, d * .12, w * .4, d * .7, '#b4c9a0')}{rect(w * .52, d * .12, w * .4, d * .7, '#ddac97')}
          {[.16, .4].map((r, i) => <g key={`swing-frame-${i}`}>{line(fp(w * r, d * .25), fp(w * r, d * .43, equipmentH), '#8d7555', 1.7)}{line(fp(w * r, d * .68), fp(w * r, d * .43, equipmentH), '#8d7555', 1.7)}</g>)}
          {line(fp(w * .16, d * .43, equipmentH), fp(w * .4, d * .43, equipmentH), '#8d7555', 2)}
          {[.23, .34].map((r, i) => <g key={`swing-${i}`}>{line(fp(w * r - unit * .5, d * .43, equipmentH), fp(w * r - unit * .5, d * .54, is3d ? .5 * unit : 0), '#5c7468', .7)}{line(fp(w * r + unit * .5, d * .43, equipmentH), fp(w * r + unit * .5, d * .54, is3d ? .5 * unit : 0), '#5c7468', .7)}{rect(w * r - unit * .7, d * .51, 1.4 * unit, .75 * unit, '#e17765', is3d ? .5 * unit : 0)}</g>)}
          {rect(w * .6, d * .24, w * .18, d * .18, '#e4bd65', equipmentH)}
          <polygon points={points([fp(w * .63, d * .42, equipmentH), fp(w * .75, d * .42, equipmentH), fp(w * .83, d * .74), fp(w * .71, d * .74)])} fill="#79a9b1" stroke="#eaf0d9" strokeWidth="1.1"/>
          {[.28, .34, .4, .46].map((r, i) => <g key={`play-ladder-${i}`}>{line(fp(w * .55, d * r, equipmentH * (1 - (r - .28) / .24)), fp(w * .6, d * r, equipmentH * (1 - (r - .28) / .24)), '#765d42', 1)}</g>)}
          {is3d && [.6, .78].map((r, i) => <g key={`slide-post-${i}`}>{line(fp(w * r, d * .24), fp(w * r, d * .24, equipmentH), '#977650', 1.4)}</g>)}
        </g>
      </>
    }
    const pergolaHeight = is3d ? Math.min(2.7, w * .18, d * .25) : 0
    return <><polygon points={quad(f.x, f.y, ...dimensions(f))} fill="#d3c09e" stroke="#a49d7b" strokeWidth=".8"/>
      <g pointerEvents="none" data-preset-illustration="bbq">
        {rect(w * .12, d * .17, w * .68, d * .65, '#ebe1c4')}
        {[.32, .65].map((r, i) => <g key={`picnic-${i}`}>{rect(w * r - w * .1, d * .42, w * .2, d * .14, '#9b7754', is3d ? .75 : 0)}{rect(w * r - w * .1, d * .32, w * .2, d * .05, '#ab8e66', is3d ? .4 : 0)}{rect(w * r - w * .1, d * .61, w * .2, d * .05, '#ab8e66', is3d ? .4 : 0)}</g>)}
        {rect(w * .84, d * .25, w * .1, d * .24, '#6c7163', is3d ? .9 : 0)}
        {[.3, .36, .42].map((r, i) => <g key={`grill-${i}`}>{line(fp(w * .85, d * r, is3d ? .92 : 0), fp(w * .93, d * r, is3d ? .92 : 0), '#d0d3bc', .7)}</g>)}
        {[.12, .8].flatMap((u, i) => [.17, .82].map((v, j) => <g key={`pergola-post-${i}-${j}`}>{line(fp(w * u, d * v), fp(w * u, d * v, pergolaHeight), '#8f7952', 1.8)}</g>))}
        {line(fp(w * .12, d * .17, pergolaHeight), fp(w * .12, d * .82, pergolaHeight), '#8f7952', 1.6)}{line(fp(w * .8, d * .17, pergolaHeight), fp(w * .8, d * .82, pergolaHeight), '#8f7952', 1.6)}
        {[.17, .3, .43, .56, .69, .82].map((r, i) => <g key={`pergola-beam-${i}`}>{line(fp(w * .1, d * r, pergolaHeight), fp(w * .82, d * r, pergolaHeight), '#a18e66', 1.6, { opacity: .8 })}</g>)}
      </g>
    </>
  }
  const renderPlayFacility = (f: Facility): ReactNode => {
    const preset = getFacilityPreset(f)
    // Percentage coordinates keep all play equipment inside editable footprints,
    // including tiny facilities, and project each ornament with the facility rotation.
    const unit = Math.min(f.width, f.depth) / 20
    const fp = (u: number, v: number, z = 0) => facilityPoint(f, f.width * u / 100, f.depth * v / 100, is3d ? z * unit : 0)
    const polygon = (coords: Point[], fill: string, stroke = '#eae9d7') => <polygon points={points(coords)} fill={fill} stroke={stroke} strokeWidth=".8"/>
    const rect = (u: number, v: number, w: number, d: number, fill: string, z = 0, stroke = '#eae9d7') => polygon([fp(u, v, z), fp(u + w, v, z), fp(u + w, v + d, z), fp(u, v + d, z)], fill, stroke)
    const oval = (u: number, v: number, rx: number, ry: number, z = 0) => Array.from({ length: 25 }, (_, i) => fp(u + Math.cos(i * Math.PI / 12) * rx, v + Math.sin(i * Math.PI / 12) * ry, z))
    const trace = (coords: Point[], color = '#fff8e8', width = .9) => <polyline points={points(coords)} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"/>
    const net = (u1: number, u2: number, v: number) => <>
      {is3d && polygon([fp(u1, v), fp(u2, v), fp(u2, v, 1.1), fp(u1, v, 1.1)], '#54756988')}
      {line(fp(u1, v, 1.1), fp(u2, v, 1.1), '#f9f4de', 1.4)}
      {[u1, u2].map((u, i) => <g key={`play-net-post-${i}`}>{line(fp(u, v), fp(u, v, 1.4), '#45654f', 1.6)}</g>)}
      {!is3d && line(fp(u1, v), fp(u2, v), '#45654f', 1.7)}
    </>
    const illustration = (() => {
      switch (preset.id) {
        case 'mini-golf': return <>
          {rect(0, 0, 100, 100, '#a9ba8c', 0, '#879966')}
          {Array.from({ length: 6 }, (_, i) => {
            const u = 7 + (i % 3) * 31, v = 12 + Math.floor(i / 3) * 45
            const [hx, hy] = fp(u + 16, v + 25)
            return <g key={`golf-hole-${i}`}>
              {polygon([fp(u, v), fp(u + 10, v), fp(u + 10, v + 12), fp(u + 22, v + 12), fp(u + 22, v + 32), fp(u + 10, v + 32), fp(u + 10, v + 23), fp(u, v + 23)], '#678b66', '#d5d2ad')}
              <ellipse cx={hx} cy={hy} rx={Math.max(.1, unit * 1.4)} ry={Math.max(.1, unit * (is3d ? .7 : 1.4))} fill="#364f3b"/>
              {line(fp(u + 16, v + 25), fp(u + 16, v + (is3d ? 25 : 17), 2), '#eff2d7', 1)}
              {polygon([fp(u + 16, v + (is3d ? 25 : 17), 2), fp(u + 23, v + (is3d ? 25 : 17), 1.8), fp(u + 16, v + (is3d ? 25 : 21), 1.3)], '#df7765', '#df7765')}
              {rect(u + 3, v + 3, 4, 5, '#d5c7a5', .3)}
            </g>
          })}
        </>
        case 'pickleball': return <>
          {rect(0, 0, 100, 100, '#8bb09a', 0, '#65856b')}{rect(14, 10, 72, 80, '#557f78')}
          {rect(14, 38, 72, 24, '#c58a73')}
          {trace([fp(14, 38), fp(86, 38)])}{trace([fp(14, 62), fp(86, 62)])}
          {trace([fp(50, 10), fp(50, 38)])}{trace([fp(50, 62), fp(50, 90)])}{net(10, 90, 50)}
        </>
        case 'beach-volleyball': return <>
          {rect(0, 0, 100, 100, '#d8c693', 0, '#b4a574')}{rect(14, 14, 72, 72, '#e7d7a6')}
          {[20, 42, 64].map((u, i) => <g key={`sand-texture-${i}`}>{trace([fp(u, 27), fp(u + 8, 30)], '#c5b581', .6)}{trace([fp(u + 6, 71), fp(u + 14, 74)], '#c5b581', .6)}</g>)}
          {net(10, 90, 50)}{polygon(oval(74, 74, 3, 4), '#f8f0d5', '#c79562')}
        </>
        case 'splash-pad': return <>
          {rect(0, 0, 100, 100, '#eee3c8', 0, '#bebba1')}
          {polygon(oval(38, 53, 30, 35), '#76bec2', '#f7f3df')}{polygon(oval(76, 71, 17, 18), '#a4d8cf', '#f7f3df')}
          {[20, 38, 56].map((u, i) => <g key={`water-jet-${i}`}>
            {polygon(oval(u, 65, 3, 2), '#d5f0e0', '#b0e3d9')}
            {trace(Array.from({ length: 9 }, (_, n) => fp(u - 5 + n * 1.25, 65 - Math.sin(n * Math.PI / 8) * (is3d ? 0 : 12), Math.sin(n * Math.PI / 8) * 3)), '#f6fff0', 1.7)}
          </g>)}
          {rect(66, 17, 19, 20, '#dfb968', 3)}
          {[68, 82].map((u, i) => <g key={`water-slide-post-${i}`}>{line(fp(u, 20), fp(u, 20, 3), '#8f916e', 1.6)}</g>)}
          {polygon([fp(68, 37, 3), fp(80, 37, 3), fp(59, 64), fp(47, 64)], '#df7967', '#f6d8ac')}
          {[20, 27, 34].map((v, i) => <g key={`water-slide-rung-${i}`}>{line(fp(59, v, (v - 17) / 7), fp(66, v, (v - 17) / 7), '#bd9e6e', 1.1)}</g>)}
          {watermelonParasol(f, f.width * .15, f.depth * .12, unit * 1.1)}
        </>
        case 'kart-track': return <>
          {rect(0, 0, 100, 100, '#a5b18c', 0, '#81976d')}
          {polygon(oval(50, 50, 45, 42), '#737c73', '#d2cbb5')}{polygon(oval(50, 50, 25, 22), '#a4b98c', '#eee5cb')}
          {trace(oval(50, 50, 35, 32), '#c7c7b5', .8)}
          {Array.from({ length: 8 }, (_, i) => <g key={`kart-checker-${i}`}>{rect(47 + (i % 2) * 3, 9 + Math.floor(i / 2) * 5, 3, 5, i % 3 ? '#f2ecd9' : '#405449')}</g>)}
          {[20, 52, 78].map((u, i) => <g key={`kart-${i}`}>{rect(u, i === 1 ? 73 : 20, 8, 7, i === 1 ? '#dc7967' : '#e4c279', .5, '#485f4f')}{rect(u + 2, i === 1 ? 74 : 21, 4, 3, '#446458', .8)}</g>)}
        </>
        case 'outdoor-cinema': return <>
          {rect(0, 0, 100, 100, '#a9b694', 0, '#849773')}{rect(8, 7, 84, 25, '#d7c9a9')}
          {[18, 82].map((u, i) => <g key={`cinema-post-${i}`}>{line(fp(u, 17), fp(u, 17, 5), '#566b56', 2)}</g>)}
          {polygon([fp(18, is3d ? 17 : 12, 1), fp(82, is3d ? 17 : 12, 1), fp(82, is3d ? 17 : 28, 5), fp(18, is3d ? 17 : 28, 5)], '#f7f5dc', '#667d65')}
          {polygon([fp(46, is3d ? 17 : 16, 2), fp(59, is3d ? 17 : 20, 3), fp(46, is3d ? 17 : 24, 4)], '#de7f6b', '#de7f6b')}
          {Array.from({ length: 12 }, (_, i) => <g key={`cinema-seat-${i}`}>{rect(17 + (i % 4) * 18, 43 + Math.floor(i / 4) * 17, 12, 10, '#ddbd8f', .5, '#a28c67')}{rect(17 + (i % 4) * 18, 43 + Math.floor(i / 4) * 17, 12, 2, '#a4845f', 1)}</g>)}
        </>
        case 'activity-lawn': return <>
          {rect(0, 0, 100, 100, '#93ae7c', 0, '#759361')}{rect(10, 15, 80, 70, '#a3ba88', 0, '#dfdfbd')}
          {trace([fp(50, 15), fp(50, 85)], '#dee5c5')}{trace(oval(50, 50, 13, 17), '#dee5c5')}
          {[12, 86].map((u, i) => <g key={`lawn-game-${i}`}>{rect(u, 42, 2, 17, '#f0e7bf', .15, '#d8d5ad')}{line(fp(u, 42), fp(u, 42, 1.2), '#df8365', 1.5)}</g>)}
          {polygon(oval(65, 35, 4, 3, .5), '#e0ad6c', '#f3e0aa')}
          {[18, 73].map((u, i) => <g key={`lawn-grass-${i}`}>{trace([fp(u, 92), fp(u - 2, 87), fp(u + 2, 92), fp(u + 4, 87)], '#7b985f', .9)}</g>)}
        </>
        default: return null
      }
    })()
    return <g pointerEvents="none" data-preset-illustration={preset.id}>{illustration}</g>
  }
  const renderLandscape = (f: Facility): ReactNode => {
    const [w, d] = dimensions(f)
    return <><polygon points={quad(f.x, f.y, w, d)} fill="#9aab7d" stroke="#83966c" strokeWidth=".8"/><polygon points={quad(f.x + 2, f.y + 2, Math.max(1, w - 4), Math.max(1, d - 4))} fill="#afbb92" stroke="#a3b286" strokeWidth="1"/>{[.25, .5, .75].map((r, i) => <g key={`garden-${i}`}><ellipse cx={p(f.x + w * r, f.y + d * .6)[0]} cy={p(f.x + w * r, f.y + d * .6)[1]} rx="5" ry={is3d ? 2.5 : 5} fill="#798f63"/>{line(p(f.x + w * r - 1.8, f.y + d * .6), p(f.x + w * r + 1.8, f.y + d * .6), '#b9c18d', 1)}</g>)}
      {Math.min(f.width, f.depth) >= 6 && <g pointerEvents="none">{[.3, .68].map((r, i) => <g key={`melon-garden-${i}`}>
        {is3d && <polygon points={points([facilityPoint(f, f.width * r - 1.2, f.depth * .35 - 1), facilityPoint(f, f.width * r + 1.2, f.depth * .35 - 1), facilityPoint(f, f.width * r + 1.2, f.depth * .35 + 1), facilityPoint(f, f.width * r - 1.2, f.depth * .35 + 1)])} fill="#d8d7b8" stroke="#9fa882" strokeWidth=".6"/>}
        {watermelonOrnament(f, f.width * r, f.depth * .35, Math.min(2, f.width * .12, f.depth * .15), is3d ? .7 : 0)}
      </g>)}</g>}
    </>
  }
  const renderFacility = (f: Facility) => {
    const [w, d] = dimensions(f), selected = selection.has(f.id)
    const preset = getFacilityPreset(f)
    return <g key={f.id} data-facility-id={f.id} data-facility-preset={preset.id} tabIndex={interactive ? 0 : undefined} role={interactive ? "button" : "img"} aria-label={`${f.name}，${getFacilityLabel(f)}${interactive ? "，点击选择" : ""}${f.locked ? '，已锁定' : interactive && selected ? '，拖动可移动' : ''}`} aria-pressed={interactive ? selected : undefined} style={{ cursor: !interactive ? 'default' : tool === 'move' ? 'grab' : selected && !f.locked ? 'move' : 'pointer' }} onPointerDown={e => beginFacility(e, f)} onKeyDown={e => {
      if (!interactive || tool !== 'select') return
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cancel(); onSelect(f.id, e.shiftKey); return }
      if (selected && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault(); cancel()
        const members = selectionIds.map(id => project.facilities.find(item => item.id === id))
        if (members.some(item => !item || item.locked || item.visible === false) || (selectionIds.length > 1 && !onMoveSelection)) return
        const step = e.shiftKey ? 5 : 1
        const dx = e.key === 'ArrowRight' ? step : e.key === 'ArrowLeft' ? -step : 0
        const dy = e.key === 'ArrowDown' ? step : e.key === 'ArrowUp' ? -step : 0
        const result = moveFacilitySelection(project, selectionIds, dx, dy)
        if (!result.ok || !result.changed) return
        const anchor = result.facilities.find(item => item.id === f.id)!
        if (selectionIds.length > 1) onMoveSelection?.(selectionIds, result.dx, result.dy)
        else onMove(f.id, anchor.x, anchor.y)
      }
    }}>
      {selected && <polygon points={quad(f.x - 1.6, f.y - 1.6, w + 3.2, d + 3.2)} fill="#d0ed83" fillOpacity=".24" stroke="#729239" strokeWidth="1.8" strokeDasharray="5 3"/>}
      {['mini-golf', 'pickleball', 'beach-volleyball', 'splash-pad', 'kart-track', 'outdoor-cinema', 'activity-lawn'].includes(preset.id) ? renderPlayFacility(f) : f.type === 'hotel' ? renderBuilding(f) : f.type === 'court' ? renderCourt(f) : f.type === 'pool' ? renderPool(f) : f.type === 'restaurant' ? renderBuilding(f, ['restaurant', 'coffee', 'bar'].includes(preset.id)) : f.type === 'parking' ? <>{renderParking(f)}{preset.id === 'ev-parking' && renderCharging(f)}</> : ['basketball', 'kids-play', 'bbq'].includes(preset.id) ? renderOutdoorActivity(f) : renderLandscape(f)}
      {f.locked && (() => {
        const [lx, ly] = p(f.x + w, f.y, is3d && (f.type === 'hotel' || f.type === 'restaurant') ? Math.min(f.floors, 30) * 3.1 + .5 : .5)
        return <g pointerEvents="none" aria-hidden="true" data-facility-locked="true" transform={`translate(${lx} ${ly})`}><rect x="-5" y="-5" width="10" height="9" rx="2" fill="#fff7e5" stroke="#65755c" strokeWidth="1"/><path d="M-3-5V-8A3 3 0 0 1 3-8V-5" fill="none" stroke="#65755c" strokeWidth="1.5"/><circle cx="0" cy="-1" r="1" fill="#65755c"/></g>
      })()}
    </g>
  }
  const visibleMaterials=(project.materials??[]).filter(piece=>piece.visible!==false)
  const renderMaterial=(piece:MaterialPiece)=>{
    const b=materialBounds(piece)
    const corners=[0,b.width].flatMap(dx=>[0,b.depth].flatMap(dy=>[piece.z,piece.z+piece.height].map(z=>p(b.x+dx,b.y+dy,z))))
    const left=Math.min(...corners.map(q=>q[0])),top=Math.min(...corners.map(q=>q[1]))
    const right=Math.max(...corners.map(q=>q[0])),bottom=Math.max(...corners.map(q=>q[1]))
    const clickable=interactive&&!!onSelectMaterial
    return <g key={`material-${piece.id}`} data-site-material={piece.id} role={clickable?'button':undefined} tabIndex={clickable?0:undefined} aria-label={clickable?`打开${piece.name}建材编辑`:undefined} onPointerDown={clickable?e=>{if(!interactive||tool!=='select'||e.button!==0)return;e.preventDefault();e.stopPropagation();onSelectMaterial?.(piece.id)}:undefined} onKeyDown={clickable?e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelectMaterial?.(piece.id)}}:undefined}>
      {clickable&&<rect x={left} y={top} width={Math.max(.1,right-left)} height={Math.max(.1,bottom-top)} fill="transparent" pointerEvents="all"/>}
      <MaterialShapes piece={piece} mode={mode} projectPoint={p}/>
    </g>
  }
  const combinedScene=[...visibleFacilities.map(f=>({kind:'facility' as const,key:f.x+f.y,item:f})),...visibleMaterials.map(piece=>({kind:'material' as const,key:piece.x+piece.y+piece.z,item:piece}))].sort((a,b)=>a.key-b.key)
  return <div className="site-canvas" data-testid="site-canvas" style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#f1f2e9' }}>
    <svg ref={svgRef} id={svgId} xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox={bounds.join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`${project.name}，${is3d ? '三维轴测' : '二维平面'}场地设计，可选择及拖动设施`} style={{ touchAction: 'none', cursor: interactive && tool === 'move' ? 'grab' : 'default', userSelect: 'none', display: 'block', background: '#f1f2e9' }} onPointerDown={beginCanvas} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={cancel}>
      <defs><pattern id={gridId} width="24" height="24" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#bdbfaf" opacity=".4"/></pattern><linearGradient id={lawnId} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfcb9d"/><stop offset="1" stopColor="#aab991"/></linearGradient></defs>
      <rect data-ground="true" x={bounds[0]} y={bounds[1]} width={bounds[2]} height={bounds[3]} fill="#f1f2e9"/>
      <rect data-ground="true" x={bounds[0]} y={bounds[1]} width={bounds[2]} height={bounds[3]} fill={`url(#${gridId})`}/>
      <g transform={`translate(${pan[0]} ${pan[1]}) translate(${center[0]} ${center[1]}) scale(${scale}) translate(${-center[0]} ${-center[1]})`}>
        {is3d && <><polygon points={points([p(0, D), p(W, D), p(W, D, -3), p(0, D, -3)])} fill="#a6ac8d"/><polygon points={points([p(W, 0), p(W, D), p(W, D, -3), p(W, 0, -3)])} fill="#8e987a"/><polygon points={points([[p(0, D)[0] + 18, p(0, D)[1] + 19], [p(W, D)[0] + 18, p(W, D)[1] + 19], [p(W, 0)[0] + 18, p(W, 0)[1] + 19], [p(0, 0)[0] + 18, p(0, 0)[1] + 19]])} fill="#6c7661" opacity=".07"/></>}
        <polygon data-ground="true" points={quad(0, 0, W, D)} fill={`url(#${lawnId})`} stroke="#a5b18b" strokeWidth="1.1"/>
        <polygon data-ground="true" points={quad(7, 7, Math.max(1, W - 14), Math.max(1, D - 14))} fill="none" stroke="#d3d9bd" strokeWidth="1.2"/>
        <polygon data-ground="true" points={quad(7, D - 13, W - 14, 5)} fill="#dadaca"/>
        <polygon data-ground="true" points={quad(W * .46, 9, 3.5, D - 19)} fill="#d8d8c7"/>
        <polygon data-ground="true" points={quad(9, D * .49, W - 18, 2)} fill="#d1d3bd"/>
        {showGrid && <g opacity=".4" pointerEvents="none">{Array.from({ length: Math.floor(W / 10) + 1 }, (_, i) => <g key={`gx-${i}`}>{line(p(i * 10, 0), p(i * 10, D), '#879576', .55)}</g>)}{Array.from({ length: Math.floor(D / 10) + 1 }, (_, i) => <g key={`gy-${i}`}>{line(p(0, i * 10), p(W, i * 10), '#879576', .55)}</g>)}</g>}
        {plantedTrees.filter(t => t.y < D * .3 && outsideFootprints(t)).map(t => tree(t.x, t.y, t.i))}
        {combinedScene.map(entry=>entry.kind==='facility'?renderFacility(entry.item):renderMaterial(entry.item))}
        {plantedTrees.filter(t => t.y >= D * .3 && outsideFootprints(t)).map(t => tree(t.x, t.y, t.i))}
        {showLabels && visibleFacilities.map(f => {
          const [w, d] = dimensions(f), height = is3d && (f.type === 'hotel' || f.type === 'restaurant') ? Math.min(f.floors, 30) * 3.1 : 0
          const [lx, ly] = p(f.x + w * .5, f.y + d * .5, height + (is3d ? 1.6 : 0))
          const textWidth = Math.max(60, f.name.length * 9 + 25)
          return <g key={`label-${f.id}`} pointerEvents="none" aria-hidden="true"><rect x={lx - textWidth / 2} y={ly - 13} width={textWidth} height="24" rx="4" fill="#fffff8" fillOpacity=".95" stroke={selection.has(f.id) ? '#91a653' : '#d3d5c4'} strokeWidth=".7"/><circle cx={lx - textWidth / 2 + 9} cy={ly - 1} r="2.3" fill={f.type === 'court' ? '#b87756' : f.type === 'pool' ? '#70aeb3' : '#78826c'}/><text x={lx + 3} y={ly + 2.5} textAnchor="middle" fontFamily="Arial, PingFang SC, Microsoft YaHei, sans-serif" fontSize="9" fontWeight="500" fill="#485448">{f.name}</text></g>
        })}
        {showLabels&&(project.materialAssemblies??[]).map(assembly=>{
          const members=visibleMaterials.filter(piece=>assembly.pieceIds.includes(piece.id))
          if(!members.length)return null
          const rects=members.map(materialBounds),x=Math.min(...rects.map(b=>b.x)),y=Math.min(...rects.map(b=>b.y)),right=Math.max(...rects.map(b=>b.x+b.width)),bottom=Math.max(...rects.map(b=>b.y+b.depth)),z=is3d?Math.max(...members.map(piece=>piece.z+piece.height)):0
          const [sx,sy]=p((x+right)/2,(y+bottom)/2,z+.4)
          return <text key={`assembly-${assembly.id}`} x={sx} y={sy} textAnchor="middle" fontSize="10" fill="#48694d" pointerEvents="none" data-material-assembly-label={assembly.id}>{assembly.name}</text>
        })}
        {showMeasurements&&<FacilityDimensions facilities={physicalFacilities.filter(f=>selection.has(f.id))} project={project} projectPoint={p}/>}
        {showGrid && <g pointerEvents="none" fill="#7b8770" fontFamily="Arial, sans-serif" fontSize="10">{line(p(0, D + 7), p(W, D + 7), '#8b957a', .7, { strokeDasharray: '3 3' })}{line(p(W + 7, 0), p(W + 7, D), '#8b957a', .7, { strokeDasharray: '3 3' })}<text x={p(W / 2, D + 11)[0]} y={p(W / 2, D + 11)[1] + 4} textAnchor="middle">{W} m</text><text x={p(W + 12, D / 2)[0]} y={p(W + 12, D / 2)[1] + 4} textAnchor="middle">{D} m</text></g>}
      </g>
    </svg>
  </div>
}
