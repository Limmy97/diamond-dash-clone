import { DIFFICULTIES } from '../engine/constants.js';

/**
 * Easy / Medium / Hard selector.
 *
 * @param {Object} props
 * @param {string} props.value Selected difficulty key.
 * @param {(difficulty: string) => void} props.onChange
 */
export default function DifficultyPicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Difficulty" className="grid w-full grid-cols-3 gap-1.5">
      {Object.entries(DIFFICULTIES).map(([key, { label, fireTrigger }]) => {
        const isSelected = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => onChange(key)}
            className={`flex flex-col items-center rounded-lg px-2 py-1.5 ring-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white ${
              isSelected ? 'bg-amber-400/25 ring-amber-300' : 'bg-white/5 ring-white/15 hover:bg-white/10'
            }`}
          >
            <span className={`text-sm font-bold ${isSelected ? 'text-amber-200' : 'text-white/80'}`}>{label}</span>
            <span className="text-[0.65rem] text-white/50">{fireTrigger} to fire</span>
          </button>
        );
      })}
    </div>
  );
}
