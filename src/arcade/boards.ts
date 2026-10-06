export type Stone = 0 | 1 | 2
export type StoneGame = 'gomoku' | 'go' | 'reversi' | 'tictactoe'
export interface StoneState { version: 1; game: StoneGame; size: number; board: Stone[]; turn: 1 | 2; passes: number; captures: [number, number]; previous: string | null; finished: boolean; komi: number; dead?: number[]; settled?: boolean }
export interface BoardResult { state: StoneState; error?: string }
const directions = [[1,0],[0,1],[1,1],[1,-1]]
const around = [[1,0],[-1,0],[0,1],[0,-1]]
export const other = (turn: 1 | 2): 1 | 2 => turn === 1 ? 2 : 1
export function createStoneGame(game: StoneGame, size = game === 'gomoku' ? 15 : game === 'go' ? 9 : game === 'reversi' ? 8 : 3): StoneState {
  const board: Stone[] = Array(size * size).fill(0)
  if (game === 'reversi') { const mid = size / 2; board[(mid-1)*size+mid-1] = 2; board[mid*size+mid] = 2; board[(mid-1)*size+mid] = 1; board[mid*size+mid-1] = 1 }
  return { version: 1, game, size, board, turn: 1, passes: 0, captures: [0,0], previous: null, finished: false, komi: 7.5, ...(game==='go'?{dead:[],settled:false}:{}) }
}
export function lineWinner(state: StoneState): Stone {
  const required = state.game === 'tictactoe' ? 3 : 5
  for (let y = 0; y < state.size; y++) for (let x = 0; x < state.size; x++) {
    const color = state.board[y * state.size + x]
    if (!color) continue
    for (const [dx,dy] of directions) {
      let count = 0
      while (x + dx*count >= 0 && x+dx*count < state.size && y+dy*count >= 0 && y+dy*count < state.size && state.board[(y+dy*count)*state.size+x+dx*count] === color) count++
      if (count >= required) return color
    }
  }
  return 0
}
function neighbors(index: number, size: number) { const x=index%size,y=Math.floor(index/size); return around.map(([dx,dy]) => [x+dx,y+dy]).filter(([a,b]) => a>=0&&a<size&&b>=0&&b<size).map(([a,b])=>b*size+a) }
export function goGroup(board: Stone[], index: number, size: number) {
  const group = new Set<number>(), liberties = new Set<number>(), pending = [index], color = board[index]
  while (pending.length) { const next=pending.pop()!; if(group.has(next)) continue; group.add(next); for(const n of neighbors(next,size)) { if(board[n]===0) liberties.add(n); else if(board[n]===color&&!group.has(n)) pending.push(n) } }
  return { group: [...group], liberties: [...liberties] }
}
export function reversiFlips(state: StoneState, index: number, color: 1|2=state.turn): number[] {
  if(state.board[index]!==0) return []
  const x=index%state.size,y=Math.floor(index/state.size), flips:number[]=[]
  for(let dx=-1;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) {
    if(!dx&&!dy) continue
    const ray:number[]=[]; let a=x+dx,b=y+dy
    while(a>=0&&a<state.size&&b>=0&&b<state.size&&state.board[b*state.size+a]===other(color)) { ray.push(b*state.size+a); a+=dx;b+=dy }
    if(ray.length&&a>=0&&a<state.size&&b>=0&&b<state.size&&state.board[b*state.size+a]===color) flips.push(...ray)
  }
  return flips
}
export function stoneMoves(state: StoneState): number[] {
  if(state.finished) return []
  return state.board.flatMap((cell,index)=>!cell&&(state.game!=='reversi'||reversiFlips(state,index).length)&&(state.game!=='go'||!playStone(state,index).error)?[index]:[])
}
export function playStone(state: StoneState, index: number): BoardResult {
  if(state.finished) return {state,error:'这一局已经结束，请开新局。'}
  if(!Number.isInteger(index)||index<0||index>=state.board.length||state.board[index]) return {state,error:'这里不能落子。'}
  const board=[...state.board], captures: [number,number]=[...state.captures]
  board[index]=state.turn
  if(state.game==='reversi') { const flips=reversiFlips(state,index); if(!flips.length) return {state,error:'必须夹住对方棋子才能落子。'}; flips.forEach(i=>board[i]=state.turn) }
  if(state.game==='go') {
    const checked=new Set<number>()
    for(const n of neighbors(index,state.size)) if(board[n]===other(state.turn)&&!checked.has(n)) { const group=goGroup(board,n,state.size); group.group.forEach(i=>checked.add(i)); if(!group.liberties.length) { group.group.forEach(i=>board[i]=0); captures[state.turn-1]+=group.group.length } }
    if(!goGroup(board,index,state.size).liberties.length) return {state,error:'这一步没有气，不能自杀落子。'}
    if(board.join('')===state.previous) return {state,error:'简单劫：不能立即还原上一局面，请先在别处落子。'}
  }
  const next:StoneState={...state,board,captures,turn:other(state.turn),passes:0,previous:state.game==='go'?state.board.join(''):null}
  next.finished=state.game==='go'?false:state.game==='reversi'?(!board.includes(0)||!board.some((_,i)=>reversiFlips(next,i,1).length||reversiFlips(next,i,2).length)):!!lineWinner(next)||!board.includes(0)
  return {state:next}
}
export function passStone(state:StoneState):BoardResult {
  if(state.finished) return {state,error:'这一局已经结束。'}
  if(state.game!=='go'&&state.game!=='reversi') return {state,error:'这款游戏不能停一手。'}
  if(state.game==='reversi'&&stoneMoves(state).length) return {state,error:'还有合法位置，不能停一手。'}
  const next:StoneState={...state,turn:other(state.turn),passes:state.passes+1,previous:state.game==='go'?state.board.join(''):null}
  next.finished=state.game==='go'?next.passes>=2:!stoneMoves(next).length
  return {state:next}
}
export function toggleGoDead(state: StoneState, index: number): StoneState {
  if(state.game!=='go'||!state.finished||state.settled||!Number.isInteger(index)||index<0||index>=state.board.length||!state.board[index]) return state
  const group=goGroup(state.board,index,state.size).group, dead=new Set(state.dead??[])
  if(dead.has(index)) group.forEach(i=>dead.delete(i)); else group.forEach(i=>dead.add(i))
  return {...state,dead:[...dead].sort((a,b)=>a-b)}
}
export function settleGoScore(state: StoneState): StoneState {
  return state.game==='go'&&state.finished&&state.passes===2&&!state.settled?{...state,settled:true}:state
}
export function goScore(original: StoneState) {
  const dead=new Set(original.dead??[]),state={...original,board:original.board.map((p,i)=>dead.has(i)?0:p)}
  const count:[number,number]=[0,state.komi], visited=new Set<number>()
  state.board.forEach((stone,index)=> { if(stone) { count[stone-1]++; return }; if(visited.has(index)) return
    const region:number[]=[], borders=new Set<Stone>(), pending=[index]
    while(pending.length) { const n=pending.pop()!;if(visited.has(n)) continue;visited.add(n);region.push(n);for(const near of neighbors(n,state.size)) if(!state.board[near]) {if(!visited.has(near)) pending.push(near)} else borders.add(state.board[near]) }
    if(borders.size===1) count[[...borders][0]-1]+=region.length
  })
  return {black:count[0],white:count[1],winner:count[0]===count[1]?0:count[0]>count[1]?1:2}
}
export function validateStoneState(raw: unknown, expected?:StoneGame): raw is StoneState {
  if(!raw||typeof raw!=='object') return false
  const s=raw as StoneState
  if(s.version!==1||!['gomoku','go','reversi','tictactoe'].includes(s.game)||expected&&s.game!==expected) return false
  if(s.size!==(s.game==='gomoku'?15:s.game==='reversi'?8:s.game==='tictactoe'?3:s.size)||s.game==='go'&&![9,13,19].includes(s.size)) return false
  if(!Array.isArray(s.board)||s.board.length!==s.size*s.size||Array.from(s.board).some(c=>c!==0&&c!==1&&c!==2)||![1,2].includes(s.turn)||!Number.isInteger(s.passes)||s.passes<0||s.passes>2||!Array.isArray(s.captures)||s.captures.length!==2||s.captures.some(c=>!Number.isInteger(c)||c<0||c>100000)||typeof s.finished!=='boolean'||s.komi!==7.5) return false
  if(s.dead!==undefined&&(!Array.isArray(s.dead)||new Set(s.dead).size!==s.dead.length||Array.from(s.dead).some(i=>!Number.isInteger(i)||i<0||i>=s.board.length||!s.board[i]))) return false
  if(s.settled!==undefined&&typeof s.settled!=='boolean') return false
  if(s.game!=='go'&&((s.dead?.length??0)>0||s.settled)) return false
  if(s.game==='go'&&((s.dead?.length??0)>0&&!s.finished||s.settled&&!s.finished)) return false
  if(s.game==='go'&&s.dead?.some(i=>goGroup(s.board,i,s.size).group.some(j=>!s.dead!.includes(j)))) return false
  if(s.game==='go') { if(s.previous!==null&&(typeof s.previous!=='string'||s.previous.length!==s.board.length||!/^[012]+$/.test(s.previous))) return false; if(s.finished!==(s.passes>=2)) return false
    return s.board.every((cell,i)=>!cell||goGroup(s.board,i,s.size).liberties.length>0)
  }
  if(s.previous!==null||s.captures.some(Boolean)) return false
  if(s.game==='reversi') { if(s.passes>1||s.board.filter(Boolean).length<4) return false; const terminal=!s.board.includes(0)||!s.board.some((_,i)=>reversiFlips(s,i,1).length||reversiFlips(s,i,2).length);return s.finished===terminal }
  if(s.passes!==0) return false
  const first=s.board.filter(c=>c===1).length,second=s.board.filter(c=>c===2).length
  if(first!==second&&first!==second+1||s.turn!==(first===second?1:2)) return false
  const winner=lineWinner(s)
  if(winner===1&&first!==second+1||winner===2&&first!==second) return false
  // A legal game cannot contain victories for both sides.
  if(winner&&lineWinner({...s,board:s.board.map(c=>c===winner?0:c)})) return false
  return s.finished===(!!winner||!s.board.includes(0))
}
export function stoneComputerMove(state:StoneState):BoardResult {
  const moves=stoneMoves(state); if(!moves.length) return passStone(state)
  if(state.game==='gomoku'||state.game==='tictactoe') {
    for(const index of moves) if(lineWinner(playStone(state,index).state)===state.turn) return playStone(state,index)
    for(const index of moves) if(lineWinner(playStone({...state,turn:other(state.turn)},index).state)===other(state.turn)) return playStone(state,index)
  }
  const center=(state.size-1)/2
  moves.sort((a,b)=> {const score=(i:number)=> { const next=playStone(state,i).state;const capture=state.game==='reversi'?reversiFlips(state,i).length:next.captures[state.turn-1]-state.captures[state.turn-1]; const x=i%state.size,y=Math.floor(i/state.size); const adjacent=neighbors(i,state.size).filter(j=>state.board[j]).length;return capture*20+adjacent*2-Math.abs(x-center)-Math.abs(y-center)+(state.game==='reversi'&&(x===0||x===state.size-1)&&(y===0||y===state.size-1)?100:0) };return score(b)-score(a) })
  return playStone(state,moves[0])
}
