import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Backpack, Coins, Diamond, Download, Flag, Hammer, Leaf, Save, Upload } from 'lucide-react'
import IslandGameMap from './IslandGameMap'
import IslandMapGallery from './IslandMapGallery'
import { getCurrentSurvivalTile as getCurrentTile, getSurvivalDay as getDay, getSurvivalQuests as getQuests, ISLAND_PRESETS, SURVIVAL_RESOURCE_LABELS as RESOURCE_LABELS, SURVIVAL_RECIPES, SURVIVAL_SHOP, TERRAIN_LABELS } from './survival'
import { useSurvivalGame } from './useSurvivalGame'
import type { IslandPreset, SurvivalAction, SurvivalItem } from './survivalTypes'
import './survival-game.css'

const INVENTORY: SurvivalItem[] = ['wood', 'stone', 'fiber', 'iron', 'food', 'water', 'rope']
const ITEM_ICONS: Record<SurvivalItem, string> = { wood: '🪵', stone: '🪨', fiber: '🌿', iron: '⛏️', food: '🥥', water: '💧', rope: '🪢' }
function itemLabel(item: SurvivalItem) { return item === 'rope' ? '草绳' : RESOURCE_LABELS[item] }
function downloadFile(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function SurvivalGamePage({ allowRuleEditing = false, onBackToDesign, onBackToLobby }: { allowRuleEditing?: boolean; onBackToDesign?: () => void; onBackToLobby?: () => void }) {
  const { game, act, message, storageError, saved, slot, changeSlot, save, importGame, newGame, restoreBackup, backupAvailable, exportGame, exportRaw } = useSurvivalGame()
  const [nickname, setNickname] = useState(game.playerName)
  const [preset, setPreset] = useState<IslandPreset>(game.preset)
  const [confirmNew, setConfirmNew] = useState(false)
  const [tradeQuantity, setTradeQuantity] = useState('1')
  const [exchangeQuantity, setExchangeQuantity] = useState('1')
  const [buyRate, setBuyRate] = useState(String(game.rates.buy))
  const [sellRate, setSellRate] = useState(String(game.rates.sell))
  const [localNotice, setLocalNotice] = useState('')
  const upload = useRef<HTMLInputElement>(null)
  const tile = getCurrentTile(game)
  const quests = getQuests(game)
  const active = game.status === 'playing'
  const doneCount = quests.filter(quest => quest.done).length
  const dispatch = (action: SurvivalAction) => { setLocalNotice(''); act(action) }
  useEffect(()=>{const previous=document.title;document.title='西瓜荒岛求生 · 顾客游玩';return()=>{document.title=previous}},[])
  useEffect(() => { setNickname(game.playerName) }, [slot, game.seed, game.playerName])
  useEffect(() => { setPreset(game.preset); setBuyRate(String(game.rates.buy)); setSellRate(String(game.rates.sell)) }, [slot, game.seed])
  useEffect(() => { setBuyRate(String(game.rates.buy)); setSellRate(String(game.rates.sell)) }, [game.rates.buy, game.rates.sell])
  useEffect(() => {
    if (!confirmNew) return
    const priorFocus = document.activeElement as HTMLElement | null
    function dialogKeys(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setConfirmNew(false); return }
      if (event.key !== 'Tab') return
      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.survival-dialog-backdrop button'))
      const first = buttons[0], last = buttons[buttons.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
    }
    window.addEventListener('keydown', dialogKeys)
    return () => { window.removeEventListener('keydown', dialogKeys); priorFocus?.focus() }
  }, [confirmNew])
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (confirmNew || target?.closest('[role="dialog"], [role="alertdialog"]')) return
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); saveCurrent(); return }
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      if (event.ctrlKey || event.metaKey || event.altKey) return
      const directions: Record<string, [number, number]> = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] }
      const delta = directions[event.key]
      if (delta && active) { event.preventDefault(); event.stopPropagation(); setLocalNotice(''); act({ type: 'move', x: game.player.x + delta[0], y: game.player.y + delta[1] }) }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [game, nickname, active, act, save, confirmNew])

  function commitPendingName(): boolean {
    const name = nickname.trim()
    if (!name || name.length > 24) { setLocalNotice('昵称需为 1 至 24 个字符，原昵称已保留。请修改后再保存或导出。'); return false }
    if (name !== game.playerName) {
      if (game.status === 'downed') { setLocalNotice('先回营地恢复，再修改昵称。原昵称和冒险进度已保留。'); return false }
      act({ type: 'rename', name })
      if ((JSON.parse(exportGame()) as { playerName: string }).playerName !== name) { setLocalNotice('昵称暂未提交。请先处理存档提示，原昵称和游戏进度已保留。'); return false }
    }
    setNickname(name)
    return true
  }
  function saveCurrent() {
    if (!commitPendingName()) return
    setLocalNotice(save() ? '游戏已保存到当前存档。' : '游戏保存失败，请导出游戏存档保留进度。')
  }
  function exportCurrent() {
    if (!commitPendingName()) return
    const data = exportGame()
    const storedName = (JSON.parse(data) as { playerName: string }).playerName.replace(/[\\/:*?"<>|]/g, '_')
    downloadFile(data, `西瓜荒岛-${storedName}-存档${slot}.json`)
    setLocalNotice('游戏存档已导出。')
  }
  function selectSlot(number: 1 | 2 | 3) {
    const validName = commitPendingName()
    changeSlot(number)
    if (!validName) { if (number === slot) setNickname(game.playerName); setLocalNotice('昵称草稿未提交，存档中的原昵称保持。') }
    else setLocalNotice('')
  }

  function quantity(raw: string): number | null {
    if (!/^\d+$/.test(raw.trim()) || Number(raw) < 1 || Number(raw) > 9999) { setLocalNotice('请输入 1 至 9999 的整数数量。'); return null }
    return Number(raw)
  }
  function setRates() {
    const buy = Number(buyRate), sell = Number(sellRate)
    if (!/^\d+$/.test(buyRate.trim()) || !/^\d+$/.test(sellRate.trim()) || !Number.isSafeInteger(buy) || buy < 1 || buy > 1000000 || !Number.isSafeInteger(sell) || sell < 0 || sell > buy) { setLocalNotice('购买价需为 1 至 1000000 的整数；回兑价需为 0 至购买价的整数。'); return }
    dispatch({ type: 'setRates', buy, sell })
  }
  async function readFile(file?: File) {
    if (!file) return
    if (file.size > 500 * 1024) { setLocalNotice('游戏存档不能超过 500 KB。'); return }
    if (!commitPendingName()) return
    try { const okay = importGame(await file.text()); setLocalNotice(okay ? '游戏存档已导入。' : '导入失败，原来的游戏进度仍保留。') } catch { setLocalNotice('无法读取文件，请重新选择游戏 JSON 存档。') }
  }
  const move = (dx: number, dy: number) => dispatch({ type: 'move', x: game.player.x + dx, y: game.player.y + dy })
  const raw = storageError ? exportRaw() : null
  return <main className="survival-game-page" data-game-status={game.status}>
    <header className="survival-header">
      <div className="survival-brand"><span className="survival-brand-mark" aria-hidden="true">🍉</span><div><span>西瓜荒岛求生</span><h1>荒岛求生</h1></div></div>
      <div className="survival-header-links">{onBackToLobby&&<button type="button" onClick={()=>{if(commitPendingName())onBackToLobby()}}>游戏大厅</button>}{allowRuleEditing && <a href="/play" target="_blank" rel="noreferrer">顾客独立入口</a>}{onBackToDesign && <button type="button" onClick={onBackToDesign}>返回酒店设计</button>}<span className="survival-save-state">{storageError ? '存档需要处理' : saved ? '进度已保存' : '进度待保存'}</span></div>
    </header>
    <section className="survival-save-bar" aria-label="游戏存档管理">
      <div className="survival-slots">{([1, 2, 3] as const).map(number => <button key={number} type="button" aria-pressed={slot === number} onClick={() => selectSlot(number)}>存档 {number}</button>)}</div>
      <form className="survival-name-form" onSubmit={event => { event.preventDefault(); if (commitPendingName()) setLocalNotice('昵称已提交。') }}><input aria-label="玩家昵称" maxLength={24} value={nickname} onChange={event => setNickname(event.target.value)} /><button type="submit">修改昵称</button></form>
      <div className="survival-file-buttons"><button type="button" onClick={saveCurrent}><Save size={15} />保存游戏</button><button type="button" onClick={exportCurrent}><Download size={15} />导出游戏存档</button><button type="button" onClick={() => upload.current?.click()}><Upload size={15} />导入游戏存档</button><input ref={upload} type="file" accept=".json,application/json" aria-label="选择游戏存档文件" hidden onChange={event => { void readFile(event.target.files?.[0]); event.target.value = '' }} /></div>
    </section>
    {storageError && <section className="survival-error" role="alert"><strong>存档没有正常保存</strong><p>{storageError}</p>{raw !== null && <button type="button" onClick={() => downloadFile(raw, `荒岛原始存档${slot}.json`)}>下载原始存档</button>}<span>请先导出当前游戏，避免丢失进度。</span></section>}
    <section className="survival-status-bar" aria-label="生存状态">
      {([{ key: 'health', label: '健康', color: '#dc665f' }, { key: 'hunger', label: '饱食', color: '#b59236' }, { key: 'thirst', label: '水分', color: '#2a8daf' }, { key: 'energy', label: '体力', color: '#4e8150' }] as const).map(stat => <div className="survival-vital" key={stat.key}><div><span>{stat.label}</span><b data-game-stat={stat.key}>{game.player[stat.key]}<small> / 100</small></b></div><progress aria-label={stat.label} max={100} value={game.player[stat.key]} style={{ accentColor: stat.color }} /></div>)}
      <div className="survival-wallet"><span><Coins size={19} /><b data-game-coins={game.wallet.coins}>{game.wallet.coins}</b>金币</span><span><Diamond size={18} /><b data-game-diamonds={game.wallet.diamonds}>{game.wallet.diamonds}</b>钻石</span></div>
    </section>
    <div className="survival-live-message" role="status" aria-live="polite">{localNotice || message || '点击相邻地块，或用方向键 / WASD 开始探索。'}</div>
    {game.status === 'escaped' && <section className="survival-ending"><Flag size={25} /><div><h2>成功离岛！</h2><p>{game.playerName}完成了第 {getDay(game)} 天的荒岛冒险。当前成果已留在这个存档中，可以换一张地图开始新的旅程。</p></div></section>}
    {game.status === 'downed' && <section className="survival-ending survival-ending-warning"><div><h2>你需要恢复状态</h2><p>回到营地继续冒险，已开启的宝箱和已采集物资会保留。</p></div><button type="button" onClick={() => dispatch({ type: 'recover' })}>回营地恢复</button></section>}
    <div className="survival-adventure-grid">
      <section className="survival-map-section" aria-label="探索荒岛">
        <div className="survival-map-heading"><div><h2>{ISLAND_PRESETS.find(island => island.id === game.preset)?.name ?? '荒岛'}</h2><span>第 {getDay(game)} 天 · 回合 {game.turn} · 位置 {game.player.x}, {game.player.y}</span></div><span className="survival-location">{TERRAIN_LABELS[tile.terrain]}{tile.resource && ` · ${itemLabel(tile.resource)}剩余 ${tile.remaining}`}</span></div>
        <IslandGameMap game={game} onMove={(x, y) => dispatch({ type: 'move', x, y })} />
        <div className="survival-map-controls">
          <div className="survival-direction-pad" aria-label="移动方向"><button className="survival-direction-up" type="button" aria-label="向上移动" disabled={!active} onClick={() => move(0, -1)}><ArrowUp size={20} /></button><button className="survival-direction-left" type="button" aria-label="向左移动" disabled={!active} onClick={() => move(-1, 0)}><ArrowLeft size={20} /></button><span className="survival-direction-center" aria-hidden="true">🧭</span><button className="survival-direction-right" type="button" aria-label="向右移动" disabled={!active} onClick={() => move(1, 0)}><ArrowRight size={20} /></button><button className="survival-direction-down" type="button" aria-label="向下移动" disabled={!active} onClick={() => move(0, 1)}><ArrowDown size={20} /></button></div>
          <div className="survival-actions"><button type="button" className="survival-primary" disabled={!active || !tile.resource || tile.remaining <= 0} onClick={() => dispatch({ type: 'gather' })}><Leaf size={17} />采集当前物资</button><button type="button" disabled={!active || !tile.chest || tile.chest.opened} onClick={() => dispatch({ type: 'openChest' })}>开启宝箱</button><button type="button" disabled={!active} onClick={() => dispatch({ type: 'rest' })}>休息</button><button type="button" disabled={!active || game.inventory.food < 1} onClick={() => dispatch({ type: 'consume', item: 'food' })}>进食</button><button type="button" disabled={!active || game.inventory.water < 1} onClick={() => dispatch({ type: 'consume', item: 'water' })}>饮水</button><button type="button" className="survival-escape" disabled={!active || !game.gear.raft || !game.gear.camp || tile.terrain !== 'beach'} onClick={() => dispatch({ type: 'escape' })}>乘木筏离岛</button></div>
        </div>
        <details className="survival-guide"><summary>怎么玩？</summary><ol><li>每次走一格，海洋不能走。点击相邻格，或使用方向键 / WASD。</li><li>站到树林、岩地或水源上采集。宝箱只需走过去打开，每个宝箱只能开一次。</li><li>收集物资制作工具、营地和草绳，再制作木筏，走到沙滩离岛。</li><li>留意健康、饱食、水分和体力，用进食、饮水、休息恢复。每 24 回合进入新的一天，关闭网页时不会消耗。</li></ol></details>
      </section>
      <aside className="survival-pack-section">
        <section className="survival-inventory"><h2><Backpack size={20} />探险背包</h2><div className="survival-inventory-grid">{INVENTORY.map(item => <div key={item} data-inventory-item={item} data-game-value={game.inventory[item]}><span aria-hidden="true">{ITEM_ICONS[item]}</span><span>{itemLabel(item)}</span><b>{game.inventory[item]}</b></div>)}</div><div className="survival-gear">{([{ id: 'axe', label: '石斧' }, { id: 'pickaxe', label: '石镐' }, { id: 'camp', label: '营地' }, { id: 'raft', label: '木筏' }] as const).map(gear => <span key={gear.id} className={game.gear[gear.id] ? 'ready' : ''}>{game.gear[gear.id] ? '✓' : '○'} {gear.label}</span>)}</div></section>
        <section className="survival-crafting"><h2><Hammer size={20} />制作与搭建</h2>{SURVIVAL_RECIPES.map(recipe => {
          const enough = Object.entries(recipe.cost).every(([item, count]) => game.inventory[item as SurvivalItem] >= (count ?? 0))
          const made = recipe.id !== 'rope' && game.gear[recipe.id]
          return <div className="survival-recipe" key={recipe.id}><div><strong>{recipe.name}</strong><p>{Object.entries(recipe.cost).map(([item, count]) => `${itemLabel(item as SurvivalItem)} ${count}`).join(' + ')}</p><small>{recipe.description}</small></div><button type="button" aria-label={`制作${recipe.name}`} disabled={!active || !enough || made} onClick={() => dispatch({ type: 'craft', recipe: recipe.id })}>{made ? '已制作' : enough ? '制作' : '缺物资'}</button></div>
        })}</section>
        <section className="survival-quests"><h2><Flag size={19} />离岛任务 <small>{doneCount} / {quests.length}</small></h2><ul>{quests.map(quest => <li key={quest.id} data-quest-id={quest.id} data-quest-done={quest.done}><span className={quest.done ? 'done' : ''}>{quest.done ? '✓' : '○'}</span><div><strong>{quest.label}</strong><small>{quest.detail}</small></div></li>)}</ul></section>
      </aside>
    </div>
    <section className="survival-trading" aria-label="荒岛商店与游戏兑换">
      <div className="survival-shop"><div className="survival-section-heading"><h2>营地物资商店</h2><label>数量<input aria-label="物资交易数量" inputMode="numeric" value={tradeQuantity} onChange={event => setTradeQuantity(event.target.value)} /></label></div><p>金币购买补给；多余的木头、石头、纤维和铁矿也能出售。</p><div className="survival-shop-grid">{SURVIVAL_SHOP.map(item => <div className="survival-shop-item" key={item.id}><div><span aria-hidden="true">{ITEM_ICONS[item.id]}</span><strong>{item.name}</strong></div><small>买入 {item.buyPrice} 金币 / 份{item.sellPrice !== null && ` · 卖出 ${item.sellPrice}`}</small><div><button type="button" aria-label={`购买${item.name}`} disabled={!active} onClick={() => { const count = quantity(tradeQuantity); if (count !== null) dispatch({ type: 'buy', item: item.id, quantity: count }) }}>购买</button>{item.sellPrice !== null && <button type="button" aria-label={`出售${item.name}`} disabled={!active || game.inventory[item.id] < 1} onClick={() => { const count = quantity(tradeQuantity); if (count !== null && ['wood', 'stone', 'fiber', 'iron'].includes(item.id)) dispatch({ type: 'sell', item: item.id as 'wood' | 'stone' | 'fiber' | 'iron', quantity: count }) }}>出售</button>}</div></div>)}</div></div>
      <div className="survival-exchange"><h2><Diamond size={20} />金币与钻石</h2><p>这些是游戏内货币与兑换规则，不涉及真实货币或现金兑现。</p><div className="survival-rate-display"><div><b>{game.rates.buy}</b><span>金币换 1 钻石</span></div><span>⇄</span><div><b>{game.rates.sell}</b><span>1 钻石换金币</span></div></div><label className="survival-exchange-quantity">兑换钻石数量<input aria-label="货币兑换数量" inputMode="numeric" value={exchangeQuantity} onChange={event => setExchangeQuantity(event.target.value)} /></label><div className="survival-exchange-buttons"><button type="button" disabled={!active} onClick={() => { const count = quantity(exchangeQuantity); if (count !== null) dispatch({ type: 'exchange', direction: 'buyDiamond', quantity: count }) }}>金币兑换钻石</button><button type="button" disabled={!active} onClick={() => { const count = quantity(exchangeQuantity); if (count !== null) dispatch({ type: 'exchange', direction: 'sellDiamond', quantity: count }) }}>钻石兑换金币</button></div><button className="survival-supply" type="button" disabled={!active || game.wallet.diamonds < 2} onClick={() => dispatch({ type: 'supplyPack' })}>购买钻石补给包 · 2 钻石</button><small>固定恢复：健康 +40、体力 +30、饱食和水分各 +15，最高 100。</small>{allowRuleEditing && <details className="survival-rules"><summary>管理游戏兑换规则</summary><p>购买价为正整数，回兑价为非负整数，且不得高于购买价。</p><form onSubmit={event => { event.preventDefault(); setRates() }}><label>购买价<input aria-label="钻石购买汇率" inputMode="numeric" value={buyRate} onChange={event => setBuyRate(event.target.value)} /></label><label>回兑价<input aria-label="钻石回兑汇率" inputMode="numeric" value={sellRate} onChange={event => setSellRate(event.target.value)} /></label><button type="submit">保存游戏兑换规则</button></form></details>}</div>
    </section>
    <section className="survival-new-adventure"><div><h2>下一场荒岛冒险</h2><p>不同地形拥有不同的资源分布。开始前会备份当前存档，可恢复上次冒险。</p></div><label>选择地图<select aria-label="新冒险地图" value={preset} onChange={event => setPreset(event.target.value as IslandPreset)}>{ISLAND_PRESETS.map(island => <option key={island.id} value={island.id}>{island.name}</option>)}</select></label><button type="button" className="survival-primary" onClick={() => setConfirmNew(true)}>开始新冒险</button>{backupAvailable && <button type="button" onClick={() => setLocalNotice(restoreBackup() ? '上次冒险已恢复。' : '恢复失败，当前游戏仍保留。')}>恢复上次冒险</button>}</section>
    <IslandMapGallery selected={preset} onSelect={setPreset} />
    <footer className="survival-footer">西瓜网球度假酒店 · 顾客荒岛冒险 <span>存档保存在当前浏览器，导出可保留或转移进度。</span></footer>
    {confirmNew && <div className="survival-dialog-backdrop" onClick={event => { if (event.target === event.currentTarget) setConfirmNew(false) }}><section role="alertdialog" aria-modal="true" aria-labelledby="survival-new-title"><h2 id="survival-new-title">开始新的冒险？</h2><p>当前存档 {slot} 的冒险会先备份，然后生成“{ISLAND_PRESETS.find(island => island.id === preset)?.name}”。其他两个存档保持原样。</p><div><button type="button" autoFocus onClick={() => setConfirmNew(false)}>继续当前冒险</button><button type="button" className="survival-primary" onClick={() => { if (!commitPendingName()) { setConfirmNew(false); return } const okay = newGame(preset); setConfirmNew(false); setLocalNotice(okay ? '新的荒岛冒险已开始。' : '新冒险未开始，请处理存档提示。') }}>确认开始新冒险</button></div></section></div>}
  </main>
}
