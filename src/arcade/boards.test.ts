import test from 'node:test'
import assert from 'node:assert/strict'
import {createStoneGame,playStone,passStone,lineWinner,reversiFlips,stoneMoves,goScore,toggleGoDead,settleGoScore,validateStoneState,stoneComputerMove} from './boards'
test('all opening boards validate and computer plays legally',()=>{for(const game of ['gomoku','go','reversi','tictactoe'] as const){const s=createStoneGame(game);assert.ok(validateStoneState(s));const n=stoneComputerMove(s);assert.equal(n.error,undefined);assert.ok(validateStoneState(n.state))}})
test('tic tac toe golden win rejects additional turns',()=>{let s=createStoneGame('tictactoe');for(const i of [0,3,1,4,2])s=playStone(s,i).state;assert.equal(lineWinner(s),1);assert.ok(s.finished);assert.ok(validateStoneState(s));assert.ok(playStone(s,8).error)})
test('tic tac toe golden full draw',()=>{let s=createStoneGame('tictactoe');for(const i of [0,1,2,4,3,5,7,6,8])s=playStone(s,i).state;assert.equal(lineWinner(s),0);assert.ok(s.finished);assert.ok(validateStoneState(s))})
test('five or more wins and edge never wraps',()=>{const s=createStoneGame('gomoku');[14,15,16,17,18].forEach(i=>s.board[i]=1);assert.equal(lineWinner(s),0);[0,1,2,3,4,5].forEach(i=>s.board[i]=2);assert.equal(lineWinner(s),2)})
test('reversi opening and flipping eight directions',()=>{const s=createStoneGame('reversi');assert.deepEqual(stoneMoves(s),[19,26,37,44]);const n=playStone(s,19).state;assert.equal(n.board[27],1);assert.equal(n.board.filter(p=>p===1).length,4);assert.ok(passStone(s).error);s.board.fill(0);for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){s.board[(3+dy)*8+3+dx]=2;s.board[(3+2*dy)*8+3+2*dx]=1}assert.equal(reversiFlips(s,27).length,8)})
test('reversi forced pass and terminal counting',()=>{const s=createStoneGame('reversi');s.board.fill(1);s.board[0]=0;s.board[1]=2;s.turn=2;assert.equal(stoneMoves(s).length,0);const n=passStone(s).state;assert.equal(n.finished,false);assert.equal(n.turn,1);assert.ok(playStone(n,0).state.finished)})
test('go capture and no suicide',()=>{const s=createStoneGame('go');s.board[10]=2;[1,9,11].forEach(i=>s.board[i]=1);const n=playStone(s,19);assert.equal(n.state.board[10],0);assert.equal(n.state.captures[0],1);const z=createStoneGame('go');[1,9,11,19].forEach(i=>z.board[i]=2);assert.ok(playStone(z,10).error)})
test('go simple ko prevents immediate recapture, pass releases ko',()=>{const s=createStoneGame('go');[1,9,19].forEach(i=>s.board[i]=1);[10,2,12,20].forEach(i=>s.board[i]=2);const n=playStone(s,11).state;assert.ok(playStone(n,10).error);assert.equal(passStone(n).state.previous,n.board.join(''))})
test('go two passes score and imports validate all supported sizes',()=>{for(const size of [9,13,19]){let s=createStoneGame('go',size);s=passStone(passStone(s).state).state;assert.ok(s.finished);assert.ok(validateStoneState(s));assert.equal(goScore(s).white,7.5)}})
test('stone import rejects toxic values and impossible turn',()=>{const s=createStoneGame('tictactoe');for(const patch of [{size:999},{passes:NaN},{turn:2},{captures:[0,Infinity]},{board:Array(9).fill(3)},{finished:true}])assert.equal(validateStoneState({...s,...patch}),false);assert.equal(validateStoneState(createStoneGame('go'),'gomoku'),false)})

test('go terminal whole group toggle persists markings without changing original board',()=>{
 const s=createStoneGame('go');s.board[10]=1;s.board[11]=1;s.board[50]=2
 const ended=passStone(passStone(s).state).state, original=[...ended.board]
 const marked=toggleGoDead(ended,10)
 assert.deepEqual(marked.dead,[10,11]);assert.deepEqual(marked.board,original);assert.deepEqual(ended.dead,[])
 assert.ok(validateStoneState(marked));assert.equal(goScore(marked).black,0)
 assert.deepEqual(toggleGoDead(marked,11).dead,[])
 assert.equal(toggleGoDead(s,10),s);assert.equal(toggleGoDead(ended,0),ended)
 assert.deepEqual(JSON.parse(JSON.stringify(marked)).dead,[10,11])
})
test('go confirmed score survives serialization and locks dead group edits',()=>{
 const s=createStoneGame('go');s.board[10]=1;s.board[11]=1;s.board[50]=2
 const ended=passStone(passStone(s).state).state,marked=toggleGoDead(ended,10),settled=settleGoScore(marked)
 assert.ok(settled.settled);assert.ok(validateStoneState(settled));assert.equal(toggleGoDead(settled,50),settled)
 const loaded=JSON.parse(JSON.stringify(settled));assert.ok(validateStoneState(loaded));assert.deepEqual(goScore(loaded),goScore(settled));assert.ok(loaded.settled)
 assert.equal(settleGoScore(s),s)
})
test('go dead save validates whole nonempty groups and accepts legacy missing fields',()=>{
 const s=createStoneGame('go');s.board[10]=1;s.board[11]=1
 const ended=passStone(passStone(s).state).state
 for(const dead of [[10],[10,10],[99],[0],[-1],[10,11,0],[NaN]])assert.equal(validateStoneState({...ended,dead}),false)
 assert.equal(validateStoneState({...s,dead:[10,11]}),false);assert.equal(validateStoneState({...s,settled:true}),false)
 assert.equal(validateStoneState({...ended,settled:'yes'}),false)
 const old={...ended};delete old.dead;delete old.settled;assert.ok(validateStoneState(old))
 assert.equal(validateStoneState({...createStoneGame('tictactoe'),settled:true}),false)
 assert.equal(validateStoneState({...createStoneGame('tictactoe'),dead:[0]}),false)
})
