/**
 * Minimap — vue d'ensemble du monde.
 * ----------------------------------
 * Rendu canvas léger : 1 pixel ≈ 1 territoire. Repeinte uniquement quand
 * l'état serveur change (pas à 60 FPS). Clic sur la minimap = recentrage
 * caméra (callback fourni par App).
 */

import { useEffect, useRef } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';
import { OCEAN_COLOR, NEUTRAL_COLOR } from '../../../../shared/constants';

interface MinimapProps {
  snap: GameSnapshot;
  onJumpTo: (col: number, row: number) => void;
}

export function Minimap({ snap, onJumpTo }: MinimapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { mapWidth: w, mapHeight: h, ownership, players } = snap;
    if (w === 0 || h === 0) return;

    canvas.width = w;
    canvas.height = h;

    // Table couleur joueur (hex) pour un accès O(1).
    const colorById = new Map(players.map((p) => [p.id, p.color]));

    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const owner = ownership[i];
      let hex: string;
      if (owner) hex = colorById.get(owner) ?? NEUTRAL_COLOR;
      else hex = NEUTRAL_COLOR;
      // Note : on ne distingue pas océan/terre ici faute de terrain dans le
      // snapshot ; en pratique on ajouterait un masque terrain statique.
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      const o = i * 4;
      img.data[o] = owner ? r : parseInt(OCEAN_COLOR.slice(1, 3), 16) + 20;
      img.data[o + 1] = owner ? g : parseInt(OCEAN_COLOR.slice(3, 5), 16) + 20;
      img.data[o + 2] = owner ? b : parseInt(OCEAN_COLOR.slice(5, 7), 16) + 20;
      img.data[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);

    // Surligne la position du joueur.
    const me = snap.me;
    if (me) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
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
