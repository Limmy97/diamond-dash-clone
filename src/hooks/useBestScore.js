import { useEffect, useState } from 'react';

const STORAGE_KEY = 'diamond-dash:best-score';

/** @returns {number} */
function readBest() {
  try {
    return Number(localStorage.getItem(STORAGE_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** @param {number} score */
function writeBest(score) {
  try {
    localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    // Storage blocked (private mode, quota): the best score just won't persist.
  }
}

/**
 * Tracks the persisted best score and records a new one when a round ends.
 *
 * @param {number} score
 * @param {boolean} isGameOver
 * @returns {{ best: number, isNewBest: boolean }}
 */
export function useBestScore(score, isGameOver) {
  const [best, setBest] = useState(readBest);
  const [bestBeforeRound, setBestBeforeRound] = useState(best);
  const [wasGameOver, setWasGameOver] = useState(isGameOver);

  // Record the result on the transition into game over (adjusting state during render).
  if (isGameOver !== wasGameOver) {
    setWasGameOver(isGameOver);
    if (isGameOver) {
      setBestBeforeRound(best);
      if (score > best) setBest(score);
    }
  }

  useEffect(() => {
    writeBest(best);
  }, [best]);

  return { best, isNewBest: isGameOver && score > bestBeforeRound };
}
