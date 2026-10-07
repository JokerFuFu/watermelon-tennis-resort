export const MAX_NUMBER = 100000;
export type ItemId = 'hint' | 'pair' | 'random' | 'boost';
export interface Item {
  id: ItemId;
  name: string;
  description: string;
  currency: 'coins' | 'diamonds';
  cost: number;
}
export interface Round {
  number: number;
  answers: string[];
  cleared: boolean;
  revealed: number[];
  boosted: boolean;
}
export interface GameState {
  version: 1;
  coins: number;
  diamonds: number;
  inventory: Record<ItemId, number>;
  campaign: Round;
  challenge: Round | null;
  active: 'campaign' | 'random';
  completed: number;
}
export type Action =
  | { type: 'answer'; index: number; value: string }
  | { type: 'submit' }
  | { type: 'next' }
  | { type: 'campaign' }
  | { type: 'resumeRandom' }
  | { type: 'buy'; item: ItemId }
  | { type: 'use'; item: ItemId; random?: number };

export const ITEMS: Item[] = [
  { id: 'hint', name: '单格提示', description: '补上一个缺失的因数，提示格会锁定。', currency: 'coins', cost: 10 },
  { id: 'pair', name: '配对提示', description: '补上乘积为目标数字的一对因数，已填对的只补另一项。', currency: 'coins', cost: 20 },
  { id: 'random', name: '随机挑战券', description: '开启随机数字挑战，已有未完成挑战可免费继续。', currency: 'coins', cost: 30 },
  { id: 'boost', name: '双倍金币券', description: '当前关卡金币翻倍，钻石不变，每关限用一次。', currency: 'diamonds', cost: 3 },
];

function isInteger(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
}

export function getFactors(n: number): number[] {
  if (!isInteger(n, 1, MAX_NUMBER)) throw new RangeError('目标数字必须是 1 至 100000 的整数');
  const lower: number[] = [];
  const upper: number[] = [];
  for (let d = 1; d * d <= n; d += 1) {
    if (n % d !== 0) continue;
    lower.push(d);
    if (d * d !== n) upper.push(n / d);
  }
  return lower.concat(upper.reverse());
}

function newRound(number: number): Round {
  return { number, answers: getFactors(number).map(() => ''), cleared: false, revealed: [], boosted: false };
}

export function createGame(): GameState {
  return { version: 1, coins: 0, diamonds: 0, inventory: { hint: 0, pair: 0, random: 0, boost: 0 }, campaign: newRound(1), challenge: null, active: 'campaign', completed: 0 };
}

export function currentRound(state: GameState): Round {
  return state.active === 'random' && state.challenge ? state.challenge : state.campaign;
}

export function rewardFor(number: number, isRandom = false): { coins: number; diamonds: number } {
  const coins = 10 + 2 * getFactors(number).length;
  return isRandom
    ? { coins: Math.max(8, Math.floor(coins * 0.75)), diamonds: 1 }
    : { coins, diamonds: number % 10 === 0 ? 3 : 1 };
}

function factorAnswer(answer: string, number: number): number | null {
  if (!/^\d+$/.test(answer.trim())) return null;
  const value = Number(answer.trim());
  return isInteger(value, 1, number) && number % value === 0 ? value : null;
}

function invalidAnswers(round: Round): number[] {
  const values = round.answers.map(answer => factorAnswer(answer, round.number));
  const counts = new Map<number, number>();
  for (const value of values) if (value !== null) counts.set(value, (counts.get(value) ?? 0) + 1);
  return values.flatMap((value, index) => value === null || counts.get(value)! > 1 ? [index] : []);
}

// Preserve revealed factors first; then preserve the first correct occurrence of each factor.
function hintTargets(round: Round): { missing: number[]; editable: number[] } {
  const present = new Set<number>();
  const kept = new Set(round.revealed);
  for (const index of round.revealed) present.add(Number(round.answers[index]));
  round.answers.forEach((answer, index) => {
    if (kept.has(index)) return;
    const value = factorAnswer(answer, round.number);
    if (value !== null && !present.has(value)) { present.add(value); kept.add(index); }
  });
  return {
    missing: getFactors(round.number).filter(value => !present.has(value)),
    editable: round.answers.flatMap((_, index) => kept.has(index) ? [] : [index])
      .sort((a, b) => Number(round.answers[a].trim() !== '') - Number(round.answers[b].trim() !== '') || a - b),
  };
}

