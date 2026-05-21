/**
 * icons.tsx — petite bibliothèque SVG d'icônes line-style.
 * --------------------------------------------------------
 * Toutes les icônes ont la même grille (24×24, stroke 1.6) pour conserver
 * une cohérence visuelle stricte sur l'ensemble du HUD. On reste monochrome
 * et on hérite la couleur via `currentColor` — la classe CSS gère le tint.
 */

interface IconProps { size?: number; className?: string; }

const wrap = (children: any, size = 18, className?: string) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.6}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    {children}
  </svg>
);

export const IconBuild = (p: IconProps) => wrap(
  <>
    <path d="M3 21V10l9-7 9 7v11" />
    <path d="M9 21v-7h6v7" />
  </>,
  p.size, p.className,
);

export const IconWeapon = (p: IconProps) => wrap(
  <>
    <path d="M12 2v6" />
    <path d="M9 8h6l-1 4h-4z" />
    <path d="M10 12v9" />
    <path d="M14 12v9" />
    <path d="M8 18h8" />
  </>,
  p.size, p.className,
);

export const IconNaval = (p: IconProps) => wrap(
  <>
    <path d="M12 3v15" />
    <circle cx={12} cy={5} r={2} />
    <path d="M8 8h8" />
    <path d="M4 18c2 2 5 3 8 3s6-1 8-3" />
    <path d="M6 16h12" />
  </>,
  p.size, p.className,
);

export const IconDiplomacy = (p: IconProps) => wrap(
  <>
    <path d="M5 9l3-3h8l3 3" />
    <path d="M5 9v9a2 2 0 002 2h10a2 2 0 002-2V9" />
    <path d="M9 14h6" />
    <path d="M12 11v6" />
  </>,
  p.size, p.className,
);

export const IconLeaderboard = (p: IconProps) => wrap(
  <>
    <path d="M4 20V10" />
    <path d="M12 20V4" />
    <path d="M20 20v-7" />
  </>,
  p.size, p.className,
);

export const IconSettings = (p: IconProps) => wrap(
  <>
    <circle cx={12} cy={12} r={3} />
    <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
  </>,
  p.size, p.className,
);

export const IconGold = (p: IconProps) => wrap(
  <><circle cx={12} cy={12} r={8} /><path d="M9 9h4a2 2 0 010 4H9z" /><path d="M9 13h4.5a2 2 0 010 4H9z" /></>,
  p.size, p.className,
);

export const IconArmy = (p: IconProps) => wrap(
  <>
    <path d="M3 21l3-3 3 3" />
    <path d="M15 21l3-3 3 3" />
    <path d="M9 21V12a3 3 0 016 0v9" />
    <path d="M9 12l-3-3 3-2 3 3 3-3 3 2-3 3" />
  </>,
  p.size, p.className,
);

export const IconPopulation = (p: IconProps) => wrap(
  <>
    <circle cx={9} cy={8} r={3} />
    <path d="M3 20c1-3 3-5 6-5s5 2 6 5" />
    <circle cx={17} cy={9} r={2.5} />
    <path d="M15 14c2 0 4 2 5 4" />
  </>,
  p.size, p.className,
);

export const IconGlobe = (p: IconProps) => wrap(
  <>
    <circle cx={12} cy={12} r={9} />
    <path d="M3 12h18" />
    <path d="M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
  </>,
  p.size, p.className,
);

export const IconChevron = (p: IconProps) => wrap(<path d="M6 9l6 6 6-6" />, p.size, p.className);

export const IconClose = (p: IconProps) => wrap(<><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>, p.size, p.className);

export const IconPlay = (p: IconProps) => wrap(<path d="M7 5v14l12-7z" fill="currentColor" />, p.size, p.className);

export const IconBack = (p: IconProps) => wrap(<path d="M15 6l-6 6 6 6" />, p.size, p.className);

/* ─── Building & weapon icons ─── Casino royal × tactique ───────────── */

interface FullIconProps { size?: number; className?: string; }

/** Wrapper SVG plein-couleur 64×64 (différent du wrap monochrome au-dessus). */
function fullIcon(size: number | undefined, className: string | undefined, children: any) {
  return (
    <svg
      width={size ?? 24}
      height={size ?? 24}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
    >
      {children}
    </svg>
  );
}

