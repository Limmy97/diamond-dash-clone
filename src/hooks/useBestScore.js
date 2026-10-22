import { useEffect, useState } from 'react';
import { DIFFICULTIES } from '../engine/constants.js';

/** @param {string} difficulty */
const storageKey = (difficulty) => `gem-blitz:best-score:${difficulty}`;

/**
 * @param {string} difficulty
 * @returns {number}
 */
function readBest(difficulty) {
  try {
    return Number(localStorage.getItem(storageKey(difficulty))) || 0;
  } catch {
    return 0;
  }
}

/**
 * @param {string} difficulty
 * @param {number} score
 */
function writeBest(difficulty, score) {
  try {
    localStorage.setItem(storageKey(difficulty), String(score));
  } catch {
    // Storage blocked (private mode, quota): the best score just won't persist.
  }
}

/**
 * Tracks the persisted best score per difficulty and records a new one when a round ends.
 *
 * @param {number} score
 * @param {boolean} isGameOver
 * @param {string} difficulty Difficulty of the selected / running round.
 * @returns {{ best: number, isNewBest: boolean }}
 */
export function useBestScore(score, isGameOver, difficulty) {
  const [bests, setBests] = useState(() =>
    Object.fromEntries(Object.keys(DIFFICULTIES).map((key) => [key, readBest(key)])),
  );
  const best = bests[difficulty];
  const [bestBeforeRound, setBestBeforeRound] = useState(best);
  const [wasGameOver, setWasGameOver] = useState(isGameOver);

  // Record the result on the transition into game over (adjusting state during render).
  if (isGameOver !== wasGameOver) {
    setWasGameOver(isGameOver);
    if (isGameOver) {
      setBestBeforeRound(best);
      if (score > best) setBests({ ...bests, [difficulty]: score });
    }
  }

  useEffect(() => {
    writeBest(difficulty, best);
  }, [difficulty, best]);

  return { best, isNewBest: isGameOver && score > bestBeforeRound };
}
