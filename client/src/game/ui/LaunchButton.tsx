/**
 * LaunchButton — bouton « LANCER » casino-style.
 * ----------------------------------------------
 * Remplace le bouton `.home-engage` actuel. 3 états :
 *   • idle    — respiration douce, anneau qui tourne lentement
 *   • hover   — scale, sweep brillant, 3 ondes émises
 *   • firing  — explosion + transition vers l'écran de chargement
 *
 * Usage dans MainMenu.tsx :
 *   <LaunchButton onLaunch={onLaunchClassic} />
 *
 * Le composant gère lui-même la transition click→loading : il déclenche
 * l'animation `firing` (700 ms), expose une couronne plein écran qui se
 * synchronise avec la palette du LoadingScreen, puis appelle `onLaunch()`
 * pour que le parent passe `screen` à `'connecting'`.
 *
 * CSS injecté une seule fois dans <head> au premier mount.
 */

import { useEffect, useRef, useState } from 'react';
import { sfx } from '../../audio/Sfx';

interface Props {
  onLaunch: () => void;
  /** Label affiché. Défaut : "LANCER". */
  label?: string;
  /** Diamètre du bouton en px. Défaut : 240. */
  size?: number;
}

const STYLE_ID = '__lbtn_casino__';

const LBTN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Limelight&family=Cinzel:wght@700;900&display=swap');

.lbtn {
  --gold: #f4c542;
  --gold-bright: #ffd247;
  --gold-light: #fff5d4;
  --gold-dark: #b6791a;
  --gold-deep: #5a3a0a;
  position: relative;
  border: none; background: transparent;
  cursor: pointer; padding: 0;
  color: var(--gold-light);
  font-family: 'Limelight', serif;
  isolation: isolate;
  -webkit-tap-highlight-color: transparent;
}
.lbtn * { pointer-events: none; }
.lbtn:focus-visible { outline: 2px solid var(--gold-bright); outline-offset: 8px; border-radius: 50%; }

/* Orb central */
.lbtn-orb {
  position: absolute; inset: 12.5%;
  border-radius: 50%;
  background:
    radial-gradient(circle at 35% 30%, #fff5d4 0%, var(--gold-bright) 30%, var(--gold-dark) 70%, var(--gold-deep) 100%);
  box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.4),
    inset 0 6px 18px rgba(255,255,255,0.3),
    0 0 30px rgba(244,197,66,0.5),
    0 0 60px rgba(244,140,60,0.3),
    0 10px 30px rgba(0,0,0,0.5);
  animation: lbtn-pulse 3.2s ease-in-out infinite;
  transition: transform 0.35s cubic-bezier(0.2,1.5,0.3,1), box-shadow 0.3s ease;
}
@keyframes lbtn-pulse {
  0%, 100% { box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.4), inset 0 6px 18px rgba(255,255,255,0.3),
    0 0 30px rgba(244,197,66,0.5), 0 0 60px rgba(244,140,60,0.3),
    0 10px 30px rgba(0,0,0,0.5); }
  50% { box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.4), inset 0 6px 18px rgba(255,255,255,0.4),
    0 0 50px rgba(244,197,66,0.7), 0 0 100px rgba(244,140,60,0.4),
    0 10px 30px rgba(0,0,0,0.5); }
}

/* Anneau rotatif */
.lbtn-ring {
  position: absolute; inset: 3.3%;
  border-radius: 50%;
  background: conic-gradient(from 0deg,
    rgba(244,197,66,0.05) 0deg, var(--gold-bright) 30deg, rgba(244,197,66,0.05) 60deg,
    rgba(244,197,66,0.05) 180deg, var(--gold-bright) 210deg, rgba(244,197,66,0.05) 240deg,
    rgba(244,197,66,0.05) 360deg);
  -webkit-mask: radial-gradient(circle, transparent 48%, black 50%, black 64%, transparent 66%);
          mask: radial-gradient(circle, transparent 48%, black 50%, black 64%, transparent 66%);
  animation: lbtn-rot 8s linear infinite;
  filter: drop-shadow(0 0 6px rgba(244,197,66,0.4));
}
@keyframes lbtn-rot { to { transform: rotate(360deg); } }

/* Points lumineux périphériques */
.lbtn-dots { position: absolute; inset: 0; animation: lbtn-rot 16s linear infinite reverse; }
.lbtn-dot {
  position: absolute; left: 50%; top: 50%;
  width: 6px; height: 6px; border-radius: 50%;
  background: var(--gold-bright);
  box-shadow: 0 0 8px var(--gold-bright), 0 0 14px var(--gold);
  margin: -3px 0 0 -3px;
  animation: lbtn-dot-pulse 1.6s ease-in-out infinite;
}
.lbtn-dot:nth-child(odd)  { animation-delay: 0s; }
.lbtn-dot:nth-child(even) { animation-delay: 0.4s; }
@keyframes lbtn-dot-pulse { 0%,100%{opacity:1} 50%{opacity:.35} }