export const CityIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={54} rx={20} ry={3} fill="#5a3a0a" opacity={0.6} />
    <rect x={22} y={22} width={20} height={28} rx={2} fill="url(#bldg-city-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    {/* Windows */}
    <rect x={25} y={26} width={3} height={3} fill="#ffd247" />
    <rect x={31} y={26} width={3} height={3} fill="#ffd247" />
    <rect x={37} y={26} width={3} height={3} fill="#1a0408" />
    <rect x={25} y={32} width={3} height={3} fill="#ffd247" />
    <rect x={31} y={32} width={3} height={3} fill="#1a0408" />
    <rect x={37} y={32} width={3} height={3} fill="#ffd247" />
    <rect x={25} y={38} width={3} height={3} fill="#ffd247" />
    <rect x={31} y={38} width={3} height={3} fill="#ffd247" />
    <rect x={37} y={38} width={3} height={3} fill="#ffd247" />
    {/* Door */}
    <rect x={29} y={44} width={6} height={6} rx={1} fill="#5a3a0a" />
    {/* Marquee bulbs */}
    <circle cx={22} cy={22} r={1.2} fill="#fff5d4" />
    <circle cx={32} cy={20} r={1.2} fill="#fff5d4" />
    <circle cx={42} cy={22} r={1.2} fill="#fff5d4" />
    {/* Sign on top */}
    <rect x={26} y={15} width={12} height={5} rx={1} fill="#c5142a" stroke="#ffd247" strokeWidth={0.6} />
    <text x={32} y={19} fontFamily="Bungee" fontSize={4} fill="#ffd247" textAnchor="middle" fontWeight="bold">HQ</text>
    {/* Crown chip */}
    <circle cx={32} cy={10} r={3.5} fill="url(#bldg-city-chip)" stroke="#5a3a0a" strokeWidth={0.5} strokeDasharray="1 1" />
    <circle cx={32} cy={10} r={1.2} fill="#fff5d4" />
    <defs>
      <linearGradient id="bldg-city-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="50%" stopColor="#f4c542" />
        <stop offset="100%" stopColor="#b6791a" />
      </linearGradient>
      <radialGradient id="bldg-city-chip">
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="100%" stopColor="#b6791a" />
      </radialGradient>
    </defs>
  </>
));

export const FactoryIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={54} rx={20} ry={3} fill="#5a3a0a" opacity={0.6} />
    <rect x={14} y={32} width={36} height={20} fill="url(#bldg-fact-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    {/* Sawtooth roof */}
    <path d="M14 32 L18 26 L22 32 L26 26 L30 32 L34 26 L38 32 L42 26 L46 32 L50 32 Z" fill="url(#bldg-fact-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    {/* Window strips */}
    <rect x={18} y={28} width={3} height={3} fill="#ffd247" opacity={0.9} />
    <rect x={26} y={28} width={3} height={3} fill="#ffd247" opacity={0.9} />
    <rect x={34} y={28} width={3} height={3} fill="#ffd247" opacity={0.9} />
    <rect x={42} y={28} width={3} height={3} fill="#ffd247" opacity={0.9} />
    {/* Gear */}
    <g transform="translate(32 42)">
      <g>
        <path d="M 0,-6 L 1.5,-5 L 4,-5 L 4,-2 L 6,0 L 4,2 L 4,5 L 1.5,5 L 0,6 L -1.5,5 L -4,5 L -4,2 L -6,0 L -4,-2 L -4,-5 L -1.5,-5 Z" fill="#5a3a0a" />
        <circle r={2} fill="#ffd247" />
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="6s" repeatCount="indefinite" />
      </g>
    </g>
    {/* Smokestack + smoke */}
    <rect x={46} y={22} width={4} height={12} fill="#5a3a0a" />
    <circle cx={48} cy={20} r={2} fill="#f4c542" opacity={0.5} />
    <circle cx={46} cy={16} r={3} fill="#f4c542" opacity={0.35} />
    <circle cx={50} cy={13} r={4} fill="#ffd247" opacity={0.2} />
    <defs>
      <linearGradient id="bldg-fact-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#9a7522" />
        <stop offset="50%" stopColor="#b6791a" />
        <stop offset="100%" stopColor="#5a3a0a" />
      </linearGradient>
    </defs>
  </>
));

export const DefensePostIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={54} rx={20} ry={3} fill="#5a3a0a" opacity={0.6} />
    {/* Shield outer */}
    <path d="M32 8 L48 14 L48 30 Q48 44 32 52 Q16 44 16 30 L16 14 Z" fill="url(#bldg-def-grad)" stroke="#5a3a0a" strokeWidth={1.2} />
    {/* Shield inner */}
    <path d="M32 12 L44 17 L44 30 Q44 41 32 47 Q20 41 20 30 L20 17 Z" fill="rgba(0,0,0,0.5)" stroke="#ffd247" strokeWidth={0.5} />
    {/* Crossed bayonets */}
    <g stroke="#ffd247" strokeWidth={1.3} strokeLinecap="round">
      <line x1={24} y1={22} x2={40} y2={40} />
      <line x1={40} y1={22} x2={24} y2={40} />
    </g>
    {/* Spade */}
    <path d="M32 27 C32 27 28 30 28 33 C28 35 30 36 32 35 L32 38 L30 38 L34 38 L32 38 L32 35 C34 36 36 35 36 33 C36 30 32 27 32 27 Z" fill="#c5142a" />
    <circle cx={20} cy={14} r={1.4} fill="#fff5d4" />
    <circle cx={44} cy={14} r={1.4} fill="#fff5d4" />
    <defs>
      <linearGradient id="bldg-def-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ffd247" />
        <stop offset="100%" stopColor="#b6791a" />
      </linearGradient>
    </defs>
  </>
));

