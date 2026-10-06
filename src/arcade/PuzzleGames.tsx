import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useArcadeSave } from './useArcadeSave'
import ArcadeSaveControls from './ArcadeSaveControls'
import { createSudoku, validateSudoku, sudokuWrite, sudokuHint, sudokuConflicts, sudokuWon, createMines, validateMines, minesFlag, minesReveal, minesChord, minesStatus, mineNumber, createTiles, validateTiles, tilesMove, tilesLost, createFifteen, validateFifteen, fifteenMove, fifteenWon, createLights, validateLights, lightsMove, lightsWon } from './puzzles'
import type { PuzzleId, Direction, Difficulty } from './puzzles'
import './puzzles.css'

function useKeys(action: (key: string) => boolean) {
  useEffect(() => { const listener = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || document.querySelector('dialog[open], [role="dialog"]') || (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], dialog, [role="dialog"]'))) return
    if (action(e.key)) e.preventDefault()
  }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener) }, [action])
}
function Panel({ children }: { children: ReactNode }) { return <section className="arcade-game-panel puzzle-panel">{children}</section> }
function PuzzleSaveControls(props: { undo: () => void; canUndo: boolean; reset: () => void; save: () => boolean; exportSave: () => string; importSave: (raw: string) => boolean; exportRaw: () => string | null; error: string | null; saved: boolean }) {
  return <><div className="puzzle-toolbar"><button disabled={!props.canUndo} onClick={props.undo}>撤销一步</button><button onClick={props.reset}>重新开始</button></div><ArcadeSaveControls {...props} /></>
}
function Sudoku() {
  const save = useArcadeSave('sudoku', () => createSudoku(), validateSudoku), s = save.state
  const [selected, setSelected] = useState<number | null>(null), [notes, setNotes] = useState(false)
  const bad = sudokuConflicts(s.board), won = sudokuWon(s)
  const write = (n: number) => { if (selected !== null) save.setState(prev => sudokuWrite(prev, selected, n, notes && n > 0)) }
  useKeys(key => { if (selected === null) return false; if (/^[1-9]$/.test(key)) { write(Number(key)); return true }; if (key === 'Backspace' || key === 'Delete' || key === '0') { write(0); return true }; const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -9, ArrowDown: 9 }; if (key in delta) { setSelected(Math.max(0, Math.min(80, selected + delta[key]))); return true }; return false })
  return <Panel><h2>数独</h2><p>每行、每列及每个九宫格填入 1–9，不可重复。浅色数字是固定题面。</p><div className="puzzle-toolbar"><label>难度 <select value={s.difficulty} onChange={e => { save.setState(createSudoku(e.target.value as Difficulty)); setSelected(null) }}><option value="easy">简单</option><option value="medium">中等</option><option value="hard">困难</option></select></label><button onClick={() => { save.setState(createSudoku(s.difficulty)); setSelected(null) }}>新题</button><span>步数 {s.moves}</span></div><div role="grid" aria-label="数独棋盘" className="puzzle-grid sudoku-grid">{s.board.map((n, i) => <button key={i} role="gridcell" aria-label={`第${Math.floor(i / 9) + 1}行第${i % 9 + 1}列，${n || '空白'}${s.puzzle[i] ? '，固定' : ''}`} aria-selected={selected === i} onClick={() => setSelected(i)} className={`${s.puzzle[i] ? 'given' : ''} ${bad.has(i) ? 'conflict' : ''} ${selected === i ? 'selected' : ''}`} style={{ borderRightWidth: i % 9 === 2 || i % 9 === 5 ? 3 : 1, borderBottomWidth: Math.floor(i / 9) === 2 || Math.floor(i / 9) === 5 ? 3 : 1 }}>{n || <span className="sudoku-notes">{Array.from({ length: 9 }, (_, k) => <span key={k}>{s.notes[i] & (1 << k) ? k + 1 : ''}</span>)}</span>}</button>)}</div><div className="puzzle-keypad">{Array.from({ length: 9 }, (_, i) => <button key={i} disabled={selected === null || Boolean(s.puzzle[selected]) || won} onClick={() => write(i + 1)}>{i + 1}</button>)}</div><div className="puzzle-toolbar"><button aria-pressed={notes} onClick={() => setNotes(v => !v)}>笔记：{notes ? '开' : '关'}</button><button onClick={() => write(0)} disabled={selected === null || won}>清除</button><button disabled={won || s.hints >= 3} onClick={() => save.setState(sudokuHint)}>提示（剩 {3 - s.hints} 次）</button></div><p role="status">{won ? '恭喜，数独全部正确！' : bad.size ? `有 ${bad.size} 格重复，请检查红色数字。` : notes ? '笔记模式：再次点同一数字可取消候选。' : '选中空格后点数字，也可用键盘输入。'}</p><PuzzleSaveControls {...save} /></Panel>
}
function Mines() {
  const save = useArcadeSave('minesweeper', () => createMines(), validateMines), s = save.state
  const [flagMode, setFlagMode] = useState(false), status = minesStatus(s)
  const act = (i: number) => save.setState(prev => flagMode ? minesFlag(prev, i) : prev.open[i] ? minesChord(prev, i) : minesReveal(prev, i))
  return <Panel><h2>扫雷</h2><p>数字表示周围雷数。首开格及周围八格安全；插旗数等于数字后，点数字可展开周围。误旗也会触雷。</p><div className="puzzle-toolbar"><label>棋盘 <select value={s.size} onChange={e => save.setState(createMines(Number(e.target.value) as 9 | 16))}><option value="9">9 × 9 · 10 雷</option><option value="16">16 × 16 · 40 雷</option></select></label><button onClick={() => save.setState(createMines(s.size))}>新局</button><button aria-pressed={flagMode} onClick={() => setFlagMode(v => !v)}>操作：{flagMode ? '插旗' : '翻开'}</button><span>剩余旗 {s.mineCount - s.flags.filter(Boolean).length}</span></div><div className="mines-scroll"><div className="puzzle-grid mines-grid" style={{ gridTemplateColumns: `repeat(${s.size}, 36px)`, width: s.size * 36 }} role="grid" aria-label="扫雷棋盘">{s.open.map((open, i) => <button key={i} role="gridcell" disabled={status !== 'playing'} aria-label={`第${Math.floor(i / s.size) + 1}行第${i % s.size + 1}列，${s.flags[i] ? '旗' : open ? s.mines[i] ? '雷' : `周围${mineNumber(s, i)}雷` : '未翻开'}`} className={`${open ? 'revealed' : ''} ${open && s.mines[i] ? 'conflict' : ''}`} onClick={() => act(i)} onContextMenu={e => { e.preventDefault(); save.setState(prev => minesFlag(prev, i)) }}>{s.flags[i] ? '⚑' : (open || status === 'lost') && s.mines[i] ? '✹' : open ? mineNumber(s, i) || '' : ''}</button>)}</div></div>{s.size === 16 && <p>宽棋盘可在棋盘内横向滑动。</p>}<p role="status">{status === 'lost' ? '触雷了，开启新局再试试。' : status === 'won' ? '成功排除所有地雷！' : '手机可切换插旗模式；电脑也可右键插旗。'}</p><PuzzleSaveControls {...save} /></Panel>
}
const directions: [Direction, string][] = [['up', '↑'], ['left', '←'], ['down', '↓'], ['right', '→']]
const keyDirection: Record<string, Direction> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }
function Tiles() {
  const save = useArcadeSave('2048', () => createTiles(), validateTiles), s = save.state
  const move = (d: Direction) => save.setState(prev => tilesMove(prev, d))
  useKeys(key => { const d = keyDirection[key]; if (!d) return false; move(d); return true })
  return <Panel><h2>2048</h2><p>向同一方向滑动全部数字，相同数字合并。每个数字每步只合并一次，有效移动后才出现新数字。</p><div className="puzzle-toolbar"><strong>得分 {s.score}</strong><span>步数 {s.moves}</span><button onClick={() => save.setState(createTiles())}>新局</button></div><div className="puzzle-grid tiles-grid" aria-label="2048 棋盘">{s.board.map((n, i) => <div key={i} className={`tile ${n ? 'filled' : ''}`} style={{ background: n ? `hsl(${Math.max(15, 48 - Math.log2(n) * 3)} 75% ${Math.max(38, 94 - Math.log2(n) * 4)}%)` : undefined }}>{n || ''}</div>)}</div><div className="puzzle-toolbar" aria-label="移动方向">{directions.map(([d, label]) => <button key={d} onClick={() => move(d)} aria-label={`向${{ up: '上', left: '左', down: '下', right: '右' }[d]}移动`}>{label}</button>)}</div><p role="status">{tilesLost(s) ? '已无可移动的方向，试试撤销或新局。' : s.won ? '已达到 2048！可以继续挑战更大的数字。' : '使用方向按钮、方向键或 WASD。'}</p><PuzzleSaveControls {...save} /></Panel>
}
function Fifteen() {
  const save = useArcadeSave('fifteen', () => createFifteen(), validateFifteen), s = save.state, won = fifteenWon(s)
  useKeys(key => { const d = keyDirection[key]; if (!d) return false; save.setState(prev => { const empty = prev.board.indexOf(0), delta = { up: 4, down: -4, left: 1, right: -1 }; return fifteenMove(prev, empty + delta[d]) }); return true })
  return <Panel><h2>数字华容道</h2><p>点击紧邻空格的数字，把 1–15 按从左到右、从上到下的顺序排列。所有新局均可解。</p><div className="puzzle-toolbar"><span>步数 {s.moves}</span><button onClick={() => save.setState(createFifteen())}>新局</button></div><div className="puzzle-grid fifteen-grid" role="grid" aria-label="数字华容道棋盘">{s.board.map((n, i) => <button key={i} role="gridcell" aria-label={n ? `移动数字 ${n}` : '空格'} className={n ? '' : 'empty'} disabled={!n || won} onClick={() => save.setState(prev => fifteenMove(prev, i))}>{n || ''}</button>)}</div><p role="status">{won ? '完成！数字全部归位。' : '方向键或 WASD 控制数字向箭头方向滑入空格。'}</p><PuzzleSaveControls {...save} /></Panel>
}
function Lights() {
  const save = useArcadeSave('lights', () => createLights(), validateLights), s = save.state, won = lightsWon(s)
  return <Panel><h2>翻灯</h2><p>点击一格会翻转它自己和上下左右的灯。熄灭全部 25 盏灯即可获胜，每个新局都有解。</p><div className="puzzle-toolbar"><span>步数 {s.moves}</span><button onClick={() => save.setState(createLights())}>新局</button></div><div className="puzzle-grid lights-grid" role="grid" aria-label="翻灯棋盘">{s.board.map((n, i) => <button key={i} role="gridcell" aria-label={`第${Math.floor(i / 5) + 1}行第${i % 5 + 1}列，${n ? '亮' : '灭'}`} aria-pressed={Boolean(n)} disabled={won} className={n ? 'lit' : ''} onClick={() => save.setState(prev => lightsMove(prev, i))}>{n ? '●' : '○'}</button>)}</div><p role="status">{won ? '全部熄灭，挑战成功！' : '灯光会相互影响，重复点击可恢复。'}</p><PuzzleSaveControls {...save} /></Panel>
}
export default function PuzzleGames({ gameId }: { gameId: PuzzleId }) { const Game = { sudoku: Sudoku, minesweeper: Mines, '2048': Tiles, fifteen: Fifteen, lights: Lights }[gameId]; return <Game key={gameId} /> }
