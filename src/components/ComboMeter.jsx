import { FIRE_MODE_DURATION_MS, FIRE_MODE_TRIGGER_COMBO } from '../engine/constants.js';

/** @param {{ lit: boolean, burning: boolean }} props */
function FlamePip({ lit, burning }) {
  return (
    <svg
      viewBox="0 0 24 32"
      className={`h-6 w-5 transition-all duration-200 sm:h-7 sm:w-6 ${
        lit ? 'scale-100 drop-shadow-[0_0_6px_rgba(251,146,60,0.9)]' : 'scale-90 opacity-30'
      } ${burning ? 'motion-safe:animate-flame' : ''}`}
      aria-hidden="true"
    >
      <path
        d="M12 1C14 8 21 11 21 20A9 9 0 0 1 3 20C3 14 7 12 8 7 10 10 10 12 11 13 12 9 12 5 12 1Z"
        fill={lit ? '#fb923c' : '#64748b'}
      />
      {lit && <path d="M12 14C14 18 16 19 16 23A4 4 0 0 1 8 23C8 20 10 19 12 14Z" fill="#fde68a" />}
    </svg>
  );
}

/**
 * @param {Object} props
 * @param {number} props.comboCount
 * @param {boolean} props.isFireMode
 * @param {number} props.fireTimeLeftMs
 */
export default function ComboMeter({ comboCount, isFireMode, fireTimeLeftMs }) {
  const lit = isFireMode ? FIRE_MODE_TRIGGER_COMBO : Math.min(comboCount, FIRE_MODE_TRIGGER_COMBO);
  const fireFraction = isFireMode ? Math.max(0, Math.min(1, fireTimeLeftMs / FIRE_MODE_DURATION_MS)) : 0;

  return (
    <div
      className={`relative flex items-center justify-between gap-3 overflow-hidden rounded-xl px-3 py-1.5 ring-1 transition-colors duration-300 ${
        isFireMode ? 'bg-orange-500/20 ring-orange-400/70' : 'bg-white/5 ring-white/10'
      }`}
      role="status"
      aria-live="polite"
      aria-label={isFireMode ? 'Magic Fire active' : `Combo ${comboCount} of ${FIRE_MODE_TRIGGER_COMBO}`}
    >
      {isFireMode && (
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-orange-500/40 to-amber-300/30"
          style={{ width: `${fireFraction * 100}%` }}
        />
      )}
      <span
        className={`relative text-xs font-bold uppercase tracking-widest sm:text-sm ${
          isFireMode ? 'text-amber-200' : 'text-white/60'
        }`}
      >
        {isFireMode ? 'Magic Fire!' : `Combo ×${comboCount}`}
      </span>
      <div className="relative flex gap-1">
        {Array.from({ length: FIRE_MODE_TRIGGER_COMBO }, (_, i) => (
          <FlamePip key={i} lit={i < lit} burning={isFireMode} />
        ))}
      </div>
    </div>
  );
}