export const PortIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={54} rx={20} ry={3} fill="#5a3a0a" opacity={0.6} />
    <path d="M 8 46 Q 14 43 20 46 T 32 46 T 44 46 T 56 46" stroke="#3a8be0" strokeWidth={1.2} fill="none" opacity={0.6} />
    <path d="M 8 50 Q 14 47 20 50 T 32 50 T 44 50 T 56 50" stroke="#3a8be0" strokeWidth={1} fill="none" opacity={0.4} />
    <path d="M 12 36 L 52 36 L 46 44 L 18 44 Z" fill="url(#bldg-port-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    <rect x={24} y={28} width={16} height={8} fill="url(#bldg-port-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    <line x1={32} y1={10} x2={32} y2={28} stroke="#5a3a0a" strokeWidth={1.2} />
    <path d="M 32 10 L 42 14 L 32 18 Z" fill="#c5142a" stroke="#ffd247" strokeWidth={0.4} />
    <circle cx={32} cy={14} r={2} fill="#ffd247" opacity={0.9} />
    <text x={32} y={17} fontFamily="Bungee" fontSize={3.5} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">⚓</text>
    <circle cx={20} cy={40} r={1.4} fill="#ffd247" />
    <circle cx={32} cy={40} r={1.4} fill="#ffd247" />
    <circle cx={44} cy={40} r={1.4} fill="#ffd247" />
    <defs>
      <linearGradient id="bldg-port-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#9a7522" />
        <stop offset="100%" stopColor="#5a3a0a" />
      </linearGradient>
    </defs>
  </>
));

export const SamLauncherIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={54} rx={20} ry={3} fill="#5a3a0a" opacity={0.6} />
    <rect x={14} y={42} width={36} height={10} fill="url(#bldg-sam-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    <circle cx={20} cy={50} r={3} fill="#1a0408" stroke="#5a3a0a" strokeWidth={0.5} />
    <circle cx={44} cy={50} r={3} fill="#1a0408" stroke="#5a3a0a" strokeWidth={0.5} />
    <g transform="translate(32 38) rotate(-20)">
      <rect x={-3} y={-22} width={2.5} height={22} fill="url(#bldg-sam-grad)" stroke="#5a3a0a" strokeWidth={0.4} />
      <rect x={0.5} y={-22} width={2.5} height={22} fill="url(#bldg-sam-grad)" stroke="#5a3a0a" strokeWidth={0.4} />
      <path d="M -3 -22 L -0.5 -28 L 2 -22 Z" fill="#ffd247" />
      <path d="M 0.5 -22 L 3 -28 L 5.5 -22 Z" fill="#ffd247" />
    </g>
    <g transform="translate(46 36)">
      <path d="M -4 0 Q -4 -6 0 -6 Q 4 -6 4 0 Z" fill="rgba(244,197,66,0.3)" stroke="#ffd247" strokeWidth={0.8} />
      <line x1={0} y1={-3} x2={0} y2={3} stroke="#5a3a0a" strokeWidth={0.5} />
      <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="4s" repeatCount="indefinite" additive="sum" />
    </g>
    <circle cx={32} cy={14} r={6} fill="none" stroke="#ff4060" strokeWidth={0.8} strokeDasharray="2 2" />
    <circle cx={32} cy={14} r={1.2} fill="#ff4060" />
    <defs>
      <linearGradient id="bldg-sam-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#9a7522" />
        <stop offset="100%" stopColor="#5a3a0a" />
      </linearGradient>
    </defs>
  </>
));

/* ─── Casino — façade luxe avec néons, dés, et chips ─────────────────
 * Bâtiment fondation des minijeux : architecture style Art Déco doré,
 * avec un signe néon "♠♥♦♣" et une couronne lumineuse.
 */
export const CasinoIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={58} rx={22} ry={2.5} fill="#5a3a0a" opacity={0.55} />
    {/* Façade principale */}
    <rect x={10} y={26} width={44} height={30} fill="url(#bldg-casino-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
    {/* Porte centrale */}
    <rect x={28} y={42} width={8} height={14} fill="#1a0408" stroke="#f1c40f" strokeWidth={0.6} />
    <circle cx={34.5} cy={49} r={0.7} fill="#f1c40f" />
    {/* Fenêtres lumineuses */}
    <rect x={14} y={32} width={5}  height={5} fill="#ffd247" opacity={0.9} />
    <rect x={22} y={32} width={5}  height={5} fill="#ff4060" opacity={0.9} />
    <rect x={37} y={32} width={5}  height={5} fill="#ffd247" opacity={0.9} />
    <rect x={45} y={32} width={5}  height={5} fill="#ff4060" opacity={0.9} />
    {/* Marche/podium */}
    <rect x={8} y={54} width={48} height={3} fill="#5a3a0a" />
    {/* Toit avec couronne d'enseigne */}
    <path d="M 8 26 L 32 14 L 56 26 Z" fill="url(#bldg-casino-roof)" stroke="#5a3a0a" strokeWidth={0.8} />
    <rect x={22} y={18} width={20} height={7} rx={1.5} fill="#1a0408" stroke="#f1c40f" strokeWidth={0.7} />
    {/* Néon symboles ♠ ♥ ♦ ♣ */}
    <text x={24.5} y={23.5} fontSize={5} fill="#f1c40f" fontFamily="serif" fontWeight="700">♠</text>
    <text x={29}   y={23.5} fontSize={5} fill="#ff4060">♥</text>
    <text x={33.5} y={23.5} fontSize={5} fill="#ff4060">♦</text>
    <text x={38}   y={23.5} fontSize={5} fill="#f1c40f" fontFamily="serif" fontWeight="700">♣</text>
    {/* Ampoule sommet */}
    <circle cx={32} cy={12} r={2} fill="#ffd247" />
    <circle cx={32} cy={12} r={4} fill="#ffd247" opacity={0.25} />
    <defs>
      <linearGradient id="bldg-casino-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%"  stopColor="#c9a338" />
        <stop offset="100%" stopColor="#7a5510" />
      </linearGradient>
      <linearGradient id="bldg-casino-roof" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%"  stopColor="#f1c40f" />
        <stop offset="100%" stopColor="#7a5510" />
      </linearGradient>
    </defs>
  </>
));

