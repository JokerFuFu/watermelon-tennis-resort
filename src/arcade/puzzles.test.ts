import test from 'node:test'
import assert from 'node:assert/strict'
import { createSudoku, validateSudoku, sudokuWrite, sudokuHint, sudokuSolutions, sudokuConflicts, sudokuWon, createMines, validateMines, mineNeighbours, minesReveal, minesFlag, minesChord, mineNumber, minesStatus, mergeLine, moveTilesBoard, createTiles, validateTiles, tilesMove, tilesLost, createFifteen, validateFifteen, fifteenMove, fifteenWon, fifteenSolvable, createLights, validateLights, lightNeighbours, lightsMove, lightsWon, lightsSolution } from './puzzles'
const solved = [5,3,4,6,7,8,9,1,2,6,7,2,1,9,5,3,4,8,1,9,8,3,4,2,5,6,7,8,5,9,7,6,1,4,2,3,4,2,6,8,5,3,7,9,1,7,1,3,9,2,4,8,5,6,9,6,1,5,3,7,2,8,4,2,8,7,4,1,9,6,3,5,3,4,5,2,8,6,1,7,9]
test('sudoku independent solved fixture, conflict detection and single missing answer', () => {
  assert.deepEqual(sudokuSolutions([...solved.slice(0,80),0]), { count:1, solution:solved })
  const wrong=[...solved]; wrong[1]=5; assert.ok(sudokuConflicts(wrong).has(0)); assert.equal(sudokuSolutions(wrong).count,0)
  assert.equal(sudokuSolutions(Array(81).fill(0)).count,2)
})
test('sudoku seeded difficulty puzzles unique and immutable givens', () => {
  for (const difficulty of ['easy','medium','hard'] as const) {
    const s=createSudoku(difficulty,42); assert.equal(sudokuSolutions(s.puzzle).count,1); assert.deepEqual(createSudoku(difficulty,42),s); assert.deepEqual(validateSudoku(s),s)
    const given=s.puzzle.findIndex(Boolean), empty=s.puzzle.indexOf(0)
    assert.equal(sudokuWrite(s,given,9),s); assert.equal(sudokuWrite(s,-1,1),s)
    const note=sudokuWrite(s,empty,3,true); assert.equal(note.notes[empty],4); assert.equal(sudokuWrite(note,empty,3,true).notes[empty],0)
    const value=sudokuWrite(note,empty,3); assert.equal(value.notes[empty],0); assert.equal(sudokuWrite(value,empty,3),value)
    let hinted=s; for(let i=0;i<3;i++) hinted=sudokuHint(hinted); assert.equal(sudokuHint(hinted),hinted)
    const complete={...s,board:sudokuSolutions(s.puzzle,1).solution!}; assert.equal(sudokuWon(complete),true); assert.equal(sudokuHint(complete),complete)
  }
})
test('sudoku validator rejects forged givens, seed, notes, incomplete boards', () => {
  const s=createSudoku('easy',42), i=s.puzzle.findIndex(Boolean)
  assert.throws(()=>validateSudoku({...s,seed:NaN})); assert.throws(()=>validateSudoku({...s,seed:0})); assert.throws(()=>validateSudoku({...s,board:[]}))
  const board=[...s.board];board[i]=0;assert.throws(()=>validateSudoku({...s,board}))
  const notes=[...s.notes];notes[i]=1;assert.throws(()=>validateSudoku({...s,notes}));assert.throws(()=>validateSudoku({...s,hints:4}));assert.throws(()=>validateSudoku({...s,difficulty:'unknown'}))
})
test('mines golden corner neighbours and safe zero first open on both sizes', () => {
  assert.deepEqual(mineNeighbours(0,9),[1,9,10]); assert.deepEqual(mineNeighbours(8,9),[7,16,17])
  for(const size of [9,16] as const) for(const first of [0,size*size-1,Math.floor(size*size/2)]) {
    const s=minesReveal(createMines(size,19),first);assert.equal(mineNumber(s,first),0);assert.equal(s.mines.filter(Boolean).length,size===9?10:40);assert.ok(s.open[first]);assert.deepEqual(validateMines(s),s)
    assert.equal(minesReveal(s,first),s)
    const mine=s.mines.findIndex(Boolean);const lost=minesReveal(s,mine);assert.equal(minesStatus(lost),'lost');assert.equal(minesReveal(lost,2),lost);assert.equal(minesFlag(lost,mine),lost)
    const won={...s,open:s.mines.map(v=>!v),flags:Array(size*size).fill(false)};assert.equal(minesStatus(won),'won');assert.equal(minesFlag(won,mine),won)
  }
})
test('mines flags block open and chord only opens when surrounding flags match', () => {
  let s=minesFlag(createMines(9,71),0);assert.equal(minesReveal(s,0),s);s=minesFlag(s,0);s=minesReveal(s,0)
  const candidate=s.open.findIndex((v,i)=>v&&mineNumber(s,i)>0&&mineNeighbours(i,9).some(j=>!s.open[j]&&!s.mines[j]));assert.ok(candidate>=0)
  assert.equal(minesChord(s,candidate),s)
  for(const j of mineNeighbours(candidate,9))if(s.mines[j])s=minesFlag(s,j)
  const chord=minesChord(s,candidate);assert.equal(minesStatus(chord),'playing');assert.ok(mineNeighbours(candidate,9).filter(j=>!s.mines[j]).every(j=>chord.open[j]));assert.equal(chord.moves,s.moves+1)
  assert.throws(()=>validateMines({...s,mineCount:11}));assert.throws(()=>validateMines({...s,mines:Array(81).fill(false)}));assert.throws(()=>validateMines({...createMines(9,1),open:Array(81).fill(true)}))
})
test('2048 golden merges once and correct direction score', () => {
  assert.deepEqual(mergeLine([2,2,2,2]),{line:[4,4,0,0],score:8});assert.deepEqual(mergeLine([2,2,4,0]),{line:[4,4,0,0],score:4});assert.deepEqual(mergeLine([4,0,4,4]),{line:[8,4,0,0],score:8})
  const board=[2,2,4,4,0,0,0,0,0,0,0,0,0,0,0,0];assert.deepEqual(moveTilesBoard(board,'right').board,[0,0,4,8,0,0,0,0,0,0,0,0,0,0,0,0]);assert.equal(moveTilesBoard(board,'left').score,12)
  assert.deepEqual(moveTilesBoard(board,'down').board,[0,0,0,0,0,0,0,0,0,0,0,0,2,2,4,4])
})
test('2048 spawn only on changed board, win continuation and loss', () => {
  const s={seed:42,board:[2,4,0,0,...Array(12).fill(0)],score:0,moves:0,won:false};assert.equal(tilesMove(s,'left'),s)
  const moved=tilesMove(s,'down');assert.equal(moved.board.filter(Boolean).length,3);assert.equal(moved.moves,1);assert.deepEqual(validateTiles(moved),moved)
  const win=tilesMove({...s,board:[1024,1024,...Array(14).fill(0)]},'left');assert.ok(win.won);assert.equal(win.score,2048);assert.ok(tilesMove(win,'down').moves>win.moves)
  const lost={...s,board:[2,4,2,4,4,2,4,2,2,4,2,4,4,2,4,2]};assert.ok(tilesLost(lost));assert.equal(tilesMove(lost,'left'),lost)
  assert.deepEqual(validateTiles(createTiles(55)),createTiles(55));assert.throws(()=>validateTiles({...s,board:[3,4,...Array(14).fill(0)]}));assert.throws(()=>validateTiles({...s,score:Infinity}));assert.throws(()=>validateTiles({...s,won:true}))
})
test('fifteen golden parity, legal adjacent moves and solved stop', () => {
  const goal=Array.from({length:16},(_,i)=>(i+1)%16), swapped=[...goal];[swapped[0],swapped[1]]=[swapped[1],swapped[0]];assert.ok(fifteenSolvable(goal));assert.equal(fifteenSolvable(swapped),false)
  const near={seed:1,board:[1,2,3,4,5,6,7,8,9,10,11,12,13,14,0,15],moves:0,elapsedMs:0};assert.equal(fifteenMove(near,0),near);const won=fifteenMove(near,15);assert.deepEqual(won.board,goal);assert.ok(fifteenWon(won));assert.equal(fifteenMove(won,14),won)
  for(let seed=1;seed<=30;seed++){const s=createFifteen(seed);assert.ok(fifteenSolvable(s.board));assert.equal(fifteenWon(s),false);assert.deepEqual(validateFifteen(s),s)}
  assert.throws(()=>validateFifteen({...near,board:swapped}));assert.throws(()=>validateFifteen({...near,board:Array(16).fill(0)}));assert.throws(()=>validateFifteen({...near,moves:-1}))
})
test('lights golden cross, corner and inverse; generated boards solved by linear solution', () => {
  assert.deepEqual(lightNeighbours(0),[0,5,1]);assert.deepEqual(lightNeighbours(12),[12,7,17,11,13]);assert.deepEqual(lightNeighbours(4),[4,9,3])
  const s={seed:1,board:Array(25).fill(1),moves:0}, pressed=lightsMove(s,12);assert.deepEqual(pressed.board.map((v,i)=>v===0?i:-1).filter(i=>i>=0),[7,11,12,13,17]);assert.deepEqual(lightsMove(pressed,12).board,s.board)
  for(let seed=1;seed<=30;seed++){let state=createLights(seed);assert.deepEqual(validateLights(state),state);const solution=lightsSolution(state.board);assert.ok(solution);solution.forEach((n,i)=>{if(n)state=lightsMove(state,i)});assert.ok(lightsWon(state));assert.equal(lightsMove(state,0),state)}
  assert.throws(()=>validateLights({...s,board:Array(25).fill(2)}));assert.throws(()=>validateLights({...s,seed:-1}));const impossible=Array(25).fill(0);impossible[0]=1;assert.equal(lightsSolution(impossible),null);assert.throws(()=>validateLights({...s,board:impossible}))
})
