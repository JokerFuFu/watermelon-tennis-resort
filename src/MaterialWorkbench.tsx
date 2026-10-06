import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Search, Copy, RotateCw, Trash2, Lock, Eye, Undo2, Redo2, Plus, Minus, Maximize2, Layers, Box, Hand } from 'lucide-react'
import type { MaterialPiece, MaterialPreset, MaterialPresetId, MaterialAssembly, Project } from './types'
import { MATERIAL_CATEGORIES, MATERIAL_PRESETS, MATERIAL_PRESET_BY_ID } from './materialCatalog'
import { createMaterialPiece, materialBounds, moveMaterialSelection, copyMaterialSelection, createMaterialAssembly, dissolveMaterialAssembly, removeMaterialPieces, rotateMaterialSelection, standMaterialPiece, estimateMaterialPurchase } from './materials'
import MaterialShapes from './MaterialShapes'
import { NumberField } from './ui'
import './material-workbench.css'

interface Props {
  project: Project
  onChange: (edit: (project: Project) => Project) => void
  onClose: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  onLocate?: (ids: string[]) => void
  initialSelection?: string[]
}
type Tab = 'library' | 'scene' | 'properties' | 'assemblies'
type Point = [number, number]
const EMPTY_PIECES:MaterialPiece[]=[]
const EMPTY_ASSEMBLIES:MaterialAssembly[]=[]
const basisNames = { piece: '每件', length: '长边米', area: '最大板面㎡', volume: '外包体积m³' }
const money = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const millimetres = (n: number) => (n * 1000).toLocaleString('zh-CN', { maximumFractionDigits: 2 })

function PriceInput({ value, onCommit }: { value: number | null; onCommit: (value: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? '' : String(value))
  useEffect(() => setDraft(value === null ? '' : String(value)), [value])
  function commit() {
    if (!draft.trim()) { if (value !== null) onCommit(null); return }
    const next = Number(draft)
    if (Number.isFinite(next) && next >= 0 && next <= 100000000) { if (next !== value) onCommit(next) }
    else setDraft(value === null ? '' : String(value))
  }
  return <label className="mw-field">采购单价（元）<input aria-label="建材采购单价" type="number" min="0" max="100000000" step="0.01" placeholder="未报价" value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { event.stopPropagation(); setDraft(value === null ? '' : String(value)) } }} /></label>
}

const Preview = memo(function Preview({ preset }: { preset: MaterialPreset }) {
  const piece: MaterialPiece = { id: `preview-${preset.id}`, materialId: preset.id, name: preset.name, x: 0, y: 0, z: 0, width: preset.width, depth: preset.depth, height: preset.height, rotation: 0, color: preset.color, unitPrice: null, priceBasis: preset.priceBasis, taxMode: 'unknown', evidence: { kind: 'assumption', name: '未询价', scope: '商品外包尺寸示例' } }
  const raw = (x: number, y: number, z: number): Point => [x - y, (x + y) * .48 - z]
  const corners = [0, preset.width].flatMap(x => [0, preset.depth].flatMap(y => [0, preset.height].map(z => raw(x, y, z))))
  const minX = Math.min(...corners.map(p => p[0])), maxX = Math.max(...corners.map(p => p[0])), minY = Math.min(...corners.map(p => p[1])), maxY = Math.max(...corners.map(p => p[1]))
  const scale = Math.min(110 / Math.max(maxX - minX, .001), 65 / Math.max(maxY - minY, .001))
  return <svg viewBox="0 0 140 90" aria-hidden="true"><MaterialShapes piece={piece} mode="3d" projectPoint={(x, y, z) => { const p = raw(x, y, z ?? 0); return [(p[0] - (minX + maxX) / 2) * scale + 70, (p[1] - (minY + maxY) / 2) * scale + 47] }} /></svg>
})

