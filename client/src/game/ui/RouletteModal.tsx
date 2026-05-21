/**
 * RouletteModal — roulette européenne, animation robuste.
 * --------------------------------------------------------------------------
 * Pattern d'animation impératif :
 *   1. La rotation de la roue est gérée par ref + DOM direct (pas par
 *      React state). À chaque spin, on set transition='none' + transform=
 *      angle actuel, on force un reflow, puis on set transition + nouvel
 *      angle. La transition CSS joue alors systématiquement, peu importe
 *      les timings de re-render React.
 *   2. L'angle est CUMULATIF (stocké dans angleRef.current) — la roue
 *      continue dans le même sens entre deux spins consécutifs.
 *
 * Visuel :
 *   - Conic-gradient pour les 37 secteurs colorés
 *   - Numéros en blanc positionnés au centre de chaque secteur, qui
 *     tournent avec la roue (text reste lisible grâce au double rotate)
 *   - Bille blanche statique perchée sur la jante interne (sous le pointeur)
 *   - Pointeur or triangulaire au sommet
 *   - Halo doré pulsant pendant le spin
 *   - Highlight du numéro gagnant après l'arrêt
 *
 * Paris : rouge/noir (×2), pair/impair (×2), low/high (×2), plein (×36).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { socket } from '../../network/SocketClient';
import { ROULETTE_MIN_BET, ROULETTE_MAX_BET, ROULETTE_RED_NUMBERS } from '@shared/constants';
import { GameSnapshot } from '../useGameState';

type BetType = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'number';

interface Props {
  snap: GameSnapshot;
  onClose: () => void;
}

interface RouletteResult {
  number: number;
  payout: number;
  won: boolean;
}

/** Ordre européen standard (CW depuis le 0 en haut). */
const ROULETTE_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];
const SLOT_ANGLE = 360 / 37;             // ~9.73°
const SPIN_DURATION_MS = 3600;
const WHEEL_SIZE = 280;

function slotColor(n: number): string {
  if (n === 0) return '#1e7d3a';
  return ROULETTE_RED_NUMBERS.has(n) ? '#c0392b' : '#1a0d10';
}

