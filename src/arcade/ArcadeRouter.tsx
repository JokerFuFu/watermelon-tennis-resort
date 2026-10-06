import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Search } from 'lucide-react'
import { ARCADE_GAMES, GAME_CATEGORIES, arcadeGameURL, readArcadeGame, type ArcadeGameId } from './gameCatalog'
import './arcade.css'
const SurvivalGamePage=lazy(()=>import('../SurvivalGamePage'))
const PuzzleGames=lazy(()=>import('./PuzzleGames'))
const BoardGames=lazy(()=>import('./BoardGames'))
const CardGames=lazy(()=>import('./CardGames'))

export default function ArcadeRouter({allowRuleEditing=false,onBackToDesign}:{allowRuleEditing?:boolean;onBackToDesign?:()=>void}){
  const [gameId,setGameId]=useState(()=>readArcadeGame(window.location.search))
  const navigate=useCallback((id:ArcadeGameId|'lobby')=>{const url=arcadeGameURL(window.location.href,id);if(url!==window.location.href)window.history.pushState(null,'',url);setGameId(id);window.scrollTo({top:0})},[])
  useEffect(()=>{const back=()=>setGameId(readArcadeGame(window.location.search));window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back)},[])
  useEffect(()=>{if(gameId==='survival')return;const previous=document.title;document.title=gameId==='lobby'?'西瓜游戏大厅 · 顾客游玩':`${ARCADE_GAMES.find(g=>g.id===gameId)?.name} · 西瓜游戏大厅`;return()=>{document.title=previous}},[gameId])
  const hotelLink=onBackToDesign?<button onClick={onBackToDesign}>返回酒店设计<ArrowUpRight size={14}/></button>:<a href="/web?section=design">酒店设计<ArrowUpRight size={14}/></a>
  if(gameId==='survival')return <Suspense fallback={<main className="arcade-page arcade-loading" role="status">正在打开荒岛求生…</main>}><SurvivalGamePage key="survival" allowRuleEditing={allowRuleEditing} onBackToDesign={onBackToDesign} onBackToLobby={()=>navigate('lobby')}/></Suspense>
  if(gameId==='lobby')return <ArcadeLobby onChoose={navigate} hotelLink={hotelLink}/>
  const game=ARCADE_GAMES.find(g=>g.id===gameId)!
  return <main className="arcade-page" data-arcade-game={gameId}>
    <header className="arcade-header"><button className="arcade-back" onClick={()=>navigate('lobby')}><ArrowLeft size={17}/>返回游戏大厅</button><span className="arcade-brand">🍉 西瓜游戏大厅</span><div className="arcade-hotel-link">{hotelLink}</div></header>
    <div className="arcade-game-heading"><span className={`arcade-game-symbol ${game.category}`}>{game.icon}</span><div><span>{GAME_CATEGORIES[game.category]} · {game.mode}</span><h1>{game.name}</h1><p>{game.description}</p></div></div>
    <details className="arcade-rules"><summary>玩法说明</summary><ol>{game.rules.map(rule=><li key={rule}>{rule}</li>)}</ol><p>游戏进度独立保存在此浏览器，可导出备份。</p></details>
    <Suspense fallback={<div className="arcade-loading" role="status">正在准备棋盘…</div>}>
      {game.category==='puzzle'?<PuzzleGames key={gameId} gameId={gameId as 'sudoku'|'minesweeper'|'2048'|'fifteen'|'lights'}/>:game.category==='board'?<BoardGames key={gameId} gameId={gameId as 'gomoku'|'xiangqi'|'go'|'chess'|'reversi'|'tictactoe'}/>:<CardGames key={gameId} gameId={gameId as 'doudizhu'|'guandan'|'solitaire'}/>}
    </Suspense>
    <footer className="arcade-footer">西瓜网球度假酒店 · 休息一下，玩一局。</footer>
  </main>
}

function ArcadeLobby({onChoose,hotelLink}:{onChoose:(id:ArcadeGameId)=>void;hotelLink:React.ReactNode}){
  const [category,setCategory]=useState<keyof typeof GAME_CATEGORIES>('all'),[search,setSearch]=useState('')
  const shown=ARCADE_GAMES.filter(g=>(category==='all'||g.category===category)&&`${g.name} ${g.description}`.includes(search.trim()))
  return <main className="arcade-page arcade-lobby" data-arcade-game="lobby">
    <header className="arcade-header"><span className="arcade-brand">🍉 西瓜游戏大厅</span><span className="arcade-header-caption">顾客休闲空间</span><div className="arcade-hotel-link">{hotelLink}</div></header>
    <section className="arcade-hero"><div><span className="arcade-eyebrow">玩得开心，也住得惬意</span><h1>今天，想玩哪一局？</h1><p>从九宫格的灵感，到棋盘上的较量。<br/>15 款游戏，随时开始，随时回来。</p><div className="arcade-hero-tags"><span>独立保存进度</span><span>手机与电脑可玩</span><span>棋牌与益智</span></div></div><div className="arcade-hero-art" aria-hidden="true"><span>♞</span><span>2<small>4</small></span><span>♥<small>♠</small></span><i>🍉</i></div></section>
    <section className="arcade-discovery"><div className="arcade-categories" aria-label="游戏分类">{Object.entries(GAME_CATEGORIES).map(([id,label])=><button key={id} aria-pressed={category===id} onClick={()=>setCategory(id as keyof typeof GAME_CATEGORIES)}>{label}</button>)}</div><label className="arcade-search"><Search size={17}/><input aria-label="搜索游戏" placeholder="搜索数独、掼蛋、象棋…" value={search} onChange={e=>setSearch(e.target.value)}/></label></section>
    <div className="arcade-list-heading"><h2>{category==='all'?'挑一款，开始你的休闲时间':GAME_CATEGORIES[category]}</h2><span>{shown.length} 款可玩</span></div>
    <section className="arcade-game-grid" aria-label="游戏列表">{shown.map((g,index)=><article className={`arcade-game-card ${g.category}`} data-game-card={g.id} key={g.id}><div className="arcade-card-top"><span className="arcade-card-icon">{g.icon}</span><span>{g.mode}</span></div><h3>{g.name}</h3><p>{g.description}</p><button aria-label={`开始${g.name}`} onClick={()=>onChoose(g.id)}>开始游戏<ArrowUpRight size={16}/></button><small>{String(index+1).padStart(2,'0')}</small></article>)}</section>
    {!shown.length&&<p className="arcade-empty">没有匹配的游戏，试试其他名字或查看全部游戏。</p>}
    <footer className="arcade-footer">西瓜网球度假酒店 · 游戏进度留在当前浏览器。</footer>
  </main>
}
