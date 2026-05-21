/**
 * Countdown — décompte 3-2-1-GO entre le LoadingScreen et le gameplay.
 * ----------------------------------------------------------------------
 * La simulation est figée (sim.setPaused(true)) pendant que ce composant
 * tourne. Chaque chiffre se montre 1 s, puis "GO" pendant 700 ms avant
 * fade-out vers le jeu.
 *
 * Style casino royal : chiffres énormes en Limelight, halo or, anneau
 * rotatif, ondes émises à chaque "tick".
 *
 * Animation overall :
 *   t=0        : fond noir + "3" qui scale-in
 *   t=1.0s     : "2" qui scale-in, ancien "3" fade out
 *   t=2.0s     : "1"
 *   t=3.0s     : "GO!" en cardinal, scale-up dramatique
 *   t=3.7s     : tout le composant fade out (overlay opacity 0)
 *   t=4.0s     : onDone() — App.tsx lève la pause et passe screen='game'
 */

import { useEffect, useState } from 'react';
import { sfx } from '../../audio/Sfx';

interface Props {
  /** Appelé quand le countdown est terminé — le parent doit alors
   *  setPaused(false) sur la sim et faire transitionner l'écran. */
  onDone: () => void;
}

const STYLE_ID = '__countdown_style__';

const COUNTDOWN_CSS = `
.countdown-overlay {
  position: fixed; inset: 0; z-index: 9999;
  pointer-events: none;
  background:
    radial-gradient(ellipse 50% 60% at 50% 50%, rgba(20, 4, 8, 0.55) 0%, rgba(0, 0, 0, 0.96) 100%);
  display: grid; place-items: center;
  /* DÉMARRE OPAQUE : prend le relais du LoadingScreen qui finit en noir,
   * pas de fade-in (sinon on voit brièvement la map à travers). */
  opacity: 1;
}

.countdown-overlay.fading-out {
  animation: countdown-overlay-out 0.7s ease-in forwards;
}
@keyframes countdown-overlay-out { 0% { opacity: 1; } 100% { opacity: 0; } }

.countdown-stage {
  position: relative;
  width: 360px; height: 360px;
  display: grid; place-items: center;
}

/* Anneau extérieur lent en arrière-plan — donne du contexte au numéro */
.countdown-ring {
  position: absolute; inset: 4%;
  border-radius: 50%;
  background: conic-gradient(from 0deg,
    rgba(244, 197, 66, 0.05) 0deg,
    var(--gold-bright, #ffd247) 30deg,
    rgba(244, 197, 66, 0.05) 60deg,
    rgba(244, 197, 66, 0.05) 180deg,
    var(--gold-bright, #ffd247) 210deg,
    rgba(244, 197, 66, 0.05) 240deg,
    rgba(244, 197, 66, 0.05) 360deg);
  -webkit-mask: radial-gradient(circle, transparent 64%, black 66%, black 76%, transparent 78%);
          mask: radial-gradient(circle, transparent 64%, black 66%, black 76%, transparent 78%);
  animation: countdown-ring-rot 4s linear infinite;
  filter: drop-shadow(0 0 14px rgba(244, 197, 66, 0.55));
}
@keyframes countdown-ring-rot { to { transform: rotate(360deg); } }

/* Onde qui s'émet à chaque tick (3, 2, 1, GO) */
.countdown-wave {
  position: absolute; inset: 0; border-radius: 50%;
  border: 3px solid rgba(244, 197, 66, 0.85);
  pointer-events: none;
  animation: countdown-wave 1s ease-out forwards;
}
@keyframes countdown-wave {
  0%   { transform: scale(0.55); border-color: rgba(244, 197, 66, 0.95); opacity: 1; }
  100% { transform: scale(2.2);  border-color: rgba(244, 197, 66, 0);    opacity: 0; }
}

/* Chiffre central */
.countdown-num {
  position: relative;
  font-family: 'Limelight', serif;
  font-size: 220px; line-height: 1;
  color: #fff5d4;
  letter-spacing: 0.04em;
  text-shadow:
    0 0 24px rgba(244, 197, 66, 0.85),
    0 0 60px rgba(244, 140, 60, 0.55),
    0 6px 0 rgba(90, 58, 10, 0.75);
  animation: countdown-num-in 1s cubic-bezier(0.2, 1.4, 0.3, 1) both;
}
@keyframes countdown-num-in {
  0%   { transform: scale(0.4) rotate(-8deg); opacity: 0; filter: blur(8px); }
  25%  { transform: scale(1.18) rotate(2deg); opacity: 1; filter: blur(0); }
  60%  { transform: scale(1.0) rotate(0); }
  85%  { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1.25); opacity: 0; filter: blur(4px); }
}

/* "GO" en rouge cardinal pour signifier le START */
.countdown-num.go {
  font-size: 200px;
  color: #fff0f2;
  letter-spacing: 0.10em;
  text-shadow:
    0 0 28px rgba(232, 66, 82, 0.95),
    0 0 70px rgba(255, 80, 100, 0.6),
    0 6px 0 rgba(47, 5, 10, 0.85);
  animation: countdown-go-in 0.7s cubic-bezier(0.2, 1.8, 0.3, 1) both;
}
@keyframes countdown-go-in {
  0%   { transform: scale(0.5) rotate(-4deg); opacity: 0; filter: blur(10px); }
  35%  { transform: scale(1.35) rotate(2deg); opacity: 1; filter: blur(0); }
  70%  { transform: scale(1.0); }
  100% { transform: scale(1.55); opacity: 0; filter: blur(8px); }
}

/* Label "PRÉPAREZ-VOUS" subtil au-dessus */
.countdown-tag {
  position: absolute; top: 18%; left: 50%;
  transform: translateX(-50%);
  font-family: 'Cinzel', var(--font-display-2);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.5em;
  color: var(--gold, #f4c542);
  text-transform: uppercase;
  text-shadow: 0 0 12px rgba(244, 197, 66, 0.6);
  animation: countdown-tag-in 0.5s ease-out 0.2s both;
}
@keyframes countdown-tag-in {
  0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  100% { opacity: 0.85; transform: translateX(-50%) translateY(0); }
}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = COUNTDOWN_CSS;
  document.head.appendChild(el);
}

type Step = 3 | 2 | 1 | 0 /* GO */;

export function Countdown({ onDone }: Props) {
  const [step, setStep] = useState<Step>(3);
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    injectStyle();
    // Fanfare medieval orchestra dès l'apparition du "3" — annonce
    // l'engagement militaire imminent.
    sfx.playCountdownFanfare();
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setStep(2), 1000));
    timers.push(window.setTimeout(() => setStep(1), 2000));
    timers.push(window.setTimeout(() => setStep(0), 3000)); // GO
    timers.push(window.setTimeout(() => setFadingOut(true), 3700));
    timers.push(window.setTimeout(() => onDone(), 4000));
    return () => { for (const t of timers) clearTimeout(t); };
  }, [onDone]);

  return (
    <div className={`countdown-overlay${fadingOut ? ' fading-out' : ''}`} aria-hidden>
      <div className="countdown-tag">PRÉPAREZ-VOUS</div>
      <div className="countdown-stage">
        <div className="countdown-ring" />
        {/* Clé sur step → React reset la div + replay l'animation à chaque chiffre */}
        {step === 0 ? (
          <>
            <div key={`wave-${step}`} className="countdown-wave" />
            <div key="num-go" className="countdown-num go">GO</div>
          </>
        ) : (
          <>
            <div key={`wave-${step}`} className="countdown-wave" />
            <div key={`num-${step}`} className="countdown-num">{step}</div>
          </>
        )}
      </div>
    </div>
  );
}
