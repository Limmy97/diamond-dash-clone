import { describe, it, expect } from 'vitest';
import {
  BOMB,
  DIFFICULTIES,
  COLOR_WASH_MIN_FRACTION,
  WASH_GEM_COOLDOWN_MAX_MS,
  WASH_GEM_COOLDOWN_MIN_MS,
  WASH_GEM_LIFETIME_MS,
  WASH_GEM_SUFFIX,
  isWashGem,
  BOMB_BONUS_POINTS,
  COLS,
  TIME_GEM_COOLDOWN_MAX_MS,
  TIME_GEM_COOLDOWN_MIN_MS,
  TIME_GEM_LIFETIME_MS,
  isTimeGem,

  TIME_GEM_BONUS_SECONDS,
  TIME_GEM_SUFFIX,
  LINE_BOMB,
  LINE_BOMB_BONUS_POINTS,
  LINE_BOMB_METER_MAX,
  LINE_BOMB_MISS_DRAIN,
  POINTS_PER_GEM,
  ROWS,
} from '../engine/constants.js';
import {
  activateBooster,
  createInitialState,
  detonateRemainingPowerUps,
  getBlastCells,
  splashBoard,
  handleCellTap,
  popRemainingClusters,
  tickGame,
} from '../engine/gameLoop.js';
import { findConnected, hasValidMoves } from '../engine/floodFill.js';

const alwaysRed = () => 0;

const makeBoard = (colorAt) =>
  Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => colorAt(r, c)));

const checkerboard = () => makeBoard((r, c) => ((r + c) % 2 === 0 ? 'red' : 'blue'));

const stateWith = (overrides) => ({ ...createInitialState(alwaysRed), ...overrides });

describe('line bomb meter', () => {
  it('fills by the size of each popped cluster', () => {
    const board = makeBoard((r) => (r < 3 ? 'red' : 'blue'));
    const { nextState } = handleCellTap(stateWith({ board }), 0, 0, 0, alwaysRed);
    expect(nextState.lineBombMeter).toBe(3 * COLS);
  });

  it('drains on a miss without going below zero', () => {
    const start = stateWith({ board: checkerboard(), lineBombMeter: LINE_BOMB_MISS_DRAIN + 2 });
    const once = handleCellTap(start, 0, 0, 0, alwaysRed).nextState;
    expect(once.lineBombMeter).toBe(2);
    expect(handleCellTap(once, 0, 0, 0, alwaysRed).nextState.lineBombMeter).toBe(0);
  });

  it('leaves a line bomb at the tapped cell once full, carrying over the excess', () => {
    const board = makeBoard((r) => (r < 3 ? 'red' : 'blue'));
    const start = stateWith({ board, lineBombMeter: LINE_BOMB_METER_MAX - 1 });
    const { nextState } = handleCellTap(start, 1, 4, 0, alwaysRed);
    expect(nextState.board[1][4]).toBe(LINE_BOMB);
    expect(nextState.lineBombMeter).toBe(3 * COLS - 1);
  });
});

describe('line bomb', () => {
  const withLineBombAt = (row, col, overrides) => {
    const board = checkerboard();
    board[row][col] = LINE_BOMB;
    return stateWith({ board, ...overrides });
  };

  it('is never part of a colour cluster', () => {
    const board = makeBoard(() => 'red');
    board[4][4] = LINE_BOMB;
    expect(findConnected(board, 4, 4)).toEqual([]);
    expect(findConnected(board, 0, 0)).toHaveLength(ROWS * COLS - 1);
  });

  it('blasts its own column and the bottom row, each cell once', () => {
    const cells = getBlastCells(withLineBombAt(2, 3).board, 2, 3);
    expect(cells).toHaveLength(COLS + ROWS - 1);
    expect(new Set(cells.map(([r, c]) => `${r},${c}`)).size).toBe(cells.length);
    expect(cells.every(([r, c]) => r === ROWS - 1 || c === 3)).toBe(true);
    expect(cells).toContainEqual([ROWS - 1, 0]);
    expect(cells).toContainEqual([0, 3]);
    expect(cells).not.toContainEqual([2, 0]);
  });

  it('detonates on tap for bonus points and adds to the combo', () => {
    const start = withLineBombAt(2, 3, { comboCount: 2, comboExpiry: 1000 });
    const { nextState, clearedCells, eventType } = handleCellTap(start, 2, 3, 0, alwaysRed);
    expect(eventType).toBe('line_bomb');
    expect(clearedCells).toHaveLength(COLS + ROWS - 1);
    expect(nextState.score).toBe(clearedCells.length * POINTS_PER_GEM + LINE_BOMB_BONUS_POINTS);
    expect(nextState.comboCount).toBe(3);
  });
});

