import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_DIFFICULTY, DIFFICULTIES, isSpecialTile } from '../engine/constants.js';
import {
  activateBooster,
  createInitialState,
  detonateRemainingPowerUps,
  getBlastCells,
  getColorCells,
  handleCellTap,
  popRemainingClusters,
  tickGame,
} from '../engine/gameLoop.js';
import { initAudio, playFireMode, playMiss, playPop } from '../services/audio.js';

/** Tick interval for the round clock and timer expiries. */
const TICK_MS = 50;

const NO_CELLS = Object.freeze([]);

/** Highest pitch step on a round's fire meter. */
const topStepOf = (state) => DIFFICULTIES[state.difficulty].fireTrigger - 1;

/** After time runs out: pause, then set off leftover power-ups, then pop leftover clusters. */
const FINALE_POWERUPS_DELAY_MS = 400;
const FINALE_POP_DELAY_MS = 1_400;

/** Pause after the final refill before the game-over screen appears. */
const GAME_OVER_DELAY_MS = 1_500;

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
  const [difficulty, setDifficulty] = useState(DEFAULT_DIFFICULTY);
  const [showGameOver, setShowGameOver] = useState(false);
  const [lastTap, setLastTap] = useState(/** @type {LastTap|null} */ (null));
  const [hoveredCell, setHoveredCellState] = useState(/** @type {[number, number]|null} */ (null));

  const stateRef = useRef(state);
  const tapIdRef = useRef(0);

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

  // Round end: leftover power-ups, then leftover clusters, then the game-over screen.
  useEffect(() => {
    if (!hasStarted || !state.isGameOver) return undefined;

    const runStep = (step, playSound) => {
      const at = Date.now();
      const { nextState, clearedCells } = step(stateRef.current);
      commit(nextState, at);
      if (clearedCells.length === 0) return;
      tapIdRef.current += 1;
      setLastTap({ id: tapIdRef.current, row: 0, col: 0, eventType: 'finale', clearedCells });
      playSound();
    };

    const timers = [
      setTimeout(() => runStep(detonateRemainingPowerUps, playFireMode), FINALE_POWERUPS_DELAY_MS),
      setTimeout(() => runStep(popRemainingClusters, () => playPop(0, { fireMode: true, topStep: topStepOf(stateRef.current) })), FINALE_POP_DELAY_MS),
      setTimeout(() => setShowGameOver(true), FINALE_POP_DELAY_MS + GAME_OVER_DELAY_MS),
    ];
    return () => timers.forEach(clearTimeout);
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

      const topStep = topStepOf(nextState);
      switch (eventType) {
        case 'pop':
          // Pitch follows the fire meter, so it rises with the combo and drops when the meter does.
          playPop(nextState.comboCount - 1, { topStep });
          break;
        case 'fire_trigger':
          playPop(topStep, { topStep });
          playFireMode();
          break;
        case 'fire_blast':
          playPop(topStep, { fireMode: true, topStep });
          break;
        case 'bomb':
        case 'line_bomb':
        case 'color_burst':
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

  /** @param {import('../engine/gameLoop.js').BoosterType} booster */
  const onBoosterUse = useCallback(
    (booster) => {
      initAudio();
      if (!hasStarted) return;
      const next = activateBooster(stateRef.current, booster);
      if (next === stateRef.current) return;
      commit(next, Date.now());
      if (booster === 'shuffle') playPop(0);
    },
    [hasStarted, commit],
  );

  const restartGame = useCallback(() => {
    initAudio();
    commit(createInitialState(Math.random, difficulty), Date.now());
    setLastTap(null);
    setShowGameOver(false);
    setHoveredCellState(null);
    setHasStarted(true);
  }, [commit, difficulty]);

  /** @param {number|null} row  Pass null to clear. */
  const setHoveredCell = useCallback((row, col) => {
    setHoveredCellState((prev) => {
      if (row == null) return null;
      return prev && prev[0] === row && prev[1] === col ? prev : [row, col];
    });
  }, []);

  const hoveredBlastCells = useMemo(() => {
    if (!hoveredCell) return NO_CELLS;
    const [row, col] = hoveredCell;
    if (state.armedBooster === 'colorBurst') return getColorCells(state.board, row, col);
    // Fire Mode keeps its blast area hidden; bombs always preview theirs.
    return isSpecialTile(state.board[row][col]) ? getBlastCells(state.board, row, col) : NO_CELLS;
  }, [state.armedBooster, state.board, hoveredCell]);

  return {
    state,
    now,
    hasStarted,
    showGameOver,
    difficulty,
    setDifficulty,
    lastTap,
    onCellTap,
    onBoosterUse,
    restartGame,
    hoveredBlastCells,
    setHoveredCell,
  };
}
