/**
 * DomExplosions — calque HTML d'explosions stylisées.
 * ----------------------------------------------------
 * Surimprime un FX casino-royal au-dessus du canvas Pixi lors des
 * événements Explosion / MissileImpact. La conversion world → screen est
 * snapshotée au moment du tir : le burst reste fixe à l'écran (l'impact
 * dure < 2.5s, donc le décalage caméra est imperceptible).
 *
 * Les keyframes vivent dans styles.css (préfixe `expl-`).
 *  - Impact         → burst normal (scale par défaut)
 *  - Missile        → idem normal (le shockwave gold suffit)
 *  - Nuke           → scale-l  (×1.4)
 *  - Hydrogen       → scale-xl (×1.7 + smoke géant + shock 480px)
 *
 * IMPORTANT — Pas de React state :
 *  Les bursts sont insérés / retirés directement dans le DOM via
 *  createElement(). Une salve de nuke crée ~25 nodes — avec un setState
 *  React on déclencherait un commit + diff de l'arbre App entier à chaque
 *  burst. Ici on saute totalement React → 0 re-render, animations CSS
 *  pures, suppression au setTimeout TTL.
 */

import { useEffect, useRef } from 'react';
import { socket } from '../../network/SocketClient';
import { GameEngine } from '../GameEngine';
import { ServerEvent } from '@shared/types';
import { CELL_SIZE } from '@shared/constants';

type Scale = '' | 'scale-l' | 'scale-xl';

const CHIP_COUNT_BY_SCALE: Record<Scale, number> = { '': 8, 'scale-l': 12, 'scale-xl': 14 };
const SPARK_COUNT_BY_SCALE: Record<Scale, number> = { '': 6, 'scale-l': 8, 'scale-xl': 10 };
/** TTL légèrement plus grand que la plus longue animation (smoke-xl = 2.2s + 0.4s delay). */
const TTL: Record<Scale, number> = { '': 1600, 'scale-l': 2200, 'scale-xl': 2800 };

const RADIUS_BY_SCALE: Record<Scale, { chip: number; spark: number }> = {
  '':         { chip: 80,  spark: 50 },
  'scale-l':  { chip: 120, spark: 75 },
  'scale-xl': { chip: 160, spark: 95 },
};

interface Props {
  engine: GameEngine | null;
}

export function DomExplosions({ engine }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!engine) return;
    const root = rootRef.current;
    if (!root) return;

    /** Petit utilitaire pour créer un élément avec classe + variables CSS. */
    const el = (className: string, vars?: Record<string, string>) => {
      const node = document.createElement('div');
      node.className = className;
      if (vars) {
        for (const k in vars) node.style.setProperty(k, vars[k]);
      }
      return node;
    };

    /** Spawn UN burst à la position monde donnée, kind contrôle scale + smoke. */
    const spawn = (worldX: number, worldY: number, kind: number, kindLabel?: 'nuke' | 'hydrogen' | 'tsar') => {
      const { x, y } = engine.worldToScreen(worldX, worldY);

      let scale: Scale = '';
      let showSmoke = false;
      let shockCount: 1 | 2 | 3 = 1;

      // kind: 0 = Impact, 2 = Nuke/Hydrogen, 3 = Tsar.
      if (kindLabel === 'tsar' || kind === 3)             { scale = 'scale-xl'; showSmoke = true; shockCount = 3; }
      else if (kindLabel === 'hydrogen')                  { scale = 'scale-xl'; showSmoke = true; shockCount = 3; }
      else if (kindLabel === 'nuke' || kind === 2)        { scale = 'scale-l';  showSmoke = true; shockCount = 3; }

      const { chip: chipR, spark: sparkR } = RADIUS_BY_SCALE[scale];
      const chipCount = CHIP_COUNT_BY_SCALE[scale];
      const sparkCount = SPARK_COUNT_BY_SCALE[scale];

      // ─── DOM direct : un wrapper .expl-burst, un .expl à l'intérieur ─
      const burst = document.createElement('div');
      burst.className = `expl-burst ${scale}`.trim();
      burst.style.left = `${x}px`;
      burst.style.top = `${y}px`;

      const expl = document.createElement('div');
      expl.className = 'expl';
      burst.appendChild(expl);

      expl.appendChild(el('flash'));
      expl.appendChild(el('shock s1'));
      if (shockCount >= 2) expl.appendChild(el('shock s2'));
      if (shockCount >= 3) expl.appendChild(el('shock s3'));
      expl.appendChild(el('fireball'));
      if (showSmoke) expl.appendChild(el('smoke'));

      for (let i = 0; i < chipCount; i++) {
        const a = (i / chipCount) * Math.PI * 2 + Math.random() * 0.5;
        const r = chipR * (0.7 + Math.random() * 0.6);
        expl.appendChild(el('chip', {
          '--cx': `${Math.cos(a) * r}px`,
          '--cy': `${Math.sin(a) * r}px`,
        }));
      }
      for (let i = 0; i < sparkCount; i++) {
        const a = (i / sparkCount) * Math.PI * 2 + Math.random();
        const r = sparkR * (0.6 + Math.random() * 0.7);
        expl.appendChild(el('spark', {
          '--sx': `${Math.cos(a) * r}px`,
          '--sy': `${Math.sin(a) * r}px`,
        }));
      }

      root.appendChild(burst);

      // Cleanup auto après TTL — les keyframes CSS ont déjà fini leur job.
      window.setTimeout(() => {
        if (burst.parentNode === root) root.removeChild(burst);
      }, TTL[scale] + 150);
    };

    const offExpl = socket.onEvent(ServerEvent.Explosion, (p: any) => {
      spawn(p.x * CELL_SIZE, p.y * CELL_SIZE, p.kind ?? 0);
    });
    const offImpact = socket.onEvent(ServerEvent.MissileImpact, (p: any) => {
      const k = p.kind as 'nuke' | 'hydrogen' | 'tsar';
      spawn(p.x * CELL_SIZE, p.y * CELL_SIZE, k === 'tsar' ? 3 : 2, k);
    });

    return () => {
      offExpl();
      offImpact();
      // Vide le root : tous les bursts encore animés s'arrêtent.
      while (root.firstChild) root.removeChild(root.firstChild);
    };
  }, [engine]);

  return <div className="dom-explosions" ref={rootRef} />;
}
