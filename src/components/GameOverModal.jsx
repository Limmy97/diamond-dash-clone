import DifficultyPicker from './DifficultyPicker.jsx';

/**
 * @param {Object} props
 * @param {number} props.score
 * @param {number} props.best
 * @param {boolean} props.isNewBest
 * @param {string} props.difficulty
 * @param {(difficulty: string) => void} props.onDifficultyChange
 * @param {() => void} props.onPlayAgain
 */
export default function GameOverModal({ score, best, isNewBest, difficulty, onDifficultyChange, onPlayAgain }) {
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-over-title"
    >
      <div className="flex w-full max-w-xs flex-col items-center gap-3 rounded-2xl bg-slate-900 p-6 text-center shadow-2xl ring-1 ring-white/15 motion-safe:animate-gem-drop">
        <h2 id="game-over-title" className="text-sm font-bold uppercase tracking-[0.3em] text-white/60">
          Time&rsquo;s up!
        </h2>
        <p className="text-5xl font-black tabular-nums text-amber-300">{score.toLocaleString()}</p>
        {isNewBest ? (
          <span className="rounded-full bg-gradient-to-r from-amber-400 to-orange-500 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-slate-950 shadow-[0_0_16px_rgba(251,191,36,0.6)]">
            New best!
          </span>
        ) : (
          <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-sky-300">
            Best {best.toLocaleString()}
          </span>
        )}
        <DifficultyPicker value={difficulty} onChange={onDifficultyChange} />
        <button
          type="button"
          autoFocus
          onClick={onPlayAgain}
          className="mt-2 w-full rounded-xl bg-gradient-to-b from-sky-400 to-blue-600 px-4 py-3 text-lg font-extrabold text-white shadow-lg shadow-blue-900/50 transition-transform hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}
