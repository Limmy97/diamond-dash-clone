import { LINE_BOMB_METER_MAX } from '../engine/constants.js';
import { Gem } from './Gems.jsx';

/**
 * @param {Object} props
 * @param {string} props.label
 * @param {string} props.icon       Glyph shown on the button.
 * @param {number} props.charges
 * @param {boolean} props.isArmed
 * @param {() => void} props.onUse
 */
function BoosterButton({ label, icon, charges, isArmed, onUse }) {
  return (
    <button
      type="button"
      disabled={charges === 0}
      aria-pressed={isArmed}
      aria-label={`${label}, ${charges} left`}
      onPointerDown={onUse}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-lg ring-1 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-90 disabled:opacity-30 sm:h-10 sm:w-10 ${
        isArmed ? 'bg-amber-400/30 ring-amber-300' : 'bg-white/10 ring-white/20 hover:bg-white/20'
      }`}
    >
      <span aria-hidden="true">{icon}</span>
      <span
        aria-hidden="true"
        className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-950 px-1 text-[10px] font-bold text-white ring-1 ring-white/30"
      >
        {charges}
      </span>
    </button>
  );
}

/**
 * Line-bomb progress bar plus the per-round booster buttons.
 *
 * @param {Object} props
 * @param {number} props.lineBombMeter
 * @param {{ shuffle: number, colorBurst: number }} props.boosters
 * @param {import('../engine/gameLoop.js').BoosterType|null} props.armedBooster
 * @param {(booster: import('../engine/gameLoop.js').BoosterType) => void} props.onBoosterUse
 */
export default function PowerBar({ lineBombMeter, boosters, armedBooster, onBoosterUse }) {
  const fraction = Math.min(1, lineBombMeter / LINE_BOMB_METER_MAX);

  return (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
      <Gem color="line_bomb" className="h-7 w-7 shrink-0" />
      <div
        className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10"
        role="progressbar"
        aria-label="Line bomb progress"
        aria-valuemin={0}
        aria-valuemax={LINE_BOMB_METER_MAX}
        aria-valuenow={lineBombMeter}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-sky-200 transition-[width] duration-200"
          style={{ width: `${fraction * 100}%` }}
        />
      </div>
      <BoosterButton
        label="Shuffle"
        icon="🔀"
        charges={boosters.shuffle}
        isArmed={false}
        onUse={() => onBoosterUse('shuffle')}
      />
      <BoosterButton
        label="Color Burst"
        icon="🎨"
        charges={boosters.colorBurst}
        isArmed={armedBooster === 'colorBurst'}
        onUse={() => onBoosterUse('colorBurst')}
      />
    </div>
  );
}
