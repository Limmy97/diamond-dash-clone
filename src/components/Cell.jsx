import { memo } from 'react';
import { Gem } from './Gems.jsx';

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
      aria-label={`${color === 'bomb' ? 'bomb' : `${color} gem`}, row ${row + 1}, column ${col + 1}`}
      onPointerDown={() => onTap(row, col)}
      onPointerEnter={() => onHover(row, col)}
      className={`group relative flex items-center justify-center rounded-md outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-white/70 ${
        isBlastTarget ? 'bg-orange-400/35 ring-2 ring-orange-300/80' : 'bg-white/[0.04]'
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
