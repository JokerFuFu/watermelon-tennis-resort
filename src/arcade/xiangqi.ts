export type XiangqiKind='k'|'a'|'e'|'h'|'r'|'c'|'p'
export type XiangqiSide='red'|'black'
export interface XiangqiPiece { side:XiangqiSide; kind:XiangqiKind }
export interface XiangqiState { version:1; board:(XiangqiPiece|null)[]; turn:XiangqiSide; moves:number }
export interface XiangqiMove { from:number;to:number }
const opponent=(side:XiangqiSide):XiangqiSide=>side==='red'?'black':'red'
const at=(x:number,y:number)=>y*9+x
const palace=(x:number,y:number,side:XiangqiSide)=>x>=3&&x<=5&&(side==='red'?y>=7&&y<=9:y>=0&&y<=2)
export function createXiangqi():XiangqiState {
  const board:(XiangqiPiece|null)[]=Array(90).fill(null), back:XiangqiKind[]=['r','h','e','a','k','a','e','h','r']
  for(const side of ['red','black'] as const) { const y=side==='red'?9:0;back.forEach((kind,x)=>board[at(x,y)]={side,kind});[1,7].forEach(x=>board[at(x,side==='red'?7:2)]={side,kind:'c'});[0,2,4,6,8].forEach(x=>board[at(x,side==='red'?6:3)]={side,kind:'p'}) }
  return {version:1,board,turn:'red',moves:0}
}
export function xiangqiPseudo(state:XiangqiState,from:number,to:number,attack=false):boolean {
  if(from===to||from<0||to<0||from>=90||to>=90) return false
  const piece=state.board[from], target=state.board[to];if(!piece||target?.side===piece.side) return false
  const x=from%9,y=Math.floor(from/9),xx=to%9,yy=Math.floor(to/9),dx=xx-x,dy=yy-y
  if(piece.kind==='k') { if(attack&&target?.kind==='k'&&dx===0) { for(let row=Math.min(y,yy)+1;row<Math.max(y,yy);row++) if(state.board[at(x,row)]) return false;return true }; return palace(xx,yy,piece.side)&&Math.abs(dx)+Math.abs(dy)===1 }
  if(piece.kind==='a') return palace(xx,yy,piece.side)&&Math.abs(dx)===1&&Math.abs(dy)===1
  if(piece.kind==='e') return (piece.side==='red'?yy>=5:yy<=4)&&Math.abs(dx)===2&&Math.abs(dy)===2&&!state.board[at(x+dx/2,y+dy/2)]
  if(piece.kind==='h') return ((Math.abs(dx)===2&&Math.abs(dy)===1&&!state.board[at(x+Math.sign(dx),y)])||(Math.abs(dx)===1&&Math.abs(dy)===2&&!state.board[at(x,y+Math.sign(dy))]))
  if(piece.kind==='p') return dx===0&&dy===(piece.side==='red'?-1:1)||(piece.side==='red'?y<=4:y>=5)&&dy===0&&Math.abs(dx)===1
  if(dx!==0&&dy!==0) return false
  let screen=0;const length=Math.max(Math.abs(dx),Math.abs(dy));for(let step=1;step<length;step++) if(state.board[at(x+Math.sign(dx)*step,y+Math.sign(dy)*step)]) screen++
  return piece.kind==='r'?screen===0:target?screen===1:screen===0
}
export function xiangqiInCheck(state:XiangqiState,side:XiangqiSide):boolean {
  const king=state.board.findIndex(p=>p?.side===side&&p.kind==='k');if(king<0) return true
  return state.board.some((p,index)=>p?.side!==side&&!!p&&xiangqiPseudo(state,index,king,true))
}
export function xiangqiLegal(state:XiangqiState,from:number,to:number):boolean {
  const piece=state.board[from];if(!piece||piece.side!==state.turn||state.board[to]?.kind==='k'||!xiangqiPseudo(state,from,to)) return false
  const board=[...state.board];board[to]=board[from];board[from]=null;return !xiangqiInCheck({...state,board},state.turn)
}
export function xiangqiMoves(state:XiangqiState):XiangqiMove[] { const moves:XiangqiMove[]=[];for(let from=0;from<90;from++) if(state.board[from]?.side===state.turn) for(let to=0;to<90;to++) if(xiangqiLegal(state,from,to)) moves.push({from,to});return moves }
export function xiangqiStatus(state:XiangqiState):{finished:boolean;winner:XiangqiSide|null;check:boolean} {const check=xiangqiInCheck(state,state.turn),finished=xiangqiMoves(state).length===0;return {finished,winner:finished?opponent(state.turn):null,check}}
export function moveXiangqi(state:XiangqiState,move:XiangqiMove):{state:XiangqiState;error?:string} {if(!Number.isInteger(move.from)||!Number.isInteger(move.to)||!xiangqiLegal(state,move.from,move.to)) return {state,error:'不能这样走：请检查走法、挡子或将军。'};const board=[...state.board];board[move.to]=board[move.from];board[move.from]=null;return {state:{...state,board,turn:opponent(state.turn),moves:state.moves+1}}}
export function validateXiangqi(raw:unknown):raw is XiangqiState {
  if(!raw||typeof raw!=='object') return false
  const s=raw as XiangqiState;if(s.version!==1||!['red','black'].includes(s.turn)||!Number.isInteger(s.moves)||s.moves<0||s.moves>100000||s.turn!==(s.moves%2===0?'red':'black')||!Array.isArray(s.board)||s.board.length!==90) return false
  const limits:Record<XiangqiKind,number>={k:1,a:2,e:2,h:2,r:2,c:2,p:5}
  for(const side of ['red','black'] as const) {for(const kind of Object.keys(limits) as XiangqiKind[]) {const count=s.board.filter(p=>p?.side===side&&p.kind===kind).length;if(count>limits[kind]||kind==='k'&&count!==1) return false}}
  for(let index=0;index<90;index++) {const p=s.board[index];if(p===null) continue;if(!p||!['red','black'].includes(p.side)||!Object.keys(limits).includes(p.kind)) return false; const x=index%9,y=Math.floor(index/9);if((p.kind==='k'||p.kind==='a')&&!palace(x,y,p.side)||p.kind==='e'&&(p.side==='red'?y<5:y>4)) return false; if(p.kind==='a'&&!((x===3||x===5)&&(p.side==='red'?y===7||y===9:y===0||y===2)||x===4&&y===(p.side==='red'?8:1))) return false; if(p.kind==='e'&&!((x===2||x===6)&&y===(p.side==='red'?9:0)||(x===0||x===4||x===8)&&y===(p.side==='red'?7:2)||(x===2||x===6)&&y===(p.side==='red'?5:4))) return false; if(p.kind==='p'&&(p.side==='red'?y>6:y<3)) return false; if(p.kind==='p'&&(p.side==='red'?y>=5:y<=4)&&x%2!==0) return false}
  // The side that just moved must not have left its own general attacked.
  return !xiangqiInCheck(s,opponent(s.turn))
}
export function computerXiangqi(state:XiangqiState):{state:XiangqiState;error?:string} {
  const legal=xiangqiMoves(state);if(!legal.length) return {state,error:'这一局已结束。'}
  const value:Record<XiangqiKind,number>={k:1000,r:90,c:45,h:40,e:20,a:20,p:12}
  legal.sort((a,b)=>{const score=(m:XiangqiMove)=>{const next=moveXiangqi(state,m).state,target=state.board[m.to];return (target?value[target.kind]:0)*10+(xiangqiInCheck(next,next.turn)?15:0)-Math.abs(m.to%9-4)};return score(b)-score(a)});return moveXiangqi(state,legal[0])
}
