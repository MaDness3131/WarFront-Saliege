/**
 * SlotsModal — machine à sous avec vrai scroll vertical des rouleaux.
 * --------------------------------------------------------------------------
 * Chaque rouleau est un strip de N cellules empilées verticalement dans
 * une fenêtre clippée par overflow:hidden. Au pull, le strip translate
 * de N×CELL_H pixels vers le haut avec easing cubic-bezier → effet de
 * défilement réaliste. Le symbole final est placé en BAS du strip pour
 * qu'il soit affiché quand l'animation se termine.
 *
 * Cascade : reel0 stop 1.1 s · reel1 1.7 s · reel2 2.3 s. Chaque reel a
 * son propre composant remonté à chaque pull (via key) pour réinitialiser
 * la position et déclencher l'animation CSS proprement.
 *
 * Sur jackpot (3 wilds), pluie de confettis or + halo pulsant sur le
 * cabinet.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../../network/SocketClient';
import { SLOTS_BET_COST } from '@shared/constants';
import { GameSnapshot } from '../useGameState';

const SYMBOL_GLYPHS = ['🍒', '🌾', '🏭', '💎', '★'];
const SYMBOL_LABELS = ['Cerises', 'Villes', 'Usines', 'Diamants', 'JACKPOT'];
const SYMBOL_PAYOUTS = [300, 1500, 3500, 15000, 50000];

const CELL_H = 80;          // hauteur d'une cellule en px
const STRIP_LEN = 30;       // nombre de symboles dans le strip de scroll
const REEL_DURATIONS = [1100, 1700, 2300]; // ms par rouleau (cascade)

interface Props {
  snap: GameSnapshot;
  onClose: () => void;
}

interface SlotsResult {
  symbols: [number, number, number];
  payout: number;
  jackpot: boolean;
}

export function SlotsModal({ snap, onClose }: Props) {
  const me = snap.me;
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'revealed'>('idle');
  const [target, setTarget] = useState<[number, number, number]>([0, 1, 2]);
  const [result, setResult] = useState<SlotsResult | null>(null);
  /** Incrémenté à chaque pull → forces le remount des Reel pour animer. */
  const [spinKey, setSpinKey] = useState(0);

  useEffect(() => {
    const off = socket.onEvent('sl_result', (p: any) => {
      if (!me || p.playerId !== me.id) return;
      setTarget(p.symbols as [number, number, number]);
      setSpinKey((k) => k + 1);
      setResult(null);
      setPhase('spinning');
      // Le résultat est révélé quand le DERNIER reel s'arrête.
      const last = REEL_DURATIONS[REEL_DURATIONS.length - 1];
      window.setTimeout(() => {
        setResult({ symbols: p.symbols, payout: p.payout, jackpot: p.jackpot });
        setPhase('revealed');
      }, last + 100);
    });
    return off;
  }, [me?.id]);

  if (!me) return null;

  const spinning = phase === 'spinning';
  const canPull = !spinning && me.gold >= SLOTS_BET_COST;

  const onPull = () => {
    if (!canPull) return;
    socket.slotsPull();
  };

  return (
    <div className="sl-overlay" onClick={onClose}>
      <div className="sl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="sl-close" onClick={onClose} aria-label="Fermer">×</button>

        <div className="sl-title">MACHINE À SOUS</div>
        <div className="sl-subtitle">
          Mise <span>{SLOTS_BET_COST} or</span>
          <span className="sl-sep">·</span>
          Solde <span>{Math.floor(me.gold)} or</span>
        </div>

        {/* ── Cabinet ─────────────────────────────────────────────── */}
        <div className={`sl-cabinet ${result?.jackpot ? 'is-jackpot' : ''}`}>
          <div className="sl-reels">
            {[0, 1, 2].map((i) => (
              <Reel
                key={`r${i}-${spinKey}`}
                target={target[i]}
                duration={REEL_DURATIONS[i]}
                spinning={spinning}
                /* En idle initial, on affiche un symbole statique sans anim. */
                initialOnly={phase === 'idle' && spinKey === 0}
              />
            ))}
          </div>
          {result?.jackpot && <SlotConfetti />}
          {result && result.payout > 0 && !result.jackpot && (
            <div className="sl-win-highlight" />
          )}
        </div>

        {/* ── Verdict ─────────────────────────────────────────────── */}
        <div className={`sl-verdict ${result ? (result.jackpot ? 'jackpot' : result.payout > 0 ? 'won' : 'lost') : 'idle'}`}>
          {result ? (
            result.payout > 0 ? (
              <>
                <div className="sl-verdict-title">
                  {result.jackpot ? 'GIGA JACKPOT' : `3 × ${SYMBOL_LABELS[result.symbols[0]]}`}
                </div>
                <div className="sl-verdict-payout">+{result.payout} or</div>
              </>
            ) : (
              <div className="sl-verdict-title">Perdu — retente !</div>
            )
          ) : spinning ? (
            <div className="sl-verdict-title sl-pulse">Rouleaux en jeu…</div>
          ) : (
            <div className="sl-verdict-title sl-hint">Tire le levier</div>
          )}
        </div>

        {/* ── Levier ──────────────────────────────────────────────── */}
        <button className="sl-pull" onClick={onPull} disabled={!canPull}>
          {spinning ? '⏳ EN COURS' : `🎰 TIRER  ·  ${SLOTS_BET_COST} or`}
        </button>

        {/* ── Tableau des gains ───────────────────────────────────── */}
        <div className="sl-paytable">
          <div className="sl-paytable-title">Tableau des gains</div>
          <div className="sl-paytable-rows">
            {SYMBOL_GLYPHS.map((g, i) => (
              <div key={i} className="sl-paytable-row">
                <span className="sl-paytable-glyph">{g}{g}{g}</span>
                <span className="sl-paytable-label">{SYMBOL_LABELS[i]}</span>
                <span className="sl-paytable-payout">+{SYMBOL_PAYOUTS[i]} or</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Reel — un rouleau qui scroll verticalement.
 *  - Au montage, strip à translateY(0).
 *  - useLayoutEffect : on déclenche le scroll vers la position finale au
 *    prochain frame → la transition CSS prend effet.
 *  - Le symbole CIBLE est placé à l'index STRIP_LEN-1 du strip ; le reste
 *    est aléatoire pour le flou visuel pendant le scroll.
 *  - Quand l'animation se termine, l'utilisateur voit le dernier symbole
 *    centré dans la fenêtre.
 */
function Reel({
  target, duration, spinning, initialOnly,
}: {
  target: number; duration: number; spinning: boolean; initialOnly: boolean;
}) {
  // Génère un strip aléatoire SAUF la dernière cellule = symbole cible.
  // useMemo lié au target+duration : régénère seulement quand le composant
  // est remonté via la key parent.
  const strip = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < STRIP_LEN - 1; i++) {
      arr.push(Math.floor(Math.random() * 5));
    }
    arr.push(target);
    return arr;
  }, [target, duration]);

  const [translateY, setTranslateY] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  // Déclenche l'animation au prochain frame après le montage.
  useLayoutEffect(() => {
    if (!spinning) return;
    // Force le browser à appliquer translateY(0) avant de passer à la valeur cible.
    if (ref.current) void ref.current.offsetHeight; // reflow
    requestAnimationFrame(() => {
      // Position finale : la dernière cellule (le target) doit être visible
      // au centre de la fenêtre, donc translateY = -(STRIP_LEN - 1) * CELL_H.
      setTranslateY(-(STRIP_LEN - 1) * CELL_H);
    });
  }, [spinning]);

  // En mode "premier rendu sans spin" (placeholder), on affiche juste le
  // symbole cible centré, pas le strip complet.
  if (initialOnly) {
    return (
      <div className="sl-reel-window">
        <div className="sl-cell sl-cell-static">{SYMBOL_GLYPHS[target]}</div>
      </div>
    );
  }

  return (
    <div className="sl-reel-window">
      <div
        ref={ref}
        className="sl-reel-strip"
        style={{
          transform: `translateY(${translateY}px)`,
          transition: spinning
            ? `transform ${duration}ms cubic-bezier(0.18, 0.78, 0.22, 1)`
            : 'none',
        }}
      >
        {strip.map((s, i) => (
          <div key={i} className="sl-cell">{SYMBOL_GLYPHS[s]}</div>
        ))}
      </div>
    </div>
  );
}

function SlotConfetti() {
  const pieces = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    key: i,
    left: Math.random() * 100,
    delay: Math.random() * 600,
    dur: 1400 + Math.random() * 1200,
    color: ['#f1c40f', '#fff', '#ffd247', '#ff4060', '#9ad9b3'][i % 5],
  })), []);
  return (
    <div className="sl-confetti">
      {pieces.map((c) => (
        <span
          key={c.key}
          style={{
            left: `${c.left}%`,
            background: c.color,
            animationDelay: `${c.delay}ms`,
            animationDuration: `${c.dur}ms`,
          }}
        />
      ))}
    </div>
  );
}
