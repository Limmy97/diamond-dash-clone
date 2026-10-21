/**
 * Original SVG gem artwork (clean-room; see docs/reverse_engineering.md).
 * Render <GemDefs /> once per page; every <Gem /> references its gradients by id.
 */

/** [light, mid, dark] shades per colour. */
const PALETTE = {
  red: ['#ff8a9a', '#f0243f', '#7d0a1d'],
  blue: ['#8fd3ff', '#1f7ae0', '#0b3478'],
  green: ['#8ff7ad', '#17b45c', '#0a5a2c'],
  purple: ['#dcb2ff', '#8a3cf0', '#3f1384'],
  yellow: ['#fff3a0', '#ffc21a', '#9a6200'],
  bomb: ['#9ca3af', '#27272a', '#09090b'],
};

const fill = (color) => `url(#gem-${color}-fill)`;
const stroke = (color) => PALETTE[color][2];

const SHAPES = {
  // Ruby heart
  red: (
    <>
      <path
        d="M50 88C22 68 7 51 10 32 13 15 34 8 50 25 66 8 87 15 90 32 93 51 78 68 50 88Z"
        fill={fill('red')}
        stroke={stroke('red')}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M50 25 50 70M22 36 50 70 78 36" stroke="#fff" strokeOpacity=".22" strokeWidth="2" fill="none" />
      <ellipse cx="30" cy="30" rx="10" ry="6" transform="rotate(-35 30 30)" fill="#fff" opacity=".6" />
    </>
  ),
  // Brilliant-cut sapphire
  blue: (
    <>
      <path
        d="M28 14H72L92 38 50 92 8 38Z"
        fill={fill('blue')}
        stroke={stroke('blue')}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path
        d="M8 38H92M28 14 38 38 50 14 62 38 72 14M38 38 50 92 62 38"
        stroke="#fff"
        strokeOpacity=".3"
        strokeWidth="2"
        fill="none"
        strokeLinejoin="round"
      />
      <path d="M30 18H46L37 33Z" fill="#fff" opacity=".6" />
    </>
  ),
  // Step-cut emerald
  green: (
    <>
      <path
        d="M30 10H70L88 28V72L70 90H30L12 72V28Z"
        fill={fill('green')}
        stroke={stroke('green')}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M38 26H62L72 36V64L62 74H38L28 64V36Z" fill="#fff" opacity=".16" />
      <path
        d="M30 10 38 26M70 10 62 26M88 28 72 36M88 72 72 64M70 90 62 74M30 90 38 74M12 72 28 64M12 28 28 36"
        stroke="#fff"
        strokeOpacity=".28"
        strokeWidth="2"
      />
      <rect x="34" y="16" width="20" height="5" rx="2.5" fill="#fff" opacity=".6" />
    </>
  ),
  // Amethyst pentagon
  purple: (
    <>
      <path
        d="M50 10 91 40 75 88H25L9 40Z"
        fill={fill('purple')}
        stroke={stroke('purple')}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M50 30 70 45 62 70H38L30 45Z" fill="#fff" opacity=".15" />
      <path
        d="M50 10 50 30M91 40 70 45M75 88 62 70M25 88 38 70M9 40 30 45"
        stroke="#fff"
        strokeOpacity=".3"
        strokeWidth="2"
      />
      <path d="M48 16 30 30 24 44Z" fill="#fff" opacity=".55" />
    </>
  ),
  // Sun citrine
  yellow: (
    <>
      <g fill={PALETTE.yellow[1]} stroke={stroke('yellow')} strokeWidth="2" strokeLinejoin="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
          <path key={deg} d="M50 3 57 17H43Z" transform={`rotate(${deg} 50 50)`} />
        ))}
      </g>
      <circle cx="50" cy="50" r="30" fill={fill('yellow')} stroke={stroke('yellow')} strokeWidth="3" />
      <circle cx="50" cy="50" r="19" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
      <ellipse cx="38" cy="37" rx="9" ry="5.5" transform="rotate(-35 38 37)" fill="#fff" opacity=".65" />
    </>
  ),
  // Bomb: dark sphere, metal cap, fuse and spark
  bomb: (
    <>
      <circle cx="46" cy="58" r="32" fill={fill('bomb')} stroke={stroke('bomb')} strokeWidth="3" />
      <rect x="56" y="20" width="16" height="12" rx="3" transform="rotate(40 64 26)" fill="#52525b" stroke="#09090b" strokeWidth="2.5" />
      <path d="M68 20Q74 8 84 12" fill="none" stroke="#a16207" strokeWidth="4" strokeLinecap="round" />
      <path
        d="M86 2 88.5 9 95 7 90.5 12.5 96 17 89 16.5 87 23 84.5 16.5 78 18 82.5 12 78 7 85 8.5Z"
        fill="#fde047"
        stroke="#f97316"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <ellipse cx="32" cy="44" rx="10" ry="6" transform="rotate(-35 32 44)" fill="#fff" opacity=".35" />
    </>
  ),
};

/** Shared gradient definitions. Render once, anywhere in the document. */
export function GemDefs() {
  return (
    <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
      <defs>
        {Object.entries(PALETTE).map(([color, [light, mid, dark]]) => (
          <radialGradient key={color} id={`gem-${color}-fill`} cx="35%" cy="30%" r="80%">
            <stop offset="0%" stopColor={light} />
            <stop offset="55%" stopColor={mid} />
            <stop offset="100%" stopColor={dark} />
          </radialGradient>
        ))}
      </defs>
    </svg>
  );
}

/**
 * @param {Object} props
 * @param {'red'|'blue'|'green'|'purple'|'yellow'|'bomb'} props.color
 * @param {string} [props.className]
 */
export function Gem({ color, className = '' }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)] ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      {SHAPES[color]}
    </svg>
  );
}