describe('boosters', () => {
  it('shuffle keeps the same tiles, spends a charge, and leaves a playable board', () => {
    const start = createInitialState(alwaysRed);
    let i = 0;
    const rng = () => ((i += 0.37) % 1);
    const next = activateBooster(start, 'shuffle', rng);
    expect(next.boosters.shuffle).toBe(start.boosters.shuffle - 1);
    expect(next.board.flat().sort()).toEqual(start.board.flat().sort());
    expect(hasValidMoves(next.board)).toBe(true);
  });

  it('does nothing once the charges are spent or the round is over', () => {
    const spent = stateWith({ boosters: { shuffle: 0, colorBurst: 0 } });
    expect(activateBooster(spent, 'shuffle')).toBe(spent);
    expect(activateBooster(spent, 'colorBurst')).toBe(spent);
    const over = stateWith({ isGameOver: true });
    expect(activateBooster(over, 'shuffle')).toBe(over);
  });

  it('color burst arms, can be disarmed, then clears every gem of the tapped colour', () => {
    const board = checkerboard();
    const armed = activateBooster(stateWith({ board }), 'colorBurst');
    expect(armed.armedBooster).toBe('colorBurst');
    expect(activateBooster(armed, 'colorBurst').armedBooster).toBeNull();

    const { nextState, clearedCells, eventType } = handleCellTap(armed, 0, 0, 0, alwaysRed);
    expect(eventType).toBe('color_burst');
    expect(clearedCells).toHaveLength((ROWS * COLS) / 2);
    expect(clearedCells.every(([r, c]) => board[r][c] === 'red')).toBe(true);
    expect(nextState.score).toBe(clearedCells.length * POINTS_PER_GEM);
    expect(nextState.armedBooster).toBeNull();
    expect(nextState.boosters.colorBurst).toBe(armed.boosters.colorBurst - 1);
  });

  it('an armed color burst ignores taps on special tiles and stays armed', () => {
    const board = checkerboard();
    board[0][0] = LINE_BOMB;
    const armed = activateBooster(stateWith({ board }), 'colorBurst');
    const result = handleCellTap(armed, 0, 0, 0, alwaysRed);
    expect(result.eventType).toBe('ignored');
    expect(result.nextState.armedBooster).toBe('colorBurst');
  });
});

describe('time gem', () => {
  const withTimeGemAt = (row, col, overrides) => {
    const board = makeBoard((r) => (r < 3 ? 'red' : 'blue'));
    board[row][col] = `red${TIME_GEM_SUFFIX}`;
    return stateWith({ board, timeRemaining: 30, ...overrides });
  };

  it('still clusters with its own colour', () => {
    const board = withTimeGemAt(1, 1).board;
    expect(findConnected(board, 0, 0)).toHaveLength(3 * COLS);
    expect(findConnected(board, 1, 1)).toHaveLength(3 * COLS);
  });

  it('adds seconds to the clock when popped', () => {
    const { nextState } = handleCellTap(withTimeGemAt(1, 1), 0, 0, 0, alwaysRed);
    expect(nextState.timeRemaining).toBe(30 + TIME_GEM_BONUS_SECONDS);
  });

  it('adds seconds for each time gem destroyed, including through blasts', () => {
    const state = withTimeGemAt(1, 1, { isFireMode: true, fireModeExpiry: 10_000 });
    state.board[0][0] = `red${TIME_GEM_SUFFIX}`;
    const { nextState } = handleCellTap(state, 2, 2, 0, alwaysRed);
    expect(nextState.timeRemaining).toBe(30 + 2 * TIME_GEM_BONUS_SECONDS);
  });

  it('leaves the clock alone when no time gem is destroyed', () => {
    const { nextState } = handleCellTap(stateWith({ board: makeBoard(() => 'red'), timeRemaining: 30 }), 0, 0, 0, alwaysRed);
    expect(nextState.timeRemaining).toBe(30);
  });
});