/* ─── RouletteIcon — roue de roulette stylisée pour menu radial. */
export const RouletteIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <circle cx={32} cy={32} r={26} fill="#5a3a0a" stroke="#1a0408" strokeWidth={1.5} />
    <circle cx={32} cy={32} r={24} fill="url(#rl-grad)" />
    {/* Cases alternées rouge/noir, 0 vert en haut */}
    {Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * 360;
      const col = i === 0 ? '#1e7d3a' : (i % 2 === 0) ? '#c0392b' : '#1a1a1a';
      return (
        <g key={i} transform={`translate(32 32) rotate(${a})`}>
          <path d="M -3 -24 L 3 -24 L 4 -14 L -4 -14 Z" fill={col} stroke="#f1c40f" strokeWidth={0.4} />
        </g>
      );
    })}
    <circle cx={32} cy={32} r={11} fill="#1a0408" stroke="#f1c40f" strokeWidth={1} />
    <text x={32} y={36} fontSize={9} textAnchor="middle" fill="#f1c40f" fontWeight="700">★</text>
    {/* Bille blanche */}
    <circle cx={32} cy={11} r={1.6} fill="#fff" stroke="#5a3a0a" strokeWidth={0.4} />
    <defs>
      <linearGradient id="rl-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#7a5510" />
        <stop offset="100%" stopColor="#2a1a0a" />
      </linearGradient>
    </defs>
  </>
));

/* ─── SlotsIcon — façade machine à sous, 3 rouleaux + levier. */
export const SlotsIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    {/* Cabinet */}
    <rect x={10} y={14} width={44} height={42} rx={3} fill="url(#sl-grad)" stroke="#5a3a0a" strokeWidth={1} />
    <rect x={10} y={14} width={44} height={6} fill="#7a1b1b" stroke="#5a3a0a" strokeWidth={0.6} />
    <text x={32} y={18.5} fontSize={4.5} textAnchor="middle" fill="#f1c40f" fontWeight="800">CASINO</text>
    {/* 3 rouleaux */}
    <rect x={14} y={24} width={36} height={20} rx={2} fill="#1a0408" stroke="#f1c40f" strokeWidth={0.6} />
    <text x={20} y={37} fontSize={8} textAnchor="middle">🍒</text>
    <text x={32} y={37} fontSize={8} textAnchor="middle">💎</text>
    <text x={44} y={37} fontSize={8} textAnchor="middle">★</text>
    {/* Levier latéral */}
    <rect x={54} y={28} width={3} height={14} fill="#c0392b" stroke="#5a3a0a" strokeWidth={0.4} />
    <circle cx={55.5} cy={26} r={2} fill="#c0392b" stroke="#5a3a0a" strokeWidth={0.4} />
    {/* Fente pièces */}
    <rect x={20} y={49} width={24} height={2} fill="#1a0408" />
    <defs>
      <linearGradient id="sl-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#c9a338" />
        <stop offset="100%" stopColor="#7a5510" />
      </linearGradient>
    </defs>
  </>
));

/* ─── BlackjackIcon — symbole des duels (carte + AS) pour le menu radial. */
export const BlackjackIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    {/* Deux cartes superposées */}
    <g transform="translate(20 18) rotate(-12)">
      <rect x={0} y={0} width={22} height={30} rx={2} fill="#fafafa" stroke="#5a3a0a" strokeWidth={1} />
      <text x={3} y={10} fontSize={9} fill="#1a0408" fontFamily="serif" fontWeight="700">10</text>
      <text x={11} y={24} fontSize={11} fill="#1a0408">♠</text>
    </g>
    <g transform="translate(28 16) rotate(12)">
      <rect x={0} y={0} width={22} height={30} rx={2} fill="#fff" stroke="#5a3a0a" strokeWidth={1} />
      <text x={3} y={10} fontSize={11} fill="#c0392b" fontFamily="serif" fontWeight="700">A</text>
      <text x={11} y={24} fontSize={11} fill="#c0392b">♥</text>
    </g>
    {/* Pile de jetons en bas */}
    <ellipse cx={32} cy={56} rx={14} ry={3} fill="#5a3a0a" opacity={0.5} />
    <ellipse cx={32} cy={54} rx={10} ry={2} fill="#c0392b" stroke="#fff" strokeWidth={0.6} />
    <ellipse cx={32} cy={51} rx={10} ry={2} fill="#1a0408" stroke="#f1c40f" strokeWidth={0.6} />
  </>
));

