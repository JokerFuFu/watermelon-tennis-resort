import {useState} from 'react'
import {useArcadeSave} from './useArcadeSave'
import ArcadeSaveControls from './ArcadeSaveControls'
import {createStoneGame,validateStoneState,playStone,passStone,stoneMoves,stoneComputerMove,lineWinner,goScore,toggleGoDead,settleGoScore,type StoneGame,type StoneState} from './boards'
import {createXiangqi,validateXiangqi,moveXiangqi,xiangqiMoves,xiangqiStatus,computerXiangqi,type XiangqiState} from './xiangqi'
import {createChess,validateChess,moveChess,chessMoves,chessStatus,computerChess,type ChessState, type ChessMove} from './chess'
import './boards.css'
export type BoardGameId=StoneGame|'xiangqi'|'chess'
const titles:Record<BoardGameId,string>={gomoku:'五子棋',go:'围棋',reversi:'黑白棋',tictactoe:'井字棋',xiangqi:'中国象棋',chess:'国际象棋'}
const xiangqiLabels={red:{k:'帅',a:'仕',e:'相',h:'马',r:'车',c:'炮',p:'兵'},black:{k:'将',a:'士',e:'象',h:'马',r:'车',c:'炮',p:'卒'}}
const chessLabels={white:{k:'♔',q:'♕',r:'♖',b:'♗',n:'♘',p:'♙'},black:{k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'}}
function StoneBoard({gameId}:{gameId:StoneGame}){
 const hook=useArcadeSave<StoneState>(gameId,()=>createStoneGame(gameId),raw=>{if(!validateStoneState(raw,gameId))throw new Error('棋盘存档不合法');return raw}),s=hook.state
 const [message,setMessage]=useState(''),dead=s.dead??[],moves=stoneMoves(s)
 const result=(r:{state:StoneState;error?:string})=>{setMessage(r.error||'');if(!r.error){hook.setState(r.state)}}
 const score=gameId==='go'?goScore(s):null,counts=[s.board.filter(p=>p===1).length,s.board.filter(p=>p===2).length],winner=gameId==='go'?score!.winner:gameId==='reversi'?(counts[0]===counts[1]?0:counts[0]>counts[1]?1:2):lineWinner(s)
 const name=(p:number)=>gameId==='tictactoe'?(p===1?'叉方':'圈方'):(p===1?'黑方':'白方')
 return <section className="board-game"><h2>{titles[gameId]}</h2><p role="status">{s.finished?winner?`${gameId==='go'?(s.settled?'已确认休闲数子：':'休闲数子暂计：'):''}${name(winner)}获胜`:'本局和棋':`${name(s.turn)}走棋`}</p>
 <p className="board-rule">{gameId==='gomoku'?'休闲规则：连成五子或更多即胜，不设禁手。':gameId==='go'?'简单劫；不许自杀；双方连续停一手后数子，白贴 7.5 目。终局可共同点击标记死子，再确认结果。未确认死活的数子仅供参考。':gameId==='reversi'?'夹住对方棋子即可翻转；没有合法落点时才可停一手，终局以棋子数定胜负。':'先连成一条横、竖或斜线者获胜。'}</p>
 {gameId==='go'&&<label>新局棋盘 <select value={s.size} onChange={e=>{hook.setState(createStoneGame('go',Number(e.target.value)))}}><option value={9}>9 路</option><option value={13}>13 路</option><option value={19}>19 路</option></select></label>}
 <div className={`stone-grid ${gameId} ${s.size>15?'large-board':''}`} style={{gridTemplateColumns:`repeat(${s.size},minmax(0,1fr))`}} aria-label={titles[gameId]+'棋盘'}>{s.board.map((p,i)=><button key={i} className={`stone-cell ${p?'occupied':''} ${dead.includes(i)?'dead':''}`} aria-label={`${Math.floor(i/s.size)+1}行${i%s.size+1}列${p?name(p):'空位'}`} onClick={()=>{if(gameId==='go'&&s.finished){if(p)hook.setState(old=>toggleGoDead(old,i));return}result(playStone(s,i))}}>{gameId==='tictactoe'?(p===1?'×':p===2?'○':''):p?<span className={`stone stone-${p}`}/>:gameId==='reversi'&&moves.includes(i)?<span className="move-dot"/>:null}</button>)}</div>
 {score&&<p>{s.settled?'已确认休闲数子':'当前休闲数子暂计'}：黑 {score.black} / 白 {score.white}（含贴目），提子 {s.captures[0]} : {s.captures[1]}{s.finished?(s.settled?'；双方已确认，标记与结果随进度保存。':'；请双方共同核对死活后确认结果。'):''}</p>}{gameId==='reversi'&&<p>黑 {counts[0]} : 白 {counts[1]}，可走 {moves.length} 处</p>}
 <div className="board-actions"><button disabled={!hook.canUndo} onClick={()=>{hook.undo()}}>悔棋</button><button onClick={()=>{hook.reset();setMessage('')}}>重新开始</button>{(gameId==='go'||gameId==='reversi')&&<button disabled={s.finished} onClick={()=>result(passStone(s))}>停一手</button>}<button disabled={s.finished} onClick={()=>result(stoneComputerMove(s))}>电脑走一步</button>{gameId==='go'&&s.finished&&!s.settled&&<button onClick={()=>hook.setState(settleGoScore)}>双方确认结果</button>}{dead.length>0&&!s.settled&&<button onClick={()=>hook.setState(old=>({...old,dead:[]}))}>清除死子标记</button>}</div><p role="alert">{message}</p><ArcadeSaveControls {...hook}/></section>
}
function PieceBoard({gameId}:{gameId:'chess'|'xiangqi'}){
 const chess=gameId==='chess',hook=useArcadeSave<ChessState|XiangqiState>(gameId,()=>chess?createChess():createXiangqi(),raw=>{if(chess?validateChess(raw):validateXiangqi(raw))return raw as ChessState|XiangqiState;throw new Error('棋子存档不合法')}),s=hook.state
 const [selected,setSelected]=useState<number|null>(null),[message,setMessage]=useState(''),[promotion,setPromotion]=useState<ChessMove['promotion']>('q')
 const moves=chess?chessMoves(s as ChessState):xiangqiMoves(s as XiangqiState),status=chess?chessStatus(s as ChessState):xiangqiStatus(s as XiangqiState),size=chess?8:9
 const sideName=(side:string)=>side==='white'?'白方':side==='red'?'红方':'黑方'
 const result=(r:{state:ChessState|XiangqiState;error?:string})=>{setMessage(r.error||'');if(!r.error){hook.setState(r.state);setSelected(null)}}
 const click=(to:number)=>{if(status.finished)return;if(s.board[to]?.side===s.turn){setSelected(to);setMessage('');return}if(selected===null){setMessage('请先选择自己的棋子。');return}result(chess?moveChess(s as ChessState,{from:selected,to,promotion}):moveXiangqi(s as XiangqiState,{from:selected,to}))}
 return <section className="board-game"><h2>{titles[gameId]}</h2><p role="status">{status.finished?status.winner?`${sideName(status.winner)}获胜`:`和棋：${chess?(status as ReturnType<typeof chessStatus>).reason:''}`:`${sideName(s.turn)}走棋${status.check?' · 正被将军':''}`}</p><p className="board-rule">{chess?'包含王车易位、吃过路兵与升变。自动判定将死、逼和、50 回合与三次重复和棋；部分极少见死局仍需双方约定和棋。':'将帅不得照面；马腿、象眼、炮架与九宫规则生效。将死或困毙均判负。重复追将等竞赛裁定请双方约定。'}同屏双人；电脑走一步为基础择优走法。</p>
 {chess&&<label>兵升变为 <select value={promotion} onChange={e=>setPromotion(e.target.value as ChessMove['promotion'])}><option value="q">后</option><option value="r">车</option><option value="b">象</option><option value="n">马</option></select></label>}
 {!chess&&<p className="river-label">黑方在上 · 楚河汉界 · 红方在下</p>}
 <div className={`piece-grid ${gameId}`} style={{gridTemplateColumns:`repeat(${size},minmax(0,1fr))`}} aria-label={titles[gameId]+'棋盘'}>{s.board.map((p,i)=>{const label=p?(chess?chessLabels[p.side as 'white'|'black'][p.kind as keyof typeof chessLabels.white]:xiangqiLabels[p.side as 'red'|'black'][p.kind as keyof typeof xiangqiLabels.red]):'';return <button key={i} onClick={()=>click(i)} aria-label={`${Math.floor(i/size)+1}行${i%size+1}列${p?sideName(p.side)+label:'空位'}`} aria-pressed={selected===i} className={`piece-cell ${(Math.floor(i/size)+i%size)%2?'dark-square':'light-square'} ${selected===i?'selected':''} ${moves.some(m=>m.from===selected&&m.to===i)?'legal-target':''} ${!chess&&Math.floor(i/9)===5?'river-edge':''}`}><span className={`piece ${p?.side||''}`}>{label}</span></button>})}</div>
 <div className="board-actions"><button disabled={!hook.canUndo} onClick={()=>{hook.undo();setSelected(null);setMessage('')}}>悔棋</button><button onClick={()=>{hook.reset();setSelected(null);setMessage('')}}>重新开始</button><button disabled={status.finished} onClick={()=>result(chess?computerChess(s as ChessState):computerXiangqi(s as XiangqiState))}>电脑走一步</button><button onClick={()=>setSelected(null)}>取消选择</button></div><p role="alert">{message}</p><ArcadeSaveControls {...hook}/></section>
}
export default function BoardGames({gameId}:{gameId:BoardGameId}){return gameId==='chess'||gameId==='xiangqi'?<PieceBoard key={gameId} gameId={gameId}/>:<StoneBoard key={gameId} gameId={gameId}/>}
