/**
 * RatioBar — barre de ratio d'attaque casino × tactique.
 * -------------------------------------------------------
 * Remplace l'ancien <input type="range">. Reprend l'esthétique du design asset
 * "HUD Icons and Troop Ratio.html" :
 *  - bordure or, rails de stripes animés à 45°, sparkle qui balaie le fill ;
 *  - pin draggable avec bulle "%" (Bungee), 5 ticks à 0/25/50/75/100 ;
 *  - presets 10/25/50/75/ALL-IN qui claquent le ratio instantanément ;
 *  - variante danger (rouge) quand on dépasse 70%.
 *
 * Interactions :
 *  - clic + drag sur la barre → setRatio en temps réel ;
 *  - clic preset → ratio absolu ;
 *  - molette → finetune ±5%.
 *
 * `value` est entre 0 et 1 (cohérent avec le reste du code : setAttackRatio).
 */

import { useCallback, useRef } from 'react';

interface Props {
  /** 0..1 */
  value: number;
  /** Total des troupes du joueur (pour afficher envoyé / réserve). */
  army: number;
  onChange: (v: number) => void;
}

const MIN = 0.05;
const MAX = 1.0;
const PRESETS: { label: string; v: number }[] = [
  { label: '10%',     v: 0.10 },
  { label: '25%',     v: 0.25 },
  { label: '50%',     v: 0.50 },
  { label: '75%',     v: 0.75 },
  { label: 'ALL-IN',  v: 1.00 },
];

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function fmt(n: number) {
  return Math.round(n).toLocaleString('fr-FR');
}

export function RatioBar({ value, army, onChange }: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  const pct = clamp(Math.round(value * 100), Math.round(MIN * 100), Math.round(MAX * 100));
  const sent = Math.round(army * value);
  const reserve = Math.max(0, army - sent);
  const danger = value > 0.7;

  const setFromClient = useCallback((clientX: number) => {
    const el = barRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    const v = clamp(raw, MIN, MAX);
    onChange(v);
  }, [onChange]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    (e.target as Element).setPointerCapture(e.pointerId);
    setFromClient(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setFromClient(e.clientX);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
  };
  const onWheel = (e: React.WheelEvent) => {
    const step = e.shiftKey ? 0.01 : 0.05;
    const dir = e.deltaY < 0 ? +1 : -1;
    onChange(clamp(value + dir * step, MIN, MAX));
  };

  return (
    <div className="ratio-cluster">
      <div className="ratio-head">
        <div className="ratio-head-title">RATIO D'ATTAQUE</div>
        <div className="ratio-head-stake">
          <span className="ratio-head-stake-num">{fmt(sent)}</span>
          <small>TROUPES</small>
        </div>
      </div>

      <div
        ref={barRef}
        className="ratio-bar"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="slider"
        aria-valuemin={MIN * 100}
        aria-valuemax={MAX * 100}
        aria-valuenow={pct}
        aria-label="Ratio d'attaque"
      >
        <div
          className={`ratio-fill${danger ? ' is-danger' : ''}`}
          style={{ width: `${pct}%` }}
        />
        <div className="ratio-ticks">
          <i /><i /><i /><i /><i />
        </div>
        <div className="ratio-pin" style={{ left: `${pct}%` }}>
          <div className="ratio-pin-head">{pct}%</div>
          <div className="ratio-pin-pole" />
        </div>
      </div>

      <div className="ratio-foot">
        <div className="ratio-seg">
          <span className="ratio-seg-label">RÉSERVE</span>
          <span className="ratio-seg-val">{fmt(reserve)}</span>
        </div>
        <div className="ratio-presets">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`ratio-preset${Math.abs(value - p.v) < 0.005 ? ' is-active' : ''}`}
              onClick={() => onChange(p.v)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
