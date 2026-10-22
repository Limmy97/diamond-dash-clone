/**
 * Game balancing constants. See spec.md for the rules these values drive.
 */

/** Number of columns on the board. */
export const COLS = 10;

/** Number of rows on the board. Row 0 is the top. */
export const ROWS = 9;

/** The five gem colors. */
export const COLORS = Object.freeze(['red', 'blue', 'green', 'purple', 'yellow']);

/** Special tile that detonates a square area when tapped. Not a colour: never part of a cluster match. */
export const BOMB = 'bomb';

/** Bomb explosion radius around the tapped bomb (2 => 5x5 area). */
export const BOMB_RADIUS = 2;

/** Chance that a gem replenished after a pop is a bomb. */
export const BOMB_SPAWN_CHANCE = 0.012;

/** Flat bonus for detonating a bomb, on top of POINTS_PER_GEM per destroyed cell. */
export const BOMB_BONUS_POINTS = 100;

/** Minimum orthogonally connected same-color gems required for a pop. */
export const MIN_CLUSTER_SIZE = 3;

/** Probability that a replenished gem copies an already-filled neighbour's colour. */
export const REFILL_MATCH_BIAS = 0.4;

/** Length of a round in milliseconds. */
export const ROUND_DURATION_MS = 60_000;

/** Maximum gap between successful pops to keep the combo streak alive. */
export const COMBO_WINDOW_MS = 1_200;

/** Combo count that triggers Fire Mode on the default (easy) difficulty. */
export const FIRE_MODE_TRIGGER_COMBO = 5;

/** How long Fire Mode stays active in milliseconds. */
export const FIRE_MODE_DURATION_MS = 5_000;

/** Fire Mode explosion radius around the tapped cell (1 => 3x3 area). */
export const FIRE_MODE_RADIUS = 1;

/** Score multiplier applied while Fire Mode is active. */
export const FIRE_MODE_SCORE_MULTIPLIER = 2;

/** Base points awarded per destroyed gem. */
export const POINTS_PER_GEM = 10;

/** Special tile that clears its own column and the bottom row of the board when tapped. Awarded when the line-bomb meter fills. */
export const LINE_BOMB = 'line_bomb';

/** Whether a tile is a tap-to-detonate special rather than a colour. */
export const isSpecialTile = (tile) => tile === BOMB || tile === LINE_BOMB;

/** Suffix marking a coloured gem as a time gem, e.g. 'red*'. It still matches its base colour. */
export const TIME_GEM_SUFFIX = '*';

/** Suffix marking a coloured gem as a wash gem, e.g. 'red^'. It still matches its base colour. */
export const WASH_GEM_SUFFIX = '^';

/** @param {string|null} tile @param {string} suffix */
export const hasMarker = (tile, suffix) => tile != null && tile.endsWith(suffix);

/** @param {string|null} tile */
export const isTimeGem = (tile) => hasMarker(tile, TIME_GEM_SUFFIX);

/** @param {string|null} tile */
export const isWashGem = (tile) => hasMarker(tile, WASH_GEM_SUFFIX);

/** @param {string|null} tile @returns {string|null} The colour without any time/wash marker. */
export const baseColor = (tile) => (tile == null ? tile : tile.replace(/[*^]$/, ''));

/** @param {string|null} tile @returns {string} The marker suffix on a gem, or ''. */
export const markerOf = (tile) => (tile == null ? '' : tile.slice(baseColor(tile).length));

/** Chance that a gem replenished after a pop is a time gem, once the spawn cooldown has passed (at most one per refill). */
export const TIME_GEM_SPAWN_CHANCE = 0.04;

/** A time gem loses its badge (becoming a plain gem) this long after it spawns. */
export const TIME_GEM_LIFETIME_MS = 4_000;

/** After a time gem spawns, the next one waits a random delay in this range (8-10s). */
export const TIME_GEM_COOLDOWN_MIN_MS = 8_000;
export const TIME_GEM_COOLDOWN_MAX_MS = 10_000;

/** Seconds added to the clock for every time gem destroyed. */
export const TIME_GEM_BONUS_SECONDS = 2;

/** Gems cleared by normal pops needed to fill the line-bomb meter. */
export const LINE_BOMB_METER_MAX = 40;

/** Meter lost on a miss (a tap on a cluster of < 3). */
export const LINE_BOMB_MISS_DRAIN = 5;

/** Flat bonus for detonating a line bomb, on top of POINTS_PER_GEM per destroyed cell. */
export const LINE_BOMB_BONUS_POINTS = 150;

/** Booster charges granted at the start of every round. */
export const STARTING_BOOSTERS = Object.freeze({ shuffle: 2, colorBurst: 1 });

/** Chance that a gem replenished after a pop is a wash gem, once its spawn cooldown has passed (at most one per refill). */
export const WASH_GEM_SPAWN_CHANCE = 0.04;

/** A wash gem loses its badge (becoming a plain gem) this long after it spawns. */
export const WASH_GEM_LIFETIME_MS = 4_000;

/** After a wash gem spawns, the next one waits a random delay in this range (10-12s). */
export const WASH_GEM_COOLDOWN_MIN_MS = 10_000;
export const WASH_GEM_COOLDOWN_MAX_MS = 12_000;

/** A wash gem's splash covers this fraction range of the board's gems (20-25%), within one quadrant. */
export const COLOR_WASH_MIN_FRACTION = 0.2;
export const COLOR_WASH_MAX_FRACTION = 0.25;

/** Attempts to shuffle into a playable board before falling back to a fresh one. */
export const SHUFFLE_MAX_ATTEMPTS = 20;

/**
 * Difficulty modes. `fireTrigger` is the consecutive successful pops needed for Fire
 * Mode; `refillMatchBias` is the REFILL_MATCH_BIAS used when replenishing gems (lower
 * means fewer easy matches appear). Easy matches the original tuning.
 */
export const DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ label: 'Easy', fireTrigger: FIRE_MODE_TRIGGER_COMBO, refillMatchBias: REFILL_MATCH_BIAS }),
  medium: Object.freeze({ label: 'Medium', fireTrigger: 7, refillMatchBias: 0.34 }),
  hard: Object.freeze({ label: 'Hard', fireTrigger: 9, refillMatchBias: 0.28 }),
});

export const DEFAULT_DIFFICULTY = 'easy';
