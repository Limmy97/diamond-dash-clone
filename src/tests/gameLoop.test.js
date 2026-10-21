import { describe, it, expect } from 'vitest';
import {
  BOMB,
  BOMB_BONUS_POINTS,
  COLS,
  ROWS,
  COMBO_WINDOW_MS,
  FIRE_MODE_DURATION_MS,
  POINTS_PER_GEM,
  ROUND_DURATION_MS,
} from '../engine/constants.js';
import { createInitialState, getBlastCells, tickGame, handleCellTap } from '../engine/gameLoop.js';
import { hasValidMoves } from '../engine/floodFill.js';

/**
 * rng that always yields 0: uniform picks are red and the refill bias always copies
 * a neighbour, so an all-red board stays all red after refills.
 */
const alwaysRed = () => 0;

const makeBoard = (colorAt) =>
  Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => colorAt(r, c)));

/** One giant cluster: every tap is a valid pop of all ROWS * COLS gems. */
const allRed = () => makeBoard(() => 'red');

/** No two orthogonal neighbours match: every regular tap is a miss. */
const checkerboard = () => makeBoard((r, c) => ((r + c) % 2 === 0 ? 'red' : 'blue'));

const stateWith = (overrides) => ({ ...createInitialState(alwaysRed), ...overrides });

const sortCoords = (coords) => [...coords].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

/** Taps [0, 0] at each timestamp, threading state through. */
const tapAt = (state, times) =>
  times.reduce(
    (acc, now) => {
      const result = handleCellTap(acc.state, 0, 0, now, alwaysRed);
      return { state: result.nextState, events: [...acc.events, result.eventType] };
    },
    { state, events: [] },
  );

describe('createInitialState', () => {
  it('starts a full 10x9 board with a fresh 60s round', () => {
    const state = createInitialState(alwaysRed);
    expect(state.board).toHaveLength(ROWS);
    expect(state.board.every((row) => row.length === COLS && !row.includes(null))).toBe(true);
    expect(state).toMatchObject({
      score: 0,
      comboCount: 0,
      comboExpiry: null,
      isFireMode: false,
      fireModeExpiry: null,
      timeRemaining: ROUND_DURATION_MS / 1000,
      isGameOver: false,
    });
  });

  it('always produces a board with at least one valid move', () => {
    // Small seeded PRNG (mulberry32) so failures are reproducible.
    const seeded = (seed) => () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    for (let seed = 1; seed <= 200; seed++) {
      expect(hasValidMoves(createInitialState(seeded(seed)).board)).toBe(true);
    }
  });

  it('still guarantees a valid move when the rng can only produce dead boards', () => {
    // Cycling 3 colours across 10 columns yields a diagonal stripe with no orthogonal matches.
    let i = 0;
    const deadRng = () => [0, 0.2, 0.4][i++ % 3];
    const state = createInitialState(deadRng);
    expect(hasValidMoves(state.board)).toBe(true);
    expect(state.board.flat().includes(null)).toBe(false);
  });
});

describe('hasValidMoves', () => {
  it('is false for a checkerboard and true once any 3-cluster exists', () => {
    const board = checkerboard();
    expect(hasValidMoves(board)).toBe(false);
    board[0][1] = 'red';
    board[1][1] = 'red';
    expect(hasValidMoves(board)).toBe(true);
  });
});

describe('combo streak', () => {
  it('increments while pops stay inside the window', () => {
    const { state, events } = tapAt(stateWith({ board: allRed() }), [0, 1000, 2000]);
    expect(events).toEqual(['pop', 'pop', 'pop']);
    expect(state.comboCount).toBe(3);
    expect(state.comboExpiry).toBe(2000 + COMBO_WINDOW_MS);
  });

  it('counts a pop exactly on the window edge as part of the streak', () => {
    const { state } = tapAt(stateWith({ board: allRed() }), [0, COMBO_WINDOW_MS]);
    expect(state.comboCount).toBe(2);
  });

  it('restarts at 1 when the next pop comes after the window', () => {
    const { state } = tapAt(stateWith({ board: allRed() }), [0, 1000, 1000 + COMBO_WINDOW_MS + 1]);
    expect(state.comboCount).toBe(1);
  });

  it('tickGame resets the streak to 0 once it expires', () => {
    const { state } = tapAt(stateWith({ board: allRed() }), [0, 500]);
    expect(tickGame(state, 500 + COMBO_WINDOW_MS, 0.1).comboCount).toBe(2);
    const lapsed = tickGame(state, 500 + COMBO_WINDOW_MS + 1, 0.1);
    expect(lapsed.comboCount).toBe(0);
    expect(lapsed.comboExpiry).toBeNull();
  });

  it('awards POINTS_PER_GEM per cleared gem on a regular pop', () => {
    const { state } = tapAt(stateWith({ board: allRed() }), [0]);
    expect(state.score).toBe(ROWS * COLS * POINTS_PER_GEM);
  });
});

