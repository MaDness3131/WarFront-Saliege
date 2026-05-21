/**
 * LoadingScreen — radar tactique.
 * --------------------------------
 * Écran de chargement style "SCANNING THEATER" : scope radar avec balayage
 * conique, blips ennemis détectés, log console qui défile, durée d'un cycle
 * ~6s. Boucle indéfiniment tant que `socket.connect()` n'a pas répondu.
 *
 * Usage dans App.tsx, à la place du bloc `loading-screen` actuel :
 *   if (screen === 'connecting') return <LoadingScreen />;
 *
 * Le composant injecte son CSS au premier mount. Background dark green/black
 * raccord avec la curtain noire/rouge du LaunchButton (fade-in soft à l'entrée
 * pour gommer la discontinuité de teinte).
 */

import { useEffect } from 'react';

interface Props {
  /** Optionnel : appelé à la fin d'un cycle (~6s). */
  onComplete?: () => void;
  /** Si true, joue l'animation de sortie : flash radial doré qui s'étale
   *  puis fonce vers le noir (le countdown prend la suite seamlessly). */
  exiting?: boolean;
}

const STYLE_ID = '__radar_loader__';

const RADAR_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Limelight&family=Cinzel:wght@700;900&family=JetBrains+Mono:wght@400;700&display=swap');

.rdr-stage {
  position: fixed; inset: 0; z-index: 1000;
  overflow: hidden;
  background: radial-gradient(ellipse 60% 80% at 50% 50%, #001a13 0%, #00080a 80%);
  color: #fff;
  font-family: 'JetBrains Mono', monospace;
  user-select: none;
  /* Soft fade-in to bridge from the dark-red curtain of the launch button */
  animation: rdr-stage-in 0.5s ease-out;
}
@keyframes rdr-stage-in { from { opacity: 0; } }

/* Grille tactique en fond */
.rdr-stage::before {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background:
    linear-gradient(rgba(0,255,180,0.04) 1px, transparent 1px) 0 0/24px 24px,
    linear-gradient(90deg, rgba(0,255,180,0.04) 1px, transparent 1px) 0 0/24px 24px;
  mask: radial-gradient(ellipse 70% 90% at 50% 50%, black, transparent 75%);
  -webkit-mask: radial-gradient(ellipse 70% 90% at 50% 50%, black, transparent 75%);
}

/* Vignette */
.rdr-stage::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(0,0,0,0.65) 100%);
}

.rdr-scene {
  position: relative; z-index: 2;
  width: 100%; height: 100%;
  display: grid; place-items: center;
  text-align: center;
}

.rdr-inner { display: flex; flex-direction: column; align-items: center; gap: 24px; }

/* ─── Scope radar ─────────────────────────────────────────────────── */
.rdr-scope {
  position: relative;
  width: clamp(280px, 38vmin, 420px);
  height: clamp(280px, 38vmin, 420px);
  border-radius: 50%;
  border: 2px solid rgba(0,255,180,0.55);
  box-shadow:
    0 0 36px rgba(0,255,180,0.25),
    inset 0 0 36px rgba(0,255,180,0.12);
}
.rdr-scope::before, .rdr-scope::after {
  content: ""; position: absolute; border-radius: 50%;
  border: 1px solid rgba(0,255,180,0.3);
}
.rdr-scope::before { inset: 20%; }
.rdr-scope::after  { inset: 40%; }

.rdr-cross { position: absolute; inset: 0; }
.rdr-cross::before, .rdr-cross::after {
  content: ""; position: absolute; background: rgba(0,255,180,0.3);
}
.rdr-cross::before { top: 50%; left: 0; right: 0; height: 1px; }
.rdr-cross::after  { left: 50%; top: 0; bottom: 0; width: 1px; }

.rdr-sweep {
  position: absolute; inset: 0;
  background: conic-gradient(
    from 0deg,
    rgba(0,255,180,0.0) 0deg,
    rgba(0,255,180,0.0) 270deg,
    rgba(0,255,180,0.42) 350deg,
    rgba(0,255,180,0.7) 360deg);
  border-radius: 50%;
  animation: rdr-sweep 2.5s linear infinite;
}
@keyframes rdr-sweep { to { transform: rotate(360deg); } }

