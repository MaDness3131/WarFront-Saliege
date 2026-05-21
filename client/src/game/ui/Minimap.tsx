/**
 * Minimap — vue d'ensemble du monde.
 * ----------------------------------
 * Rendu canvas léger : 1 pixel ≈ 1 territoire. Affiche océan / terre /
 * propriétaires + traces de terrain brûlé. Clique pour recentrer la caméra.
 */

import { useEffect, useRef } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';
import { OCEAN_COLOR, NEUTRAL_COLOR, SCORCH_COLOR } from '@shared/constants';
import { TerrainType } from '@shared/types';

interface MinimapProps {
  snap: GameSnapshot;
  onJumpTo: (col: number, row: number) => void;
}

const hex = (s: string) => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16),
];

const OCEAN_RGB = hex(OCEAN_COLOR);
const NEUTRAL_RGB = hex(NEUTRAL_COLOR);
const SCORCH_RGB = hex(SCORCH_COLOR);
const MOUNTAIN_RGB = [60, 60, 70];

export function Minimap({ snap, onJumpTo }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { mapWidth: w, mapHeight: h, territories, players, tick } = snap;
    if (w === 0 || h === 0) return;

    // ── Subsample : la minimap est ~220×120 px à l'écran, pas la peine
    //    d'itérer 682k tuiles. Step = 4 → 16× moins de boucles (~42k au
    //    lieu de 682k). Visuel quasi-identique vu la taille.
    const STEP = 4;
    const cw = Math.ceil(w / STEP);
    const ch = Math.ceil(h / STEP);
    canvas.width = cw;
    canvas.height = ch;

    const colorById = new Map(players.map((p) => [p.id, hex(p.color)]));

    const img = ctx.createImageData(cw, ch);
    let pi = 0;
    for (let cy = 0; cy < ch; cy++) {
      const sy = Math.min(h - 1, cy * STEP);
      const baseRow = sy * w;
      for (let cx = 0; cx < cw; cx++) {
        const sx = Math.min(w - 1, cx * STEP);
        const t = territories[baseRow + sx];
        let rgb: number[];
        if (!t) rgb = OCEAN_RGB;
        else {
          const scorched = (t.scorchedUntil ?? 0) > tick;
          if (scorched) rgb = SCORCH_RGB;
          else if (t.terrain === TerrainType.Ocean) rgb = OCEAN_RGB;
          else if (t.owner) rgb = colorById.get(t.owner) ?? NEUTRAL_RGB;
          else if (t.terrain === TerrainType.Mountain) rgb = MOUNTAIN_RGB;
          else rgb = NEUTRAL_RGB;
        }
        img.data[pi++] = rgb[0];
        img.data[pi++] = rgb[1];
        img.data[pi++] = rgb[2];
        img.data[pi++] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Navires : petits points blancs (coords / STEP pour matcher subsample).
    if (snap.ships.length > 0) {
      ctx.fillStyle = '#ffffff';
      for (const s of snap.ships) {
        const sx = Math.floor(s.x / STEP);
        const sy = Math.floor(s.y / STEP);
        if (sx >= 0 && sy >= 0 && sx < cw && sy < ch) ctx.fillRect(sx, sy, 1, 1);
      }
    }

    // Vagues d'attaque actives : point clignotant à la couleur de l'attaquant.
    if (snap.waves.length > 0) {
      const pulse = (tick % 6) < 3 ? 1 : 0.4;
      for (const wave of snap.waves) {
        if (wave.frontX === null || wave.frontY === null) continue;
        const owner = players.find((p) => p.id === wave.owner);
        if (!owner) continue;
        ctx.fillStyle = owner.color;
        ctx.globalAlpha = pulse;
        const fx = Math.floor(wave.frontX / STEP);
        const fy = Math.floor(wave.frontY / STEP);
        ctx.fillRect(fx - 1, fy - 1, 3, 3);
      }
      ctx.globalAlpha = 1;
    }
  }, [snap]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const col = Math.floor(((e.clientX - rect.left) / rect.width) * snap.mapWidth);
    const row = Math.floor(((e.clientY - rect.top) / rect.height) * snap.mapHeight);
    onJumpTo(col, row);
  };

  return (
    <div className="hud-panel minimap">
      <div className="minimap-title">CARTE DU MONDE</div>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        onClick={handleClick}
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="minimap-legend">
        {snap.players.slice(0, 6).map((p) => (
          <span key={p.id} className="minimap-legend-item">
            <span className="minimap-legend-dot" style={{ background: p.color }} />
            {p.id === socket.sessionId ? 'Toi' : p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