export const MissileIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <g transform="translate(32 50)">
      <path d="M -3 0 Q 0 6 3 0 Q 0 14 0 14 Q -1 9 -3 0 Z" fill="url(#wpn-missile-flame)" />
    </g>
    <g transform="translate(32 28)">
      <path d="M 0 -22 L 5 -10 L 5 8 L 3 14 L -3 14 L -5 8 L -5 -10 Z" fill="url(#wpn-missile-grad)" stroke="#5a3a0a" strokeWidth={0.8} />
      <path d="M 0 -22 L 5 -10 L -5 -10 Z" fill="#c5142a" />
      <path d="M 5 6 L 10 14 L 5 12 Z" fill="#5a3a0a" />
      <path d="M -5 6 L -10 14 L -5 12 Z" fill="#5a3a0a" />
      <rect x={-5} y={-6} width={10} height={2} fill="#5a3a0a" />
      <rect x={-5} y={2} width={10} height={2} fill="#5a3a0a" />
      <text x={0} y={0} fontFamily="Bungee" fontSize={6} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">★</text>
    </g>
    <defs>
      <linearGradient id="wpn-missile-grad" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ffd247" />
        <stop offset="100%" stopColor="#b6791a" />
      </linearGradient>
      <linearGradient id="wpn-missile-flame" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ffd247" />
        <stop offset="50%" stopColor="#ff7a3a" />
        <stop offset="100%" stopColor="#c5142a" stopOpacity={0} />
      </linearGradient>
    </defs>
  </>
));

export const NukeIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={22} rx={18} ry={10} fill="url(#wpn-nuke-cloud)" />
    <ellipse cx={24} cy={20} rx={8} ry={6} fill="url(#wpn-nuke-cloud)" opacity={0.8} />
    <ellipse cx={40} cy={20} rx={8} ry={6} fill="url(#wpn-nuke-cloud)" opacity={0.8} />
    <path d="M 26 30 L 26 46 L 38 46 L 38 30 Z" fill="url(#wpn-nuke-stem)" />
    <ellipse cx={32} cy={46} rx={14} ry={3} fill="#c5142a" opacity={0.7} />
    <circle cx={32} cy={38} r={4} fill="#ffd247" opacity={0.7} />
    <g transform="translate(32 22)">
      <circle r={6} fill="#1a0408" opacity={0.4} />
      <circle r={1.5} fill="#ffd247" />
      <path d="M 0 -1.5 L -4 -6 A 5 5 0 0 1 4 -6 Z" fill="#ffd247" />
      <path d="M -1.3 0.75 L -5.5 4 A 5 5 0 0 1 -3 -3 Z" fill="#ffd247" />
      <path d="M 1.3 0.75 L 5.5 4 A 5 5 0 0 0 3 -3 Z" fill="#ffd247" />
    </g>
    <circle cx={14} cy={50} r={1} fill="#ffd247" />
    <circle cx={22} cy={52} r={1} fill="#ffd247" />
    <circle cx={32} cy={53} r={1} fill="#ffd247" />
    <circle cx={42} cy={52} r={1} fill="#ffd247" />
    <circle cx={50} cy={50} r={1} fill="#ffd247" />
    <defs>
      <radialGradient id="wpn-nuke-cloud">
        <stop offset="0%" stopColor="#ffd247" />
        <stop offset="40%" stopColor="#ff7a3a" />
        <stop offset="100%" stopColor="#5a1518" />
      </radialGradient>
      <linearGradient id="wpn-nuke-stem" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ff7a3a" />
        <stop offset="100%" stopColor="#5a1518" />
      </linearGradient>
    </defs>
  </>
));