.rdr-blip {
  position: absolute; width: 10px; height: 10px; border-radius: 50%;
  background: #00ffb4;
  box-shadow: 0 0 8px #00ffb4, 0 0 16px rgba(0,255,180,0.6);
  transform: translate(-50%, -50%);
  opacity: 0;
}
.rdr-blip:nth-child(1) { left: 30%; top: 35%; animation: rdr-blip 2.5s 0.6s infinite; }
.rdr-blip:nth-child(2) { left: 70%; top: 28%; animation: rdr-blip 2.5s 0.9s infinite; }
.rdr-blip:nth-child(3) { left: 65%; top: 70%; animation: rdr-blip 2.5s 1.4s infinite; }
.rdr-blip:nth-child(4) { left: 25%; top: 65%; animation: rdr-blip 2.5s 1.9s infinite; }
.rdr-blip:nth-child(5) { left: 50%; top: 18%; animation: rdr-blip 2.5s 0.3s infinite; }
.rdr-blip:nth-child(6) { left: 80%; top: 50%; animation: rdr-blip 2.5s 1.1s infinite; }
.rdr-blip:nth-child(7) { left: 18%; top: 48%; animation: rdr-blip 2.5s 1.7s infinite; }
@keyframes rdr-blip {
  0%, 3% { opacity: 1; transform: translate(-50%,-50%) scale(1.4); }
  20%    { opacity: 0.85; transform: translate(-50%,-50%) scale(1); }
  100%   { opacity: 0; transform: translate(-50%,-50%) scale(0.7); }
}

/* ─── Texte ──────────────────────────────────────────────────────── */
.rdr-title {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px; letter-spacing: 0.42em;
  color: #00ffb4;
  text-shadow: 0 0 8px rgba(0,255,180,0.6);
}
.rdr-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 0.46em;
  color: rgba(0,255,180,0.65);
}