export function transition(state: GameState, action: Action): { state: GameState; message: string; ok: boolean; invalidIndices: number[] } {
  const fail = (message: string, invalidIndices: number[] = []) => ({ state, message, ok: false, invalidIndices });
  const next = structuredClone(state);
  const round = currentRound(next);
  const success = (message: string) => ({ state: next, message, ok: true, invalidIndices: [] });
  switch (action.type) {
    case 'answer':
      if (round.cleared) return fail('本关已完成，继续下一关吧。');
      if (!isInteger(action.index, 0, round.answers.length - 1)) return fail('这个答案格不存在。');
      if (round.revealed.includes(action.index)) return fail('提示格已锁定，请填写其他格。');
      round.answers[action.index] = action.value;
      return success('');
    case 'submit': {
      if (round.cleared) return fail('本关奖励已经领取。');
      const invalid = invalidAnswers(round);
      if (invalid.length) return fail('请检查标出的格子：填入正整数因数，不能留空或重复。', invalid);
      const reward = rewardFor(round.number, next.active === 'random');
      const coins = reward.coins * (round.boosted ? 2 : 1);
      if (!Number.isSafeInteger(next.coins + coins) || !Number.isSafeInteger(next.diamonds + reward.diamonds)) return fail('货币余额已达到可保存上限。');
      round.cleared = true;
      next.coins += coins;
      next.diamonds += reward.diamonds;
      if (next.active === 'campaign') next.completed = round.number;
      return success(`全部正确！获得 ${coins} 金币、${reward.diamonds} 钻石。`);
    }
    case 'next':
      if (next.active === 'random') return fail('随机挑战不推进主线，请先返回主线。');
      if (!round.cleared) return fail('先完成本关，才能进入下一关。');
      if (round.number >= MAX_NUMBER) return fail('你已完成全部 100000 个主线关卡！');
      next.campaign = newRound(round.number + 1);
      return success('下一关已开启。');
    case 'campaign':
      next.active = 'campaign';
      return success('已返回主线，挑战答案会保留。');
    case 'resumeRandom':
      if (!next.challenge) return fail('还没有随机挑战，可在背包使用挑战券。');
      next.active = 'random';
      return success('已返回之前的随机挑战。');
    case 'buy': {
      const item = ITEMS.find(item => item.id === action.item);
      if (!item) return fail('没有这个道具。');
      if (next[item.currency] < item.cost) return fail(`${item.currency === 'coins' ? '金币' : '钻石'}不足。`);
      if (!Number.isSafeInteger(next.inventory[item.id] + 1)) return fail('背包数量已达到上限。');
      next[item.currency] -= item.cost;
      next.inventory[item.id] += 1;
      return success(`已购买${item.name}，可在背包使用。`);
    }
    case 'use': {
      if (action.item === 'random' && next.challenge && !next.challenge.cleared) {
        next.active = 'random';
        return success('已继续未完成的随机挑战，没有消耗新的挑战券。');
      }
      if (!ITEMS.some(item => item.id === action.item)) return fail('没有这个道具。');
      if (next.inventory[action.item] <= 0) return fail('背包里没有这个道具，请先到商店购买。');
      if (action.item === 'random') {
        const random = action.random ?? Math.random();
        if (!Number.isFinite(random) || random < 0 || random >= 1) return fail('随机数字无效，挑战券已保留。');
        const upper = Math.min(MAX_NUMBER, Math.max(20, next.campaign.number * 5));
        next.challenge = newRound(2 + Math.floor(random * (upper - 1)));
        next.active = 'random';
        next.inventory.random -= 1;
        return success('随机挑战已开启，主线进度会保留。');
      }
      if (round.cleared) return fail('本关已完成，道具已保留。');
      if (action.item === 'boost') {
        if (round.boosted) return fail('本关已经开启双倍金币，不能叠加。');
        round.boosted = true;
        next.inventory.boost -= 1;
        return success('本关金币奖励已翻倍。');
      }
      const targets = hintTargets(round);
      if (!targets.missing.length) return fail('所有因数已填正确，提交即可，道具已保留。');
      const factor = action.item === 'pair'
        ? getFactors(round.number).find(value => targets.missing.includes(value) || targets.missing.includes(round.number / value))!
        : targets.missing[0];
      const partner = round.number / factor;
      const values = targets.missing.includes(factor) ? [factor] : [];
      if (action.item === 'pair' && partner !== factor && targets.missing.includes(partner)) values.push(partner);
      values.forEach((value, offset) => {
        const index = targets.editable[offset];
        round.answers[index] = String(value);
        round.revealed.push(index);
      });
      next.inventory[action.item] -= 1;
      return success(action.item === 'pair' ? '配对提示已填入缺失因数，提示格已锁定。' : '单格提示已填入，提示格已锁定。');
    }
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validRound(value: unknown, min: number, max: number): value is Round {
  if (!record(value) || !isInteger(value.number, min, max)) return false;
  if (typeof value.cleared !== 'boolean' || typeof value.boosted !== 'boolean') return false;
  if (!Array.isArray(value.answers) || value.answers.length !== getFactors(value.number).length || !Array.from(value.answers).every(answer => typeof answer === 'string' && answer.length <= 8)) return false;
  if (!Array.isArray(value.revealed) || !Array.from(value.revealed).every(index => isInteger(index, 0, (value.answers as string[]).length - 1))) return false;
  if (new Set(value.revealed).size !== value.revealed.length) return false;
  const revealedFactors = value.revealed.map(index => factorAnswer((value.answers as string[])[index], value.number as number));
  if (revealedFactors.includes(null) || new Set(revealedFactors).size !== revealedFactors.length) return false;
  return !value.cleared || invalidAnswers(value as unknown as Round).length === 0;
}

export function parseSave(value: unknown): GameState | null {
  if (!record(value) || value.version !== 1 || !isInteger(value.coins) || !isInteger(value.diamonds)) return null;
  if (!record(value.inventory) || !ITEMS.every(item => isInteger((value.inventory as Record<string, unknown>)[item.id]))) return null;
  if (!validRound(value.campaign, 1, MAX_NUMBER) || !isInteger(value.completed, 0, MAX_NUMBER)) return null;
  if (value.completed !== value.campaign.number - (value.campaign.cleared ? 0 : 1)) return null;
  const challengeMax = Math.min(MAX_NUMBER, Math.max(20, value.campaign.number * 5));
  if (value.challenge !== null && !validRound(value.challenge, 2, challengeMax)) return null;
  if (value.active !== 'campaign' && value.active !== 'random') return null;
  if (value.active === 'random' && value.challenge === null) return null;
  return structuredClone(value) as unknown as GameState;
}
