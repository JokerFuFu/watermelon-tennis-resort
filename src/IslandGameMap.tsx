import type { IslandTerrain, IslandTile, SurvivalGameState } from './survivalTypes'

const SIZE = 42
const COLORS: Record<IslandTerrain, string> = { sea: '#2a8daf', beach: '#ead69c', grass: '#96b46a', forest: '#4e8150', rock: '#8f9489', freshwater: '#70ced0', ruins: '#baa887' }
const NAMES: Record<IslandTerrain, string> = { sea: '海洋', beach: '沙滩', grass: '草地', forest: '森林', rock: '岩地', freshwater: '淡水', ruins: '遗迹' }

function TileDrawing({ tile }: { tile: IslandTile }) {
  const exhausted = tile.resource !== null && tile.remaining === 0
  return <g opacity={exhausted ? 0.45 : 1} pointerEvents="none">
    {tile.terrain === 'sea' && <path d="M5 17q5-5 10 0t10 0t10 0M12 29q5-5 10 0t10 0" fill="none" stroke="#8ddce1" strokeWidth="1.4" opacity=".45" />}
    {tile.terrain === 'beach' && <g fill="#c5af76"><circle cx="10" cy="28" r="1" /><circle cx="29" cy="9" r="1.2" /><circle cx="32" cy="33" r="1" /></g>}
    {(tile.terrain === 'forest' || tile.resource === 'wood') && <g><path d="M22 35V15" stroke="#765836" strokeWidth="4" /><path d="M9 22 20 3 32 22Z" fill="#254f3e" /><path d="M7 29 21 9 35 29Z" fill="#32694a" /><path d="m17 16 4-7 3 6" fill="none" stroke="#8eb76a" strokeWidth="2" /></g>}
    {(tile.terrain === 'rock' || tile.resource === 'stone' || tile.resource === 'iron') && <g><path d="m5 29 7-13 13-5 12 12-5 12H13Z" fill="#657572" stroke="#52625e" strokeWidth="1" /><path d="m12 16 13-5-5 16-15 2Z" fill="#a7b1a3" /><path d="m20 27 12 8 5-12" fill="none" stroke="#cad1bc" strokeWidth="1" />{tile.resource === 'iron' && <g fill="#ebad70"><path d="m14 22 4-4 3 5-4 4Z" /><path d="m27 20 4-2 2 5-4 1Z" /></g>}</g>}
    {tile.terrain === 'freshwater' && <g><path d="M6 22q4-14 15-12t14 14q-5 12-17 8T6 22" fill="#48aebd" stroke="#b4ece2" strokeWidth="2" /><path d="M13 21q5 3 13 0M17 27h8" fill="none" stroke="#d3f6e9" /></g>}
    {tile.resource === 'fiber' && <g stroke="#34674b" strokeWidth="2" fill="none"><path d="m20 35-8-15m8 15 1-23m-1 23 12-15" /><path d="m12 20-5-3m14-5-4-6m15 14 3-6" /></g>}
    {tile.resource === 'food' && <g><path d="M23 35 20 13" stroke="#8b6941" strokeWidth="3" /><path d="M20 15Q8 4 4 15q11-2 16 0M20 15Q29 2 38 12q-11 0-18 3M20 15Q11 18 10 26q4-6 10-11M20 15q14 4 16 13-8-6-16-13" fill="#285e45" /><circle cx="22" cy="18" r="3" fill="#bd804d" /></g>}
    {tile.terrain === 'ruins' && <g fill="#cfc3a1" stroke="#827860" strokeWidth="1.1"><path d="M8 35V14h7v21M26 35V14h7v21M5 10h31v6H5Z" /><path d="m12 5 10-3 10 7H9Z" /><path d="M7 30h28v5H7Z" /></g>}
    {tile.chest && <g transform="translate(8 15)">
      <rect y="7" width="26" height="16" rx="2" fill={tile.chest.opened ? '#6c6650' : tile.chest.tier === 'golden' ? '#eeb645' : tile.chest.tier === 'silver' ? '#b8d3ce' : '#ad7445'} stroke="#544a34" strokeWidth="1.8" />
      <path d={tile.chest.opened ? 'M0 6 5-5h24l-3 11Z' : 'M0 7V2q13-8 26 0v5Z'} fill={tile.chest.tier === 'golden' ? '#f6d37c' : tile.chest.tier === 'silver' ? '#e1f0e6' : '#ce945b'} stroke="#544a34" strokeWidth="1.8" />
      <path d="M5 7v15M21 7v15" stroke="#e8c788" strokeWidth="2" />{!tile.chest.opened && <rect x="11" y="10" width="5" height="6" rx="1" fill="#fff3b0" />}
    </g>}
  </g>
}