export default function MaterialWorkbench({ project, onChange, onClose, onUndo, onRedo, canUndo, canRedo, onLocate, initialSelection=[] }: Props) {
  const pieces = project.materials ?? EMPTY_PIECES, assemblies = project.materialAssemblies ?? EMPTY_ASSEMBLIES
  const [selected, setSelected] = useState<string[]>(()=>[...new Set(initialSelection.flatMap(id=>assemblies.find(a=>a.pieceIds.includes(id))?.pieceIds??[id]))].filter(id=>pieces.some(p=>p.id===id)))
  const [tab, setTab] = useState<Tab>('library')
  const [category, setCategory] = useState('all'), [search, setSearch] = useState('')
  const [mode, setMode] = useState<'2d' | '3d'>('3d'), [panTool, setPanTool] = useState(false)
  const [camera, setCamera] = useState({ x: 2, y: 2, span: 6 })
  const [notice, setNotice] = useState(''), [groupName, setGroupName] = useState('我的自建作品')
  const [localEdits, setLocalEdits] = useState(0), [localRedos, setLocalRedos] = useState(0)
  const dialog = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), closeRef = useRef(onClose)
  closeRef.current = onClose
  const gesture = useRef<{ kind: 'move' | 'pan'; ids: string[]; start: Point; last: Point; origin: Project; camera: typeof camera; pointer: number } | null>(null)
  const [preview, setPreview] = useState<Project | null>(null)
  const displayPieces = preview?.materials ?? pieces
  const selectedIds = useMemo(() => new Set(selected), [selected])
  const primary = useMemo(() => pieces.find(piece => piece.id === selected[0]), [pieces, selected])
  const chosen = useMemo(() => pieces.filter(piece => selectedIds.has(piece.id)), [pieces, selectedIds])
  const selectedAssembly = useMemo(() => assemblies.find(assembly => primary && assembly.pieceIds.includes(primary.id)), [assemblies, primary])
  const anyLocked = useMemo(() => chosen.some(piece => piece.locked), [chosen])
  const purchase = useMemo(() => estimateMaterialPurchase(project), [project])
  const purchasePreview = useMemo(() => estimateMaterialPurchase({...project,materialBudgetIncluded:true}), [project])
  const purchaseSubtotal=purchasePreview.total
  const shown = useMemo(() => MATERIAL_PRESETS.filter(preset => (category === 'all' || preset.category === category) && `${preset.name} ${preset.description}`.includes(search.trim())), [category, search])
  const visiblePieces = useMemo(() => displayPieces.filter(piece => piece.visible !== false).sort((a, b) => a.x + a.y + a.z - b.x - b.y - b.z), [displayPieces])
  const scale = 800 / camera.span
  const projectPoint = useCallback((x: number, y: number, z = 0): Point => mode === '2d' ? [500 + (x - camera.x) * scale, 330 + (y - camera.y) * scale] : [500 + (x - camera.x - y + camera.y) * scale * .8, 330 + (x - camera.x + y - camera.y) * scale * .42 - z * scale], [mode, camera.x, camera.y, scale])
  const unprojectDelta = (dx: number, dy: number): Point => mode === '2d' ? [dx / scale, dy / scale] : [(dx / (scale * .8) + dy / (scale * .42)) / 2, (dy / (scale * .42) - dx / (scale * .8)) / 2]

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.querySelector<HTMLElement>('button')?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); if (gesture.current) { gesture.current = null; setPreview(null) } else closeRef.current() }
      if (event.key !== 'Tab') return
      const nodes = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(node => node.getClientRects().length)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('keydown', key); previous?.focus() }
  }, [])
  useEffect(() => setSelected(ids => {const next=ids.filter(id=>pieces.some(piece=>piece.id===id));return next.length===ids.length?ids:next}), [pieces])
  useEffect(() => { if (pieces.length) fitScene(pieces) }, [mode])

  function fitScene(items = pieces) {
    if (!items.length) { setCamera({ x: 2, y: 2, span: 6 }); return }
    const raw=(x:number,y:number,z:number):Point=>mode==='2d'?[x,y]:[(x-y)*.8,(x+y)*.42-z]
    const projected=items.flatMap(piece=>{const b=materialBounds(piece);return [0,b.width].flatMap(dx=>[0,b.depth].flatMap(dy=>[piece.z,piece.z+piece.height].map(z=>raw(b.x+dx,b.y+dy,z))))})
    const left=Math.min(...projected.map(q=>q[0])),right=Math.max(...projected.map(q=>q[0])),top=Math.min(...projected.map(q=>q[1])),bottom=Math.max(...projected.map(q=>q[1]))
    const cx=(left+right)/2,cy=(top+bottom)/2
    const centre:Point=mode==='2d'?[cx,cy]:[(cx/.8+cy/.42)/2,(cy/.42-cx/.8)/2]
    setCamera({x:centre[0],y:centre[1],span:Math.max(4,(right-left)*1.2,(bottom-top)*1.92)})
  }
  function edit(transform: (p: Project) => Project, message = '') {
    try {
      let changed=false
      onChange(current=>{const next=transform(current);changed=JSON.stringify(next)!==JSON.stringify(current);return next})
      if(changed){setLocalEdits(count=>count+1);setLocalRedos(0)}
      setNotice(message)
    } catch (error) { setNotice(error instanceof Error ? error.message : '操作未完成，当前材料保留') }
  }
  function idsFor(id: string) { return assemblies.find(assembly => assembly.pieceIds.includes(id))?.pieceIds ?? [id] }
  function selectPiece(id: string, multiple = false) {
    const ids = idsFor(id)
    const next = multiple ? ids.every(item => selected.includes(item)) ? selected.filter(item => !ids.includes(item)) : [...new Set([...selected, ...ids])] : ids
    setSelected(next)
    return next
  }
  function add(materialId: MaterialPresetId) {
    if (pieces.length >= 500) { setNotice('最多添加 500 件建材'); return }
    const piece = createMaterialPiece(materialId, project)
    if (primary) { const bounds = materialBounds(primary); piece.x = bounds.x + bounds.width + .04; piece.y = bounds.y; piece.z = primary.z }
    else if (pieces.length) { piece.x = camera.x; piece.y = camera.y }
    edit(p => ({ ...p, materials: [...(p.materials ?? []), piece] }), `已添加${piece.name}`)
    setSelected([piece.id]); setTab('scene'); fitScene([piece, ...(primary ? [primary] : [])])
  }
  function patch(patch: Partial<MaterialPiece>) {
    if (!primary) return
    if (anyLocked) { setNotice('所选材料或组合已锁定，请先解锁'); return }
    edit(p => ({ ...p, materials: (p.materials ?? []).map(piece => piece.id === primary.id ? { ...piece, ...patch } : piece) }))
  }
  function move(axis: 'x' | 'y' | 'z', value: number) {
    if (!primary) return
    edit(p => moveMaterialSelection(p, selected, axis === 'x' ? value - primary.x : 0, axis === 'y' ? value - primary.y : 0, axis === 'z' ? value - primary.z : 0))
  }
  function point(event: React.PointerEvent): Point {
    const element = svg.current, matrix = element?.getScreenCTM()
    if (!element || !matrix) return [0, 0]
    const p = element.createSVGPoint(); p.x = event.clientX; p.y = event.clientY
    const local = p.matrixTransform(matrix.inverse()); return [local.x, local.y]
  }
  function start(event: React.PointerEvent, id?: string) {
    if (event.button !== 0 && event.button !== 1) return
    if (document.activeElement instanceof HTMLInputElement) document.activeElement.blur()
    const p = point(event), kind = panTool || event.button === 1 || !id ? 'pan' : 'move'
    const ids = id && kind === 'move' ? selectPiece(id, event.shiftKey) : selected
    if (event.shiftKey && id) { event.preventDefault(); event.stopPropagation(); return }
    if (kind === 'move' && pieces.some(piece => ids.includes(piece.id) && piece.locked)) { setNotice('所选材料或组合已锁定，请先解锁'); return }
    event.preventDefault(); event.stopPropagation()
    svg.current?.setPointerCapture(event.pointerId)
    gesture.current = { kind, ids, start: p, last: [0, 0], origin: project, camera, pointer: event.pointerId }
  }
  function drag(event: React.PointerEvent) {
    const active = gesture.current
    if (!active || active.pointer !== event.pointerId) return
    const p = point(event), delta = unprojectDelta(p[0] - active.start[0], p[1] - active.start[1])
    active.last = delta
    if (active.kind === 'pan') setCamera({ ...active.camera, x: active.camera.x - delta[0], y: active.camera.y - delta[1] })
    else try { setPreview(moveMaterialSelection(active.origin, active.ids, delta[0], delta[1])) } catch (error) { setNotice(error instanceof Error ? error.message : '无法移动材料') }
  }
  function finish(event: React.PointerEvent, cancel = false) {
    const active = gesture.current
    if (!active || active.pointer !== event.pointerId) return
    gesture.current = null; setPreview(null)
    if (svg.current?.hasPointerCapture(event.pointerId)) svg.current.releasePointerCapture(event.pointerId)
    if (!cancel && active.kind === 'move' && (Math.abs(active.last[0]) > .00001 || Math.abs(active.last[1]) > .00001)) edit(p => moveMaterialSelection(p, active.ids, active.last[0], active.last[1]))
  }
  function toggle(field: 'locked' | 'visible') {
    const value = field === 'locked' ? !anyLocked : chosen.some(p => p.visible === false)
    edit(p => ({ ...p, materials: (p.materials ?? []).map(piece => selected.includes(piece.id) ? { ...piece, [field]: value } : piece) }))
  }
  function copySelection(stack = false) {
    try {
      const next = copyMaterialSelection(project, selected, { stack })
      const oldIDs = new Set(pieces.map(piece => piece.id))
      const copied = (next.materials ?? []).filter(piece => !oldIDs.has(piece.id))
      edit(() => next, stack ? '已复制并叠放' : '已复制所选建材')
      setSelected(copied.map(piece => piece.id))
    } catch (error) { setNotice(error instanceof Error ? error.message : '无法复制材料') }
  }
  function undo() { if (localEdits > 0 && canUndo) { onUndo(); setLocalEdits(count => count - 1); setLocalRedos(count => count + 1) } }
  function redo() { if (localRedos > 0 && canRedo) { onRedo(); setLocalEdits(count => count + 1); setLocalRedos(count => count - 1) } }

  const library = <section className="mw-library" data-mw-panel="library"><div className="mw-search"><Search size={15}/><input aria-label="搜索建材" placeholder="砖块、木板、钢管…" value={search} onChange={e => setSearch(e.target.value)}/></div><select aria-label="建材分类" value={category} onChange={e => setCategory(e.target.value)}><option value="all">全部建材 · 33 种</option>{MATERIAL_CATEGORIES.map(item => <option value={item.id} key={item.id}>{item.label}</option>)}</select><div className="mw-library-grid">{shown.map(preset => <button key={preset.id} data-material-library-id={preset.id} aria-label={`添加${preset.name}`} onClick={() => add(preset.id)} disabled={pieces.length >= 500} title={preset.description}><Preview preset={preset}/><strong>{preset.name}</strong><small>{millimetres(preset.width)} × {millimetres(preset.depth)} × {millimetres(preset.height)} mm</small></button>)}</div>{!shown.length && <p className="mw-empty">没有找到匹配建材</p>}</section>
  const scene = <section className="mw-scene" data-mw-panel="scene"><div className="mw-scene-heading"><div><strong>近景拼搭</strong><small>{pieces.length} 件材料 · {assemblies.length} 个作品</small></div><div className="mw-view-controls"><button onClick={() => setMode('2d')} aria-pressed={mode === '2d'}>平面</button><button onClick={() => setMode('3d')} aria-pressed={mode === '3d'}>立体</button></div></div><div className="mw-scene-surface"><svg id="material-builder-svg" ref={svg} viewBox="0 0 1000 660" role="img" aria-label="建材近景拼搭画布" onPointerDown={event => start(event)} onPointerMove={drag} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}>
    <defs><pattern id="mw-grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M 40 0 L 0 0 0 40" fill="none" stroke="#dce4d5" strokeWidth="1"/></pattern></defs><rect width="1000" height="660" fill="#f2f5ed"/><rect width="1000" height="660" fill="url(#mw-grid)"/>
    {visiblePieces.map(piece => <g key={piece.id} data-selected-piece={selectedIds.has(piece.id) ? piece.id : undefined} data-material-piece={piece.id} role="button" tabIndex={0} aria-label={`选择${piece.name}${piece.locked ? '，已锁定' : ''}`} onPointerDown={event => start(event, piece.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectPiece(piece.id, event.shiftKey) } }}>{(()=>{const b=materialBounds(piece),corners=[0,b.width].flatMap(dx=>[0,b.depth].flatMap(dy=>[piece.z,piece.z+piece.height].map(z=>projectPoint(b.x+dx,b.y+dy,z))));const left=Math.min(...corners.map(q=>q[0])),top=Math.min(...corners.map(q=>q[1])),right=Math.max(...corners.map(q=>q[0])),bottom=Math.max(...corners.map(q=>q[1]));return <rect data-material-hitbox={piece.id} x={left} y={top} width={Math.max(2,right-left)} height={Math.max(2,bottom-top)} fill="transparent" pointerEvents="all"/>})()}<MaterialShapes piece={piece} mode={mode} projectPoint={projectPoint} selected={selectedIds.has(piece.id)}/></g>)}
  </svg>{!pieces.length && <div className="mw-scene-empty"><Box size={42}/><strong>从左侧挑选一块建材</strong><span>拖动拼搭，叠放、组合，搭建自己的作品</span></div>}<div className="mw-canvas-controls"><button aria-label="缩小建材视图" onClick={() => setCamera(p => ({ ...p, span: Math.min(4000, p.span * 1.3) }))}><Minus size={17}/></button><button aria-label="放大建材视图" onClick={() => setCamera(p => ({ ...p, span: Math.max(.3, p.span / 1.3) }))}><Plus size={17}/></button><button aria-label="适应全部建材" onClick={() => fitScene()}><Maximize2 size={17}/></button><button aria-label="平移建材视图" aria-pressed={panTool} onClick={() => setPanTool(p => !p)}><Hand size={17}/></button></div></div><p className="mw-hint">拖动材料调整 X / Y；Shift 点击多选。高度通过右侧 Z 或「复制叠放」调整。背景网格仅作视觉参考。</p><div className="mw-actions"><button disabled={!chosen.length || anyLocked} onClick={() => copySelection()}><Copy size={15}/>复制</button><button disabled={!chosen.length || anyLocked} onClick={() => copySelection(true)}><Layers size={15}/>复制叠放</button><button disabled={!chosen.length || anyLocked} onClick={() => edit(p => rotateMaterialSelection(p, selected))}><RotateCw size={15}/>旋转90°</button><button disabled={!primary || anyLocked || selected.length !== 1} onClick={() => primary && edit(p => standMaterialPiece(p, primary.id, 'width'))}>立放</button><button disabled={!primary || anyLocked || selected.length !== 1} onClick={() => primary && edit(p => standMaterialPiece(p, primary.id, 'depth'))}>侧立</button><button disabled={!chosen.length} onClick={() => toggle('locked')}><Lock size={15}/>{anyLocked ? '解锁' : '锁定'}</button><button disabled={!chosen.length} onClick={() => toggle('visible')}><Eye size={15}/>{chosen.some(p => p.visible === false) ? '显示' : '隐藏'}</button><button disabled={!chosen.length || anyLocked} onClick={() => { edit(p => removeMaterialPieces(p, selected)); setSelected([]) }}><Trash2 size={15}/>删除</button></div></section>
  const properties = <section className="mw-properties" data-mw-panel="properties"><h3>材料属性</h3>{primary ? <><p className="mw-hint">已选 {selected.length} 件{selectedAssembly ? ` · ${selectedAssembly.name}` : ''}。坐标调整移动整组；尺寸与单价编辑当前材料。</p><fieldset disabled={anyLocked}><label className="mw-field">材料名称<input aria-label="材料名称" value={primary.name} maxLength={80} onChange={e => e.target.value.trim() && patch({ name: e.target.value })}/></label><div className="mw-two"><NumberField resetKey={primary.id} label="材料宽度" value={primary.width} onChange={width => patch({ width })} min={.0001} max={1000} step={.0001} unit="m"/><NumberField resetKey={primary.id} label="材料深度" value={primary.depth} onChange={depth => patch({ depth })} min={.0001} max={1000} step={.0001} unit="m"/></div><NumberField resetKey={primary.id} label="材料高度" value={primary.height} onChange={height => patch({ height })} min={.0001} max={1000} step={.0001} unit="m"/><p className="mw-hint">{millimetres(primary.width)} × {millimetres(primary.depth)} × {millimetres(primary.height)} mm · 旋转 {primary.rotation}°</p><div className="mw-two"><NumberField resetKey={primary.id} label="材料X坐标" value={primary.x} onChange={value => move('x', value)} min={-1000} max={1000} step={.001} unit="m"/><NumberField resetKey={primary.id} label="材料Y坐标" value={primary.y} onChange={value => move('y', value)} min={-1000} max={1000} step={.001} unit="m"/></div><NumberField resetKey={primary.id} label="材料Z高度" value={primary.z} onChange={value => move('z', value)} min={0} max={1000} step={.001} unit="m"/><label className="mw-field">材料颜色<input aria-label="材料颜色" type="color" value={primary.color} onChange={e => patch({ color: e.target.value })}/></label><h3>采购计价</h3><PriceInput key={primary.id} value={primary.unitPrice} onCommit={unitPrice => patch({ unitPrice, evidence: { ...primary.evidence, name: '用户录入单价（未核验）' } })}/><label className="mw-field">计价单位<select aria-label="建材计价单位" value={primary.priceBasis} onChange={e => patch({ priceBasis: e.target.value as MaterialPiece['priceBasis'] })}>{Object.entries(basisNames).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label><label className="mw-field">税口径<select aria-label="建材税口径" value={primary.taxMode} onChange={e => patch({ taxMode: e.target.value as MaterialPiece['taxMode'] })}><option value="unknown">待核实</option><option value="included">已含税</option><option value="excluded">未含税</option></select></label>{primary.taxMode === 'excluded' && <label className="mw-field">税率（%）<input aria-label="建材税率" type="number" min="0" max="100" step=".01" placeholder="待核实" value={primary.taxRate ?? ''} onChange={e => { const value = e.target.value === '' ? undefined : Number(e.target.value); if (value === undefined || Number.isFinite(value) && value >= 0 && value <= 100) patch({ taxRate: value }) }}/></label>}<label className="mw-field">价格来源<input aria-label="建材价格来源" value={primary.evidence.name} maxLength={120} onChange={e => e.target.value.trim() && patch({ evidence: { ...primary.evidence, name: e.target.value } })}/></label><label className="mw-field">包含范围<textarea aria-label="建材价格范围" value={primary.evidence.scope} maxLength={500} onChange={e => e.target.value.trim() && patch({ evidence: { ...primary.evidence, scope: e.target.value } })}/></label></fieldset>{anyLocked && <p className="mw-hint">材料或组合已锁定，解锁后可编辑。</p>}<p className="mw-hint">{MATERIAL_PRESET_BY_ID[primary.materialId].description}</p>{onLocate && <button onClick={() => onLocate(selected)}>在总场地中定位</button>}</> : <p className="mw-empty">选中材料后编辑规格、高度与采购单价。</p>}</section>
  const groups = <section className="mw-assemblies" data-mw-panel="assemblies"><h3>自建作品与材料</h3><div className="mw-group-create"><input aria-label="自建作品名称" value={groupName} maxLength={80} onChange={e => setGroupName(e.target.value)}/><button disabled={selected.length < 2 || anyLocked || !groupName.trim()} onClick={() => edit(p => createMaterialAssembly(p, selected, groupName.trim()), '已组合为自建作品')}>组合所选 {selected.length} 件</button></div>{assemblies.map(assembly => <div className="mw-group" key={assembly.id}><button className="mw-group-select" aria-label={`选择作品${assembly.name}`} onClick={() => { setSelected(assembly.pieceIds); fitScene(pieces.filter(p => assembly.pieceIds.includes(p.id))); setTab('scene') }}><Layers size={16}/><strong>{assembly.name}</strong><small>{assembly.pieceIds.length} 件</small></button><button aria-label={`解散作品${assembly.name}`} onClick={() => edit(p => dissolveMaterialAssembly(p, assembly.id), '作品已解散，材料保留')}>解散</button></div>)}<div className="mw-pieces">{pieces.map(piece => <label key={piece.id}><input type="checkbox" aria-label={`勾选${piece.name}`} checked={selectedIds.has(piece.id)} onChange={() => selectPiece(piece.id, true)}/><span>{piece.name}<small>{piece.locked ? '已锁定 · ' : ''}{piece.visible === false ? '隐藏 · ' : ''}{millimetres(piece.width)} mm</small></span><button aria-label={`查看${piece.name}`} onClick={() => { setSelected(idsFor(piece.id)); fitScene(pieces.filter(p => idsFor(piece.id).includes(p.id))); setTab('scene') }}>查看</button></label>)}</div>{!pieces.length && <p className="mw-empty">尚未添加建材</p>}</section>

  return createPortal(<div className="mw-backdrop"><div className="mw-dialog" role="dialog" aria-modal="true" aria-labelledby="mw-title" ref={dialog}><header className="mw-header"><div><h2 id="mw-title">建材拼搭工作台</h2><p>从真实尺寸的小材料，搭建自己的作品</p></div><div className="mw-header-actions"><button aria-label="撤销建材编辑" disabled={!canUndo || localEdits === 0} onClick={undo}><Undo2 size={18}/></button><button aria-label="重做建材编辑" disabled={!canRedo || localRedos === 0} onClick={redo}><Redo2 size={18}/></button><button aria-label="关闭建材工作台" onClick={onClose}><X size={21}/></button></div></header><nav className="mw-tabs" aria-label="建材工作台区域">{([['library', '建材库'], ['scene', '拼搭'], ['properties', '属性'], ['assemblies', '作品']] as const).map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav><div className={`mw-body mw-tab-${tab}`}><div className="mw-library-area">{library}</div><div className="mw-scene-area">{scene}</div><div className="mw-right-area">{properties}{groups}</div></div><footer className="mw-footer"><div><strong>采购清单已计 ¥{money(purchaseSubtotal)}</strong><span>{purchasePreview.unpricedItems.length} 件未报价 · {purchasePreview.taxUnresolvedItems.length} 件税口径待核实 · 预算另计 ¥{money(purchase.total)}</span></div><label><input type="checkbox" aria-label="将建材采购计入建设预算" checked={project.materialBudgetIncluded === true} onChange={e => edit(p => ({ ...p, materialBudgetIncluded: e.target.checked }))}/>单列加入建设预算（先核对综合价避免重复）</label><button onClick={onClose}>返回场地</button></footer><div className="mw-status" role="status">{notice || '尺寸与外包数量用于示意拼搭和采购估算；不提供施工或结构验算。'}</div></div></div>, document.body)
}
