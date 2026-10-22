import {
  baseColor,
  BOMB,
  BOMB_RADIUS,
  BOMB_BONUS_POINTS,
  BOMB_SPAWN_CHANCE,
  COLOR_WASH_MAX_FRACTION,
  COLOR_WASH_MIN_FRACTION,
  COLS,
  isSpecialTile,
  isTimeGem,
  LINE_BOMB,
  LINE_BOMB_BONUS_POINTS,
  LINE_BOMB_METER_MAX,
  LINE_BOMB_MISS_DRAIN,
  SHUFFLE_MAX_ATTEMPTS,
  STARTING_BOOSTERS,
  TIME_GEM_BONUS_SECONDS,
  TIME_GEM_COOLDOWN_MAX_MS,
  TIME_GEM_COOLDOWN_MIN_MS,
  TIME_GEM_LIFETIME_MS,
  TIME_GEM_SPAWN_CHANCE,
  TIME_GEM_SUFFIX,
  ROWS,
  ROUND_DURATION_MS,
  COMBO_WINDOW_MS,
  DEFAULT_DIFFICULTY,
  DIFFICULTIES,
  FIRE_MODE_DURATION_MS,
  FIRE_MODE_RADIUS,
  FIRE_MODE_SCORE_MULTIPLIER,
  POINTS_PER_GEM,
  hasMarker,
  isWashGem,
  markerOf,
  MIN_CLUSTER_SIZE,
  WASH_GEM_COOLDOWN_MAX_MS,
  WASH_GEM_COOLDOWN_MIN_MS,
  WASH_GEM_LIFETIME_MS,
  WASH_GEM_SPAWN_CHANCE,
  WASH_GEM_SUFFIX,
} from './constants.js';
import { findCluster, findConnected, hasValidMoves, isInBounds } from './floodFill.js';
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
 * @property {DifficultyKey} difficulty Fixed for the round; sets the Fire Mode trigger and refill bias.
 * @property {number} lineBombMeter     Progress toward the next line bomb, in gems (0 to LINE_BOMB_METER_MAX).
 * @property {{ shuffle: number, colorBurst: number }} boosters Remaining charges this round.
 * @property {BoosterType|null} armedBooster Booster waiting for a target tap, if any.
 * @property {number|null} timeGemExpiry Timestamp (ms) at which the time gem on the board loses its badge.
 * @property {number|null} nextTimeGemAt Earliest timestamp (ms) a new time gem may spawn; null before the first.
 * @property {number|null} washGemExpiry Timestamp (ms) at which the wash gem on the board loses its badge.
 * @property {number|null} nextWashGemAt Earliest timestamp (ms) a new wash gem may spawn; null before the first.
 *
 * @typedef {keyof typeof DIFFICULTIES} DifficultyKey
 * @typedef {'shuffle'|'colorBurst'} BoosterType
 * @typedef {'pop'|'fire_trigger'|'fire_blast'|'bomb'|'line_bomb'|'color_burst'|'finale'|'miss'|'ignored'} TapEventType
 *
 * @typedef {Object} TapResult
 * @property {GameState} nextState
 * @property {Coord[]} clearedCells
 * @property {TapEventType} eventType
 */

/**
 * The two badged gems that spawn on the board. Each has at most one on the board
 * at a time, a spawn cooldown, and a short lifetime before the badge falls off.
 */
const POWER_GEMS = [
  {
    suffix: TIME_GEM_SUFFIX,
    chance: TIME_GEM_SPAWN_CHANCE,
    lifetimeMs: TIME_GEM_LIFETIME_MS,
    cooldownMinMs: TIME_GEM_COOLDOWN_MIN_MS,
    cooldownMaxMs: TIME_GEM_COOLDOWN_MAX_MS,
    expiryKey: 'timeGemExpiry',
    nextKey: 'nextTimeGemAt',
  },
  {
    suffix: WASH_GEM_SUFFIX,
    chance: WASH_GEM_SPAWN_CHANCE,
    lifetimeMs: WASH_GEM_LIFETIME_MS,
    cooldownMinMs: WASH_GEM_COOLDOWN_MIN_MS,
    cooldownMaxMs: WASH_GEM_COOLDOWN_MAX_MS,
    expiryKey: 'washGemExpiry',
    nextKey: 'nextWashGemAt',
  },
];

/** @param {string|null} tile @param {string} suffix */
const stripMarker = (tile, suffix) => (hasMarker(tile, suffix) ? tile.slice(0, -suffix.length) : tile);