export const HydrogenIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <g transform="translate(32 32)">
      <polygon points="0,-28 24,-14 24,14 0,28 -24,14 -24,-14" fill="none" stroke="#ffd247" strokeWidth={1} strokeDasharray="3 2" />
    </g>
    <g transform="translate(32 32)">
      <circle r={14} fill="#1a0408" stroke="#ffd247" strokeWidth={0.8} />
      <circle r={2} fill="#ffd247" />
      <path d="M 0 -3 L -5 -12 A 10 10 0 0 1 5 -12 Z" fill="#ff4060" />
      <path d="M -2.6 1.5 L -11 5.5 A 10 10 0 0 1 -7 -8 Z" fill="#ff4060" />
      <path d="M 2.6 1.5 L 11 5.5 A 10 10 0 0 0 7 -8 Z" fill="#ff4060" />
    </g>
    <g transform="translate(32 8)">
      <path d="M -8 0 L -8 4 L -5 0 L -2 4 L 0 0 L 2 4 L 5 0 L 8 4 L 8 0 L 8 -2 L -8 -2 Z" fill="#ffd247" />
      <circle cx={-5} cy={-2} r={1} fill="#c5142a" />
      <circle cx={0} cy={-2} r={1} fill="#c5142a" />
      <circle cx={5} cy={-2} r={1} fill="#c5142a" />
    </g>
    <circle cx={8} cy={14} r={1.2} fill="#fff5d4" />
    <circle cx={56} cy={14} r={1.2} fill="#fff5d4" />
    <circle cx={8} cy={50} r={1.2} fill="#fff5d4" />
    <circle cx={56} cy={50} r={1.2} fill="#fff5d4" />
  </>
));

/* ─── Tsar Bomba — l'arme ultime, raseuse de continent ────────────────
 * Visuel : couronne impériale rouge + ogive massive striée or, double
 * anneau de garde. Codes couleur : or impérial (#f1c40f) + rouge sang
 * (#c0392b) pour évoquer la puissance soviétique légendaire.
 */
export const TsarBombIcon = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    {/* Halo extérieur menaçant */}
    <circle cx={32} cy={36} r={28} fill="none" stroke="#c0392b" strokeWidth={1} strokeDasharray="2 3" opacity={0.55} />
    <circle cx={32} cy={36} r={22} fill="none" stroke="#f1c40f" strokeWidth={1} strokeDasharray="4 2" opacity={0.7} />
    {/* Couronne impériale sommitale */}
    <g transform="translate(32 8)">
      <path d="M -10 4 L -10 -2 L -6 2 L -3 -5 L 0 2 L 3 -5 L 6 2 L 10 -2 L 10 4 Z" fill="#f1c40f" stroke="#5a3a0a" strokeWidth={0.6} />
      <circle cx={0} cy={-4} r={1.8} fill="#c0392b" />
      <circle cx={-6} cy={1} r={1.1} fill="#c0392b" />
      <circle cx={6} cy={1} r={1.1} fill="#c0392b" />
      <rect x={-11} y={4} width={22} height={2.5} fill="#5a3a0a" />
    </g>
    {/* Ogive : forme bombée avec bandes or */}
    <g transform="translate(32 36)">
      <ellipse cx={0} cy={0} rx={16} ry={20} fill="#2c3e50" stroke="#1a0408" strokeWidth={1} />
      <ellipse cx={0} cy={0} rx={16} ry={20} fill="url(#tsar-grad)" opacity={0.65} />
      <ellipse cx={-5} cy={-6} rx={4} ry={9} fill="#5d6d7e" opacity={0.5} />
      {/* Bandes décoratives or */}
      <ellipse cx={0} cy={-6} rx={16} ry={2.5} fill="none" stroke="#f1c40f" strokeWidth={1.2} />
      <ellipse cx={0} cy={0}  rx={16} ry={2.5} fill="none" stroke="#f1c40f" strokeWidth={1.2} />
      <ellipse cx={0} cy={6}  rx={15.5} ry={2.5} fill="none" stroke="#f1c40f" strokeWidth={1.2} />
      {/* Étoile soviétique au centre */}
      <polygon points="0,-5 1.5,-1.5 5,-1.5 2,1 3,5 0,2.5 -3,5 -2,1 -5,-1.5 -1.5,-1.5" fill="#c0392b" stroke="#f1c40f" strokeWidth={0.4} />
    </g>
    <defs>
      <linearGradient id="tsar-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="#5d6d7e" />
        <stop offset="100%" stopColor="#1a0408" />
      </linearGradient>
    </defs>
    {/* Ailerons stabilisateurs en bas */}
    <g transform="translate(32 56)">
      <path d="M -14 0 L -8 -4 L -8 4 Z" fill="#c0392b" />
      <path d="M 14 0 L 8 -4 L 8 4 Z" fill="#c0392b" />
      <rect x={-1.5} y={-2} width={3} height={6} fill="#f1c40f" />
    </g>
  </>
));

/* ─── Dock category icons — refonte Casino × War ───────────────────────
 * Remplacent IconBuild/IconWeapon/IconDiplomacy/IconLeaderboard pour le
 * BottomDock. Mêmes specs que les bâtiments (viewBox 64×64, gradients
 * prefixés `dock-*` pour éviter les collisions DOM).                    */