/* Texte */
.lbtn-text {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  text-shadow: 0 2px 0 var(--gold-deep), 0 0 12px rgba(244,197,66,0.6), 0 0 24px rgba(244,140,60,0.4);
  letter-spacing: 0.16em; font-size: 0.125em;
  color: #fff5d4; text-transform: uppercase;
  transition: transform 0.25s ease, letter-spacing 0.25s ease;
  z-index: 3;
}

/* Sweep brillant (hover) */
.lbtn-shine {
  position: absolute; inset: 0;
  display: grid; place-items: center;
  z-index: 4; pointer-events: none; color: transparent;
  font-family: 'Limelight', serif;
  font-size: 0.125em; letter-spacing: 0.16em; text-transform: uppercase;
  background: linear-gradient(120deg, transparent 38%, rgba(255,255,255,0.85) 50%, transparent 62%);
  -webkit-background-clip: text; background-clip: text;
  background-size: 200% 100%; background-position: 200% 0;
}

/* Ondes émises (hover) */
.lbtn-wave {
  position: absolute; inset: 0; border-radius: 50%;
  border: 2px solid rgba(244,197,66,0); opacity: 0; pointer-events: none;
}

/* IDLE */
.lbtn .lbtn-text { animation: lbtn-breath 3.2s ease-in-out infinite; }
@keyframes lbtn-breath { 0%,100%{transform:scale(1)} 50%{transform:scale(1.03)} }

/* HOVER (déclenché par :hover et par .force-hover pour preview) */
.lbtn:not(.firing):hover .lbtn-orb,
.lbtn.force-hover:not(.firing) .lbtn-orb {
  transform: scale(1.05);
  box-shadow:
    inset 0 -10px 30px rgba(0,0,0,0.4), inset 0 6px 18px rgba(255,255,255,0.45),
    0 0 60px rgba(244,197,66,0.9), 0 0 120px rgba(244,140,60,0.6),
    0 10px 40px rgba(0,0,0,0.5);
}
.lbtn:not(.firing):hover .lbtn-ring,
.lbtn.force-hover:not(.firing) .lbtn-ring {
  animation: lbtn-rot 1.8s linear infinite;
  filter: drop-shadow(0 0 12px rgba(244,197,66,0.9)) drop-shadow(0 0 20px rgba(255,210,71,0.5));
}
.lbtn:not(.firing):hover .lbtn-dots,
.lbtn.force-hover:not(.firing) .lbtn-dots { animation: lbtn-rot 5s linear infinite reverse; }
.lbtn:not(.firing):hover .lbtn-dot,
.lbtn.force-hover:not(.firing) .lbtn-dot { animation-duration: 0.7s; }
.lbtn:not(.firing):hover .lbtn-text,
.lbtn.force-hover:not(.firing) .lbtn-text { transform: scale(1.06); letter-spacing: 0.22em; }
.lbtn:not(.firing):hover .lbtn-shine,
.lbtn.force-hover:not(.firing) .lbtn-shine { animation: lbtn-sweep 1.6s ease-in-out infinite; }
@keyframes lbtn-sweep { 0%{background-position:200% 0} 60%,100%{background-position:-100% 0} }
.lbtn:not(.firing):hover .lbtn-wave,
.lbtn.force-hover:not(.firing) .lbtn-wave { animation: lbtn-wave 1.6s ease-out infinite; }
.lbtn:not(.firing):hover .lbtn-wave.w2,
.lbtn.force-hover:not(.firing) .lbtn-wave.w2 { animation-delay: 0.4s; }
.lbtn:not(.firing):hover .lbtn-wave.w3,
.lbtn.force-hover:not(.firing) .lbtn-wave.w3 { animation-delay: 0.8s; }
@keyframes lbtn-wave {
  0%   { transform: scale(0.85); border-color: rgba(244,197,66,0.7); opacity: 1; }
  100% { transform: scale(1.45); border-color: rgba(244,197,66,0);   opacity: 0; }
}

/* FIRING — clic : RIPPLE fluide, pas d'explosion */
.lbtn.firing { cursor: default; pointer-events: none; }

/* L'orbe s'éteint en douceur : pulse léger puis fade out avec un brin de flou */
.lbtn.firing .lbtn-orb {
  animation: lbtn-fade 0.7s ease-out forwards;
}
@keyframes lbtn-fade {
  0%   { transform: scale(1); opacity: 1; filter: brightness(1); }
  30%  { transform: scale(1.06); filter: brightness(1.4); }
  100% { transform: scale(0.85); opacity: 0; filter: brightness(0.6) blur(2px); }
}