describe('wash gem', () => {
  const timeRng = () => 0.97;
  const countWashGems = (board) => board.flat().filter(isWashGem).length;

  const quadrantOf = (r, c) => (r >= Math.ceil(ROWS / 2) ? 2 : 0) + (c >= Math.ceil(COLS / 2) ? 1 : 0);
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const cellsOf = (board, color) =>
    board.flatMap((row, r) => row.flatMap((tile, c) => (tile === color ? [[r, c]] : [])));

  it('splashes its colour over one adjacent blob in a different quadrant when popped', () => {
    // Top three rows are a green cluster holding the wash gem; the rest has no green at all.
    const board = makeBoard((r, c) => (r < 3 ? 'green' : (r + c) % 2 === 0 ? 'red' : 'blue'));
    board[0][0] = `green${WASH_GEM_SUFFIX}`;
    const { nextState } = handleCellTap(stateWith({ board, lineBombMeter: -1000 }), 0, 0, 0, alwaysRed);
    const green = cellsOf(nextState.board, 'green');
    expect(green).toHaveLength(Math.round(ROWS * COLS * COLOR_WASH_MIN_FRACTION));
    expect(green.every(([r, c]) => quadrantOf(r, c) !== quadrantOf(0, 0))).toBe(true);
    expect(findConnected(nextState.board, green[0][0], green[0][1])).toHaveLength(green.length);
    expect(hasValidMoves(nextState.board)).toBe(true);
  });

  it('always paints one connected blob, never in the source quadrant, of 20-25% of the board', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const from = [seed % ROWS, (seed * 3) % COLS];
      const next = splashBoard(checkerboard(), seeded(seed), 'green', from);
      const green = cellsOf(next, 'green');
      const quadrantCells = (q) => cellsOf(makeBoard(() => 'green'), 'green').filter(([r, c]) => quadrantOf(r, c) === q);
      const sizes = [0, 1, 2, 3].filter((q) => q !== quadrantOf(...from)).map((q) => quadrantCells(q).length);
      expect(green.length).toBeGreaterThanOrEqual(Math.min(Math.min(...sizes), 18));
      expect(green.length).toBeLessThanOrEqual(Math.round(ROWS * COLS * 0.25));
      expect(new Set(green.map(([r, c]) => quadrantOf(r, c))).size).toBe(1);
      expect(quadrantOf(...green[0])).not.toBe(quadrantOf(...from));
      expect(findConnected(next, green[0][0], green[0][1])).toHaveLength(green.length);
    }
  });

  it('skips bombs and keeps time badges', () => {
    const board = checkerboard();
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (quadrantOf(r, c) === 1) board[r][c] = BOMB;
    board[0][5] = `red${TIME_GEM_SUFFIX}`;
    for (let seed = 1; seed <= 30; seed++) {
      const next = splashBoard(board, seeded(seed), 'green', [0, 0]);
      // Quadrant 1 is all bombs, so a splash must pick elsewhere (or give up) and never touch them.
      if (next) {
        expect(next.flat().filter((tile) => tile === BOMB)).toHaveLength(board.flat().filter((tile) => tile === BOMB).length);
        expect(next[0][5]).toBe(`red${TIME_GEM_SUFFIX}`);
      }
    }
  });

  it('spawns at most one at a time, 10-12s apart, and loses its badge after 4s', () => {
    const board = makeBoard((r) => (r < 3 ? 'red' : 'blue'));
    const start = stateWith({ board, lineBombMeter: -1000 });
    const first = handleCellTap(start, 0, 0, 1000, timeRng).nextState;
    expect(countWashGems(first.board)).toBe(1);
    expect(first.washGemExpiry).toBe(1000 + WASH_GEM_LIFETIME_MS);
    expect(first.nextWashGemAt).toBeGreaterThanOrEqual(1000 + WASH_GEM_COOLDOWN_MIN_MS);
    expect(first.nextWashGemAt).toBeLessThanOrEqual(1000 + WASH_GEM_COOLDOWN_MAX_MS);

    const expired = tickGame(first, first.washGemExpiry, 0.05);
    expect(countWashGems(expired.board)).toBe(0);
    expect(expired.washGemExpiry).toBeNull();
  });

  it('is no longer a booster button', () => {
    expect(createInitialState(alwaysRed).boosters).toEqual({ shuffle: 2, colorBurst: 1 });
  });
});

