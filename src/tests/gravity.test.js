import { describe, it, expect } from 'vitest';
import { COLS, ROWS, COLORS } from '../engine/constants.js';
import { findCluster, hasValidMoves } from '../engine/floodFill.js';
import { clearCells, collapseColumns, refill, applyGravity } from '../engine/gravity.js';

/** Letter shorthand for building boards; '.' is an empty cell. */
const LETTERS = { R: 'red', B: 'blue', G: 'green', P: 'purple', Y: 'yellow', '.': null };

/** @param {string[]} rows */
const parse = (rows) => rows.map((line) => [...line].map((ch) => LETTERS[ch]));

/** Deterministic rng that cycles through the given values. */
const sequenceRng = (values) => {
  let i = 0;
  return () => values[i++ % values.length];
};

/** Small seeded PRNG (mulberry32) so failures are reproducible. */
const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const checkerboard = (rows = ROWS, cols = COLS) =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => ((r + c) % 2 === 0 ? 'red' : 'blue')),
  );

/** Coordinates whose values differ between two same-sized boards. */
const diffCells = (a, b) =>
  a.flatMap((row, r) => row.flatMap((cell, c) => (cell !== b[r][c] ? [[r, c]] : [])));

// Uniform pick boundaries for 5 colours: [0,.2) red, [.2,.4) blue, [.4,.6) green, [.6,.8) purple, [.8,1) yellow.

describe('clearCells', () => {
  it('nulls the given cells without mutating the input', () => {
    const board = parse(['RG', 'BY']);
    const next = clearCells(board, [[0, 1]]);
    expect(next).toEqual(parse(['R.', 'BY']));
    expect(board).toEqual(parse(['RG', 'BY']));
  });
});

describe('collapseColumns', () => {
  it('drops gems down, preserving order, with gaps at the top', () => {
    const board = parse([
      'RB.',
      '.G.',
      'Y.P',
      '..G',
    ]);
    expect(collapseColumns(board)).toEqual(parse([
      '...',
      '...',
      'RBP',
      'YGG',
    ]));
  });
});

describe('refill: biased fill (Step A)', () => {
  it('fills only empty cells when the board already has a move', () => {
    const board = parse(['...', 'RRR', 'BGB']);
    const next = refill(board, seeded(7));
    expect(next.slice(1)).toEqual(board.slice(1));
    expect(next[0].every((cell) => COLORS.includes(cell))).toBe(true);
    expect(board[0]).toEqual([null, null, null]);
  });

  it('copies a filled neighbour when the bias roll succeeds', () => {
    // Bias roll 0.1 < 0.4, then neighbour index pick 0 -> the green below.
    const next = refill(parse(['.', 'G', 'G']), sequenceRng([0.1, 0]));
    expect(next).toEqual(parse(['G', 'G', 'G']));
  });

  it('uses the supplied match bias, so harder modes copy neighbours less often', () => {
    // A 0.35 roll copies the green below at the easy 0.4 bias but not at the hard 0.28 bias.
    expect(refill(parse(['.', 'G', 'G']), sequenceRng([0.35, 0]), 0, [], 0.4)[0][0]).toBe('green');
    expect(refill(parse(['.', 'G', 'G']), sequenceRng([0.35, 0]), 0, [], 0.28)[0][0]).toBe('red');
  });

  it('picks uniformly when the bias roll fails', () => {
    // Bias roll 0.5 >= 0.4, then uniform 0.3 -> blue.
    const next = refill(parse(['.', 'R', 'R', 'R']), sequenceRng([0.5, 0.3]));
    expect(next[0][0]).toBe('blue');
  });

  it('only samples neighbours that are already filled (below, left, right)', () => {
    // Fill order is bottom-up, left-to-right. [0,0] sees only the yellow below;
    // [0,1] then sees [red (below), yellow (left)]; index pick .99 -> the second, yellow.
    const next = refill(parse(['..', 'YR', 'YR', 'GG']), sequenceRng([0.1, 0, 0.1, 0.99]));
    expect(next[0]).toEqual(['yellow', 'yellow']);
    // Same rolls but index pick 0 at [0,1] -> the red below.
    expect(refill(parse(['..', 'YR', 'YR', 'GG']), sequenceRng([0.1, 0, 0.1, 0]))[0]).toEqual(['yellow', 'red']);
  });

  it('is deterministic for a given rng seed', () => {
    const empty = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
    expect(refill(empty, seeded(42))).toEqual(refill(empty, seeded(42)));
  });

  it('a full-size board stays 10x9 and has no empty cells after a pop', () => {
    const rng = seeded(3);
    const board = refill(Array.from({ length: ROWS }, () => new Array(COLS).fill(null)), rng);
    const next = applyGravity(board, [[8, 0], [8, 1], [8, 2], [4, 5]], rng);
    expect(next).toHaveLength(ROWS);
    next.forEach((row) => expect(row).toHaveLength(COLS));
    expect(next.flat().includes(null)).toBe(false);
  });
});

describe('refill: guaranteed move (Step B)', () => {
  it('breaks a worst-case full checkerboard stalemate by forcing one connected triple', () => {
    const board = checkerboard();
    expect(hasValidMoves(board)).toBe(false);

    const next = refill(board, seeded(1));
    expect(hasValidMoves(next)).toBe(true);

    const changed = diffCells(board, next);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThanOrEqual(3);
    expect(board).toEqual(checkerboard());
  });

  it('forces a triple on any checkerboard for many seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      expect(hasValidMoves(refill(checkerboard(), seeded(seed)))).toBe(true);
    }
  });

  it('prefers newly filled cells when choosing the triple to force', () => {
    // One empty cell in a checkerboard, filled with green via the uniform path
    // (rng .5 everywhere): an isolated new gem, so the board is still stalemated.
    const board = checkerboard();
    board[0][0] = null;
    const next = refill(board, () => 0.5);
    expect(hasValidMoves(next)).toBe(true);

    // The forced triple includes the new gem, so it is part of the resulting cluster,
    // and at most 2 previously visible gems were repainted.
    expect(findCluster(next, 0, 0).length).toBeGreaterThanOrEqual(3);
    const changed = diffCells(checkerboard(), next);
    expect(changed).toContainEqual([0, 0]);
    expect(changed.length).toBeLessThanOrEqual(3);
  });

  it('every refill after a pop leaves a valid move (randomised soak)', () => {
    const rng = seeded(99);
    let board = refill(checkerboard(), rng);
    for (let i = 0; i < 300; i++) {
      const r = Math.floor(rng() * ROWS);
      const c = Math.floor(rng() * COLS);
      const cleared = [[r, c], [r, (c + 1) % COLS], [(r + 1) % ROWS, c]];
      board = applyGravity(board, cleared, rng);
      expect(hasValidMoves(board)).toBe(true);
    }
  });
});

describe('applyGravity', () => {
  it('clears a popped cluster, drops survivors, and fills the top rows', () => {
    const board = parse([
      'GB',
      'YP',
      'RR',
      'RB',
    ]);
    const cluster = findCluster(board, 2, 0);
    expect(cluster).toHaveLength(3);

    // rng .8 always fails the bias roll and picks yellow uniformly.
    const next = applyGravity(board, cluster, sequenceRng([0.8]));
    // Column 0 loses 2 reds; G and Y fall to the bottom; 2 new yellows on top.
    // Column 1 loses its red at row 2; B and P fall; 1 new yellow on top.
    expect(next).toEqual(parse([
      'YY',
      'YB',
      'GP',
      'YB',
    ]));
  });
});