/** @param {{ difficulty?: string }} state @returns {(typeof DIFFICULTIES)[DifficultyKey]} */
const difficultyOf = (state) => DIFFICULTIES[state.difficulty] ?? DIFFICULTIES[DEFAULT_DIFFICULTY];

/**
 * A fresh full board. refill() guarantees it has at least one valid move.
 *
 * @param {Rng} [randomFn=Math.random]
 * @param {number} [matchBias] Refill neighbour-copy chance; defaults to the easy tuning.
 * @returns {Board}
 */
export function createPlayableBoard(randomFn = Math.random, matchBias) {
  const empty = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  return refill(empty, randomFn, 0, [], matchBias);
}

/**
 * @param {Rng} [randomFn=Math.random]
 * @param {DifficultyKey} [difficulty=DEFAULT_DIFFICULTY]
 * @returns {GameState}
 */
export function createInitialState(randomFn = Math.random, difficulty = DEFAULT_DIFFICULTY) {
  return {
    board: createPlayableBoard(randomFn, DIFFICULTIES[difficulty].refillMatchBias),
    difficulty,
    score: 0,
    comboCount: 0,
    comboExpiry: null,
    isFireMode: false,
    fireModeExpiry: null,
    timeRemaining: ROUND_DURATION_MS / 1000,
    isGameOver: false,
    lineBombMeter: 0,
    boosters: { ...STARTING_BOOSTERS },
    armedBooster: null,
    timeGemExpiry: null,
    nextTimeGemAt: null,
    washGemExpiry: null,
    nextWashGemAt: null,
  };
}

/**
 * Lapses the combo streak, ends Fire Mode and strips unpopped time/wash gems' badges once their deadlines have passed.
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
  for (const gem of POWER_GEMS) {
    if (next[gem.expiryKey] != null && now >= next[gem.expiryKey]) {
      const board = next.board.map((cells) => cells.map((tile) => stripMarker(tile, gem.suffix)));
      next = { ...next, board, [gem.expiryKey]: null };
    }
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
 * Cells a line bomb in column `col` destroys: that whole column plus the bottom row.
 *
 * @param {Board} board
 * @param {number} col
 * @returns {Coord[]}
 */
export function getLineCells(board, col) {
  const bottom = board.length - 1;
  const cells = [];
  for (let r = 0; r < bottom; r++) cells.push([r, col]);
  for (let c = 0; c < board[bottom].length; c++) cells.push([bottom, c]);
  return cells;
}

/**
 * Every gem on the board sharing the colour at [row, col] ([] for empty or special tiles).
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @returns {Coord[]}
 */
export function getColorCells(board, row, col) {
  if (!isInBounds(board, row, col)) return [];
  const tile = board[row][col];
  if (tile == null || isSpecialTile(tile)) return [];
  const color = baseColor(tile);
  const cells = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (baseColor(board[r][c]) === color) cells.push([r, c]);
    }
  }
  return cells;
}

const cellKey = (r, c) => `${r},${c}`;

const NEIGHBOUR_STEPS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Grows a blast by detonating every bomb and line bomb it reaches, repeatedly,
 * so chain reactions resolve fully. Each special tile detonates at most once.
 *
 * @param {Board} board
 * @param {Coord[]} cells Cells already blasted.
 * @param {Coord[]} [detonated=[]] Specials that already exploded to produce `cells`.
 * @returns {{ cells: Coord[], bonus: number }} All blasted cells and the bonus for the chained specials.
 */
function chainBlast(board, cells, detonated = []) {
  const seen = new Set(cells.map(([r, c]) => cellKey(r, c)));
  const done = new Set(detonated.map(([r, c]) => cellKey(r, c)));
  const all = cells.slice();
  let bonus = 0;

  for (let i = 0; i < all.length; i++) {
    const [r, c] = all[i];
    const tile = board[r][c];
    if (!isSpecialTile(tile) || done.has(cellKey(r, c))) continue;
    done.add(cellKey(r, c));
    bonus += tile === BOMB ? BOMB_BONUS_POINTS : LINE_BOMB_BONUS_POINTS;
    const blast = tile === BOMB ? expandBlast(board, [[r, c]], BOMB_RADIUS) : getLineCells(board, c);
    for (const [br, bc] of blast) {
      if (!seen.has(cellKey(br, bc))) {
        seen.add(cellKey(br, bc));
        all.push([br, bc]);
      }
    }
  }
  return { cells: all, bonus };
}