/* L'anneau et les points s'évanouissent */
.lbtn.firing .lbtn-ring,
.lbtn.firing .lbtn-dots,
.lbtn.firing .lbtn-shine {
  animation: lbtn-elem-fade 0.5s ease-out forwards;
}
@keyframes lbtn-elem-fade {
  0%   { opacity: 1; }
  100% { opacity: 0; }
}

/* Le texte glisse vers une scale subtile puis disparait */
.lbtn.firing .lbtn-text {
  animation: lbtn-text-soft 0.7s ease-out forwards;
}
@keyframes lbtn-text-soft {
  0%   { transform: scale(1.06); opacity: 1; letter-spacing: 0.22em; }
  100% { transform: scale(0.95); opacity: 0; letter-spacing: 0.32em; filter: blur(2px); }
}

/* 3 ondes concentriques émises depuis le bouton — les 3 .lbtn-wave
   sont réutilisées (sans le loop infini du hover) avec un décalage. */
.lbtn.firing .lbtn-wave {
  animation: lbtn-ripple 0.75s cubic-bezier(0.2, 0.6, 0.3, 1) forwards;
}
.lbtn.firing .lbtn-wave.w2 { animation-delay: 0.12s; }
.lbtn.firing .lbtn-wave.w3 { animation-delay: 0.24s; }
@keyframes lbtn-ripple {
  0%   { transform: scale(0.85); border-color: rgba(244,197,66,0.9); border-width: 3px; opacity: 1; }
  100% { transform: scale(2.0);  border-color: rgba(244,197,66,0);   border-width: 1px; opacity: 0; }
}

/* Voile plein écran qui fade en même temps que le ripple — tout l'écran s'assombrit
   progressivement, pas seulement le bouton. */
.lbtn-curtain {
  position: fixed; inset: 0; z-index: 2147483647;
  background: radial-gradient(ellipse at 50% 50%,
    rgba(58,10,24,0.85) 0%,
    rgba(10,4,7,0.96) 70%);
  opacity: 0; pointer-events: none;
  transition: opacity 0.55s ease-in;
}
.lbtn-curtain.on { opacity: 1; }
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = LBTN_CSS;
  document.head.appendChild(el);
}

export function LaunchButton({ onLaunch, label = 'LANCER', size = 240 }: Props) {
  const [firing, setFiring] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // Le voile est créé en vanilla JS sur <body> et géré entièrement hors JSX,
  // pour qu'il échappe aux stacking contexts du menu ET soit garanti retiré
  // au unmount (sinon il reste devant le LoadingScreen → "le fondu reste").
  const curtainRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => { injectStyle(); }, []);

  useEffect(() => {
    const c = document.createElement('div');
    c.className = 'lbtn-curtain';
    document.body.appendChild(c);
    curtainRef.current = c;
    return () => {
      if (c.parentNode) c.parentNode.removeChild(c);
      curtainRef.current = null;
    };
  }, []);

  const handleEnter = () => {
    if (firing) return;
    sfx.playLaunchHover();
  };
  const handleLeave = () => {
    sfx.stopLaunchHover();
  };

  const handleClick = () => {
    if (firing) return;
    setFiring(true);

    // Coupe la boucle de hover et déclenche les deux one-shots à +1 s.
    sfx.stopLaunchHover();
    sfx.playLaunchClick();

    const c = curtainRef.current;
    if (c) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => c.classList.add('on'));
      });
    }

    window.setTimeout(() => {
      onLaunch();
    }, 550);
  };

  // Calcule taille des points dynamiquement (8 dots à 116/240 * size du centre)
  const dotPositions = [
    [0, -1], [0.707, -0.707], [1, 0], [0.707, 0.707],
    [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707],
  ] as const;
  const dotRadius = (size / 240) * 116;

  return (
    <>
      <button
        ref={btnRef}
        className={`lbtn${firing ? ' firing' : ''}`}
        style={{ width: size, height: size, fontSize: size + 'px' }}
        onClick={handleClick}
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        onFocus={handleEnter}
        onBlur={handleLeave}
        aria-label={label}
      >
        <div className="lbtn-ring" />
        <div className="lbtn-dots">
          {dotPositions.map(([dx, dy], i) => (
            <i
              key={i}
              className="lbtn-dot"
              style={{ transform: `translate(${dx * dotRadius}px, ${dy * dotRadius}px)` }}
            />
          ))}
        </div>
        <div className="lbtn-orb" />
        <div className="lbtn-text">{label}</div>
        <div className="lbtn-shine">{label}</div>
        <div className="lbtn-wave" />
        <div className="lbtn-wave w2" />
        <div className="lbtn-wave w3" />
      </button>
    </>
  );
}