/* ─── Log console ────────────────────────────────────────────────── */
.rdr-log {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px; letter-spacing: 0.16em;
  color: rgba(0,255,180,0.78);
  text-align: left;
  width: clamp(280px, 36vmin, 380px);
  min-height: 80px;
}
.rdr-log p {
  margin: 3px 0; opacity: 0;
  animation: rdr-log-entry 6s linear infinite;
}
.rdr-log p::before { content: "> "; color: #f4c542; }
.rdr-log p:nth-child(1) { animation-delay: 0.4s; }
.rdr-log p:nth-child(2) { animation-delay: 1.4s; }
.rdr-log p:nth-child(3) { animation-delay: 2.4s; }
.rdr-log p:nth-child(4) { animation-delay: 3.4s; }
.rdr-log p:nth-child(5) { animation-delay: 4.4s; }
/* Chaque entrée apparaît, reste, puis fade pour laisser place au cycle suivant */
@keyframes rdr-log-entry {
  0%   { opacity: 0; transform: translateX(-8px); }
  8%   { opacity: 1; transform: translateX(0); }
  78%  { opacity: 1; }
  92%  { opacity: 0; }
  100% { opacity: 0; }
}

/* ─── Top/bottom bars (HUD ambiance) ─────────────────────────────── */
.rdr-hud {
  position: absolute; left: 0; right: 0;
  padding: 18px 24px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; letter-spacing: 0.4em;
  color: rgba(0,255,180,0.55);
  display: flex; justify-content: space-between; align-items: center;
  pointer-events: none; z-index: 3;
  text-transform: uppercase;
}
.rdr-hud.top { top: 0; }
.rdr-hud.bot { bottom: 0; }
.rdr-hud b { color: #f4c542; font-weight: 700; }
.rdr-hud .dot {
  display: inline-block; width: 6px; height: 6px;
  border-radius: 50%; background: #00ffb4;
  box-shadow: 0 0 6px #00ffb4;
  margin-right: 8px; vertical-align: middle;
  animation: rdr-hud-pulse 1s linear infinite;
}
@keyframes rdr-hud-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }

/* Scan line qui défile (CRT) */
.rdr-scan {
  position: absolute; left: 0; right: 0; height: 80px;
  background: linear-gradient(180deg, transparent 0%, rgba(0,255,180,0.06) 50%, transparent 100%);
  z-index: 2; pointer-events: none;
  animation: rdr-scan 6s linear infinite;
}
@keyframes rdr-scan {
  0%   { top: -80px; }
  100% { top: 100%; }
}

/* Tip discret */
.rdr-tip {
  position: absolute; bottom: 50px; left: 50%; transform: translateX(-50%);
  font-family: 'Cinzel', serif; font-weight: 700;
  font-size: 10px; letter-spacing: 0.4em;
  color: rgba(255,255,255,0.4);
  text-align: center; max-width: 480px;
  pointer-events: none; z-index: 3;
}
.rdr-tip .lbl { color: #f4c542; opacity: 0.8; font-size: 9px; margin-bottom: 4px; letter-spacing: 0.55em; }
.rdr-tip .txt { transition: opacity 0.3s; }

/* ═════════════ Exit animation ═════════════
 * Quand la connexion est résolue, on déclenche cette séquence :
 *   1. Le contenu (scope + textes + log + tip) fade-out + blur
 *   2. Un FLASH radial or éclate depuis le centre, scale-up
 *   3. Une nappe noire fade-in par-dessus → écran totalement opaque noir
 * Au bout de 0.8 s, le parent swap vers Countdown qui démarre déjà opaque.
 */
.rdr-stage.exiting .rdr-scope,
.rdr-stage.exiting .rdr-title,
.rdr-stage.exiting .rdr-sub,
.rdr-stage.exiting .rdr-log,
.rdr-stage.exiting .rdr-tip,
.rdr-stage.exiting .rdr-hud {
  animation: rdr-content-out 0.5s ease-out forwards;
}
@keyframes rdr-content-out {
  0%   { opacity: 1; transform: scale(1); filter: blur(0); }
  100% { opacity: 0; transform: scale(0.92); filter: blur(6px); }
}

.rdr-flash-bright {
  position: fixed; inset: 0; pointer-events: none; z-index: 1100;
  background: radial-gradient(circle at 50% 50%,
    #fff5d4 0%, #ffd247 18%, #f4c542 32%, rgba(184, 122, 26, 0.6) 55%, transparent 80%);
  opacity: 0;
  transform: scale(0.05);
}
.rdr-stage.exiting .rdr-flash-bright {
  animation: rdr-bright-out 0.55s cubic-bezier(0.3, 0.0, 0.6, 1) forwards;
}
@keyframes rdr-bright-out {
  0%   { opacity: 0; transform: scale(0.05); }
  35%  { opacity: 1; transform: scale(1.8); }
  100% { opacity: 0; transform: scale(3.2); }
}

.rdr-flash-dark {
  position: fixed; inset: 0; pointer-events: none; z-index: 1099;
  background: radial-gradient(circle at 50% 50%,
    rgba(20, 4, 8, 0.95) 0%, rgba(0, 0, 0, 1) 100%);
  opacity: 0;
}
.rdr-stage.exiting .rdr-flash-dark {
  animation: rdr-dark-in 0.6s ease-in 0.2s forwards;
}
@keyframes rdr-dark-in {
  0%   { opacity: 0; }
  100% { opacity: 1; }
}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = RADAR_CSS;
  document.head.appendChild(el);
}

const LOG_LINES = [
  'UPLINK ÉTABLI · CANAL CHIFFRÉ',
  'CHARGEMENT DU THEATRE · GRID 144x72',
  '5 HOSTILES DÉTECTÉS · DIFFICULTÉ NORMAL',
  'COALITIONS SYNCHRONISÉES',
  'PRÊT · EN ATTENTE D\'ORDRES',
];

const TIPS = [
  "L'expansion précoce capture les territoires neutres avant l'opposition.",
  "Une alliance vaut deux victoires. Sauf quand ton allié vise ta capitale.",
  "Le port double ta valeur défensive sur la côte.",
  "Une montagne mal défendue, c'est une porte ouverte. Garnison toujours.",
];

export function LoadingScreen({ onComplete, exiting }: Props) {
  useEffect(() => { injectStyle(); }, []);

  // Notify after one full cycle (6s)
  useEffect(() => {
    if (!onComplete) return;
    const id = window.setTimeout(onComplete, 6000);
    return () => window.clearTimeout(id);
  }, [onComplete]);

  // Rotate tip every 4.5s (so it changes once per cycle ~)
  useEffect(() => {
    const el = document.getElementById('rdr-tip-txt');
    if (!el) return;
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % TIPS.length;
      el.style.opacity = '0';
      window.setTimeout(() => {
        el.textContent = TIPS[i];
        el.style.opacity = '0.7';
      }, 280);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={`rdr-stage${exiting ? ' exiting' : ''}`}>
      {exiting && <div className="rdr-flash-dark" aria-hidden />}
      {exiting && <div className="rdr-flash-bright" aria-hidden />}
      <div className="rdr-scan" />

      <div className="rdr-hud top">
        <span><span className="dot" />WARFRONT · SALIÈGE COMMAND</span>
        <span><b>SECURE</b> · NODE SLG-01</span>
      </div>

      <div className="rdr-scene">
        <div className="rdr-inner">
          <div className="rdr-scope">
            <div className="rdr-cross" />
            <i className="rdr-blip" />
            <i className="rdr-blip" />
            <i className="rdr-blip" />
            <i className="rdr-blip" />
            <i className="rdr-blip" />
            <i className="rdr-blip" />
            <i className="rdr-blip" />
            <div className="rdr-sweep" />
          </div>
          <h2 className="rdr-title">SCANNING THEATER</h2>
          <div className="rdr-sub">DEPLOYING · STAND BY</div>
          <div className="rdr-log">
            {LOG_LINES.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      </div>

      <div className="rdr-hud bot">
        <span>v1.0 · BUILD 042</span>
        <span><b>STATUS</b> · CONNECTING</span>
      </div>

      <div className="rdr-tip">
        <div className="lbl">TIP DU CROUPIER</div>
        <div id="rdr-tip-txt" className="txt" style={{ opacity: 0.7 }}>
          {TIPS[0]}
        </div>
      </div>
    </div>
  );
}