export const IconBuildCasino = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={56} rx={18} ry={2.5} fill="#5a3a0a" opacity={0.5} />
    {/* Marteau diagonal */}
    <g transform="translate(32 32) rotate(-30)">
      <rect x={-1.4} y={-2} width={2.8} height={26} rx={0.6} fill="url(#dock-hammer-handle)" stroke="#5a3a0a" strokeWidth={0.4} />
      <rect x={-9} y={-12} width={18} height={9} rx={1.2} fill="url(#dock-hammer-head)" stroke="#5a3a0a" strokeWidth={0.7} />
      <rect x={-7} y={-11} width={14} height={1.5} fill="#fff5d4" opacity={0.5} />
      <rect x={-3} y={-9} width={6} height={3} rx={0.4} fill="#5a3a0a" opacity={0.5} />
    </g>
    {/* Petite tour casino silhouette */}
    <g opacity={0.45}>
      <rect x={44} y={28} width={10} height={22} fill="#5a3a0a" />
      <rect x={45} y={30} width={2} height={2} fill="#ffd247" />
      <rect x={51} y={30} width={2} height={2} fill="#ffd247" />
      <rect x={45} y={35} width={2} height={2} fill="#ffd247" />
      <rect x={51} y={35} width={2} height={2} fill="#ffd247" />
      <rect x={48} y={44} width={2} height={6} fill="#1a0408" />
    </g>
    {/* Pile de chips au sol */}
    <g transform="translate(14 48)">
      <ellipse cx={0} cy={2} rx={6} ry={1.8} fill="#5a3a0a" />
      <ellipse cx={0} cy={0} rx={6} ry={1.8} fill="#b6791a" />
      <ellipse cx={0} cy={-2} rx={6} ry={1.8} fill="#ffd247" stroke="#5a3a0a" strokeWidth={0.3} />
    </g>
    <defs>
      <linearGradient id="dock-hammer-handle" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#b6791a" />
        <stop offset="100%" stopColor="#5a3a0a" />
      </linearGradient>
      <linearGradient id="dock-hammer-head" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="50%" stopColor="#f4c542" />
        <stop offset="100%" stopColor="#5a3a0a" />
      </linearGradient>
    </defs>
  </>
));

export const IconWeaponCasino = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={56} rx={18} ry={2.5} fill="#5a3a0a" opacity={0.5} />
    {/* Croisée de deux missiles */}
    <g transform="translate(22 28) rotate(35)">
      <path d="M 0 -16 L 4 -10 L 4 8 L 2 12 L -2 12 L -4 8 L -4 -10 Z" fill="url(#dock-weap-m1)" stroke="#5a3a0a" strokeWidth={0.5} />
      <path d="M 0 -16 L 4 -10 L -4 -10 Z" fill="#c5142a" />
      <path d="M 4 4 L 8 12 L 4 10 Z" fill="#5a3a0a" />
      <path d="M -4 4 L -8 12 L -4 10 Z" fill="#5a3a0a" />
      <rect x={-4} y={-4} width={8} height={1.5} fill="#5a3a0a" />
      <text x={0} y={2} fontFamily="Bungee" fontSize={5} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">★</text>
    </g>
    <g transform="translate(42 28) rotate(-35)">
      <path d="M 0 -16 L 4 -10 L 4 8 L 2 12 L -2 12 L -4 8 L -4 -10 Z" fill="url(#dock-weap-m2)" stroke="#5a3a0a" strokeWidth={0.5} />
      <path d="M 0 -16 L 4 -10 L -4 -10 Z" fill="#1a0408" />
      <path d="M 4 4 L 8 12 L 4 10 Z" fill="#5a3a0a" />
      <path d="M -4 4 L -8 12 L -4 10 Z" fill="#5a3a0a" />
      <rect x={-4} y={-4} width={8} height={1.5} fill="#5a3a0a" />
      <text x={0} y={2} fontFamily="Bungee" fontSize={5} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">☢</text>
    </g>
    {/* Reticle centre */}
    <circle cx={32} cy={42} r={8} fill="none" stroke="#ff4060" strokeWidth={0.8} strokeDasharray="2 2" />
    <line x1={22} y1={42} x2={42} y2={42} stroke="#ff4060" strokeWidth={0.6} />
    <line x1={32} y1={32} x2={32} y2={52} stroke="#ff4060" strokeWidth={0.6} />
    <circle cx={32} cy={42} r={1.5} fill="#ff4060" />
    <defs>
      <linearGradient id="dock-weap-m1" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ffd247" />
        <stop offset="100%" stopColor="#b6791a" />
      </linearGradient>
      <linearGradient id="dock-weap-m2" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ff8e3c" />
        <stop offset="100%" stopColor="#6f0a14" />
      </linearGradient>
    </defs>
  </>
));

