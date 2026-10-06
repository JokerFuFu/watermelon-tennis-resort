import test from 'node:test';
import assert from 'node:assert/strict';

import * as engine from './engine';
import type { GameState, ItemId } from './engine';
import * as storage from './storage';

test('one has exactly one positive factor', () => {
  assert.deepEqual(engine.getFactors?.(1), [1]);
});

function at(number: number): GameState {
  const state = engine.createGame();
  state.campaign.number = number;
  state.campaign.answers = engine.getFactors(number).map(() => '');
  state.completed = number - 1;
  return state;
}

function filled(number: number): GameState {
  const state = at(number);
  state.campaign.answers = engine.getFactors(number).reverse().map(String);
  return state;
}

test('prime and large factor counts are correct; invalid targets are rejected', () => {
  assert.deepEqual(engine.getFactors(97), [1, 97]);
  assert.equal(engine.getFactors(83160).length, 128);
  for (const n of [0, -1, 1.5, Infinity, 100001, NaN]) assert.throws(() => engine.getFactors(n), RangeError);
});

test('unordered complete answers clear a round without mutating the old state', () => {
  const state = filled(36);
  const previous = structuredClone(state);
  const result = engine.transition(state, { type: 'submit' });
  assert.equal(result.ok, true);
  assert.equal(result.state.campaign.cleared, true);
  assert.equal(result.state.coins, 28);
  assert.deepEqual(state, previous);
});

test('blank, zero, negative, decimal, scientific notation and nonfactors are editable errors', () => {
  for (const value of ['', '0', '-1', '1.5', '1e0', '5', 'hello']) {
    const state = filled(6);
    state.campaign.answers[0] = value;
    const result = engine.transition(state, { type: 'submit' });
    assert.equal(result.ok, false, value);
    assert.ok(result.invalidIndices.includes(0), value);
    assert.equal(result.state.coins, 0);
    assert.equal(result.state.campaign.cleared, false);
  }
});

