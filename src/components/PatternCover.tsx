import { useId } from 'react';
import type { CoverVariant } from '../types';

const W = 320;
const H = 160;

const TREES = Array.from({ length: 24 }, (_, i) => ({
  x: i * 14 + ((i * 7) % 9),
  w: 2 + (i % 3),
  o: 0.12 + (i % 4) * 0.07,
}));

/** Generated cover art used in place of photos for course cards, club banners, etc. */
export function PatternCover({ color, variant, className }: { color: string; variant: CoverVariant; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shade = `shade${uid}`;
  const dots = `dots${uid}`;
  const grid = `grid${uid}`;

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={shade} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.14" />
          <stop offset="1" stopColor="#000" stopOpacity="0.2" />
        </linearGradient>
        <pattern id={dots} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="3" cy="3" r="1.5" fill="#fff" fillOpacity="0.35" />
        </pattern>
        <pattern id={grid} width="22" height="22" patternUnits="userSpaceOnUse">
          <path d="M22 0H0V22" fill="none" stroke="#fff" strokeOpacity="0.2" />
        </pattern>
      </defs>

      <rect width={W} height={H} fill={color} />

      {variant === 'dots' && (
        <>
          <rect width={W} height={H} fill={`url(#${dots})`} />
          <circle cx="250" cy="40" r="70" fill="#fff" fillOpacity="0.08" />
          <circle cx="60" cy="150" r="50" fill="#000" fillOpacity="0.1" />
        </>
      )}

      {variant === 'grid' && (
        <>
          <rect width={W} height={H} fill={`url(#${grid})`} />
          <path d="M0 160L160 0M80 160L240 0M160 160L320 0" stroke="#fff" strokeOpacity="0.12" strokeWidth="10" />
        </>
      )}

      {variant === 'circuit' && (
        <g fill="none" stroke="#fff" strokeWidth="1.5" strokeOpacity="0.45">
          <path d="M0 30h70l20 20h40M0 120h50l25-25h55M320 40h-80l-20 20h-30M320 125h-60l-20-20h-50M160 0v50M160 160v-50M100 160v-20l20-20M220 0v20l-20 20" />
          <rect x="130" y="50" width="60" height="60" rx="6" strokeOpacity="0.75" />
          <rect x="146" y="66" width="28" height="28" rx="3" />
          <g fill="#fff" fillOpacity="0.8" stroke="none">
            <circle cx="70" cy="30" r="3" />
            <circle cx="50" cy="120" r="3" />
            <circle cx="240" cy="40" r="3" />
            <circle cx="260" cy="125" r="3" />
            <circle cx="100" cy="140" r="3" />
            <circle cx="220" cy="20" r="3" />
          </g>
        </g>
      )}

      {variant === 'waves' && (
        <g fill="none" stroke="#fff" strokeWidth="2">
          {[40, 65, 90, 115, 140].map((y, i) => (
            <path
              key={y}
              d={`M0 ${y} C 80 ${y - 28}, 160 ${y + 28}, 320 ${y - 6}`}
              strokeOpacity={0.12 + i * 0.06}
            />
          ))}
        </g>
      )}

      {variant === 'topo' && (
        <g fill="none" stroke="#fff" strokeOpacity="0.22" strokeWidth="1.5">
          {[18, 38, 60, 84, 110, 138, 168].map((r) => (
            <ellipse key={r} cx="235" cy="70" rx={r * 1.25} ry={r * 0.8} transform="rotate(-12 235 70)" />
          ))}
        </g>
      )}

      {variant === 'forest' && (
        <>
          {TREES.map((t, i) => (
            <rect key={i} x={t.x} y="0" width={t.w} height={H} fill="#fff" fillOpacity={t.o} />
          ))}
          <rect y="115" width={W} height="45" fill="#000" fillOpacity="0.12" />
        </>
      )}

      <rect width={W} height={H} fill={`url(#${shade})`} />
    </svg>
  );
}