describe('chain reactions', () => {
  const has = (cells, r, c) => cells.some(([cr, cc]) => cr === r && cc === c);

  it('a bomb detonates another bomb inside its blast', () => {
    const board = checkerboard();
    board[4][4] = BOMB;
    board[4][6] = BOMB;
    const { clearedCells, nextState } = handleCellTap(stateWith({ board }), 4, 4, 0, alwaysRed);
    expect(has(clearedCells, 4, 8)).toBe(true); // only reachable through the second bomb
    expect(nextState.score).toBe(clearedCells.length * POINTS_PER_GEM + 2 * BOMB_BONUS_POINTS);
  });

  it('a line bomb detonates a bomb in its column and bottom row', () => {
    const board = checkerboard();
    board[2][3] = LINE_BOMB;
    board[5][3] = BOMB;
    const { clearedCells, nextState } = handleCellTap(stateWith({ board }), 2, 3, 0, alwaysRed);
    expect(has(clearedCells, 6, 1)).toBe(true); // only reachable through the bomb
    expect(nextState.score).toBe(
      clearedCells.length * POINTS_PER_GEM + LINE_BOMB_BONUS_POINTS + BOMB_BONUS_POINTS,
    );
  });

  it('a Fire Mode blast detonates a bomb it reaches', () => {
    const board = checkerboard();
    for (const [r, c] of [[0, 0], [0, 1], [1, 0]]) board[r][c] = 'red';
    board[2][1] = BOMB;
    const start = stateWith({ board, isFireMode: true, fireModeExpiry: 10_000 });
    const { clearedCells, eventType } = handleCellTap(start, 0, 0, 0, alwaysRed);
    expect(eventType).toBe('fire_blast');
    expect(has(clearedCells, 4, 3)).toBe(true);
  });

  it('chained specials detonate only once even when they reach each other', () => {
    const board = checkerboard();
    board[4][4] = BOMB;
    board[4][5] = BOMB;
    const { clearedCells, nextState } = handleCellTap(stateWith({ board }), 4, 4, 0, alwaysRed);
    expect(new Set(clearedCells.map(([r, c]) => `${r},${c}`)).size).toBe(clearedCells.length);
    expect(nextState.score).toBe(clearedCells.length * POINTS_PER_GEM + 2 * BOMB_BONUS_POINTS);
  });
});

