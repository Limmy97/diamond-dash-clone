const WARNING_SECONDS = 10;

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {import('react').ReactNode} props.children
 * @param {string} [props.className]
 */
function Stat({ label, children, className = '' }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-white/5 px-2 py-1.5 ring-1 ring-white/10">
      <span className="text-[0.65rem] font-semibold uppercase tracking-widest text-white/50">{label}</span>
      <span className={`text-xl font-extrabold tabular-nums sm:text-2xl ${className}`}>{children}</span>
    </div>
  );
}

/**
 * @param {Object} props
 * @param {number} props.timeRemaining Seconds.
 * @param {number} props.score
 * @param {number} props.best
 */
export default function Header({ timeRemaining, score, best }) {
  const seconds = Math.ceil(timeRemaining);
  const isLow = seconds <= WARNING_SECONDS;
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <header className="grid grid-cols-3 gap-2">
      <Stat label="Time" className={isLow ? 'text-rose-400 motion-safe:animate-pulse' : 'text-white'}>
        {clock}
      </Stat>
      <Stat label="Score" className="text-amber-300">
        {score.toLocaleString()}
      </Stat>
      <Stat label="Best" className="text-sky-300">
        {Math.max(best, score).toLocaleString()}
      </Stat>
    </header>
  );
}