/**
 * Full result of a tap's blast: the destroyed cells (chain reactions included)
 * and the flat bonus points for every special tile that detonated.
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @param {number} [radius] Overrides BOMB_RADIUS / FIRE_MODE_RADIUS for the first blast.
 * @returns {{ cells: Coord[], bonus: number }}
 */
function resolveBlast(board, row, col, radius) {
  const tile = isInBounds(board, row, col) ? board[row][col] : null;
  if (tile === LINE_BOMB || tile === BOMB) {
    const first = tile === LINE_BOMB ? getLineCells(board, col) : expandBlast(board, [[row, col]], radius ?? BOMB_RADIUS);
    const chain = chainBlast(board, first, [[row, col]]);
    return { cells: chain.cells, bonus: chain.bonus + (tile === BOMB ? BOMB_BONUS_POINTS : LINE_BOMB_BONUS_POINTS) };
  }
  return chainBlast(board, expandBlast(board, findCluster(board, row, col), radius ?? FIRE_MODE_RADIUS));
}

/**
 * Cells a tap at [row, col] would blast: the column and bottom row of a line bomb,
 * the BOMB_RADIUS square around a bomb, otherwise the Fire Mode chained blast
 * around the tapped cluster ([] if it is too small to pop). Any bomb or line
 * bomb inside the blast detonates too.
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @param {number} [radius] Overrides BOMB_RADIUS / FIRE_MODE_RADIUS.
 * @returns {Coord[]}
 */
export function getBlastCells(board, row, col, radius) {
  return resolveBlast(board, row, col, radius).cells;
}

/**
 * Clears `cells`, lets the board settle, and resolves the badged gems: every
 * time gem destroyed credits the clock, a destroyed wash gem splashes its
 * colour over part of another quadrant of the new board, and each kind may only spawn when none survives on the board
 * and its cooldown has passed.
 *
 * @param {GameState} state
 * @param {Coord[]} cells
 * @param {Rng} randomFn
 * @param {number} now Timestamp in ms.
 * @returns {Partial<GameState>} board, timeRemaining and the power-gem timers.
 */
function settle(state, cells, randomFn, now) {
  const cleared = new Set(cells.map(([r, c]) => cellKey(r, c)));
  const destroyed = POWER_GEMS.map(() => 0);
  const survivors = POWER_GEMS.map(() => false);
  let washColor = null;
  let washFrom = null;
  state.board.forEach((rowCells, r) =>
    rowCells.forEach((tile, c) =>
      POWER_GEMS.forEach((gem, i) => {
        if (!hasMarker(tile, gem.suffix)) return;
        if (!cleared.has(cellKey(r, c))) survivors[i] = true;
        else {
          destroyed[i]++;
          if (gem.suffix === WASH_GEM_SUFFIX && washColor === null) {
            washColor = baseColor(tile);
            washFrom = [r, c];
          }
        }
      }),
    ),
  );

  const allowed = POWER_GEMS.map((gem, i) => !survivors[i] && (state[gem.nextKey] == null || now >= state[gem.nextKey]));
  const markers = POWER_GEMS.flatMap((gem, i) => (allowed[i] ? [[gem.suffix, gem.chance]] : []));
  let board = applyGravity(
    state.board,
    cells,
    randomFn,
    BOMB_SPAWN_CHANCE,
    markers,
    difficultyOf(state).refillMatchBias,
  );
  if (washColor !== null) board = splashBoard(board, randomFn, washColor, washFrom) ?? board;
  board = placeBadgesOnValidMoves(
    board,
    POWER_GEMS.filter((gem, i) => allowed[i]).map((gem) => gem.suffix),
    randomFn,
  );

  const result = { board, timeRemaining: state.timeRemaining + destroyed[0] * TIME_GEM_BONUS_SECONDS };
  POWER_GEMS.forEach((gem, i) => {
    const spawned = allowed[i] && board.some((rowCells) => rowCells.some((tile) => hasMarker(tile, gem.suffix)));
    result[gem.expiryKey] = spawned ? now + gem.lifetimeMs : survivors[i] ? state[gem.expiryKey] : null;
    result[gem.nextKey] = spawned
      ? now + gem.cooldownMinMs + randomFn() * (gem.cooldownMaxMs - gem.cooldownMinMs)
      : state[gem.nextKey];
  });
  return result;
}

