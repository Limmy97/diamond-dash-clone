import ComboMeter from './components/ComboMeter.jsx';
import GameOverModal from './components/GameOverModal.jsx';
import Grid from './components/Grid.jsx';
import Header from './components/Header.jsx';
import PowerBar from './components/PowerBar.jsx';
import StartScreen from './components/StartScreen.jsx';
import { DIFFICULTIES } from './engine/constants.js';
import { useBestScore } from './hooks/useBestScore.js';
import { useGameEngine } from './hooks/useGameEngine.js';

/**
 * Column width: fill the viewport on phones, cap on desktop, and shrink on
 * short screens so the 10:9 board plus header, combo meter and power bar (~14rem) always fit.
 */
const COLUMN_WIDTH = 'min(100%, 34rem, calc((100svh - 14rem) * 10 / 9))';

export default function App() {
  const { state, now, hasStarted, showGameOver, difficulty, setDifficulty, lastTap, onCellTap, onBoosterUse, restartGame, hoveredBlastCells, setHoveredCell } =
    useGameEngine();
  const { best, isNewBest } = useBestScore(state.score, showGameOver, difficulty);

  const fireTimeLeftMs = state.isFireMode ? Math.max(0, state.fireModeExpiry - now) : 0;

  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-3">
      <div className="flex flex-col gap-2 sm:gap-3" style={{ width: COLUMN_WIDTH }}>
        <h1 className="sr-only">Gem Blitz</h1>
        <Header timeRemaining={state.timeRemaining} score={state.score} best={best} />
        <ComboMeter comboCount={state.comboCount} isFireMode={state.isFireMode} fireTimeLeftMs={fireTimeLeftMs}
          trigger={DIFFICULTIES[state.difficulty].fireTrigger}
        />
        <div className="relative">
          <Grid
            board={state.board}
            isFireMode={state.isFireMode}
            lastTap={lastTap}
            hoveredBlastCells={hoveredBlastCells}
            onCellTap={onCellTap}
            onHoverCell={setHoveredCell}
          />
          {!hasStarted && (
            <StartScreen onStart={restartGame} difficulty={difficulty} onDifficultyChange={setDifficulty} />
          )}
          {hasStarted && showGameOver && (
            <GameOverModal
              score={state.score}
              best={best}
              isNewBest={isNewBest}
              difficulty={difficulty}
              onDifficultyChange={setDifficulty}
              onPlayAgain={restartGame}
            />
          )}
        </div>
        <PowerBar
          lineBombMeter={state.lineBombMeter}
          boosters={state.boosters}
          armedBooster={state.armedBooster}
          onBoosterUse={onBoosterUse}
        />
      </div>
    </main>
  );
}