export default function IslandGameMap({ game, onMove }: { game: SurvivalGameState; onMove: (x: number, y: number) => void }) {
  return <div className="island-map-wrap">
    <svg className="island-game-map" viewBox={`0 0 ${game.world.width * SIZE} ${game.world.height * SIZE}`} role="group" aria-label="荒岛地图，点击相邻地块移动">
      <defs><filter id="island-player-shadow"><feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#163b43" floodOpacity=".5" /></filter></defs>
      <rect width="100%" height="100%" fill={COLORS.sea} />
      {game.world.tiles.map(tile => {
        const adjacent = Math.abs(tile.x - game.player.x) + Math.abs(tile.y - game.player.y) === 1
        return <g key={`${tile.x},${tile.y}`} transform={`translate(${tile.x * SIZE} ${tile.y * SIZE})`} data-game-tile={`${tile.x},${tile.y}`} data-terrain={tile.terrain} data-node-remaining={tile.remaining} data-chest-tier={tile.chest?.tier} data-chest-opened={tile.chest?.opened} role="button" aria-label={`${tile.x},${tile.y} ${NAMES[tile.terrain]}${tile.chest ? tile.chest.opened ? '，已开启宝箱' : '，宝箱' : ''}`} tabIndex={adjacent && tile.terrain !== 'sea' ? 0 : -1} onClick={() => onMove(tile.x, tile.y)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onMove(tile.x, tile.y) } }}>
          <rect width={SIZE} height={SIZE} fill={COLORS[tile.terrain]} stroke={adjacent ? '#f8edd1' : '#244c501c'} strokeWidth={adjacent ? 2 : .6} />
          <TileDrawing tile={tile} />
          {tile.x === game.world.camp.x && tile.y === game.world.camp.y && <g pointerEvents="none"><path d="m5 37 15-19 15 19Z" fill={game.gear.camp ? '#f4e0a7' : '#dcc794'} stroke="#685c3f" strokeWidth="1.4" /><path d="m17 37 3-12 5 12" fill="#67563f" /><path d="M34 21V4l-8 3 8 5" stroke="#814f3e" fill="#eb746c" strokeWidth="1.8" /></g>}
        </g>
      })}
      <g transform={`translate(${game.player.x * SIZE + 21} ${game.player.y * SIZE + 21})`} pointerEvents="none" data-player-x={game.player.x} data-player-y={game.player.y} filter="url(#island-player-shadow)">
        <circle r="18" fill="#ffffff" fillOpacity=".35" stroke="#fff7d9" strokeWidth="2" />
        <path d="M-8 12v-9q8-6 16 0v9Z" fill="#eb746c" stroke="#873c37" strokeWidth="1.4" /><circle cy="-6" r="7" fill="#ffe0a7" stroke="#805e43" strokeWidth="1" /><path d="M-10-8h20M-7-9l2-6H5l2 6" stroke="#594f3d" strokeWidth="2" fill="#f7d882" /><path d="M-4 15v-4m8 4v-4" stroke="#233d3c" strokeWidth="3" />
      </g>
    </svg>
    <div className="island-map-legend">{Object.entries(NAMES).map(([key, label]) => <span key={key}><i style={{ background: COLORS[key as IslandTerrain] }} />{label}</span>)}<span>木箱 / 银箱 / 金箱</span></div>
  </div>
}