describe('miss penalty', () => {
  it('a tap on a cluster < 3 resets combo to 0 and leaves the board alone', () => {
    const start = stateWith({ board: checkerboard(), comboCount: 3, comboExpiry: 5000 });
    const { nextState, clearedCells, eventType } = handleCellTap(start, 4, 4, 1000, alwaysRed);
    expect(eventType).toBe('miss');
    expect(clearedCells).toEqual([]);
    expect(nextState.comboCount).toBe(0);
    expect(nextState.comboExpiry).toBeNull();
    expect(nextState.board).toEqual(start.board);
    expect(nextState.score).toBe(start.score);
  });
});

describe('Fire Mode', () => {
  it('activates on the 5th consecutive pop within the window', () => {
    const times = [0, 500, 1000, 1500, 2000];
    const { state, events } = tapAt(stateWith({ board: allRed() }), times);
    expect(events).toEqual(['pop', 'pop', 'pop', 'pop', 'fire_trigger']);
    expect(state.isFireMode).toBe(true);
    expect(state.fireModeExpiry).toBe(2000 + FIRE_MODE_DURATION_MS);
    // Four 1x pops plus the triggering pop at 2x.
    expect(state.score).toBe(ROWS * COLS * POINTS_PER_GEM * (4 + 2));
  });

  it('does not activate if the streak breaks before the 5th pop', () => {
    const { state, events } = tapAt(stateWith({ board: allRed() }), [0, 500, 1000, 1500, 5000]);
    expect(events.at(-1)).toBe('pop');
    expect(state.isFireMode).toBe(false);
    expect(state.comboCount).toBe(1);
  });

  it('ends on tick at fireModeExpiry and consumes the streak', () => {
    const fire = stateWith({ isFireMode: true, fireModeExpiry: 7000, comboCount: 5, comboExpiry: 8000 });
    expect(tickGame(fire, 6999, 0.1).isFireMode).toBe(true);
    const ended = tickGame(fire, 7000, 0.1);
    expect(ended.isFireMode).toBe(false);
    expect(ended.fireModeExpiry).toBeNull();
    expect(ended.comboCount).toBe(0);
  });

  it('falls back to regular rules if a tap arrives after expiry before any tick', () => {
    const fire = stateWith({ board: checkerboard(), isFireMode: true, fireModeExpiry: 7000 });
    const { eventType, nextState } = handleCellTap(fire, 4, 4, 7500, alwaysRed);
    expect(eventType).toBe('miss');
    expect(nextState.isFireMode).toBe(false);
  });

  describe('chained explosion', () => {
    /** Background with no red and no orthogonal matches: (r + 2c) mod 3 differs for every neighbour. */
    const background = (r, c) => ['blue', 'green', 'purple'][(r + 2 * c) % 3];

    /** Background board with a red cluster painted at the given cells. */
    const withRed = (cells) => {
      const board = makeBoard(background);
      for (const [r, c] of cells) board[r][c] = 'red';
      return board;
    };

    const fireState = (board) =>
      stateWith({ board, isFireMode: true, fireModeExpiry: 10_000, comboCount: 5, comboExpiry: 1500, score: 100 });

    /** Every cell in the inclusive rectangle. */
    const rect = (r0, r1, c0, c1) => {
      const cells = [];
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) cells.push([r, c]);
      return cells;
    };

    const unique = (coords) => [...new Map(coords.map((rc) => [rc.join(','), rc])).values()];

    it('a 3-gem cluster clears itself plus the merged 3x3 areas around each gem, at 2x points', () => {
      const cluster = [[4, 3], [4, 4], [4, 5]];
      const { nextState, clearedCells, eventType } = handleCellTap(fireState(withRed(cluster)), 4, 4, 1000, alwaysRed);
      expect(eventType).toBe('fire_blast');
      // Three overlapping 3x3 squares merge into one 3x5 block.
      expect(sortCoords(clearedCells)).toEqual(rect(3, 5, 2, 6));
      expect(clearedCells).toHaveLength(15);
      expect(nextState.score).toBe(100 + 15 * POINTS_PER_GEM * 2);
      expect(nextState.isFireMode).toBe(true);
      expect(nextState.comboCount).toBe(5);
    });

    it('a 4-gem L-shaped cluster clears the union of its four 3x3 areas', () => {
      const cluster = [[4, 4], [4, 5], [4, 6], [5, 6]];
      const { clearedCells } = handleCellTap(fireState(withRed(cluster)), 5, 6, 1000, alwaysRed);
      const expected = sortCoords(unique([...rect(3, 5, 3, 7), ...rect(6, 6, 5, 7)]));
      expect(sortCoords(clearedCells)).toEqual(expected);
      expect(clearedCells).toHaveLength(18);
      // The blast sweeps unmatched neighbours, not just the red cluster.
      expect(clearedCells.length).toBeGreaterThan(cluster.length);
    });

    it('never lists a cell twice even where 3x3 areas overlap', () => {
      const { clearedCells } = handleCellTap(fireState(withRed(rect(3, 4, 3, 4))), 3, 3, 1000, alwaysRed);
      expect(unique(clearedCells)).toHaveLength(clearedCells.length);
      expect(sortCoords(clearedCells)).toEqual(rect(2, 5, 2, 5));
    });

    it('clips the chained area at corners and edges', () => {
      const topLeft = handleCellTap(fireState(withRed([[0, 0], [0, 1], [0, 2]])), 0, 0, 1000, alwaysRed);
      expect(sortCoords(topLeft.clearedCells)).toEqual(rect(0, 1, 0, 3));

      const bottomRight = [[ROWS - 3, COLS - 1], [ROWS - 2, COLS - 1], [ROWS - 1, COLS - 1]];
      const br = handleCellTap(fireState(withRed(bottomRight)), ROWS - 1, COLS - 1, 1000, alwaysRed);
      expect(sortCoords(br.clearedCells)).toEqual(rect(ROWS - 4, ROWS - 1, COLS - 2, COLS - 1));
    });

    it('a large cluster chain-blasts a massive portion of the board', () => {
      // A full row 4 plus a full column 4: a 18-gem cross.
      const cross = unique([...rect(4, 4, 0, COLS - 1), ...rect(0, ROWS - 1, 4, 4)]);
      const { nextState, clearedCells } = handleCellTap(fireState(withRed(cross)), 0, 4, 1000, alwaysRed);
      // Rows 3-5 (30 cells) + columns 3-5 (27 cells) - their 3x3 overlap (9 cells).
      expect(clearedCells).toHaveLength(48);
      expect(clearedCells.length).toBeGreaterThan((ROWS * COLS) / 2);
      expect(nextState.score).toBe(100 + 48 * POINTS_PER_GEM * 2);
    });

    it('a cluster spanning the whole board clears every cell', () => {
      const { clearedCells } = handleCellTap(fireState(allRed()), 4, 4, 1000, alwaysRed);
      expect(clearedCells).toHaveLength(ROWS * COLS);
    });

    it('tapping a gem outside any valid cluster is a miss: no blast, combo reset', () => {
      const start = fireState(withRed([[4, 4], [4, 5]]));
      for (const [r, c] of [[0, 0], [4, 4]]) {
        const { nextState, clearedCells, eventType } = handleCellTap(start, r, c, 1000, alwaysRed);
        expect(eventType).toBe('miss');
        expect(clearedCells).toEqual([]);
        expect(nextState.board).toEqual(start.board);
        expect(nextState.score).toBe(start.score);
        expect(nextState.comboCount).toBe(0);
        expect(nextState.isFireMode).toBe(true);
      }
    });

    it('getBlastCells previews exactly what a tap destroys, and [] for invalid clusters', () => {
      const board = withRed([[4, 4], [4, 5], [4, 6], [5, 6]]);
      const { clearedCells } = handleCellTap(fireState(board), 4, 4, 1000, alwaysRed);
      expect(sortCoords(getBlastCells(board, 4, 5))).toEqual(sortCoords(clearedCells));
      expect(getBlastCells(board, 0, 0)).toEqual([]);
    });

    it('collapses and refills the board after a chained blast', () => {
      const board = withRed([[0, 0], [0, 1], [0, 2]]);
      const { nextState } = handleCellTap(fireState(board), 0, 0, 1000, alwaysRed);
      expect(nextState.board.flat().includes(null)).toBe(false);
      // Columns 4+ are outside the blast and unchanged.
      expect(nextState.board.map((row) => row.slice(4))).toEqual(board.map((row) => row.slice(4)));
      expect(hasValidMoves(nextState.board)).toBe(true);
    });
  });
});

