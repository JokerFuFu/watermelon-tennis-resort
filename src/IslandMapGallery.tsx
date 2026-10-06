import { memo, useState } from 'react'
import { generateIslandMap, ISLAND_PRESETS } from './survival'
import type { IslandPreset, IslandTerrain, SurvivalGameState } from './survivalTypes'

const PREVIEW_SEED = 20261003
const COLORS: Record<IslandTerrain, string> = { sea: '#2a8daf', beach: '#ead69c', grass: '#96b46a', forest: '#4e8150', rock: '#8f9489', freshwater: '#70ced0', ruins: '#baa887' }
const previewMaps = new Map<IslandPreset, SurvivalGameState['world']>()

function previewMap(preset: IslandPreset) {
  let world = previewMaps.get(preset)
  if (!world) {
    world = generateIslandMap(preset, PREVIEW_SEED)
    previewMaps.set(preset, world)
  }
  return world
}

const MapThumbnail = memo(function MapThumbnail({ preset }: { preset: IslandPreset }) {
  const world = previewMap(preset)
  return <svg className="island-map-thumbnail" viewBox={`0 0 ${world.width} ${world.height}`} aria-hidden="true" focusable="false" data-preview-preset={preset}>
    {world.tiles.map(tile => <rect key={`${tile.x},${tile.y}`} x={tile.x} y={tile.y} width="1" height="1" fill={COLORS[tile.terrain]} data-preview-terrain={tile.terrain} />)}
    <circle cx={world.camp.x + .5} cy={world.camp.y + .5} r=".45" fill="#fff9df" stroke="#21444a" strokeWidth=".12" />
  </svg>
})

function IslandMapGallery({ selected, onSelect }: { selected: IslandPreset; onSelect: (preset: IslandPreset) => void }) {
  const [expanded, setExpanded] = useState(false)
  const choice = ISLAND_PRESETS.find(island => island.id === selected)
  return <section className="island-map-gallery" data-map-count={ISLAND_PRESETS.length} aria-label="荒岛地图目录" onKeyDown={event => {
    // Map selection is separate from movement in the current adventure.
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D'].includes(event.key)) event.stopPropagation()
  }}>
    <div className="island-gallery-heading">
      <div><strong>下一场：{choice?.name}</strong><p>{choice?.description}</p></div>
      <button type="button" aria-expanded={expanded} aria-controls="island-map-gallery-list" onClick={() => setExpanded(value => !value)}>{expanded ? '收起地图目录' : '浏览全部地图'}<span>{ISLAND_PRESETS.length} 张</span></button>
    </div>
    {expanded && <div id="island-map-gallery-list">
      <p className="island-gallery-help">选择后点击「开始新冒险」，旧档会先备份。浏览和选择地图不会改变当前冒险；缩略图使用统一示例种子，实际冒险会重新生成。</p>
      <div className="island-gallery-grid">{ISLAND_PRESETS.map(island => <button key={island.id} type="button" className="island-map-card" data-island-card={island.id} aria-label={`选择地图${island.name}`} aria-pressed={selected === island.id} onClick={() => onSelect(island.id)}>
        <MapThumbnail preset={island.id} />
        <span className="island-map-card-title"><strong>{island.name}</strong>{selected === island.id && <span>已选择</span>}</span>
        <span className="island-map-card-description">{island.description}</span>
      </button>)}</div>
    </div>}
  </section>
}

export default memo(IslandMapGallery)