/**
 * Makes sure every badged gem of the given kinds sits in a poppable cluster (>= MIN_CLUSTER_SIZE),
 * so a freshly spawned time/wash gem can be tapped straight away. A badge stranded on a
 * loose gem moves to a random plain gem inside a valid cluster.
 *
 * @param {Board} board
 * @param {string[]} suffixes Badge suffixes to check.
 * @param {Rng} randomFn
 * @returns {Board}
 */
function placeBadgesOnValidMoves(board, suffixes, randomFn) {
  const next = board.map((rowCells) => rowCells.slice());
  const isPoppable = (r, c) => findConnected(next, r, c).length >= MIN_CLUSTER_SIZE;
  for (const suffix of suffixes) {
    for (let r = 0; r < next.length; r++) {
      for (let c = 0; c < next[r].length; c++) {
        if (!hasMarker(next[r][c], suffix) || isPoppable(r, c)) continue;
        const homes = [];
        next.forEach((rowCells, hr) =>
          rowCells.forEach((tile, hc) => {
            if (!isSpecialTile(tile) && markerOf(tile) === '' && isPoppable(hr, hc)) homes.push([hr, hc]);
          }),
        );
        if (homes.length === 0) continue;
        const [hr, hc] = homes[Math.floor(randomFn() * homes.length)];
        next[r][c] = baseColor(next[r][c]);
        next[hr][hc] += suffix;
      }
    }
  }
  return next;
}

/**
 * Extends the combo streak by one successful move and starts Fire Mode when the
 * difficulty's trigger count is reached. expireTimers has already zeroed a
 * lapsed streak, so this both extends and restarts it.
 *
 * @param {GameState} state
 * @param {number} now Timestamp in ms.
 * @returns {Pick<GameState, 'comboCount'|'comboExpiry'|'isFireMode'|'fireModeExpiry'>}
 */
function advanceStreak(state, now) {
  const comboCount = state.comboCount + 1;
  const isFireMode = comboCount >= difficultyOf(state).fireTrigger;
  return {
    comboCount,
    comboExpiry: now + COMBO_WINDOW_MS,
    isFireMode,
    fireModeExpiry: isFireMode ? now + FIRE_MODE_DURATION_MS : null,
  };
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

  // An armed Color Burst consumes the next tap on a gem; taps elsewhere are ignored.
  if (current.armedBooster === 'colorBurst') {
    const clearedCells = getColorCells(current.board, row, col);
    if (clearedCells.length === 0) return { nextState: current, clearedCells: [], eventType: 'ignored' };
    return {
      nextState: {
        ...current,
        ...settle(current, clearedCells, randomFn, now),
        score: current.score + clearedCells.length * POINTS_PER_GEM * multiplier,
        boosters: { ...current.boosters, colorBurst: current.boosters.colorBurst - 1 },
        armedBooster: null,
      },
      clearedCells,
      eventType: 'color_burst',
    };
  }

  // Bombs detonate on any tap. That is a valid move, so outside Fire Mode it feeds the streak.
  const tile = current.board[row][col];
  if (isSpecialTile(tile)) {
    const { cells: clearedCells, bonus } = resolveBlast(current.board, row, col);
    const streak = current.isFireMode ? {} : advanceStreak(current, now);
    const blastMultiplier = streak.isFireMode ? FIRE_MODE_SCORE_MULTIPLIER : multiplier;
    return {
      nextState: {
        ...current,
        ...settle(current, clearedCells, randomFn, now),
        ...streak,
        score: current.score + (clearedCells.length * POINTS_PER_GEM + bonus) * blastMultiplier,
      },
      clearedCells,
      eventType: tile === BOMB ? 'bomb' : 'line_bomb',
    };
  }

  // A valid cluster is required in both modes; anything smaller is a miss.
  const cluster = findCluster(current.board, row, col);
  if (cluster.length === 0) {
    return {
      nextState: {
        ...current,
        comboCount: 0,
        comboExpiry: null,
        lineBombMeter: Math.max(0, current.lineBombMeter - LINE_BOMB_MISS_DRAIN),
      },
      clearedCells: [],
      eventType: 'miss',
    };
  }

  if (current.isFireMode) {
    // Every gem in the cluster detonates its own FIRE_MODE_RADIUS square at once;
    // any special tile caught in the blast detonates as well.
    const { cells: clearedCells, bonus } = resolveBlast(current.board, row, col);
    return {
      nextState: {
        ...current,
        ...settle(current, clearedCells, randomFn, now),
        score: current.score + (clearedCells.length * POINTS_PER_GEM + bonus) * FIRE_MODE_SCORE_MULTIPLIER,
      },
      clearedCells,
      eventType: 'fire_blast',
    };
  }

  const streak = advanceStreak(current, now);
  const popMultiplier = streak.isFireMode ? FIRE_MODE_SCORE_MULTIPLIER : 1;

  // A full meter leaves a line bomb where the player tapped.
  const meter = current.lineBombMeter + cluster.length;
  const earnsLineBomb = meter >= LINE_BOMB_METER_MAX;
  const settled = settle(current, cluster, randomFn, now);
  const board = earnsLineBomb
    ? settled.board.map((cells, r) => (r === row ? cells.with(col, LINE_BOMB) : cells))
    : settled.board;

  return {
    nextState: {
      ...current,
      ...settled,
      board,
      lineBombMeter: earnsLineBomb ? meter - LINE_BOMB_METER_MAX : meter,
      score: current.score + cluster.length * POINTS_PER_GEM * popMultiplier,
      ...streak,
    },
    clearedCells: cluster,
    eventType: streak.isFireMode ? 'fire_trigger' : 'pop',
  };
}