describe('bomb', () => {
  /** No-match background (no red, no orthogonal pairs) with a bomb at [row, col]. */
  const bombAt = (row, col) => {
    const board = makeBoard((r, c) => ['blue', 'green', 'purple'][(r + 2 * c) % 3]);
    board[row][col] = BOMB;
    return board;
  };

  it('detonates on tap, clearing its 3x3 neighbourhood with bonus points and leaving the combo alone', () => {
    const start = stateWith({ board: bombAt(4, 4), comboCount: 2, comboExpiry: 2000, score: 50 });
    const { nextState, clearedCells, eventType } = handleCellTap(start, 4, 4, 1000, alwaysRed);
    expect(eventType).toBe('bomb');
    expect(sortCoords(clearedCells)).toEqual([
      [3, 3], [3, 4], [3, 5],
      [4, 3], [4, 4], [4, 5],
      [5, 3], [5, 4], [5, 5],
    ]);
    expect(nextState.score).toBe(50 + 9 * POINTS_PER_GEM + BOMB_BONUS_POINTS);
    expect(nextState.comboCount).toBe(2);
    expect(nextState.board.flat().includes(null)).toBe(false);
    // Columns outside the blast are untouched; the board still has a move.
    expect(nextState.board.map((row) => row.slice(6))).toEqual(start.board.map((row) => row.slice(6)));
    expect(hasValidMoves(nextState.board)).toBe(true);
  });

  it('clips the blast at a corner and doubles points in Fire Mode', () => {
    const start = stateWith({ board: bombAt(0, 0), isFireMode: true, fireModeExpiry: 10_000 });
    expect(getBlastCells(start.board, 0, 0)).toHaveLength(4);
    const { nextState, clearedCells, eventType } = handleCellTap(start, 0, 0, 1000, alwaysRed);
    expect(eventType).toBe('bomb');
    expect(sortCoords(clearedCells)).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(nextState.score).toBe((4 * POINTS_PER_GEM + BOMB_BONUS_POINTS) * 2);
  });
});

