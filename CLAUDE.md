# Diamond Dash Web Clone (React + Vite)

## Tech Stack & Tooling
- Framework: React 18+ (Plain JavaScript / JSX)
- Bundler: Vite
- Styling: Tailwind CSS
- Unit Testing: Vitest
- State Strategy: Functional components, custom hooks, pure decoupled engine

## Build & Test Commands
- Dev Server: `npm run dev`
- Run Tests: `npm test` (or `npx vitest run`)
- Single Test: `npx vitest run src/tests/<filename>.test.js`
- Lint: `npm run lint`
- Production Build: `npm run build`

## Architecture & Separation of Concerns
1. **Engine Layer (`src/engine/`):**
   - Strictly PURE JavaScript functions with ZERO React hooks, DOM references, or browser globals.
   - All state transitions (board manipulation, cluster finding, gravity settling) must be deterministic.
   - Any modifications to `src/engine/` MUST be verified against `npm test` before touching React components.

2. **UI & State Layer (`src/hooks/`, `src/components/`):**
   - Use `useGameEngine.js` to manage the central tick, round timer, and current board state.
   - Use `pointerdown` events instead of `click` to eliminate the 300ms mobile touch delay.
   - Handle visual animations via CSS transitions and Tailwind classes rather than third-party canvas engines.

3. **Asset References:**
   - Keep all static sounds and images inside `public/`.
   - Reference static assets using root-relative paths (`/sfx/pop.mp3`, `/gems/red.png`).

## Game Rules & Balancing Defaults
- Board Grid: Exactly 10 columns by 9 rows.
- Colors: 5 distinct colors ('red', 'blue', 'green', 'purple', 'yellow').
- Minimum Cluster Size: >= 3 matching orthogonal gems for a standard pop.
- Miss Penalty: Clicking a cluster of < 3 resets the combo counter to 0.
- Round Duration: 60 seconds.
- Magic Fire / Fever Mode:
  - Fills after 5 consecutive successful pops within 1.2 seconds of each other.
  - Active for 5 seconds.
  - In Fever Mode, the player must still tap a valid cluster (>= 3). Every gem in that cluster detonates its own 3x3 area; the deduplicated union of those areas is destroyed and scores 2x points. A cluster of < 3 is a miss.

## Coding Style & Guardrails
- Plain ES modules (`import`/`export`).
- No TypeScript files (`.ts`/`.tsx`). Use clear variable names and JSDoc comments where helpful.
- Keep components small and modular. Never combine the game engine and UI components in the same file.
- Dependencies: Keep external npm packages minimal. Prefer vanilla React and Tailwind CSS. Do not install component UI libraries (such as MUI, Chakra, or Ant Design) or canvas engines unless explicitly asked.
