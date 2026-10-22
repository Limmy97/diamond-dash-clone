import { baseColor, BOMB, COLORS, isSpecialTile, REFILL_MATCH_BIAS } from './constants.js';
import { hasValidMoves, isInBounds } from './floodFill.js';

/**
 * @typedef {(string|null)[][]} Board  board[row][col]; row 0 is the top.
 * @typedef {[number, number]} Coord   [row, col]
 * @typedef {() => number} Rng         Returns a float in [0, 1), like Math.random.
 */

/**
 * Picks a gem color using the supplied random source.
 *
 * @param {Rng} rng
 * @returns {string}
 */
export function randomColor(rng) {
  return COLORS[Math.floor(rng() * COLORS.length)];
}

/**
 * Returns a new board with the given cells set to null.
 *
 * @param {Board} board
 * @param {Coord[]} cells
 * @returns {Board}
 */
export function clearCells(board, cells) {
  const next = board.map((row) => row.slice());
  for (const [r, c] of cells) next[r][c] = null;
  return next;
}

/**
 * Returns a new board where every column's gems have fallen to the bottom,
 * keeping their relative order, with the empty cells gathered at the top.
 *
 * @param {Board} board
 * @returns {Board}
 */
export function collapseColumns(board) {
  const rows = board.length;
  const cols = rows > 0 ? board[0].length : 0;
  const next = Array.from({ length: rows }, () => new Array(cols).fill(null));

  for (let c = 0; c < cols; c++) {
    let writeRow = rows - 1;
    for (let r = rows - 1; r >= 0; r--) {
      if (board[r][c] != null) {
        next[writeRow][c] = board[r][c];
        writeRow--;
      }
    }
  }

  return next;
}

const ORTHOGONAL = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * Colour for a new gem at [r, c]: with `matchBias` probability copy an
 * already-filled neighbour (below, left or right), otherwise pick uniformly.
 *
 * @param {Board} board
 * @param {number} r
 * @param {number} c
 * @param {Rng} rng
 * @param {number} matchBias
 * @returns {string}
 */
function biasedColor(board, r, c, rng, matchBias) {
  const neighbours = [
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ]
    .filter(([nr, nc]) => isInBounds(board, nr, nc) && board[nr][nc] != null && !isSpecialTile(board[nr][nc]))
    .map(([nr, nc]) => baseColor(board[nr][nc]));

  if (neighbours.length > 0 && rng() < matchBias) {
    return neighbours[Math.floor(rng() * neighbours.length)];
  }
  return randomColor(rng);
}

/**
 * Stalemate breaker: paints one connected triple (a centre cell plus two of its
 * orthogonal neighbours, straight or L-shaped) a single colour, which always
 * creates a cluster of at least 3. Triples made of the most newly filled cells
 * are preferred, so gems the player can already see change as little as possible.
 *
 * @param {Board} board Mutated in place.
 * @param {Set<string>} filled Keys ("r,c") of cells filled by this refill.
 * @param {Rng} rng
 */
function forceMove(board, filled, rng) {
  let best = [];
  let bestScore = -1;

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const neighbours = ORTHOGONAL.map(([dr, dc]) => [r + dr, c + dc]).filter(([nr, nc]) =>
        isInBounds(board, nr, nc),
      );
      for (let i = 0; i < neighbours.length; i++) {
        for (let j = i + 1; j < neighbours.length; j++) {
          const triple = [[r, c], neighbours[i], neighbours[j]];
          const score = triple.filter(([tr, tc]) => filled.has(`${tr},${tc}`)).length;
          if (score > bestScore) {
            best = [triple];
            bestScore = score;
          } else if (score === bestScore) {
            best.push(triple);
          }
        }
      }
    }
  }

  // Boards too small to hold a connected triple cannot be forced.
  if (best.length === 0) return;
  const triple = best[Math.floor(rng() * best.length)];
  const color = randomColor(rng);
  for (const [r, c] of triple) board[r][c] = color;
}

/**
 * Returns a new board with every empty cell filled, guaranteeing at least one
 * valid move.
 *
 * Step A: cells are filled bottom-up, each biased toward a filled neighbour's colour
 *         (or, with `bombChance`, spawned as a bomb).
 * Step B: if the result has no valid move, one connected triple is forced to match.
 *
 * @param {Board} board
 * @param {Rng} [rng=Math.random] Inject a seeded generator for deterministic results.
 * @param {number} [bombChance=0] Per-cell bomb probability. At 0 no extra rng values are drawn.
 * @param {[string, number][]} [gemMarkers=[]] [suffix, chance] pairs for time/wash gems. Each marker spawns at most
 *        once per refill, never two on one gem; with none, no extra rng values are drawn.
 * @param {number} [matchBias=REFILL_MATCH_BIAS] Chance a new gem copies a neighbour's colour.
 * @returns {Board}
 */
export function refill(board, rng = Math.random, bombChance = 0, gemMarkers = [], matchBias = REFILL_MATCH_BIAS) {
  const next = board.map((row) => row.slice());
  const filled = new Set();
  const markers = gemMarkers.filter(([, chance]) => chance > 0);

  for (let r = next.length - 1; r >= 0; r--) {
    for (let c = 0; c < next[r].length; c++) {
      if (next[r][c] == null) {
        // Bombs roll at the top of the range so rngs biased toward 0 never spawn them.
        if (bombChance > 0 && rng() >= 1 - bombChance) {
          next[r][c] = BOMB;
        } else {
          // Markers roll at the top of the range too, so rngs biased toward 0 never spawn them.
          let marker = '';
          for (let i = 0; i < markers.length && marker === ''; i++) {
            if (rng() >= 1 - markers[i][1]) [[marker]] = markers.splice(i, 1);
          }
          next[r][c] = biasedColor(next, r, c, rng, matchBias) + marker;
        }
        filled.add(`${r},${c}`);
      }
    }
  }

  if (!hasValidMoves(next)) forceMove(next, filled, rng);
  return next;
}

/**
 * Full resolution step after a pop: clear, collapse, then refill from the top.
 *
 * @param {Board} board
 * @param {Coord[]} cells
 * @param {Rng} [rng=Math.random]
 * @param {number} [bombChance=0]
 * @param {[string, number][]} [gemMarkers=[]]
 * @param {number} [matchBias=REFILL_MATCH_BIAS]
 * @returns {Board}
 */
export function applyGravity(
  board,
  cells,
  rng = Math.random,
  bombChance = 0,
  gemMarkers = [],
  matchBias = REFILL_MATCH_BIAS,
) {
  return refill(collapseColumns(clearCells(board, cells)), rng, bombChance, gemMarkers, matchBias);
}
