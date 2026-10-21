import { Gem } from './Gems.jsx';
import { COLORS, FIRE_MODE_TRIGGER_COMBO, MIN_CLUSTER_SIZE, ROUND_DURATION_MS } from '../engine/constants.js';

/** @param {{ onStart: () => void }} props */
export default function StartScreen({ onStart }) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="flex max-w-xs flex-col items-center gap-4 text-center">
        <div className="flex gap-1.5">
          {COLORS.map((color) => (
            <Gem key={color} color={color} className="h-8 w-8 sm:h-10 sm:w-10" />
          ))}
        </div>
        <h2 className="bg-gradient-to-b from-white to-sky-300 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
          Diamond Dash
        </h2>
        <p className="text-sm text-white/70">
          Tap groups of {MIN_CLUSTER_SIZE}+ matching gems. Chain {FIRE_MODE_TRIGGER_COMBO} quick pops to ignite
          Magic Fire. You have {ROUND_DURATION_MS / 1000} seconds.
        </p>
        <button
          type="button"
          autoFocus
          onClick={onStart}
          className="w-full rounded-xl bg-gradient-to-b from-amber-300 to-orange-500 px-4 py-3 text-lg font-extrabold text-slate-950 shadow-lg shadow-orange-900/50 transition-transform hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-95"
        >
          Tap to Start
        </button>
      </div>
    </div>
  );
}