describe('time gem lifecycle', () => {
  /** Rolls high enough to spawn a time gem (and a yellow gem) but never a bomb. */
  const timeRng = () => 0.97;
  const countTimeGems = (board) => board.flat().filter(isTimeGem).length;
  const topThreeRed = () => makeBoard((r) => (r < 3 ? 'red' : 'blue'));
  const start = () => stateWith({ board: topThreeRed(), timeRemaining: 30, lineBombMeter: -1000 });

  it('spawns at most one, then waits out an 8-10s cooldown', () => {
    const first = handleCellTap(start(), 0, 0, 1000, timeRng).nextState;
    expect(countTimeGems(first.board)).toBe(1);
    expect(first.timeGemExpiry).toBe(1000 + TIME_GEM_LIFETIME_MS);
    expect(first.nextTimeGemAt).toBeGreaterThanOrEqual(1000 + TIME_GEM_COOLDOWN_MIN_MS);
    expect(first.nextTimeGemAt).toBeLessThanOrEqual(1000 + TIME_GEM_COOLDOWN_MAX_MS);

    // Popping it pays out and, still on cooldown, does not respawn.
    const second = handleCellTap(first, 0, 0, 2000, timeRng).nextState;
    expect(second.timeRemaining).toBe(32);
    expect(countTimeGems(second.board)).toBe(0);
    expect(second.timeGemExpiry).toBeNull();

    // Once the cooldown has passed the next pop can spawn another.
    const third = handleCellTap(second, 0, 0, first.nextTimeGemAt + 1, timeRng).nextState;
    expect(countTimeGems(third.board)).toBe(1);
  });

  it('does not spawn a second while one is still on the board', () => {
    const first = handleCellTap(start(), 0, 0, 1000, timeRng).nextState;
    // Pop the blue cluster instead; the time gem survives and must block new spawns.
    const later = handleCellTap({ ...first, nextTimeGemAt: 0 }, ROWS - 1, 0, 1500, timeRng).nextState;
    expect(countTimeGems(later.board)).toBe(1);
  });

  it('loses its badge after the lifetime, becoming a plain gem', () => {
    const board = checkerboard();
    board[3][3] = `red${TIME_GEM_SUFFIX}`;
    const state = stateWith({ board, timeGemExpiry: 5000 });
    expect(countTimeGems(tickGame(state, 4999, 0.05).board)).toBe(1);
    const expired = tickGame(state, 5000, 0.05);
    expect(countTimeGems(expired.board)).toBe(0);
    expect(expired.board[3][3]).toBe('red');
    expect(expired.timeGemExpiry).toBeNull();
  });
});

describe('round-end finale', () => {
  const over = (overrides) => stateWith({ isGameOver: true, timeRemaining: 0, ...overrides });

  it('detonates every leftover power-up at once, chaining bombs, without touching the clock', () => {
    const board = checkerboard();
    board[4][4] = BOMB;
    board[4][6] = BOMB;
    board[0][0] = `red${TIME_GEM_SUFFIX}`;
    board[8][9] = LINE_BOMB;
    const { nextState, clearedCells } = detonateRemainingPowerUps(over({ board }), alwaysRed);
    const has = (r, c) => clearedCells.some(([cr, cc]) => cr === r && cc === c);
    expect(has(4, 8)).toBe(true); // chained from the second bomb
    expect(has(0, 0)).toBe(true); // time gem
    expect(has(0, 9)).toBe(true); // line bomb column
    expect(nextState.score).toBe(clearedCells.length * POINTS_PER_GEM + 2 * BOMB_BONUS_POINTS + LINE_BOMB_BONUS_POINTS);
    expect(nextState.timeRemaining).toBe(0);
    expect(nextState.isGameOver).toBe(true);
    expect(nextState.board.flat().some((tile) => tile === BOMB || tile === LINE_BOMB)).toBe(false);
  });

  it('activates a leftover wash gem before clearing', () => {
    const board = checkerboard();
    board[2][2] = `green${WASH_GEM_SUFFIX}`;
    const { nextState } = detonateRemainingPowerUps(over({ board }), alwaysRed);
    expect(nextState.board.flat().some(isWashGem)).toBe(false);
    expect(nextState.board.flat().filter((tile) => tile === 'green').length).toBeGreaterThan(0);
  });

  it('does nothing when no power-ups remain', () => {
    const state = over({ board: checkerboard() });
    const result = detonateRemainingPowerUps(state, alwaysRed);
    expect(result.clearedCells).toEqual([]);
    expect(result.nextState.score).toBe(0);
  });

  it('pops every remaining cluster at once for base points and refills', () => {
    const board = makeBoard((r) => (r < 3 ? 'red' : 'blue'));
    const { nextState, clearedCells } = popRemainingClusters(over({ board }), alwaysRed);
    expect(clearedCells).toHaveLength(ROWS * COLS);
    expect(nextState.score).toBe(ROWS * COLS * POINTS_PER_GEM);
    expect(nextState.board.flat().includes(null)).toBe(false);
    expect(hasValidMoves(nextState.board)).toBe(true);
  });

  it('leaves unmatched singles alone', () => {
    const board = checkerboard();
    for (const [r, c] of [[0, 0], [0, 2], [1, 1]]) board[r][c] = 'green';
    board[0][1] = 'green';
    const { clearedCells } = popRemainingClusters(over({ board }), alwaysRed);
    expect(clearedCells).toHaveLength(4);
  });
});

