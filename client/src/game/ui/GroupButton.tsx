/**
 * GroupButton — variante ROUGE / CARDINAL du LaunchButton.
 * ---------------------------------------------------------
 * Même grammaire visuelle : orb central + anneau rotatif + dots
 * périphériques + texte qui respire, sweep brillant et 3 ondes au hover,
 * fade + ripple + voile au clic. Palette cardinal (#c5142a → #ff6478)
 * au lieu de l'or, pour signaler "action ≠ guerre" (rejoindre un salon).
 *
 * Sons :
 *   - hover  → sfx.playGroupHover()  (launch-hover.mp3 pitché 0.55, grave)
 *   - click  → sfx.playGroupClick()  (one-shot grave, ≠ cash-register)
 *
 * Le voile click est ROUGE velvet pour s'enchaîner avec le rideau du
 * GroupScreen (cohérence visuelle de la transition).
 */

import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/Sfx';

interface Props {
  onLaunch: () => void;
  label?: string;
  size?: number;
}

const STYLE_ID = '__gbtn_casino__';

const GBTN_CSS = `
.gbtn {
  --red: #c5142a;
  --red-bright: #e84252;
  --red-light: #ff8a99;
  --red-dark: #6f0a14;
  --red-deep: #2f050a;
  --red-glow: #ff4060;
  position: relative;
  border: none; background: transparent;
  cursor: pointer; padding: 0;
  color: var(--red-light);
  font-family: 'Limelight', serif;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
}
.gbtn * { pointer-events: none; }
.gbtn:focus-visible { outline: 2px solid var(--red-bright); outline-offset: 8px; border-radius: 50%; }

/* Orb central */
.gbtn-orb {
  position: absolute; inset: 12.5%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, #ffd5d8 0%, var(--red-bright) 30%, var(--red) 60%, var(--red-deep) 100%);
  box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.5),
    inset 0 6px 18px rgba(255,180,190,0.32),
    0 0 30px rgba(197,20,42,0.55),
    0 0 60px rgba(232,66,82,0.35),
    0 10px 30px rgba(0,0,0,0.5);
  animation: gbtn-pulse 3.2s ease-in-out infinite;
  transition: transform 0.35s cubic-bezier(0.2,1.5,0.3,1), box-shadow 0.3s ease;
}
@keyframes gbtn-pulse {
  0%, 100% { box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.5), inset 0 6px 18px rgba(255,180,190,0.32),
    0 0 30px rgba(197,20,42,0.55), 0 0 60px rgba(232,66,82,0.35),
    0 10px 30px rgba(0,0,0,0.5); }
  50% { box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.5), inset 0 6px 18px rgba(255,180,190,0.45),
    0 0 50px rgba(232,66,82,0.8), 0 0 100px rgba(255,80,100,0.45),
    0 10px 30px rgba(0,0,0,0.5); }
}

/* Anneau rotatif */
.gbtn-ring {
  position: absolute; inset: 3.3%;
  border-radius: 50%;
  background: conic-gradient(from 0deg,
    rgba(232,66,82,0.05) 0deg, var(--red-bright) 30deg, rgba(232,66,82,0.05) 60deg,
    rgba(232,66,82,0.05) 180deg, var(--red-bright) 210deg, rgba(232,66,82,0.05) 240deg,
    rgba(232,66,82,0.05) 360deg);
  -webkit-mask: radial-gradient(circle, transparent 48%, black 50%, black 64%, transparent 66%);
          mask: radial-gradient(circle, transparent 48%, black 50%, black 64%, transparent 66%);
  animation: gbtn-rot 8s linear infinite;
  filter: drop-shadow(0 0 6px rgba(232,66,82,0.45));
}
@keyframes gbtn-rot { to { transform: rotate(360deg); } }

/* Dots */
.gbtn-dots { position: absolute; inset: 0; animation: gbtn-rot 16s linear infinite reverse; }
.gbtn-dot {
  position: absolute; left: 50%; top: 50%;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--red-bright);
  box-shadow: 0 0 8px var(--red-bright), 0 0 14px var(--red);
  margin: -3px 0 0 -3px;
  animation: gbtn-dot-pulse 1.6s ease-in-out infinite;
}
.gbtn-dot:nth-child(odd)  { animation-delay: 0s; }
.gbtn-dot:nth-child(even) { animation-delay: 0.4s; }
@keyframes gbtn-dot-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

/* Texte */
.gbtn-text {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  text-shadow: 0 2px 0 var(--red-deep), 0 0 12px rgba(232,66,82,0.65), 0 0 24px rgba(255,80,100,0.45);
  letter-spacing: 0.16em; font-size: 0.125em;
  color: #fff0f2; text-transform: uppercase;
  transition: transform 0.25s ease, letter-spacing 0.25s ease;
  z-index: 3;
}

/* Sweep brillant */
.gbtn-shine {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  z-index: 4; pointer-events: none; color: transparent;
  font-family: 'Limelight', serif;
  font-size: 0.125em; letter-spacing: 0.16em; text-transform: uppercase;
  background: linear-gradient(120deg, transparent 38%, rgba(255,230,235,0.85) 50%, transparent 62%);
  -webkit-background-clip: text; background-clip: text;
  background-size: 200% 100%; background-position: 200% 0;
}

/* Ondes */
.gbtn-wave {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(232,66,82,0); opacity: 0; pointer-events: none;
}

.gbtn .gbtn-text { animation: gbtn-breath 3.2s ease-in-out infinite; }
@keyframes gbtn-breath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }

.gbtn:not(.firing):hover .gbtn-orb {
  transform: scale(1.05);
  box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.5), inset 0 6px 18px rgba(255,180,190,0.5),
    0 0 60px rgba(232,66,82,0.95), 0 0 120px rgba(255,80,100,0.6),
    0 10px 40px rgba(0,0,0,0.5);
}
.gbtn:not(.firing):hover .gbtn-ring {
  animation: gbtn-rot 1.8s linear infinite;
  filter: drop-shadow(0 0 12px rgba(232,66,82,0.95)) drop-shadow(0 0 20px rgba(255,80,100,0.55));
}
.gbtn:not(.firing):hover .gbtn-dots { animation: gbtn-rot 5s linear infinite reverse; }
.gbtn:not(.firing):hover .gbtn-dot { animation-duration: 0.7s; }
.gbtn:not(.firing):hover .gbtn-text { transform: scale(1.06); letter-spacing: 0.22em; }
.gbtn:not(.firing):hover .gbtn-shine { animation: gbtn-sweep 1.6s ease-in-out infinite; }
@keyframes gbtn-sweep { 0%{background-position:200% 0} 60%,100%{background-position:-100% 0} }
.gbtn:not(.firing):hover .gbtn-wave { animation: gbtn-wave 1.6s ease-out infinite; }
.gbtn:not(.firing):hover .gbtn-wave.w2 { animation-delay: 0.4s; }
.gbtn:not(.firing):hover .gbtn-wave.w3 { animation-delay: 0.8s; }
@keyframes gbtn-wave {
  0%   { transform: scale(0.85); border-color: rgba(232,66,82,0.75); opacity: 1; }
  100% { transform: scale(1.45); border-color: rgba(232,66,82,0);    opacity: 0; }
}

/* FIRING */
.gbtn.firing { cursor: default; pointer-events: none; }
.gbtn.firing .gbtn-orb { animation: gbtn-fade 0.7s ease-out forwards; }
@keyframes gbtn-fade {
  0%   { transform: scale(1); opacity: 1; filter: brightness(1); }
  30%  { transform: scale(1.06); filter: brightness(1.4); }
  100% { transform: scale(0.85); opacity: 0; filter: brightness(0.6) blur(2px); }
}
.gbtn.firing .gbtn-ring,
.gbtn.firing .gbtn-dots,
.gbtn.firing .gbtn-shine {
  animation: gbtn-elem-fade 0.5s ease-out forwards;
}
@keyframes gbtn-elem-fade { 0%{opacity:1} 100%{opacity:0} }
.gbtn.firing .gbtn-text { animation: gbtn-text-soft 0.7s ease-out forwards; }
@keyframes gbtn-text-soft {
  0%   { transform: scale(1.06); opacity: 1; letter-spacing: 0.22em; }
  100% { transform: scale(0.95); opacity: 0; letter-spacing: 0.32em; filter: blur(2px); }
}
.gbtn.firing .gbtn-wave { animation: gbtn-ripple 0.75s cubic-bezier(0.2, 0.6, 0.3, 1) forwards; }
.gbtn.firing .gbtn-wave.w2 { animation-delay: 0.12s; }
.gbtn.firing .gbtn-wave.w3 { animation-delay: 0.24s; }
@keyframes gbtn-ripple {
  0%   { transform: scale(0.85); border-color: rgba(232,66,82,0.95); border-width: 3px; opacity: 1; }
  100% { transform: scale(2.0);  border-color: rgba(232,66,82,0);    border-width: 1px; opacity: 0; }
}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = GBTN_CSS;
  document.head.appendChild(el);
}

export function GroupButton({ onLaunch, label = 'GROUPE', size = 240 }: Props) {
  const [firing, setFiring] = useState(false);

  useEffect(() => { injectStyle(); }, []);

  const handleEnter = () => {
    if (firing) return;
    sfx.playGroupHover();
  };
  const handleLeave = () => {
    sfx.stopGroupHover();
  };

  const handleClick = () => {
    if (firing) return;
    setFiring(true);
    sfx.stopGroupHover();
    sfx.playGroupClick();
    // Le rideau de transition est géré par le parent (GroupScreen monté
    // par App.tsx) — ici on déclenche seulement le firing local + délai.
    window.setTimeout(() => {
      onLaunch();
    }, 550);
  };

  const dotPositions = [
    [0, -1], [0.707, -0.707], [1, 0], [0.707, 0.707],
    [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707],
  ] as const;
  const dotRadius = (size / 240) * 116;

  return (
    <button
      className={`gbtn${firing ? ' firing' : ''}`}
      style={{ width: size, height: size, fontSize: size + 'px' }}
      onClick={handleClick}
      onPointerEnter={handleEnter}
      onPointerLeave={handleLeave}
      onFocus={handleEnter}
      onBlur={handleLeave}
      aria-label={label}
    >
      <div className="gbtn-ring" />
      <div className="gbtn-dots">
        {dotPositions.map(([dx, dy], i) => (
          <i
            key={i}
            className="gbtn-dot"
            style={{ transform: `translate(${dx * dotRadius}px, ${dy * dotRadius}px)` }}
          />
        ))}
      </div>
      <div className="gbtn-orb" />
      <div className="gbtn-text">{label}</div>
      <div className="gbtn-shine">{label}</div>
      <div className="gbtn-wave" />
      <div className="gbtn-wave w2" />
      <div className="gbtn-wave w3" />
    </button>
  );
}
