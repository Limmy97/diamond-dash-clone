import { memo, useMemo } from 'react';
import Cell from './Cell.jsx';
import { GemDefs } from './Gems.jsx';

const key = (r, c) => `${r},${c}`;

/**
 * @param {Object} props
 * @param {import('../engine/gameLoop.js').Board} props.board
 * @param {boolean} props.isFireMode
 * @param {import('../hooks/useGameEngine.js').LastTap|null} props.lastTap
 * @param {import('../engine/gameLoop.js').Coord[]} props.hoveredBlastCells
 * @param {(row: number, col: number) => void} props.onCellTap
 * @param {(row: number|null, col?: number) => void} props.onHoverCell
 */
function Grid({ board, isFireMode, lastTap, hoveredBlastCells, onCellTap, onHoverCell }) {
  const cols = board[0].length;

  const blastSet = useMemo(
    () => new Set(hoveredBlastCells.map(([r, c]) => key(r, c))),
    [hoveredBlastCells],
  );

  // Gravity changes every cell at or above the lowest cleared cell in each column.
  const { lowestCleared, clearedSet } = useMemo(() => {
    const lowest = new Array(cols).fill(-1);
    const cleared = new Set();
    for (const [r, c] of lastTap?.clearedCells ?? []) {
      lowest[c] = Math.max(lowest[c], r);
      cleared.add(key(r, c));
    }
    return { lowestCleared: lowest, clearedSet: cleared };
  }, [lastTap, cols]);

  const tapId = lastTap?.id ?? 0;
  const isMiss = lastTap?.eventType === 'miss';

  return (
    <div
      className={`grid aspect-[10/9] w-full touch-manipulation select-none gap-[2px] rounded-2xl p-1.5 ring-2 transition-[box-shadow,background-color] duration-300 sm:gap-1 sm:p-2 ${
        isFireMode
          ? 'bg-orange-950/60 shadow-[0_0_32px_rgba(251,146,60,0.55)] ring-orange-400'
          : 'bg-slate-900/70 shadow-xl shadow-black/40 ring-white/10'
      }`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      onPointerLeave={() => onHoverCell(null)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <GemDefs />
      {board.map((rowCells, r) =>
        rowCells.map((color, c) => (
          <Cell
            key={key(r, c)}
            row={r}
            col={c}
            color={color}
            dropKey={r <= lowestCleared[c] ? tapId : 0}
            burstKey={clearedSet.has(key(r, c)) ? tapId : 0}
            shakeKey={isMiss && lastTap.row === r && lastTap.col === c ? tapId : 0}
            isBlastTarget={blastSet.has(key(r, c))}
            onTap={onCellTap}
            onHover={onHoverCell}
          />
        )),
      )}
    </div>
  );
}

export default memo(Grid);
