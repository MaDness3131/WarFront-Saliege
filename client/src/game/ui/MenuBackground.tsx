/**
 * MenuBackground — fond animé casino + tactique pour MainMenu.
 * ------------------------------------------------------------
 * Remplace l'ancien fond cyan/radar par un mélange casino royal :
 *
 *   Couche tactique :
 *     - silhouette du monde (atlas compact) shimmer or → rouge en X
 *     - radar conique doré qui tourne lentement (18 s)
 *     - anneaux de portée concentriques pulsants
 *     - 13 capitales pulsantes (3 hostiles en rouge)
 *     - grille tactique gold faint sur tout l'écran
 *     - scan line CRT qui défile
 *
 *   Couche casino :
 *     - ampoules de marquee Vegas qui clignotent (haut + bas)
 *     - 6 cartes à jouer flottantes dérivant en boucle
 *     - 4 jetons de poker spinning lentement
 *     - particules d'embers (or + rouge) qui montent
 *
 * Palette unifiée : noir velours / or / rouge. Pas de cyan/vert.
 *
 * Le composant injecte son CSS une seule fois dans <head>. Il rend un canvas
 * pour la silhouette + les particules (perf), et le reste en DOM.
 */

import { useEffect, useRef } from 'react';

const STYLE_ID = '__menu_bg_casino__';

