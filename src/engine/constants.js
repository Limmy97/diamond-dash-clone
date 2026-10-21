/**
 * Game balancing constants. See spec.md for the rules these values drive.
 */

/** Number of columns on the board. */
export const COLS = 10;

/** Number of rows on the board. Row 0 is the top. */
export const ROWS = 9;

/** The five gem colors. */
export const COLORS = Object.freeze(['red', 'blue', 'green', 'purple', 'yellow']);

/** Special tile that detonates a 3x3 area when tapped. Not a colour: never part of a cluster match. */
export const BOMB = 'bomb';

/** Chance that a gem replenished after a pop is a bomb. */
export const BOMB_SPAWN_CHANCE = 0.03;

/** Flat bonus for detonating a bomb, on top of POINTS_PER_GEM per destroyed cell. */
export const BOMB_BONUS_POINTS = 100;

/** Minimum orthogonally connected same-color gems required for a pop. */
export const MIN_CLUSTER_SIZE = 3;

/** Probability that a replenished gem copies an already-filled neighbour's colour. */
export const REFILL_MATCH_BIAS = 0.45;

/** Length of a round in milliseconds. */
export const ROUND_DURATION_MS = 60_000;

/** Maximum gap between successful pops to keep the combo streak alive. */
export const COMBO_WINDOW_MS = 1_200;

/** Combo count that triggers Fire Mode. */
export const FIRE_MODE_TRIGGER_COMBO = 5;

/** How long Fire Mode stays active in milliseconds. */
export const FIRE_MODE_DURATION_MS = 5_000;

/** Fire Mode explosion radius around the tapped cell (1 => 3x3 area). */
export const FIRE_MODE_RADIUS = 2;

/** Score multiplier applied while Fire Mode is active. */
export const FIRE_MODE_SCORE_MULTIPLIER = 2;

/** Base points awarded per destroyed gem. */
export const POINTS_PER_GEM = 10;
