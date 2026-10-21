import {
  BOMB,
  BOMB_BONUS_POINTS,
  BOMB_SPAWN_CHANCE,
  COLS,
  ROWS,
  ROUND_DURATION_MS,
  COMBO_WINDOW_MS,
  FIRE_MODE_TRIGGER_COMBO,
  FIRE_MODE_DURATION_MS,
  FIRE_MODE_RADIUS,
  FIRE_MODE_SCORE_MULTIPLIER,
  POINTS_PER_GEM,
} from './constants.js';
import { findCluster, isInBounds } from './floodFill.js';
import { applyGravity, refill } from './gravity.js';

/**
 * @typedef {import('./gravity.js').Board} Board
 * @typedef {import('./gravity.js').Coord} Coord
 * @typedef {import('./gravity.js').Rng} Rng
 *
 * @typedef {Object} GameState
 * @property {Board} board
 * @property {number} score
 * @property {number} comboCount        Consecutive successful pops in the current streak.
 * @property {number|null} comboExpiry  Timestamp (ms) after which the streak lapses.
 * @property {boolean} isFireMode
 * @property {number|null} fireModeExpiry Timestamp (ms) at which Fire Mode ends.
 * @property {number} timeRemaining     Seconds left in the round.
 * @property {boolean} isGameOver
 *
 * @typedef {'pop'|'fire_trigger'|'fire_blast'|'bomb'|'miss'|'ignored'} TapEventType
 *
 * @typedef {Object} TapResult
 * @property {GameState} nextState
 * @property {Coord[]} clearedCells
 * @property {TapEventType} eventType
 */

/**
 * A fresh full board. refill() guarantees it has at least one valid move.
 *
 * @param {Rng} [randomFn=Math.random]
 * @returns {Board}
 */
export function createPlayableBoard(randomFn = Math.random) {
  const empty = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  return refill(empty, randomFn);
}

/**
 * @param {Rng} [randomFn=Math.random]
 * @returns {GameState}
 */
export function createInitialState(randomFn = Math.random) {
  return {
    board: createPlayableBoard(randomFn),
    score: 0,
    comboCount: 0,
    comboExpiry: null,
    isFireMode: false,
    fireModeExpiry: null,
    timeRemaining: ROUND_DURATION_MS / 1000,
    isGameOver: false,
  };
}

/**
 * Lapses the combo streak and ends Fire Mode once their deadlines have passed.
 * Ending Fire Mode also consumes the streak, so it cannot retrigger immediately.
 *
 * @param {GameState} state
 * @param {number} now Timestamp in ms.
 * @returns {GameState}
 */
function expireTimers(state, now) {
  let next = state;
  if (next.comboExpiry != null && now > next.comboExpiry) {
    next = { ...next, comboCount: 0, comboExpiry: null };
  }
  if (next.isFireMode && now >= next.fireModeExpiry) {
    next = { ...next, isFireMode: false, fireModeExpiry: null, comboCount: 0, comboExpiry: null };
  }
  return next;
}

/**
 * Advances the round clock and resolves timer-based transitions.
 *
 * @param {GameState} state
 * @param {number} now Timestamp in ms.
 * @param {number} deltaSeconds Seconds elapsed since the previous tick.
 * @returns {GameState}
 */
export function tickGame(state, now, deltaSeconds) {
  if (state.isGameOver) return state;
  const timeRemaining = Math.max(0, state.timeRemaining - deltaSeconds);
  return {
    ...expireTimers(state, now),
    timeRemaining,
    isGameOver: timeRemaining <= 0,
  };
}

/**
 * Chained explosion area: the union of the square of `radius` (3x3 for radius 1)
 * around every given cell, deduplicated and clipped to the board. Because each
 * cell's square contains the cell itself, the source cells are always included.
 *
 * @param {Board} board
 * @param {Coord[]} cells
 * @param {number} [radius=FIRE_MODE_RADIUS]
 * @returns {Coord[]}
 */