/**
 * Shuffles the board's tiles, retrying until a valid move exists and falling
 * back to a fresh board if none of the attempts is playable.
 *
 * @param {Board} board
 * @param {Rng} randomFn
 * @param {number} matchBias Refill bias for the fallback board.
 * @returns {Board}
 */
function shuffleBoard(board, randomFn, matchBias) {
  const cols = board[0].length;
  for (let attempt = 0; attempt < SHUFFLE_MAX_ATTEMPTS; attempt++) {
    const tiles = board.flat();
    for (let i = tiles.length - 1; i > 0; i--) {
      const j = Math.floor(randomFn() * (i + 1));
      [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
    }
    const shuffled = Array.from({ length: board.length }, (_, r) => tiles.slice(r * cols, (r + 1) * cols));
    if (hasValidMoves(shuffled)) return shuffled;
  }
  return createPlayableBoard(randomFn, matchBias);
}

/**
 * Quadrant index of a cell: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right.
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @returns {number}
 */
function quadrantOf(board, row, col) {
  const midRow = Math.ceil(board.length / 2);
  const midCol = Math.ceil(board[0].length / 2);
  return (row >= midRow ? 2 : 0) + (col >= midCol ? 1 : 0);
}

/**
 * Paint-bucket splash: floods an organic blob of adjacent gems with `color`.
 * The blob lands in a random quadrant other than the one `from` is in, grows
 * outward from a random seed gem (favouring cells already surrounded by paint,
 * so the edge is ragged but the blob stays compact), and keeps any time/wash
 * badge. Its size is 20-25% of the board's gems, limited by the quadrant. The
 * result always contains a cluster; null if the quadrant has nothing to paint.
 *
 * @param {Board} board
 * @param {Rng} randomFn
 * @param {string} color
 * @param {Coord} from Cell of the wash gem that triggered the splash.
 * @returns {Board|null}
 */
export function splashBoard(board, randomFn, color, from) {
  const source = quadrantOf(board, from[0], from[1]);
  const others = [0, 1, 2, 3].filter((quadrant) => quadrant !== source);
  const target = others[Math.floor(randomFn() * others.length)];

  let totalGems = 0;
  const eligible = [];
  board.forEach((cells, r) =>
    cells.forEach((tile, c) => {
      if (isSpecialTile(tile)) return;
      totalGems++;
      if (quadrantOf(board, r, c) === target) eligible.push([r, c]);
    }),
  );
  if (eligible.length === 0) return null;

  const fraction = COLOR_WASH_MIN_FRACTION + randomFn() * (COLOR_WASH_MAX_FRACTION - COLOR_WASH_MIN_FRACTION);
  const goal = Math.min(eligible.length, Math.round(totalGems * fraction));
  const paintable = new Set(eligible.map(([r, c]) => cellKey(r, c)));

  const painted = new Set();
  const queued = new Set();
  const frontier = [];
  const paintedNeighbours = ([r, c]) =>
    NEIGHBOUR_STEPS.filter(([dr, dc]) => painted.has(cellKey(r + dr, c + dc))).length;
  const paint = (cell) => {
    painted.add(cellKey(cell[0], cell[1]));
    for (const [dr, dc] of NEIGHBOUR_STEPS) {
      const next = [cell[0] + dr, cell[1] + dc];
      const key = cellKey(next[0], next[1]);
      if (paintable.has(key) && !queued.has(key)) {
        queued.add(key);
        frontier.push(next);
      }
    }
  };

  const seed = eligible[Math.floor(randomFn() * eligible.length)];
  queued.add(cellKey(seed[0], seed[1]));
  paint(seed);
  while (painted.size < goal && frontier.length > 0) {
    // Best of two random frontier cells: the one with more painted neighbours.
    const first = Math.floor(randomFn() * frontier.length);
    const second = Math.floor(randomFn() * frontier.length);
    const pick = paintedNeighbours(frontier[second]) > paintedNeighbours(frontier[first]) ? second : first;
    paint(frontier.splice(pick, 1)[0]);
  }

  const splashed = board.map((cells) => cells.slice());
  for (const key of painted) {
    const [r, c] = key.split(',').map(Number);
    splashed[r][c] = color + markerOf(splashed[r][c]);
  }
  return hasValidMoves(splashed) ? splashed : null;
}

/**
 * Uses a booster. Shuffle spends a charge immediately; Color Burst arms (or
 * disarms) itself and spends its charge on the next gem tapped.
 *
 * @param {GameState} state
 * @param {BoosterType} booster
 * @param {Rng} [randomFn=Math.random]
 * @returns {GameState} The same state if the booster is unavailable.
 */
export function activateBooster(state, booster, randomFn = Math.random) {
  if (state.isGameOver || !(state.boosters[booster] > 0)) return state;
  if (booster === 'shuffle') {
    return {
      ...state,
      board: shuffleBoard(state.board, randomFn, difficultyOf(state).refillMatchBias),
      boosters: { ...state.boosters, shuffle: state.boosters.shuffle - 1 },
      armedBooster: null,
    };
  }
  return { ...state, armedBooster: state.armedBooster === booster ? null : booster };
}

/**
 * Round-end step 1: every power-up left on the board activates at once. A wash
 * gem splashes its colour first, then every bomb, line bomb, time gem and wash
 * gem is destroyed together (bombs chaining into one another) and the board
 * refills with plain gems. Works on a finished round and ignores the clock.
 *
 * @param {GameState} state
 * @param {Rng} [randomFn=Math.random]
 * @returns {TapResult}
 */
export function detonateRemainingPowerUps(state, randomFn = Math.random) {
  let board = state.board;
  const powerCells = [];
  let washColor = null;
  let washFrom = null;
  board.forEach((rowCells, r) =>
    rowCells.forEach((tile, c) => {
      if (isWashGem(tile) && washColor === null) {
        washColor = baseColor(tile);
        washFrom = [r, c];
      }
      if (isSpecialTile(tile) || isTimeGem(tile) || isWashGem(tile)) powerCells.push([r, c]);
    }),
  );
  if (washColor !== null) board = splashBoard(board, randomFn, washColor, washFrom) ?? board;
  if (powerCells.length === 0) return { nextState: { ...state, board }, clearedCells: [], eventType: 'finale' };

  const { cells, bonus } = chainBlast(board, powerCells);
  return {
    nextState: {
      ...state,
      board: applyGravity(board, cells, randomFn, 0, [], difficultyOf(state).refillMatchBias),
      score: state.score + cells.length * POINTS_PER_GEM + bonus,
    },
    clearedCells: cells,
    eventType: 'finale',
  };
}

/**
 * Round-end step 2: every cluster of MIN_CLUSTER_SIZE+ matching gems currently
 * on the board is popped at once for base points, then the board refills.
 *
 * @param {GameState} state
 * @param {Rng} [randomFn=Math.random]
 * @returns {TapResult}
 */
export function popRemainingClusters(state, randomFn = Math.random) {
  const visited = new Set();
  const cells = [];
  state.board.forEach((rowCells, r) =>
    rowCells.forEach((_, c) => {
      if (visited.has(cellKey(r, c))) return;
      const component = findConnected(state.board, r, c);
      for (const [cr, cc] of component) visited.add(cellKey(cr, cc));
      if (component.length >= MIN_CLUSTER_SIZE) cells.push(...component);
    }),
  );
  if (cells.length === 0) return { nextState: state, clearedCells: [], eventType: 'finale' };

  return {
    nextState: {
      ...state,
      board: applyGravity(state.board, cells, randomFn, 0, [], difficultyOf(state).refillMatchBias),
      score: state.score + cells.length * POINTS_PER_GEM,
    },
    clearedCells: cells,
    eventType: 'finale',
  };
}