export function RouletteModal({ snap, onClose }: Props) {
  const me = snap.me;

  const [betType, setBetType] = useState<BetType>('red');
  const [betNumber, setBetNumber] = useState(7);
  const [betAmount, setBetAmount] = useState(100);
  const [spinning, setSpinning] = useState(false);
  const [shownResult, setShownResult] = useState<RouletteResult | null>(null);

  // Refs pour la rotation impérative — découplée de React state.
  const wheelRef = useRef<HTMLDivElement | null>(null);
  const angleRef = useRef(0);
  const timersRef = useRef<number[]>([]);

  // Abonnement aux résultats émis par la simulation.
  useEffect(() => {
    const off = socket.onEvent('rl_result', (p: any) => {
      if (!me || p.playerId !== me.id) return;
      const idx = ROULETTE_ORDER.indexOf(p.number);
      if (idx < 0) return;

      // Cleanup timers d'un précédent spin.
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];

      // Calcul de l'angle cible (cumulatif, 5 tours + delta).
      const targetMod = (360 - idx * SLOT_ANGLE) % 360;
      const prevMod = ((angleRef.current % 360) + 360) % 360;
      let delta = targetMod - prevMod;
      if (delta < 0) delta += 360;
      const newAngle = angleRef.current + delta + 360 * 5;

      // Animation impérative : pattern reflow forcé.
      const raf = requestAnimationFrame(() => {
        const el = wheelRef.current;
        if (!el) return;
        el.style.transition = 'none';
        el.style.transform = `rotate(${angleRef.current}deg)`;
        void el.offsetHeight; // reflow
        el.style.transition = `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.16, 0.78, 0.18, 1)`;
        el.style.transform = `rotate(${newAngle}deg)`;
        angleRef.current = newAngle;
      });

      // Verdict révélé à la fin de l'animation.
      const t = window.setTimeout(() => {
        setShownResult({ number: p.number, payout: p.payout, won: p.won });
        setSpinning(false);
      }, SPIN_DURATION_MS + 200);
      timersRef.current.push(t);

      return () => cancelAnimationFrame(raf);
    });
    return () => {
      off();
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    };
  }, [me?.id]);

  // Conic-gradient des 37 secteurs colorés (calculé une fois).
  const conicBg = useMemo(() => {
    const stops: string[] = [];
    for (let i = 0; i < ROULETTE_ORDER.length; i++) {
      const n = ROULETTE_ORDER[i];
      const start = (i * SLOT_ANGLE).toFixed(3);
      const end = ((i + 1) * SLOT_ANGLE).toFixed(3);
      stops.push(`${slotColor(n)} ${start}deg ${end}deg`);
    }
    // -SLOT_ANGLE/2 pour centrer le secteur 0 (numéro 0) sur le haut.
    return `conic-gradient(from -${SLOT_ANGLE / 2}deg, ${stops.join(', ')})`;
  }, []);

  if (!me) return null;

  const canBet =
    !spinning &&
    betAmount >= ROULETTE_MIN_BET &&
    betAmount <= ROULETTE_MAX_BET &&
    me.gold >= betAmount;

  const onSpin = () => {
    if (!canBet) return;
    setSpinning(true);
    setShownResult(null);
    socket.rouletteSpin(betType, betAmount, betNumber);
  };

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose} aria-label="Fermer">×</button>

        <div className="rl-title">ROULETTE</div>
        <div className="rl-subtitle">
          Solde : <span>{Math.floor(me.gold)} or</span>
        </div>

        {/* ── Roue ─────────────────────────────────────────────────── */}
        <div className="rl-wheel-wrap" style={{ width: WHEEL_SIZE, height: WHEEL_SIZE }}>
          <div className="rl-pointer" />
          <div className="rl-rim" />
          <div className="rl-ball" />

          <div
            ref={wheelRef}
            className={`rl-wheel ${spinning ? 'is-spinning' : ''}`}
            style={{
              width: WHEEL_SIZE,
              height: WHEEL_SIZE,
              background: conicBg,
              /* transform / transition gérés impérativement via ref */
            }}
          >
            {/* Numéros centrés sur leur secteur, contre-rotated pour rester lisibles */}
            {ROULETTE_ORDER.map((n, i) => {
              const angle = i * SLOT_ANGLE;
              const radius = WHEEL_SIZE * 0.395;
              const isWinning = !spinning && shownResult?.number === n;
              return (
                <div
                  key={n}
                  className={`rl-number ${isWinning ? 'is-winning' : ''}`}
                  style={{
                    transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-${radius}px) rotate(${-angle}deg)`,
                  }}
                >
                  {n}
                </div>
              );
            })}

            <div className="rl-hub">
              <div className="rl-hub-inner">★</div>
            </div>
          </div>
        </div>

        {/* ── Verdict ─────────────────────────────────────────────── */}
        <div className={`rl-verdict ${shownResult ? (shownResult.won ? 'won' : 'lost') : spinning ? 'spinning' : 'idle'}`}>
          {shownResult ? (
            <>
              <span className="rl-verdict-num" style={{ background: slotColor(shownResult.number) }}>
                {shownResult.number}
              </span>
              <span className="rl-verdict-label">
                {shownResult.won ? 'GAGNÉ' : 'PERDU'}
              </span>
              {shownResult.won && (
                <span className="rl-verdict-payout">+{shownResult.payout} or</span>
              )}
            </>
          ) : spinning ? (
            <span className="rl-verdict-label rl-pulse">La bille roule…</span>
          ) : (
            <span className="rl-verdict-label rl-hint">Choisis ton pari</span>
          )}
        </div>

        {/* ── Paris ───────────────────────────────────────────────── */}
        <div className="rl-bets">
          <BetBtn label="Rouge"  active={betType === 'red'}   onClick={() => setBetType('red')}   cls="bet-red" />
          <BetBtn label="Noir"   active={betType === 'black'} onClick={() => setBetType('black')} cls="bet-black" />
          <BetBtn label="Pair"   active={betType === 'even'}  onClick={() => setBetType('even')} />
          <BetBtn label="Impair" active={betType === 'odd'}   onClick={() => setBetType('odd')} />
          <BetBtn label="1–18"   active={betType === 'low'}   onClick={() => setBetType('low')} />
          <BetBtn label="19–36"  active={betType === 'high'}  onClick={() => setBetType('high')} />
          <BetBtn
            label={`N°${betNumber} · ×36`}
            active={betType === 'number'}
            onClick={() => setBetType('number')}
            cls="bet-number"
          />
        </div>

        {betType === 'number' && (
          <div className="rl-numgrid">
            {Array.from({ length: 37 }, (_, n) => (
              <button
                key={n}
                className={`rl-num ${betNumber === n ? 'sel' : ''}`}
                style={{ background: slotColor(n) }}
                onClick={() => setBetNumber(n)}
                disabled={spinning}
              >
                {n}
              </button>
            ))}
          </div>
        )}

        {/* ── Mise + Spin ─────────────────────────────────────────── */}
        <div className="rl-controls">
          <div className="rl-amount-row">
            <span className="rl-amount-label">Mise</span>
            <input
              type="number"
              min={ROULETTE_MIN_BET}
              max={ROULETTE_MAX_BET}
              step={50}
              value={betAmount}
              onChange={(e) => setBetAmount(Math.max(0, Number(e.target.value) || 0))}
              disabled={spinning}
            />
            <span className="rl-amount-unit">or</span>
          </div>
          <div className="rl-chip-quick">
            {[100, 500, 1000, 5000].map((v) => (
              <button
                key={v}
                disabled={spinning}
                onClick={() => setBetAmount((cur) => Math.min(ROULETTE_MAX_BET, cur + v))}
              >+{v}</button>
            ))}
            <button
              disabled={spinning}
              onClick={() => setBetAmount(ROULETTE_MIN_BET)}
              className="rl-chip-reset"
            >RAZ</button>
          </div>
          <button className="rl-spin" onClick={onSpin} disabled={!canBet}>
            {spinning ? '⏳ Bille en jeu…' : `🎯 Tourner · ${betAmount} or`}
          </button>
        </div>
      </div>
    </div>
  );
}

function BetBtn({
  label, active, onClick, cls,
}: {
  label: string; active: boolean; onClick: () => void; cls?: string;
}) {
  return (
    <button className={`rl-bet ${cls ?? ''} ${active ? 'active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}
