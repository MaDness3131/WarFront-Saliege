/**
 * WeaponPanel — arsenal de frappe (Phase 3).
 * ------------------------------------------
 * Trois armes, trois échelles. Sélectionner une arme arme le pointeur :
 * le prochain clic carte est interprété comme un ordre de tir au lieu d'une
 * conquête classique. Coût + cooldown affichés en temps réel.
 */

import { ReactNode } from 'react';
import { GameSnapshot } from '../useGameState';
import { WeaponKind } from '@shared/types';
import { WEAPONS, TICK_RATE } from '@shared/constants';
import { NukeIcon, HydrogenIcon, TsarBombIcon } from './icons';

interface WeaponPanelProps {
  snap: GameSnapshot;
  selected: WeaponKind | null;
  onSelect: (k: WeaponKind | null) => void;
}

const CATALOG: { kind: WeaponKind; name: string; tag: string; icon: ReactNode }[] = [
  { kind: 'nuke',     name: 'Nuke',        tag: 'stratégique',       icon: <NukeIcon size={36} /> },
  { kind: 'hydrogen', name: 'Hydrogène',   tag: 'apocalyptique',     icon: <HydrogenIcon size={36} /> },
  { kind: 'tsar',     name: 'Tsar Bomba',  tag: 'raseur de continent', icon: <TsarBombIcon size={36} /> },
];

export function WeaponPanel({ snap, selected, onSelect }: WeaponPanelProps) {
  const me = snap.me;
  if (!snap.enabled.weapons || !me) return null;

  return (
    <div className="hud-panel weapons">
      <div className="weapons-title">ARSENAL</div>
      <div className="weapons-list">
        {CATALOG.map((item) => {
          const spec = WEAPONS[item.kind];
          const cd = me.cooldowns[item.kind];
          const cdSec = Math.ceil(cd / TICK_RATE);
          const ready = cd <= 0 && me.gold >= spec.cost;
          const isSel = selected === item.kind;
          return (
            <button
              key={item.kind}
              className={`weapon-item ${isSel ? 'is-selected' : ''} ${ready ? '' : 'is-locked'}`}
              onClick={() => onSelect(isSel ? null : item.kind)}
              disabled={cd > 0}
              title={item.tag}
            >
              <div className="weapon-item-icon">{item.icon}</div>
              <div className="weapon-item-body">
                <div className="weapon-item-head">
                  <span className="weapon-item-name">{item.name}</span>
                  <span className="weapon-item-cost">{spec.cost}</span>
                </div>
                <div className="weapon-item-meta">
                  rayon {spec.radius} · vol {(spec.flightTicks / TICK_RATE).toFixed(1)}s
                </div>
                <div className={`weapon-item-cd ${cd > 0 ? 'is-cooling' : ''}`}>
                  {cd > 0 ? `prêt dans ${cdSec}s` : 'PRÊT'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="weapons-hint">
          Clique une case ennemie pour tirer.
        </div>
      )}
    </div>
  );
}
