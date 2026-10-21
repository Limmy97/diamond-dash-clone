import { describe, it, expect } from 'vitest';
import { findCluster, findConnected } from '../engine/floodFill.js';

/** Letter shorthand for building boards; '.' is an empty cell. */
const LETTERS = { R: 'red', B: 'blue', G: 'green', P: 'purple', Y: 'yellow', '.': null };

/** @param {string[]} rows */
const parse = (rows) => rows.map((line) => [...line].map((ch) => LETTERS[ch]));

const sortCoords = (coords) => [...coords].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

describe('findCluster', () => {
  it('returns [] for a single isolated gem', () => {
    const board = parse(['RBG', 'BGR', 'GRB']);
    expect(findCluster(board, 1, 1)).toEqual([]);
  });

  it('returns [] for a pair (below the threshold of 3)', () => {
    const board = parse(['RRB', 'GBG', 'BGB']);
    expect(findConnected(board, 0, 0)).toHaveLength(2);
    expect(findCluster(board, 0, 0)).toEqual([]);
  });

  it('does not connect diagonal neighbours', () => {
    const board = parse(['RBR', 'BRB', 'RBR']);
    expect(findCluster(board, 1, 1)).toEqual([]);
  });

  it('returns [] for out-of-bounds or empty cells', () => {
    const board = parse(['RRR', '.BB', 'GGG']);
    expect(findCluster(board, -1, 0)).toEqual([]);
    expect(findCluster(board, 0, 3)).toEqual([]);
    expect(findCluster(board, 1, 0)).toEqual([]);
  });

  it('returns all coordinates of a cluster of exactly 3', () => {
    const board = parse(['RRR', 'BGB', 'GBG']);
    expect(sortCoords(findCluster(board, 0, 1))).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
    ]);
  });

  it('follows bends to find the whole orthogonal component', () => {
    const board = parse(['RBBB', 'RRGB', 'GRGR', 'GRRR']);
    expect(sortCoords(findCluster(board, 0, 0))).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [2, 1],
      [3, 1],
      [3, 2],
      [3, 3],
      [2, 3],
    ].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  });

  it('gives the same cluster whichever member is tapped', () => {
    const board = parse(['YYG', 'GYG', 'GYB']);
    const fromTop = sortCoords(findCluster(board, 0, 0));
    const fromBottom = sortCoords(findCluster(board, 2, 1));
    expect(fromTop).toHaveLength(4);
    expect(fromBottom).toEqual(fromTop);
  });
});
