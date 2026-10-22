# Gem Blitz — Core Gameplay Specification

## Purpose
Define the headless gameplay rules for a 60-second tile-popping round: board layout, cluster detection, gravity and replenishment, combo and Fire Mode, and procedural audio feedback. The engine (`src/engine/`) implements these rules as pure, deterministic functions. The UI layer only renders the engine's state and forwards input.

## Requirements

### Requirement: Board Grid
The board SHALL be a grid of exactly 10 columns by 9 rows. Each cell holds one of five colors: `'red'`, `'blue'`, `'green'`, `'purple'`, `'yellow'`, or `null` while it is empty during resolution. Coordinates are `[row, col]` with row `0` at the top.

#### Scenario: Board dimensions
- **WHEN** a new board is created
- **THEN** it has 9 rows, each containing 10 cells
- **AND** every cell holds one of the five colors

### Requirement: Cluster Detection
The engine SHALL find clusters with a breadth-first search over orthogonally adjacent cells (up, down, left, right) that share the tapped cell's color. A cluster is poppable only if it has at least 3 cells.

#### Scenario: Poppable cluster
- **WHEN** the player taps a cell whose same-color orthogonal component has 3 or more cells
- **THEN** the engine returns every `[row, col]` coordinate in that component

#### Scenario: Cluster too small
- **WHEN** the player taps a cell whose component has fewer than 3 cells
- **THEN** the engine returns an empty array and the board is unchanged
- **AND** the combo counter resets to 0 (miss penalty)

#### Scenario: Diagonal cells are not connected
- **WHEN** two same-color cells touch only diagonally
- **THEN** they are not part of the same cluster

#### Scenario: Invalid tap
- **WHEN** the tapped coordinate is out of bounds or the cell is empty
- **THEN** the engine returns an empty array

### Requirement: Gravity Collapse
After cells are cleared, each column SHALL collapse independently. Remaining gems fall straight down to fill empty cells and keep their relative order.

#### Scenario: Gems fall into gaps
- **WHEN** cells in a column are cleared
- **THEN** the gems above them shift down by the number of cleared cells below them
- **AND** all empty cells in that column end up contiguous at the top

### Requirement: Top Replenishment
After gravity, every empty cell SHALL be filled with a new gem, and the refilled board SHALL always contain at least one valid move. The color source is an injectable random function, so results are deterministic under a seeded generator.

- **Biased fill:** empty cells are filled bottom-up, left to right. Each new gem copies the color of an already-filled neighbor (below, left or right) with probability `REFILL_MATCH_BIAS` (0.45). Otherwise it picks uniformly from the five colors.
- **Guaranteed move:** if the filled board has no valid move, one connected triple (a cell plus two of its orthogonal neighbors, straight or L-shaped) is repainted a single random color. Triples made of the most newly filled cells are preferred, to minimize visible changes.

#### Scenario: Board is full after a pop
- **WHEN** a pop resolves (clear, collapse, refill)
- **THEN** the board contains no empty cells

#### Scenario: Stalemate is impossible
- **WHEN** a refill produces a board with no cluster of 3 or more
- **THEN** exactly one connected triple is repainted to a single color
- **AND** the board has at least one valid move

### Requirement: Round Timer
A round SHALL last 60 seconds. Input is ignored once the timer reaches 0.

### Requirement: Combo Streak
A successful pop SHALL increment the combo counter if it happens within 1.2 seconds of the previous successful pop. Otherwise the counter restarts at 1. A miss resets the counter to 0.

#### Scenario: Streak continues
- **WHEN** a successful pop happens 1.0 s after the previous successful pop
- **THEN** the combo counter increments by 1

#### Scenario: Streak lapses
- **WHEN** a successful pop happens more than 1.2 s after the previous one
- **THEN** the combo counter restarts at 1

### Requirement: Fire Mode
Fire Mode SHALL activate when the combo counter reaches 5. It lasts 5 seconds. While it is active:
- The player MUST still tap a valid cluster (3 or more connected same-color gems).
- Every gem in that cluster detonates its own 3x3 area (radius 1, including diagonals) at the same moment. The destroyed area is the deduplicated union of those squares, clipped to the board. It includes the cluster itself and sweeps away adjacent gems of any color.
- Points are awarded for every destroyed cell, multiplied by 2.
- Tapping a cluster smaller than 3 is a miss: nothing is destroyed and the combo counter resets to 0. Fire Mode stays active.

#### Scenario: Trigger
- **WHEN** the fifth consecutive successful pop lands inside the streak window
- **THEN** Fire Mode activates for 5 seconds

#### Scenario: Chained explosion
- **WHEN** the player taps a horizontal 3-gem cluster at `[4,3]`, `[4,4]`, `[4,5]` during Fire Mode
- **THEN** the 15 cells in rows 3–5, columns 2–6 are destroyed
- **AND** the score increases by `15 * POINTS_PER_GEM * 2`

#### Scenario: Edge explosion
- **WHEN** the player taps a 3-gem cluster along the top-left edge at `[0,0]`, `[0,1]`, `[0,2]` during Fire Mode
- **THEN** only the 8 in-bounds cells in rows 0–1, columns 0–3 are destroyed