export function expandBlast(board, cells, radius = FIRE_MODE_RADIUS) {
  const seen = new Set();
  const area = [];
  for (const [cr, cc] of cells) {
    for (let r = cr - radius; r <= cr + radius; r++) {
      for (let c = cc - radius; c <= cc + radius; c++) {
        const key = `${r},${c}`;
        if (!seen.has(key) && isInBounds(board, r, c)) {
          seen.add(key);
          area.push([r, c]);
        }
      }
    }
  }
  return area;
}

/**
 * Cells a tap at [row, col] would blast: the 3x3 around a bomb, otherwise the
 * Fire Mode chained blast around the tapped cluster ([] if it is too small to pop).
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @param {number} [radius=FIRE_MODE_RADIUS]
 * @returns {Coord[]}
 */
export function getBlastCells(board, row, col, radius = FIRE_MODE_RADIUS) {
  if (isInBounds(board, row, col) && board[row][col] === BOMB) {
    return expandBlast(board, [[row, col]], radius);
  }
  return expandBlast(board, findCluster(board, row, col), radius);
}

/**
 * Resolves a player tap.
 *
 * @param {GameState} state
 * @param {number} row
 * @param {number} col
 * @param {number} now Timestamp in ms.
 * @param {Rng} [randomFn=Math.random] Colour source for replenished gems.
 * @returns {TapResult}
 */
export function handleCellTap(state, row, col, now, randomFn = Math.random) {
  if (
    state.isGameOver ||
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    !isInBounds(state.board, row, col)
  ) {
    return { nextState: state, clearedCells: [], eventType: 'ignored' };
  }

  const current = expireTimers(state, now);
  const multiplier = current.isFireMode ? FIRE_MODE_SCORE_MULTIPLIER : 1;

  // Bombs detonate on any tap and leave the combo streak untouched.
  if (current.board[row][col] === BOMB) {
    const clearedCells = getBlastCells(current.board, row, col);
    return {
      nextState: {
        ...current,
        board: applyGravity(current.board, clearedCells, randomFn, BOMB_SPAWN_CHANCE),
        score: current.score + (clearedCells.length * POINTS_PER_GEM + BOMB_BONUS_POINTS) * multiplier,
      },
      clearedCells,
      eventType: 'bomb',
    };
  }

  // A valid cluster is required in both modes; anything smaller is a miss.
  const cluster = findCluster(current.board, row, col);
  if (cluster.length === 0) {
    return {
      nextState: { ...current, comboCount: 0, comboExpiry: null },
      clearedCells: [],
      eventType: 'miss',
    };
  }

  if (current.isFireMode) {
    // Every gem in the cluster detonates its own 3x3 area at once.
    const clearedCells = expandBlast(current.board, cluster);
    return {
      nextState: {
        ...current,
        board: applyGravity(current.board, clearedCells, randomFn, BOMB_SPAWN_CHANCE),
        score: current.score + clearedCells.length * POINTS_PER_GEM * FIRE_MODE_SCORE_MULTIPLIER,
      },
      clearedCells,
      eventType: 'fire_blast',
    };
  }

  // expireTimers already zeroed a lapsed streak, so this both extends and restarts it.
  const comboCount = current.comboCount + 1;
  const isFireMode = comboCount >= FIRE_MODE_TRIGGER_COMBO;
  const popMultiplier = isFireMode ? FIRE_MODE_SCORE_MULTIPLIER : 1;

  return {
    nextState: {
      ...current,
      board: applyGravity(current.board, cluster, randomFn, BOMB_SPAWN_CHANCE),
      score: current.score + cluster.length * POINTS_PER_GEM * popMultiplier,
      comboCount,
      comboExpiry: now + COMBO_WINDOW_MS,
      isFireMode,
      fireModeExpiry: isFireMode ? now + FIRE_MODE_DURATION_MS : null,
    },
    clearedCells: cluster,
    eventType: isFireMode ? 'fire_trigger' : 'pop',
  };
}