export const IconDiplomacyCasino = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={56} rx={18} ry={2.5} fill="#5a3a0a" opacity={0.5} />
    {/* Main gauche (or) */}
    <g transform="translate(20 32)">
      <rect x={-8} y={0} width={10} height={12} rx={1} fill="url(#dock-hand-gold)" stroke="#5a3a0a" strokeWidth={0.5} />
      <path d="M 0 -4 L 8 -4 L 12 0 L 12 4 L 8 8 L 0 8 Z" fill="url(#dock-hand-gold)" stroke="#5a3a0a" strokeWidth={0.5} />
      <rect x={-8} y={9} width={10} height={2} fill="#5a3a0a" />
      <text x={-3} y={9} fontFamily="Bungee" fontSize={4} fill="#5a3a0a" fontWeight="bold">♠</text>
    </g>
    {/* Main droite (rouge) */}
    <g transform="translate(44 32) scale(-1 1)">
      <rect x={-8} y={0} width={10} height={12} rx={1} fill="url(#dock-hand-red)" stroke="#5a3a0a" strokeWidth={0.5} />
      <path d="M 0 -4 L 8 -4 L 12 0 L 12 4 L 8 8 L 0 8 Z" fill="url(#dock-hand-red)" stroke="#5a3a0a" strokeWidth={0.5} />
      <rect x={-8} y={9} width={10} height={2} fill="#5a3a0a" />
      <text x={-3} y={9} fontFamily="Bungee" fontSize={4} fill="#5a3a0a" fontWeight="bold">♥</text>
    </g>
    {/* Étincelle au point de contact */}
    <circle cx={32} cy={34} r={3} fill="#fff5d4" opacity={0.6} />
    <circle cx={32} cy={34} r={1.5} fill="#fff" opacity={0.9} />
    <g transform="translate(32 34)">
      <path d="M 0 -8 L 0 8 M -8 0 L 8 0" stroke="#ffd247" strokeWidth={0.6} opacity={0.7} />
    </g>
    {/* Branche d'olivier au-dessus */}
    <g transform="translate(32 16)" stroke="#1f8a5b" strokeWidth={0.7} fill="none">
      <path d="M -6 0 Q -3 -2 0 -3 Q 3 -2 6 0" />
      <path d="M -4 -1 Q -5 -3 -3 -4" fill="#1f8a5b" />
      <path d="M 0 -3 Q 0 -5 2 -5" fill="#1f8a5b" />
      <path d="M 4 -1 Q 5 -3 3 -4" fill="#1f8a5b" />
    </g>
    <defs>
      <linearGradient id="dock-hand-gold" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="100%" stopColor="#b6791a" />
      </linearGradient>
      <linearGradient id="dock-hand-red" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#ff8e3c" />
        <stop offset="100%" stopColor="#6f0a14" />
      </linearGradient>
    </defs>
  </>
));

export const IconLeaderboardCasino = ({ size, className }: FullIconProps) => fullIcon(size, className, (
  <>
    <ellipse cx={32} cy={56} rx={18} ry={2.5} fill="#5a3a0a" opacity={0.5} />
    {/* Podium 2nd (argent, gauche) */}
    <rect x={10} y={36} width={14} height={14} fill="url(#dock-pod-silver)" stroke="#5a3a0a" strokeWidth={0.6} />
    <text x={17} y={46} fontFamily="Bungee" fontSize={7} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">2</text>
    {/* Podium 1er (or, centre) */}
    <rect x={25} y={28} width={14} height={22} fill="url(#dock-pod-gold)" stroke="#5a3a0a" strokeWidth={0.6} />
    <text x={32} y={42} fontFamily="Bungee" fontSize={9} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">1</text>
    {/* Podium 3e (bronze, droite) */}
    <rect x={40} y={40} width={14} height={10} fill="url(#dock-pod-bronze)" stroke="#5a3a0a" strokeWidth={0.6} />
    <text x={47} y={48} fontFamily="Bungee" fontSize={6} fill="#5a3a0a" textAnchor="middle" fontWeight="bold">3</text>
    {/* Couronne sur le 1er */}
    <g transform="translate(32 22)">
      <path d="M -7 0 L -7 4 L -4 0 L -2 4 L 0 0 L 2 4 L 4 0 L 7 4 L 7 0 L 6 -3 L -6 -3 Z" fill="#ffd247" stroke="#5a3a0a" strokeWidth={0.4} />
      <circle cx={-4} cy={-2} r={1} fill="#c5142a" />
      <circle cx={0} cy={-2.5} r={1.2} fill="#c5142a" />
      <circle cx={4} cy={-2} r={1} fill="#c5142a" />
    </g>
    {/* Étoiles décoratives */}
    <text x={14} y={20} fontFamily="Bungee" fontSize={5} fill="#ffd247" opacity={0.7}>★</text>
    <text x={52} y={22} fontFamily="Bungee" fontSize={4} fill="#ffd247" opacity={0.6}>★</text>
    <text x={46} y={14} fontFamily="Bungee" fontSize={3} fill="#fff5d4" opacity={0.7}>★</text>
    <defs>
      <linearGradient id="dock-pod-gold" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#fff5d4" />
        <stop offset="50%" stopColor="#ffd247" />
        <stop offset="100%" stopColor="#b6791a" />
      </linearGradient>
      <linearGradient id="dock-pod-silver" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#f0f0f0" />
        <stop offset="50%" stopColor="#c8c8c8" />
        <stop offset="100%" stopColor="#6a6a6a" />
      </linearGradient>
      <linearGradient id="dock-pod-bronze" x1={0} y1={0} x2={0} y2={1}>
        <stop offset="0%" stopColor="#e8a878" />
        <stop offset="50%" stopColor="#b87838" />
        <stop offset="100%" stopColor="#604020" />
      </linearGradient>
    </defs>
  </>
));
