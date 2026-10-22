import { memo } from 'react';
import { baseColor, isTimeGem, isWashGem } from '../engine/constants.js';
import { Gem } from './Gems.jsx';

const TILE_LABELS = { bomb: 'bomb', line_bomb: 'line bomb' };

/** Faint tile background per gem colour, matching the gem sitting on it. */
const TILE_TINTS = {
  red: 'bg-rose-500/20',
  blue: 'bg-sky-500/20',
  green: 'bg-emerald-500/20',
  purple: 'bg-violet-500/20',
  yellow: 'bg-amber-400/20',
  bomb: 'bg-zinc-400/20',
  line_bomb: 'bg-cyan-400/20',
};

/**
 * One board cell. Memoised: only cells whose props change re-render.
 *
 * @param {Object} props
 * @param {string} props.color
 * @param {number} props.row
 * @param {number} props.col
 * @param {number} props.dropKey  Non-zero when this cell's gem just changed; remounts it to replay the drop-in.
 * @param {number} props.burstKey Non-zero when this cell was just cleared.
 * @param {number} props.shakeKey Non-zero when this cell was the target of a miss.
 * @param {boolean} props.isBlastTarget
 * @param {(row: number, col: number) => void} props.onTap
 * @param {(row: number, col: number) => void} props.onHover
 */
function Cell({ color, row, col, dropKey, burstKey, shakeKey, isBlastTarget, onTap, onHover }) {
  const animation = shakeKey ? 'motion-safe:animate-shake' : dropKey ? 'motion-safe:animate-gem-drop' : '';

  return (
    <button
      type="button"
      aria-label={`${TILE_LABELS[color] ?? `${baseColor(color)} gem${isTimeGem(color) ? ' (+2 seconds)' : isWashGem(color) ? ' (color wash)' : ''}`}, row ${row + 1}, column ${col + 1}`}
      onPointerDown={() => onTap(row, col)}
      onPointerEnter={() => onHover(row, col)}
      className={`group relative flex items-center justify-center outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/70 ${
        isBlastTarget ? 'bg-orange-400/35 ring-2 ring-inset ring-orange-300/80' : TILE_TINTS[baseColor(color)] ?? 'bg-white/[0.04]'
      }`}
    >
      {burstKey > 0 && (
        <span
          key={`burst-${burstKey}`}
          className="pointer-events-none absolute inset-[10%] rounded-full bg-white/70 motion-safe:animate-burst motion-reduce:hidden"
        />
      )}
      <span key={`${dropKey}:${shakeKey}`} className={`flex h-[86%] w-[86%] ${animation}`}>
        <Gem color={color} className="h-full w-full transition-transform duration-100 group-active:scale-90" />
      </span>
    </button>
  );
}

export default memo(Cell);
