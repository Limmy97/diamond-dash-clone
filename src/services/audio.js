/**
 * Procedural Web Audio sound effects. No audio files are loaded.
 * Every function is a silent no-op until initAudio() has succeeded,
 * so gameplay never depends on audio being available.
 */

/** Base pitch for combo step 0 (A4). */
const POP_BASE_FREQUENCY = 440;

/** Total climb across the meter, so every difficulty spans the same pitch range. */
const PITCH_SPAN_SEMITONES = 8;

/** Top pitch step for the default 5-pip meter. */
const DEFAULT_TOP_STEP = 4;

const MASTER_VOLUME = 0.3;

/** @type {AudioContext|null} */
let ctx = null;
/** @type {GainNode|null} */
let master = null;

/**
 * Frequency for a meter step, spread evenly over PITCH_SPAN_SEMITONES from step 0
 * to `topStep` (the pop that fills the meter). Fire Mode is always the top.
 *
 * @param {number} comboStep 0-based step (comboCount - 1).
 * @param {boolean} [fireMode=false]
 * @param {number} [topStep=DEFAULT_TOP_STEP] Fire trigger count minus one.
 * @returns {number}
 */
export function getPopFrequency(comboStep, fireMode = false, topStep = DEFAULT_TOP_STEP) {
  const step = fireMode ? topStep : Math.min(Math.max(0, Math.floor(comboStep) || 0), topStep);
  return POP_BASE_FREQUENCY * 2 ** (((step / topStep) * PITCH_SPAN_SEMITONES) / 12);
}

/**
 * Creates (or resumes) the AudioContext. Call from a user-gesture handler such
 * as pointerdown so browser autoplay policies allow it.
 *
 * @returns {boolean} Whether audio is available.
 */
export function initAudio() {
  try {
    if (!ctx) {
      const AudioContextClass =
        typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AudioContextClass) return false;
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  } catch {
    ctx = null;
    master = null;
    return false;
  }
}

/**
 * Schedules one oscillator voice with an exponential frequency sweep and a
 * quick attack / exponential decay envelope.
 *
 * @param {Object} voice
 * @param {OscillatorType} voice.type
 * @param {number} voice.from Start frequency (Hz).
 * @param {number} voice.to End frequency (Hz).
 * @param {number} voice.duration Seconds.
 * @param {number} voice.peak Peak gain (0-1).
 * @param {number} [voice.delay=0] Seconds from now.
 * @param {AudioNode} [voice.output=master]
 */
function playVoice({ type, from, to, duration, peak, delay = 0, output = master }) {
  const start = ctx.currentTime + delay;
  const end = start + duration;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, end);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);

  osc.connect(gain).connect(output);
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
  osc.start(start);
  osc.stop(end + 0.01);
}

/**
 * Short upward chirp whose pitch follows the fire meter.
 *
 * @param {number} comboStep 0-based step (e.g. comboCount - 1).
 * @param {Object} [options]
 * @param {boolean} [options.fireMode=false] Brighter timbre, always at the top pitch.
 * @param {number} [options.topStep] Highest step on the current difficulty's meter.
 */
export function playPop(comboStep, { fireMode = false, topStep } = {}) {
  if (!ctx) return;
  const freq = getPopFrequency(comboStep, fireMode, topStep);
  playVoice({
    type: fireMode ? 'square' : 'triangle',
    from: freq,
    to: freq * 1.5,
    duration: 0.08,
    peak: fireMode ? 0.35 : 0.6,
  });
}

/** Rising root + fifth sawtooth sweep through an opening low-pass filter. */
export function playFireMode() {
  if (!ctx) return;
  const now = ctx.currentTime;
  const duration = 0.5;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(6000, now + duration);
  filter.connect(master);

  playVoice({ type: 'sawtooth', from: 220, to: 440, duration, peak: 0.4, output: filter });
  playVoice({ type: 'sawtooth', from: 330, to: 660, duration, peak: 0.3, output: filter });

  setTimeout(() => filter.disconnect(), (duration + 0.1) * 1000);
}

/** Low, short downward buzz for a broken streak. */
export function playMiss() {
  if (!ctx) return;
  playVoice({ type: 'square', from: 140, to: 70, duration: 0.15, peak: 0.25 });
}