describe('difficulty modes', () => {
  const allRed = () => makeBoard(() => 'red');
  /** Taps [0, 0] at 100ms intervals; the huge negative meter keeps line bombs out of the way. */
  const popTimes = (difficulty, count) => {
    let state = { ...createInitialState(alwaysRed, difficulty), board: allRed(), lineBombMeter: -1e6 };
    const events = [];
    for (let i = 0; i < count; i++) {
      const result = handleCellTap(state, 0, 0, i * 100, alwaysRed);
      state = result.nextState;
      events.push(result.eventType);
    }
    return { state, events };
  };

  it('defines easy/medium/hard with rising fire triggers and falling refill bias', () => {
    const { easy, medium, hard } = DIFFICULTIES;
    expect([easy.fireTrigger, medium.fireTrigger, hard.fireTrigger]).toEqual([5, 7, 9]);
    expect(easy.refillMatchBias).toBeGreaterThan(medium.refillMatchBias);
    expect(medium.refillMatchBias).toBeGreaterThan(hard.refillMatchBias);
  });

  it('starts a round on the chosen difficulty', () => {
    expect(createInitialState(alwaysRed).difficulty).toBe('easy');
    expect(createInitialState(alwaysRed, 'hard').difficulty).toBe('hard');
  });

  it.each([
    ['easy', 5],
    ['medium', 7],
    ['hard', 9],
  ])('%s ignites Fire Mode on exactly pop %i', (difficulty, trigger) => {
    const before = popTimes(difficulty, trigger - 1);
    expect(before.state.isFireMode).toBe(false);
    expect(before.events.at(-1)).toBe('pop');
    const after = popTimes(difficulty, trigger);
    expect(after.state.isFireMode).toBe(true);
    expect(after.events.at(-1)).toBe('fire_trigger');
  });

  it('a bomb tap adds to the streak instead of resetting it, and can ignite Fire Mode', () => {
    const board = checkerboard();
    board[4][4] = BOMB;
    const start = stateWith({ board, comboCount: 4, comboExpiry: 1000 });
    const { nextState, eventType } = handleCellTap(start, 4, 4, 500, alwaysRed);
    expect(eventType).toBe('bomb');
    expect(nextState.comboCount).toBe(5);
    expect(nextState.isFireMode).toBe(true);
    expect(nextState.fireModeExpiry).toBeGreaterThan(500);
    expect(nextState.score).toBe((25 * POINTS_PER_GEM + BOMB_BONUS_POINTS) * 2);
  });

  it('a line bomb tap also extends the streak', () => {
    const board = checkerboard();
    board[2][3] = LINE_BOMB;
    const { nextState } = handleCellTap(stateWith({ board, comboCount: 1, comboExpiry: 1000 }), 2, 3, 500, alwaysRed);
    expect(nextState.comboCount).toBe(2);
  });

  it('bomb taps leave the streak alone during Fire Mode', () => {
    const board = checkerboard();
    board[4][4] = BOMB;
    const start = stateWith({ board, isFireMode: true, fireModeExpiry: 10_000, comboCount: 5 });
    expect(handleCellTap(start, 4, 4, 500, alwaysRed).nextState.comboCount).toBe(5);
  });
});

describe('badged gem placement', () => {
  const seeded = (seed) => () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  it('only spawns time and wash gems inside a poppable cluster', () => {
    let spawned = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const board = makeBoard((r) => (r < 3 ? 'red' : 'blue'));
      const start = stateWith({ board, lineBombMeter: -1000 });
      const { nextState } = handleCellTap(start, 0, 0, 20000, seeded(seed));
      nextState.board.forEach((rowCells, r) =>
        rowCells.forEach((tile, c) => {
          if (!isTimeGem(tile) && !isWashGem(tile)) return;
          spawned++;
          expect(findConnected(nextState.board, r, c).length).toBeGreaterThanOrEqual(3);
        }),
      );
    }
    expect(spawned).toBeGreaterThan(0);
  });
});
