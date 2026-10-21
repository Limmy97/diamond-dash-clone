import { BOMB, MIN_CLUSTER_SIZE } from './constants.js';

/**
 * @typedef {(string|null)[][]} Board  board[row][col]; row 0 is the top.
 * @typedef {[number, number]} Coord   [row, col]
 */

const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @returns {boolean}
 */
export function isInBounds(board, row, col) {
  return row >= 0 && row < board.length && col >= 0 && col < board[row].length;
}

/**
 * Breadth-first search for the full orthogonally connected component of
 * same-color cells containing [row, col], whatever its size.
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @returns {Coord[]} Coordinates in BFS order, or [] if the cell is out of bounds, empty, or a bomb.
 */
export function findConnected(board, row, col) {
  if (!isInBounds(board, row, col)) return [];
  const color = board[row][col];
  if (color == null || color === BOMB) return [];

  const visited = new Set([`${row},${col}`]);
  const queue = [[row, col]];
  const result = [];

  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    result.push([r, c]);
    for (const [dr, dc] of DIRECTIONS) {
      const nr = r + dr;
      const nc = c + dc;
      const key = `${nr},${nc}`;
      if (!visited.has(key) && isInBounds(board, nr, nc) && board[nr][nc] === color) {
        visited.add(key);
        queue.push([nr, nc]);
      }
    }
  }

  return result;
}

/**
 * Returns the poppable cluster at [row, col], or [] if it is smaller than `minSize`.
 *
 * @param {Board} board
 * @param {number} row
 * @param {number} col
 * @param {number} [minSize=MIN_CLUSTER_SIZE]
 * @returns {Coord[]}
 */
export function findCluster(board, row, col, minSize = MIN_CLUSTER_SIZE) {
  const connected = findConnected(board, row, col);
  return connected.length >= minSize ? connected : [];
}

/**
 * Whether any poppable cluster exists. Each component is searched only once.
 *
 * @param {Board} board
 * @param {number} [minSize=MIN_CLUSTER_SIZE]
 * @returns {boolean}
 */
export function hasValidMoves(board, minSize = MIN_CLUSTER_SIZE) {
  const visited = new Set();
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      if (visited.has(`${r},${c}`)) continue;
      const component = findConnected(board, r, c);
      if (component.length >= minSize) return true;
      for (const [cr, cc] of component) visited.add(`${cr},${cc}`);
    }
  }
  return false;
}
