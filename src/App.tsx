/**
 * App — composant racine.
 * -----------------------
 * Deux états : écran de connexion (choix nom + mode) et écran de jeu. En
 * jeu, monte le GameEngine PixiJS dans un conteneur plein écran et superpose
 * les panneaux React (HUD, minimap, construction, classement, diplomatie).
 *
 * App orchestre aussi le « mode construction » : si un bâtiment est
 * sélectionné, le prochain clic carte est interprété comme un ordre de
 * construction au lieu d'une attaque.
 */

import { useEffect, useRef, useState } from 'react';
import { GameEngine } from './game/GameEngine';
import { socket } from './network/SocketClient';
import { audio } from './audio/AudioManager';
import { useGameState } from './game/useGameState';
import { HUD } from './game/ui/HUD';
import { Minimap } from './game/ui/Minimap';
import { ConstructionMenu } from './game/ui/ConstructionMenu';
import { Leaderboard } from './game/ui/Leaderboard';
import { DiplomacyPanel } from './game/ui/DiplomacyPanel';
import { BuildingType } from "@shared/types";
import { CELL_SIZE } from "@shared/constants";

type Screen = 'connect' | 'connecting' | 'game';
type Mode = 'classic' | 'fast' | 'custom';

export function App() {
  const [screen, setScreen] = useState<Screen>('connect');
  const [name, setName] = useState('');
  const [mode, setMode] = useState<Mode>('classic');
  const [error, setError] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<BuildingType>(BuildingType.None);

  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const snap = useGameState();

  // ─── Connexion ────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setError(null);
    setScreen('connecting');
    try {
      await audio.init(); // débloque l'audio (interaction utilisateur)
      await socket.connect(mode, name.trim() || 'Commander');
      setScreen('game');
    } catch {
      setError('Connexion au serveur impossible. Vérifie que le serveur tourne.');
      setScreen('connect');
    }
  };

  // ─── Montage du moteur de rendu ───────────────────────────────────────
  useEffect(() => {
    if (screen !== 'game' || !mountRef.current) return;
    const engine = new GameEngine();
    engineRef.current = engine;
    engine.start(mountRef.current).then(() => audio.startMusic());
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [screen]);

  // ─── Mode construction : intercepte le clic carte ─────────────────────
  // GameEngine appelle socket.attack par défaut ; quand un bâtiment est
  // sélectionné, on bascule via un écouteur global de clic résolu en case.
  useEffect(() => {
    if (screen !== 'game') return;
    const onContextClick = (e: MouseEvent) => {
      // clic droit = construction si un bâtiment est sélectionné
      if (selectedBuilding === BuildingType.None) return;
      const engine = engineRef.current;
      if (!engine) return;
      e.preventDefault();
      const cam = engine.getCamera();
      const canvas = engine.app.canvas;
      const rect = canvas.getBoundingClientRect();
      const worldX = (e.clientX - rect.left) / cam.zoom + cam.x;
      const worldY = (e.clientY - rect.top) / cam.zoom + cam.y;
      const col = Math.floor(worldX / CELL_SIZE);
      const row = Math.floor(worldY / CELL_SIZE);
      if (snap) {
        const id = row * snap.mapWidth + col;
        socket.build(id, selectedBuilding);
      }
    };
    window.addEventListener('contextmenu', onContextClick);
    return () => window.removeEventListener('contextmenu', onContextClick);
  }, [screen, selectedBuilding, snap]);

  const jumpTo = (col: number, row: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    const cam = engine.getCamera();
    cam.x = col * CELL_SIZE - engine.app.screen.width / 2 / cam.zoom;
    cam.y = row * CELL_SIZE - engine.app.screen.height / 2 / cam.zoom;
  };

  // ─── Écran de connexion ───────────────────────────────────────────────
  if (screen !== 'game') {
    return (
      <div className="connect-screen">
        <div className="connect-card">
          <h1 className="connect-title">
            WARFRONT <span>SALIÈGE</span>
          </h1>
          <p className="connect-tagline">Conquête territoriale mondiale en temps réel</p>

          <label className="connect-label">NATION</label>
          <input
            className="connect-input"
            placeholder="Nom de ta nation"
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
          />

          <label className="connect-label">MODE DE JEU</label>
          <div className="connect-modes">
            {(['classic', 'fast', 'custom'] as Mode[]).map((m) => (
              <button
                key={m}
                className={`connect-mode ${mode === m ? 'is-active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m === 'classic' ? 'Classique' : m === 'fast' ? 'Rapide' : 'Personnalisé'}
              </button>
            ))}
          </div>

          {error && <div className="connect-error">{error}</div>}

          <button
            className="connect-button"
            onClick={handleConnect}
            disabled={screen === 'connecting'}
          >
            {screen === 'connecting' ? 'CONNEXION…' : 'ENTRER EN GUERRE'}
          </button>

          <div className="connect-controls">
            <span>WASD — caméra</span>
            <span>Q/E ou molette — zoom</span>
            <span>Clic gauche — conquérir</span>
            <span>Clic droit — construire</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── Écran de jeu ─────────────────────────────────────────────────────
  return (
    <div className="game-screen">
      <div ref={mountRef} className="game-canvas-mount" />
      {snap && (
        <div className="hud-overlay">
          <HUD snap={snap} />
          <Minimap snap={snap} onJumpTo={jumpTo} />
          <Leaderboard snap={snap} />
          <ConstructionMenu
            snap={snap}
            selected={selectedBuilding}
            onSelect={setSelectedBuilding}
          />
          <DiplomacyPanel snap={snap} />
          {snap.phase === 2 && (
            <div className="game-over">
              <div className="game-over-card">
                <h2>{snap.winner === socket.sessionId ? 'VICTOIRE' : 'PARTIE TERMINÉE'}</h2>
                <p>
                  {snap.winner === socket.sessionId
                    ? 'Tu domines le monde.'
                    : `Vainqueur : ${snap.players.find((p) => p.id === snap.winner)?.name ?? '—'}`}
                </p>
                <button onClick={() => window.location.reload()}>Nouvelle partie</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
