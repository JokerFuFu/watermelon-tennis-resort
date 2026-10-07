import { createGame, parseSave } from './engine';
import type { GameState } from './engine';

export const SAVE_KEY = 'factor-quest-save-v1';

export function loadGame(): { state: GameState; warning: string } {
  let raw: string | null;
  try {
    raw = globalThis.localStorage.getItem(SAVE_KEY);
  } catch {
    return { state: createGame(), warning: '浏览器存储不可用，本次进度可能无法保存。' };
  }
  if (raw === null) return { state: createGame(), warning: '' };
  let state: GameState | null = null;
  try { state = parseSave(JSON.parse(raw)); } catch { /* Corrupt JSON follows the same recovery path. */ }
  if (state) return { state, warning: '' };
  let backedUp = false;
  try {
    globalThis.localStorage.setItem(`${SAVE_KEY}-corrupt-${Date.now()}`, raw);
    backedUp = true;
  } catch { /* Recovery still works if storage is full or blocked. */ }
  return {
    state: createGame(),
    warning: backedUp ? '旧存档损坏，已保留备份并开启新游戏。' : '旧存档损坏，备份失败，已开启新游戏。',
  };
}

export function saveGame(state: GameState): boolean {
  try {
    if (!parseSave(state)) return false;
    globalThis.localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