const MENU_BG_CSS = `
/* ─── Neutralise l'ancien fond du menu pour que ce composant prenne le relais ───
   On supprime le gradient de .menu-screen, la scan-line ::before, la vignette
   ::after, et la grille cyan rendue par <div className="menu-bg-grid">. */
.menu-screen { background: #050203 !important; }
.menu-screen::before,
.menu-screen::after { display: none !important; }
.menu-bg-grid { display: none !important; }
.menu-bg-canvas { display: none !important; }

.cb-bg {
  position: absolute; inset: 0; overflow: hidden;
  background:
    radial-gradient(ellipse 80% 100% at 50% 50%, #2a0810 0%, #1a0408 40%, #050203 100%);
  pointer-events: none;
  z-index: 0;
}
.cb-bg .cb-grid {
  position: absolute; inset: 0;
  background:
    linear-gradient(rgba(244,197,66,0.035) 1px, transparent 1px) 0 0/64px 64px,
    linear-gradient(90deg, rgba(244,197,66,0.035) 1px, transparent 1px) 0 0/64px 64px;
  mask: radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent 80%);
  -webkit-mask: radial-gradient(ellipse 80% 80% at 50% 50%, black, transparent 80%);
}
.cb-bg canvas { position: absolute; inset: 0; width: 100%; height: 100%; }

/* Cartes flottantes */
.cb-bg .cb-card {
  position: absolute;
  width: 80px; height: 116px;
  border-radius: 6px;
  background: linear-gradient(180deg, rgba(255,245,212,0.06) 0%, rgba(255,245,212,0.02) 100%);
  border: 1px solid rgba(244,197,66,0.18);
  box-shadow: 0 0 30px rgba(0,0,0,0.4), inset 0 0 14px rgba(244,197,66,0.06);
  display: grid; place-items: center;
  font-family: 'Limelight', serif;
  font-size: 38px;
  color: rgba(244,197,66,0.25);
  text-shadow: 0 0 8px rgba(244,197,66,0.4);
}
.cb-bg .cb-card.r { color: rgba(197,20,42,0.35); text-shadow: 0 0 8px rgba(197,20,42,0.5); }
.cb-bg .cb-card.c1 { top: 8%;  left: 6%;  animation: cb-float-a 18s ease-in-out infinite; }
.cb-bg .cb-card.c2 { top: 14%; right: 8%; animation: cb-float-b 22s ease-in-out infinite; }
.cb-bg .cb-card.c3 { bottom: 12%; left: 18%; animation: cb-float-c 26s ease-in-out infinite; }
.cb-bg .cb-card.c4 { bottom: 18%; right: 14%; animation: cb-float-d 20s ease-in-out infinite; }
.cb-bg .cb-card.c5 { top: 50%; left: 4%; animation: cb-float-b 28s ease-in-out infinite reverse; }
.cb-bg .cb-card.c6 { top: 60%; right: 6%; animation: cb-float-c 32s ease-in-out infinite reverse; }
@keyframes cb-float-a { 0%,100%{transform:translateY(0) rotate(-12deg)} 50%{transform:translateY(-30px) rotate(-8deg)} }
@keyframes cb-float-b { 0%,100%{transform:translateY(0) rotate(15deg)}  50%{transform:translateY(-26px) rotate(18deg)} }
@keyframes cb-float-c { 0%,100%{transform:translateY(0) rotate(8deg)}   50%{transform:translateY(-22px) rotate(12deg)} }
@keyframes cb-float-d { 0%,100%{transform:translateY(0) rotate(-10deg)} 50%{transform:translateY(-28px) rotate(-6deg)} }

/* Jetons */
.cb-bg .cb-chip {
  position: absolute;
  width: 70px; height: 70px; border-radius: 50%;
  background: radial-gradient(circle, rgba(244,197,66,0.08) 0%, rgba(244,197,66,0.02) 70%, transparent 100%);
  border: 2px dashed rgba(244,197,66,0.22);
  box-shadow: 0 0 24px rgba(244,197,66,0.1);
  display: grid; place-items: center;
  font-family: 'Cinzel', serif; font-weight: 900;
  font-size: 14px; letter-spacing: 0.1em;
  color: rgba(244,197,66,0.3);
}
.cb-bg .cb-chip.red { border-color: rgba(197,20,42,0.28); color: rgba(197,20,42,0.4); }
.cb-bg .cb-chip::before {
  content: ""; position: absolute; inset: 8px; border-radius: 50%;
  border: 1px solid currentColor; opacity: 0.4;
}
.cb-bg .cb-chip.k1 { top: 22%; left: 28%; animation: cb-bob-a 14s ease-in-out infinite; }
.cb-bg .cb-chip.k2 { bottom: 26%; left: 60%; animation: cb-bob-b 18s ease-in-out infinite; }
.cb-bg .cb-chip.k3 { top: 36%; right: 22%; animation: cb-bob-a 22s ease-in-out infinite reverse; }
.cb-bg .cb-chip.k4 { bottom: 30%; left: 10%; animation: cb-bob-b 16s ease-in-out infinite reverse; }
@keyframes cb-bob-a { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-18px)} }
@keyframes cb-bob-b { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-22px)} }

/* Radar cone */
.cb-bg .cb-radar {
  position: absolute; left: 50%; top: 50%;
  width: 250vmax; height: 250vmax;
  transform: translate(-50%,-50%);
  background: conic-gradient(
    from 0deg,
    rgba(244,197,66,0.0) 0deg,
    rgba(244,197,66,0.0) 320deg,
    rgba(244,197,66,0.08) 358deg,
    rgba(244,197,66,0.18) 360deg);
  animation: cb-radar-spin 18s linear infinite;
  mix-blend-mode: screen;
}
@keyframes cb-radar-spin { to { transform: translate(-50%,-50%) rotate(360deg); } }

/* Range rings */
.cb-bg .cb-rings { position: absolute; left: 50%; top: 50%; }
.cb-bg .cb-rings i {
  position: absolute;
  border-radius: 50%;
  border: 1px solid rgba(244,197,66,0.08);
  transform: translate(-50%,-50%);
  animation: cb-ring-pulse 6s ease-in-out infinite;
}
.cb-bg .cb-rings i:nth-child(1) { width: 30vmin; height: 30vmin; animation-delay: 0s; }
.cb-bg .cb-rings i:nth-child(2) { width: 55vmin; height: 55vmin; animation-delay: 1.5s; }
.cb-bg .cb-rings i:nth-child(3) { width: 85vmin; height: 85vmin; animation-delay: 3s; }
.cb-bg .cb-rings i:nth-child(4) { width: 120vmin; height: 120vmin; animation-delay: 4.5s; }
@keyframes cb-ring-pulse {
  0%,100% { opacity: 0.3; border-color: rgba(244,197,66,0.08); }
  50%     { opacity: 1; border-color: rgba(244,197,66,0.22); }
}

/* Vegas marquee bulbs */
.cb-bg .cb-marquee { position: absolute; left: 0; right: 0; height: 3px; }
.cb-bg .cb-marquee.t { top: 0; }
.cb-bg .cb-marquee.b { bottom: 0; }
.cb-bg .cb-marquee i {
  position: absolute;
  width: 6px; height: 6px; border-radius: 50%;
  background: #ffd247;
  box-shadow: 0 0 8px #ffd247, 0 0 18px rgba(255,210,71,0.5);
  top: 50%; transform: translate(-50%,-50%);
  animation: cb-bulb 1.6s linear infinite;
}
@keyframes cb-bulb {
  0%, 49% { opacity: 1; }
  50%, 99% { opacity: 0.25; box-shadow: 0 0 2px #5a3a0a; }
  100% { opacity: 1; }
}

/* Capital nodes */
.cb-bg .cb-nodes { position: absolute; inset: 0; }
.cb-bg .cb-node {
  position: absolute;
  width: 8px; height: 8px;
  border-radius: 50%;
  background: #ffd247;
  box-shadow: 0 0 12px #ffd247, 0 0 24px rgba(244,197,66,0.6);
  transform: translate(-50%,-50%);
  animation: cb-node-pulse 2.6s ease-in-out infinite;
}
.cb-bg .cb-node.r {
  background: #ff4060;
  box-shadow: 0 0 12px #ff4060, 0 0 24px rgba(255,64,96,0.5);
}
@keyframes cb-node-pulse {
  0%,100% { transform: translate(-50%,-50%) scale(1); opacity: 1; }
  50%     { transform: translate(-50%,-50%) scale(0.6); opacity: 0.5; }
}

/* Vignette */
.cb-bg .cb-vignette {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%);
  z-index: 10;
}

/* Scan line */
.cb-bg .cb-scan {
  position: absolute; left: 0; right: 0;
  height: 120px;
  background: linear-gradient(180deg, transparent 0%, rgba(244,197,66,0.04) 50%, transparent 100%);
  z-index: 9;
  animation: cb-scan-move 12s linear infinite;
}
@keyframes cb-scan-move {
  0%   { top: -120px; }
  100% { top: 100%; }
}
`;

function injectStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = MENU_BG_CSS;
  document.head.appendChild(el);
}

// Atlas compact 96×42 — silhouette monde (issu de l'ancien MenuBackground).
const ATLAS: readonly string[] = [
  '................................................................................................',
  '......######.................................######.............................###............',
  '....##############......................########################...........############.........',
  '..######################################################################################.........',
  '.######################################################################################..........',
  '.#####################################################################################...........',
  '..#############^^############################################################################....',
  '..############^^^############################################################################....',
  '..############^^^############################################################################....',
  '...############^^^#########################################################################......',
  '....###########^^^#######################################################################........',
  '......##########^^^####################################################################..........',
  '........#########^^^##################################################################...........',
  '..........########^^^###############################################################.............',
  '............######^^^############################################################...............',
  '.............#####^^^##########################################################.................',
  '..............####^^^^########################################################..................',
  '...............###^^^^######################################################....................',
  '...............##^^^^^####################################################......................',
  '...............##^^^^^##################################################........................',
  '..............##^^^^^^##############################################............................',
  '..............##^^^^############################################................................',
  '..............##^^^^##########################################..................................',
  '..............##^^^^########################################....................................',
  '..............##^^^^######################################......................................',
  '..............##^^^^####################################........................................',
  '..............##^^^####################################..........................................',
  '..............##^^####################################..........................................',
  '..............#^###################################..............................................',
  '..............#^#################################................................................',
  '..............##################################.................................................',
  '..............#################################..................................................',
  '..............################################...................................................',
  '..............#############################......................................................',
  '..............##########################.........................................................',
  '..............######################..............................................................',
  '..............##################..................................................................',
  '..............#############.......................................................................',
  '..............#########............................................................................',
  '..............######...............................................................................',
  '..............####.................................................................................',
  '..............##...................................................................................',
];
const ATLAS_W = ATLAS[0].length;
const ATLAS_H = ATLAS.length;

const NODES: { x: number; y: number; r?: boolean }[] = [
  { x: 0.16, y: 0.32 }, { x: 0.22, y: 0.45 }, { x: 0.28, y: 0.58, r: true },
  { x: 0.36, y: 0.28 }, { x: 0.44, y: 0.42 }, { x: 0.52, y: 0.36, r: true },
  { x: 0.58, y: 0.50 }, { x: 0.50, y: 0.65 }, { x: 0.64, y: 0.32 },
  { x: 0.72, y: 0.46, r: true }, { x: 0.78, y: 0.30 },
  { x: 0.84, y: 0.42 }, { x: 0.88, y: 0.56 },
];

const CARDS = [
  { cls: 'c1', red: false, face: 'A♠' },
  { cls: 'c2', red: true,  face: 'Q♥' },
  { cls: 'c3', red: false, face: 'K♣' },
  { cls: 'c4', red: true,  face: 'J♦' },
  { cls: 'c5', red: false, face: '★'  },
  { cls: 'c6', red: true,  face: '7♥' },
];

const CHIPS = [
  { cls: 'k1', red: false, val: '10' },
  { cls: 'k2', red: true,  val: '25' },
  { cls: 'k3', red: false, val: '100' },
  { cls: 'k4', red: true,  val: '5' },
];