describe('round timer', () => {
  it('counts down and flags game over at 0', () => {
    let state = createInitialState(alwaysRed);
    state = tickGame(state, 0, 59.5);
    expect(state.timeRemaining).toBeCloseTo(0.5);
    expect(state.isGameOver).toBe(false);
    state = tickGame(state, 0, 1);
    expect(state.timeRemaining).toBe(0);
    expect(state.isGameOver).toBe(true);
  });

  it('ignores all taps once the round is over', () => {
    const over = tickGame(stateWith({ board: allRed() }), 0, ROUND_DURATION_MS / 1000);
    const result = handleCellTap(over, 0, 0, 100, alwaysRed);
    expect(result.eventType).toBe('ignored');
    expect(result.clearedCells).toEqual([]);
    expect(result.nextState).toBe(over);

    const fireOver = { ...over, isFireMode: true, fireModeExpiry: 10_000 };
    expect(handleCellTap(fireOver, 4, 4, 100, alwaysRed).nextState).toBe(fireOver);
  });

  it('further ticks after game over are no-ops', () => {
    const over = tickGame(createInitialState(alwaysRed), 0, 100);
    expect(tickGame(over, 1000, 1)).toBe(over);
  });
});

describe('invalid taps', () => {
  it('returns the state unchanged for out-of-bounds or non-integer coordinates', () => {
    const state = stateWith({ board: allRed() });
    for (const [r, c] of [[-1, 0], [0, -1], [ROWS, 0], [0, COLS], [1.5, 2], [NaN, 0]]) {
      const result = handleCellTap(state, r, c, 0, alwaysRed);
      expect(result.nextState).toBe(state);
      expect(result.eventType).toBe('ignored');
    }
  });
});
