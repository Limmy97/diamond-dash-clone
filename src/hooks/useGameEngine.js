import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOMB } from '../engine/constants.js';
import { createInitialState, getBlastCells, handleCellTap, tickGame } from '../engine/gameLoop.js';
import { initAudio, playFireMode, playMiss, playPop } from '../services/audio.js';

/** Tick interval for the round clock and timer expiries. */
const TICK_MS = 50;

const NO_CELLS = Object.freeze([]);

/**
 * @typedef {Object} LastTap
 * @property {number} id Increments on every handled tap; use as an animation key.
 * @property {number} row
 * @property {number} col
 * @property {import('../engine/gameLoop.js').TapEventType} eventType
 * @property {import('../engine/gameLoop.js').Coord[]} clearedCells
 */

/**
 * Owns the game state, the tick loop, and tap -> audio routing.
 *
 * The authoritative state lives in a ref so taps and ticks always build on the
 * latest state synchronously (no stale closures between renders); React state
 * mirrors it to trigger re-renders.
 */
export function useGameEngine() {
  const [state, setState] = useState(() => createInitialState());
  const [now, setNow] = useState(() => Date.now());
  const [hasStarted, setHasStarted] = useState(false);
  const [lastTap, setLastTap] = useState(/** @type {LastTap|null} */ (null));
  const [hoveredCell, setHoveredCellState] = useState(/** @type {[number, number]|null} */ (null));

  const stateRef = useRef(state);
  const tapIdRef = useRef(0);
  const fireBlastStepRef = useRef(0);

  const commit = useCallback((next, at) => {
    stateRef.current = next;
    setState(next);
    setNow(at);
  }, []);

  useEffect(() => {
    if (!hasStarted || state.isGameOver) return undefined;
    let last = Date.now();
    const id = setInterval(() => {
      const at = Date.now();
      commit(tickGame(stateRef.current, at, (at - last) / 1000), at);
      last = at;
    }, TICK_MS);
    return () => clearInterval(id);
  }, [hasStarted, state.isGameOver, commit]);

  const onCellTap = useCallback(
    (row, col) => {
      // Cheap after the first call; also resumes a context the browser suspended.
      initAudio();
      if (!hasStarted) return;

      const at = Date.now();
      const { nextState, clearedCells, eventType } = handleCellTap(stateRef.current, row, col, at);
      if (eventType === 'ignored') return;

      commit(nextState, at);
      tapIdRef.current += 1;
      setLastTap({ id: tapIdRef.current, row, col, eventType, clearedCells });

      switch (eventType) {
        case 'pop':
          playPop(nextState.comboCount - 1);
          break;
        case 'fire_trigger':
          fireBlastStepRef.current = 0;
          playFireMode();
          break;
        case 'fire_blast':
          playPop(fireBlastStepRef.current, { fireMode: true });
          fireBlastStepRef.current += 1;
          break;
        case 'bomb':
          playFireMode();
          break;
        case 'miss':
          playMiss();
          break;
        default:
          break;
      }
    },
    [hasStarted, commit],
  );

  const restartGame = useCallback(() => {
    initAudio();
    commit(createInitialState(), Date.now());
    fireBlastStepRef.current = 0;
    setLastTap(null);
    setHoveredCellState(null);
    setHasStarted(true);
  }, [commit]);

  /** @param {number|null} row  Pass null to clear. */
  const setHoveredCell = useCallback((row, col) => {
    setHoveredCellState((prev) => {
      if (row == null) return null;
      return prev && prev[0] === row && prev[1] === col ? prev : [row, col];
    });
  }, []);

  const hoveredBlastCells = useMemo(
    () =>
      hoveredCell &&
      (state.isFireMode || state.board[hoveredCell[0]][hoveredCell[1]] === BOMB)
        ? getBlastCells(state.board, hoveredCell[0], hoveredCell[1])
        : NO_CELLS,
    [state.isFireMode, state.board, hoveredCell],
  );

  return {
    state,
    now,
    hasStarted,
    lastTap,
    onCellTap,
    restartGame,
    hoveredBlastCells,
    setHoveredCell,
  };
}