export function MenuBackground() {
  const silRef = useRef<HTMLCanvasElement>(null);
  const dustRef = useRef<HTMLCanvasElement>(null);
  const marqueeTopRef = useRef<HTMLDivElement>(null);
  const marqueeBotRef = useRef<HTMLDivElement>(null);

  useEffect(() => { injectStyle(); }, []);

  useEffect(() => {
    const sil = silRef.current;
    const dust = dustRef.current;
    if (!sil || !dust) return;
    const sctx = sil.getContext('2d');
    const dctx = dust.getContext('2d');
    if (!sctx || !dctx) return;

    let W = window.innerWidth, H = window.innerHeight;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;
      sil.width = W * dpr; sil.height = H * dpr;
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dust.width = W * dpr; dust.height = H * dpr;
      dctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      placeBulbs();
    };

    const placeBulbs = () => {
      const t = marqueeTopRef.current;
      const b = marqueeBotRef.current;
      if (!t || !b) return;
      t.innerHTML = ''; b.innerHTML = '';
      const N = Math.max(20, Math.floor(W / 36));
      for (let i = 0; i < N; i++) {
        const x = ((i + 0.5) / N) * 100;
        const it = document.createElement('i');
        it.style.left = x + '%';
        it.style.animationDelay = (i * 0.08) + 's';
        t.appendChild(it);
        const ib = it.cloneNode() as HTMLElement;
        b.appendChild(ib);
      }
    };

    resize();
    window.addEventListener('resize', resize);

    // Particles
    type P = { x: number; y: number; r: number; vx: number; vy: number; life: number; hue: 'red' | 'gold'; phase: number };
    const particles: P[] = [];
    let spawnTimer = 0;

    const startT = performance.now();
    let last = startT;
    let raf = 0;

    const tick = (now: number) => {
      const dt = now - last; last = now;
      const t = (now - startT) / 1000;

      // ─── Silhouette ──
      sctx.clearRect(0, 0, W, H);
      const cellW = W / ATLAS_W;
      const cellH = (H / ATLAS_H) * 0.65;
      const offY = H * 0.18;
      for (let y = 0; y < ATLAS_H; y++) {
        const row = ATLAS[y];
        for (let x = 0; x < ATLAS_W; x++) {
          const ch = row.charAt(x);
          if (ch !== '#' && ch !== '^') continue;
          const phase = ((x / ATLAS_W) + t * 0.04) % 1;
          const isMtn = ch === '^';
          let r, g, b;
          if (phase < 0.5) {
            const k = phase * 2;
            r = Math.round(244 + (197 - 244) * k);
            g = Math.round(197 + (20  - 197) * k);
            b = Math.round(66  + (42  -  66) * k);
          } else {
            const k = (phase - 0.5) * 2;
            r = Math.round(197 + (244 - 197) * k);
            g = Math.round(20  + (197 -  20) * k);
            b = Math.round(42  + (66  -  42) * k);
          }
          sctx.fillStyle = `rgba(${r},${g},${b},${isMtn ? 0.14 : 0.07})`;
          sctx.fillRect(x * cellW, offY + y * cellH, cellW + 0.6, cellH + 0.6);
        }
      }

      // ─── Particles ──
      dctx.clearRect(0, 0, W, H);
      spawnTimer += dt;
      if (spawnTimer > 90 && particles.length < 60) {
        particles.push({
          x: Math.random() * W, y: H + 10,
          r: 0.6 + Math.random() * 1.8,
          vy: -0.15 - Math.random() * 0.4,
          vx: (Math.random() - 0.5) * 0.18,
          life: 1,
          hue: Math.random() < 0.3 ? 'red' : 'gold',
          phase: Math.random() * Math.PI * 2,
        });
        spawnTimer = 0;
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy;
        p.life -= 0.0024;
        p.phase += 0.04;
        const ax = p.x + Math.sin(p.phase) * 6;
        if (p.life <= 0 || p.y < -10) { particles.splice(i, 1); continue; }
        const color = p.hue === 'red'
          ? `rgba(255, 80, 100, ${p.life * 0.7})`
          : `rgba(255, 210, 71, ${p.life * 0.8})`;
        dctx.fillStyle = color;
        dctx.shadowColor = color;
        dctx.shadowBlur = 8;
        dctx.beginPath();
        dctx.arc(ax, p.y, p.r * p.life, 0, Math.PI * 2);
        dctx.fill();
      }
      dctx.shadowBlur = 0;

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="cb-bg" aria-hidden>
      <div className="cb-grid" />

      <canvas ref={silRef} />

      <div className="cb-rings">
        <i /><i /><i /><i />
      </div>
      <div className="cb-radar" />

      {CHIPS.map((c) => (
        <div key={c.cls} className={`cb-chip ${c.cls}${c.red ? ' red' : ''}`}>{c.val}</div>
      ))}

      {CARDS.map((c) => (
        <div key={c.cls} className={`cb-card ${c.cls}${c.red ? ' r' : ''}`}>{c.face}</div>
      ))}

      <div className="cb-nodes">
        {NODES.map((n, i) => (
          <div
            key={i}
            className={`cb-node${n.r ? ' r' : ''}`}
            style={{
              left: `${n.x * 100}%`,
              top: `${n.y * 100}%`,
              animationDelay: `${i * 0.2}s`,
            }}
          />
        ))}
      </div>

      <div ref={marqueeTopRef} className="cb-marquee t" />
      <div ref={marqueeBotRef} className="cb-marquee b" />

      <canvas ref={dustRef} />

      <div className="cb-scan" />
      <div className="cb-vignette" />
    </div>
  );
}