test('duplicate factor answers mark all duplicates and award nothing', () => {
  const state = at(6);
  state.campaign.answers = ['1', '2', '2', '6'];
  const result = engine.transition(state, { type: 'submit' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.invalidIndices, [1, 2]);
  assert.equal(result.state.coins, 0);
});

test('next requires cleared campaign and respects the final number', () => {
  assert.equal(engine.transition(at(2), { type: 'next' }).ok, false);
  const state = engine.transition(filled(2), { type: 'submit' }).state;
  const next = engine.transition(state, { type: 'next' }).state;
  assert.equal(next.campaign.number, 3);
  assert.equal(next.completed, 2);
  assert.deepEqual(next.campaign.answers, ['', '']);
  assert.equal(next.campaign.boosted, false);
  const end = engine.transition(filled(100000), { type: 'submit' }).state;
  assert.equal(engine.transition(end, { type: 'next' }).ok, false);
});

test('reward schedule gives tenth-level diamonds and reduced random coins', () => {
  assert.deepEqual(engine.rewardFor(10), { coins: 18, diamonds: 3 });
  assert.deepEqual(engine.rewardFor(10, true), { coins: 13, diamonds: 1 });
});

test('shop publishes four prices and purchases inventory without using it', () => {
  assert.deepEqual(engine.ITEMS.map(item => [item.id, item.currency, item.cost]), [
    ['hint', 'coins', 10], ['pair', 'coins', 20], ['random', 'coins', 30], ['boost', 'diamonds', 3],
  ]);
  for (const item of engine.ITEMS) {
    const poor = engine.createGame();
    assert.equal(engine.transition(poor, { type: 'buy', item: item.id }).ok, false);
    const rich = engine.createGame(); rich.coins = 100; rich.diamonds = 10;
    const bought = engine.transition(rich, { type: 'buy', item: item.id });
    assert.equal(bought.ok, true);
    assert.equal(bought.state.inventory[item.id], 1);
    assert.equal(bought.state[item.currency], rich[item.currency] - item.cost);
    assert.deepEqual(bought.state.campaign, rich.campaign);
  }
});

test('hint replaces a wrong entry, preserves good entries and locks the reveal', () => {
  const state = at(6);
  state.campaign.answers = ['6', '8', '2', '3'];
  state.inventory.hint = 1;
  const result = engine.transition(state, { type: 'use', item: 'hint' });
  assert.equal(result.ok, true);
  assert.deepEqual(result.state.campaign.answers, ['6', '1', '2', '3']);
  assert.deepEqual(result.state.campaign.revealed, [1]);
  assert.equal(result.state.inventory.hint, 0);
  const edited = engine.transition(result.state, { type: 'answer', index: 1, value: '9' });
  assert.equal(edited.ok, false);
  assert.deepEqual(edited.state, result.state);
});

test('hint fixes duplicate while preserving the original valid answer', () => {
  const state = at(2); state.campaign.answers = ['1', '1']; state.inventory.hint = 1;
  const result = engine.transition(state, { type: 'use', item: 'hint' });
  assert.deepEqual(result.state.campaign.answers, ['1', '2']);
});

test('hint prefers a blank slot before overwriting an earlier wrong answer', () => {
  const state = at(6); state.campaign.answers = ['5', '', '', '']; state.inventory.hint = 1;
  const result = engine.transition(state, { type: 'use', item: 'hint' });
  assert.deepEqual(result.state.campaign.answers, ['5', '1', '', '']);
  assert.deepEqual(result.state.campaign.revealed, [1]);
});

test('pair hint prefers blank slots before overwriting an earlier wrong answer', () => {
  const state = at(6); state.campaign.answers = ['5', '', '', '']; state.inventory.pair = 1;
  const result = engine.transition(state, { type: 'use', item: 'pair' });
  assert.deepEqual(result.state.campaign.answers, ['5', '1', '6', '']);
  assert.deepEqual(result.state.campaign.revealed, [1, 2]);
});

test('pair uses its only blank before an unlocked wrong slot and preserves locks', () => {
  const state = at(6); state.campaign.answers = ['5', '2', '8', ' ']; state.campaign.revealed = [1]; state.inventory.pair = 1;
  const result = engine.transition(state, { type: 'use', item: 'pair' });
  assert.deepEqual(result.state.campaign.answers, ['6', '2', '8', '1']);
  assert.deepEqual(result.state.campaign.revealed, [1, 3, 0]);
});

test('pair hint fills a factor pair, only missing partner, and square root once', () => {
  const state = at(6); state.inventory.pair = 1;
  const first = engine.transition(state, { type: 'use', item: 'pair' });
  assert.deepEqual(first.state.campaign.answers.slice(0, 2), ['1', '6']);
  const partial = at(6); partial.campaign.answers[0] = '1'; partial.inventory.pair = 1;
  assert.deepEqual(engine.transition(partial, { type: 'use', item: 'pair' }).state.campaign.answers, ['1', '6', '', '']);
  const square = filled(36); square.campaign.answers[4] = ''; square.inventory.pair = 1;
  const completed = engine.transition(square, { type: 'use', item: 'pair' });
  assert.equal(completed.state.campaign.answers[4], '6');
  assert.deepEqual(completed.state.campaign.revealed, [4]);
});

test('unusable hints, cleared rounds and missing inventory consume nothing', () => {
  for (const item of ['hint', 'pair', 'boost'] as ItemId[]) {
    assert.equal(engine.transition(at(6), { type: 'use', item }).ok, false);
    const done = engine.transition(filled(6), { type: 'submit' }).state;
    done.inventory[item] = 1;
    const result = engine.transition(done, { type: 'use', item });
    assert.equal(result.ok, false);
    assert.deepEqual(result.state, done);
  }
  for (const item of ['hint', 'pair'] as ItemId[]) {
    const full = filled(6); full.inventory[item] = 1;
    assert.deepEqual(engine.transition(full, { type: 'use', item }).state, full);
  }
});

test('answer rejects out-of-bounds indices and cleared-round edits', () => {
  for (const index of [-1, 2, 0.5, NaN]) {
    const state = at(2);
    assert.equal(engine.transition(state, { type: 'answer', index, value: '1' }).ok, false);
  }
  const done = engine.transition(filled(2), { type: 'submit' }).state;
  assert.equal(engine.transition(done, { type: 'answer', index: 0, value: '9' }).ok, false);
});

test('boost doubles only coins once, belongs to its round and resets next round', () => {
  const state = filled(10); state.inventory.boost = 2;
  const boosted = engine.transition(state, { type: 'use', item: 'boost' }).state;
  assert.equal(boosted.campaign.boosted, true);
  assert.equal(boosted.inventory.boost, 1);
  assert.equal(engine.transition(boosted, { type: 'use', item: 'boost' }).ok, false);
  const done = engine.transition(boosted, { type: 'submit' }).state;
  assert.equal(done.coins, 36); assert.equal(done.diamonds, 3);
  assert.equal(engine.transition(done, { type: 'next' }).state.campaign.boosted, false);
});

test('random targets honor bounds and existing challenge resumes without another ticket', () => {
  for (const [number, random, expected] of [[1, 0, 2], [1, 0.999999, 20], [100000, 0.999999, 100000]]) {
    const state = at(number); state.inventory.random = 2;
    const opened = engine.transition(state, { type: 'use', item: 'random', random }).state;
    assert.equal(opened.active, 'random'); assert.equal(opened.challenge?.number, expected);
    assert.equal(opened.inventory.random, 1);
    opened.challenge!.answers[0] = '1';
    const back = engine.transition(opened, { type: 'campaign' }).state;
    back.inventory.random = 0;
    const resumed = engine.transition(back, { type: 'use', item: 'random', random: 0 });
    assert.equal(resumed.ok, true);
    assert.equal(resumed.state.inventory.random, 0);
    assert.deepEqual(resumed.state.challenge, opened.challenge);
    assert.equal(resumed.state.active, 'random');
    assert.equal(resumed.state.campaign.number, number);
  }
});

test('bad random seeds do not waste a ticket', () => {
  for (const random of [-0.1, 1, Infinity, NaN]) {
    const state = at(1); state.inventory.random = 1;
    assert.deepEqual(engine.transition(state, { type: 'use', item: 'random', random }).state, state);
  }
});

test('random rewards do not advance campaign and cannot be reclaimed on reload', () => {
  const state = at(10); state.inventory.random = 2; state.inventory.boost = 1;
  let random = engine.transition(state, { type: 'use', item: 'random', random: 0 }).state;
  random = engine.transition(random, { type: 'use', item: 'boost' }).state;
  random.challenge!.answers = ['2', '1'];
  random = engine.transition(random, { type: 'submit' }).state;
  assert.equal(random.coins, 20); assert.equal(random.diamonds, 1);
  assert.equal(random.completed, 9); assert.equal(random.campaign.cleared, false);
  const parsed = engine.parseSave(JSON.parse(JSON.stringify(random)))!;
  assert.ok(parsed);
  assert.deepEqual(engine.transition(parsed, { type: 'submit' }).state, parsed);
  assert.equal(engine.transition(parsed, { type: 'next' }).state.campaign.number, 10);
  const returned = engine.transition(parsed, { type: 'campaign' }).state;
  assert.equal(engine.transition(returned, { type: 'resumeRandom' }).state.active, 'random');
  const fresh = engine.transition(returned, { type: 'use', item: 'random', random: 0.9 }).state;
  assert.equal(fresh.inventory.random, 0); assert.equal(fresh.challenge!.cleared, false);
});

test('parseSave accepts real progress, drafts, locks and boost without sharing references', () => {
  let state = filled(1); state.inventory.hint = 1;
  state = engine.transition(state, { type: 'submit' }).state;
  state = engine.transition(state, { type: 'next' }).state;
  state = engine.transition(state, { type: 'use', item: 'hint' }).state;
  state.campaign.answers[1] = 'draft';
  const parsed = engine.parseSave(state);
  assert.deepEqual(parsed, state); assert.notEqual(parsed, state);
});

test('parseSave rejects corrupt structure and inconsistent progress or locked answers', () => {
  const edits: Array<(state: any) => void> = [
    s => { s.version = 2; }, s => { s.coins = -1; }, s => { s.coins = 1.5; },
    s => { s.diamonds = Infinity; }, s => { s.inventory.hint = -1; },
    s => { delete s.inventory.pair; }, s => { s.completed = 1; },
    s => { s.campaign.number = 0; }, s => { s.campaign.number = 100001; },
    s => { s.campaign.answers = []; }, s => { s.campaign.answers[0] = 1; },
    s => { s.campaign.cleared = true; }, s => { s.campaign.boosted = 'yes'; },
    s => { s.campaign.revealed = [0, 0]; }, s => { s.campaign.revealed = [1]; },
    s => { s.campaign.revealed = [0]; }, s => { s.active = 'random'; },
    s => { s.active = 'invalid'; }, s => { s.challenge = { ...s.campaign, number: 1 }; },
    s => { s.challenge = { number: 999, answers: engine.getFactors(999).map(() => ''), revealed: [], cleared: false, boosted: false }; },
  ];
  for (const edit of edits) {
    const state = engine.createGame(); edit(state);
    assert.equal(engine.parseSave(state), null, String(edit));
  }
  for (const value of [null, [], {}, 'oops', 5]) assert.equal(engine.parseSave(value), null);
  const duplicate = filled(2); duplicate.campaign.cleared = true; duplicate.completed = 2; duplicate.campaign.answers = ['1', '1'];
  assert.equal(engine.parseSave(duplicate), null);
  const lockedDuplicate = at(2); lockedDuplicate.campaign.answers = ['1', '1']; lockedDuplicate.campaign.revealed = [0, 1];
  assert.equal(engine.parseSave(lockedDuplicate), null);
});

test('resumeRandom without a challenge leaves the campaign intact', () => {
  assert.equal(engine.transition(engine.createGame(), { type: 'resumeRandom' }).ok, false);
});

test('parseSave rejects sparse answer and revealed arrays', () => {
  const answers = at(2);
  answers.campaign.answers = new Array(2);
  assert.equal(engine.parseSave(answers), null);
  const revealed = filled(2);
  revealed.campaign.revealed = new Array(1);
  assert.equal(engine.parseSave(revealed), null);
});

test('parseSave caps saved answer strings at eight characters without changing numeric rules', () => {
  const state = at(1); state.campaign.answers = ['00000001'];
  assert.ok(engine.parseSave(state));
  state.campaign.answers = [' 1 '];
  assert.ok(engine.parseSave(state));
  state.campaign.answers = ['000000001'];
  assert.equal(engine.parseSave(state), null);
  state.campaign.answers = ['wrong'.repeat(100000)];
  assert.equal(engine.parseSave(state), null);
});

test('safe integer ceilings cannot overflow inventory or rewards', () => {
  const state = filled(1); state.coins = Number.MAX_SAFE_INTEGER;
  assert.equal(engine.transition(state, { type: 'submit' }).ok, false);
  state.inventory.hint = Number.MAX_SAFE_INTEGER;
  assert.equal(engine.transition(state, { type: 'buy', item: 'hint' }).ok, false);
});

test('all 100000 numbers agree with an independent divisor-count sieve', () => {
  const counts = new Uint16Array(engine.MAX_NUMBER + 1);
  for (let divisor = 1; divisor <= engine.MAX_NUMBER; divisor += 1) {
    for (let multiple = divisor; multiple <= engine.MAX_NUMBER; multiple += divisor) counts[multiple] += 1;
  }
  for (let number = 1; number <= engine.MAX_NUMBER; number += 1) {
    const factors = engine.getFactors(number);
    assert.equal(factors.length, counts[number], String(number));
    assert.equal(factors[0], 1);
    assert.equal(factors.at(-1), number);
    assert.ok(factors.every((factor, index) => number % factor === 0 && (index === 0 || factors[index - 1] < factor)), String(number));
  }
});

function withLocalStorage(value: unknown, run: () => void) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value });
  try { run(); } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('storage saves and reloads using its independent key', () => {
  assert.equal(storage.SAVE_KEY, 'factor-quest-save-v1');
  const values = new Map<string, string>();
  withLocalStorage({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, () => {
    const state = engine.transition(filled(1), { type: 'submit' }).state;
    assert.equal(storage.saveGame(state), true);
    assert.deepEqual(storage.loadGame(), { state, warning: '' });
    assert.equal(values.size, 1);
  });
});

test('storage falls back with a warning for read errors and returns false for write errors', () => {
  assert.equal(typeof storage.loadGame, 'function');
  withLocalStorage({ getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } }, () => {
    assert.deepEqual(storage.loadGame().state, engine.createGame());
    assert.ok(storage.loadGame().warning);
    assert.equal(storage.saveGame(engine.createGame()), false);
  });
  withLocalStorage(undefined, () => {
    assert.ok(storage.loadGame().warning);
    assert.equal(storage.saveGame(engine.createGame()), false);
  });
});

test('storage rejects bad JSON or schema and preserves raw bad save in a backup', () => {
  assert.equal(typeof storage.loadGame, 'function');
  for (const raw of ['{oops', '{"version":1}']) {
    const values = new Map([[storage.SAVE_KEY, raw]]);
    withLocalStorage({ getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) }, () => {
      const result = storage.loadGame();
      assert.ok(result.warning); assert.deepEqual(result.state, engine.createGame());
      assert.ok([...values].some(([key, value]) => key !== storage.SAVE_KEY && value === raw));
    });
  }
});

test('square factors are ordered and square root is counted once', () => {
  assert.deepEqual(engine.getFactors?.(36), [1, 2, 3, 4, 6, 9, 12, 18, 36]);
});

test('first correct answer earns 12 coins and one diamond only once', () => {
  assert.equal(typeof engine.createGame, 'function');
  let state = engine.createGame();
  state = engine.transition(state, { type: 'answer', index: 0, value: '1' }).state;
  state = engine.transition(state, { type: 'submit' }).state;
  assert.equal(state.coins, 12);
  assert.equal(state.diamonds, 1);
  assert.equal(state.completed, 1);
  assert.deepEqual(engine.transition(state, { type: 'submit' }).state, state);
});