#### Scenario: Miss during Fire Mode
- **WHEN** the player taps a cluster smaller than 3 during Fire Mode
- **THEN** nothing is destroyed, the combo counter resets to 0, and Fire Mode continues

#### Scenario: Expiry
- **WHEN** 5 seconds have passed since Fire Mode activated
- **THEN** Fire Mode ends and normal cluster rules apply again

### Requirement: Difficulty Modes
The player picks Easy, Medium or Hard before each round (`DIFFICULTIES` in `src/engine/constants.js`). Easy needs 5 consecutive successful moves to ignite Fire Mode and uses `REFILL_MATCH_BIAS` (0.40); Medium needs 7 with a bias of 0.34; Hard needs 9 with a bias of 0.28. The fire meter, pop pitch ladder and best score are all per difficulty. Detonating a bomb or line bomb is a successful move: outside Fire Mode it adds one to the streak (and can ignite Fire Mode) instead of resetting it.

### Requirement: Bomb Gem
Each gem replenished after a pop SHALL have a `BOMB_SPAWN_CHANCE` (1.2%) chance to be a bomb. A bomb is not a color: it never joins a cluster, and the refill bias never copies it. Tapping a bomb destroys the 5x5 area around it (`BOMB_RADIUS` = 2, clipped to the board) without needing a cluster. It awards `POINTS_PER_GEM` per destroyed cell plus `BOMB_BONUS_POINTS`, doubled in Fire Mode, and counts as a successful move for the combo streak.

#### Scenario: Bomb detonation
- **WHEN** the player taps a bomb at `[4,4]`
- **THEN** the 25 cells in rows 2–6, columns 2–6 are destroyed and the board collapses and refills

A bomb, line bomb or Fire Mode blast that reaches another bomb or line bomb detonates it too (chain reactions resolve fully, each special once, each awarding its bonus).

### Requirement: Line Bomb
A separate meter fills by the size of every normal (non-Fire) pop and drains `LINE_BOMB_MISS_DRAIN` on a miss. When it reaches `LINE_BOMB_METER_MAX` a line bomb replaces the gem at the tapped position. Tapping it destroys its entire column plus the entire bottom row, scoring `POINTS_PER_GEM` per cell plus `LINE_BOMB_BONUS_POINTS`.

### Requirement: Time Gem
Replenished gems have a `TIME_GEM_SPAWN_CHANCE` chance to be a time gem: a coloured gem that still matches its base colour. Every time gem destroyed by any means adds `TIME_GEM_BONUS_SECONDS` (2) to the round clock. At most one time gem exists at a time, a new one spawns no sooner than 8–10 seconds after the previous, and an unpopped one loses its badge (becoming a plain gem) after `TIME_GEM_LIFETIME_MS` (4s).

### Requirement: Wash Gem
Like the time gem, a wash gem is a coloured gem that still matches its base colour. It spawns at most once per 10–12 seconds (`WASH_GEM_COOLDOWN_*`), at most one exists at a time, and an unpopped one loses its badge after `WASH_GEM_LIFETIME_MS` (4s). Destroying it by any means splashes its own colour over the refilled board like a paint bucket: the board is split into four quadrants, and a random quadrant other than the one the gem was in receives an organic blob of adjacent gems (20–25% of the board's gems, limited by the quadrant's size) painted in that colour.

### Requirement: Boosters
Each round grants `STARTING_BOOSTERS`: Shuffle (rearranges the board) and Color Burst (armed, then destroys every gem of the tapped colour). Boosters never touch special tiles and always leave a valid move.

### Requirement: Round-End Finale
When the clock reaches 0, taps are ignored and the game-over screen waits for a finale. First every leftover power-up on the board activates at once (a wash gem splashes, then every bomb, line bomb, time gem and wash gem is destroyed, bombs chaining), then every remaining cluster of 3+ is popped at once for base points. The game-over screen appears `GAME_OVER_DELAY_MS` (1.5s) after the final refill. Best score is recorded after the bonus points.

### Requirement: Scoring
Each destroyed gem SHALL award `POINTS_PER_GEM` base points (defined in `src/engine/constants.js`), multiplied by `FIRE_MODE_SCORE_MULTIPLIER` while Fire Mode is active.

### Requirement: Procedural Audio Engine
Sound effects SHALL be synthesized at runtime with the Web Audio API. No sampled audio from the original game is used. Each pop plays a short oscillator tone with an attack/decay gain envelope. Its pitch follows the fire meter, one step per pip:
- Step `n` (0-based, `comboCount - 1`) plays at `baseFrequency * 2^(2n / 12)`, two semitones per step, up to step 4 when the meter fills.
- Fire Mode pops use a brighter timbre and always play the top step.
- The pitch tracks the visible meter, so it drops when a miss or lapsed streak empties the meter.

#### Scenario: Escalating pitch
- **WHEN** the combo counter goes from 2 to 3
- **THEN** the next pop plays two semitones higher than the previous one

#### Scenario: Fire Mode pitch
- **WHEN** Fire Mode is active
- **THEN** every pop plays the top pitch

#### Scenario: Audio unavailable
- **WHEN** the browser blocks or lacks an `AudioContext`
- **THEN** gameplay continues silently without errors
