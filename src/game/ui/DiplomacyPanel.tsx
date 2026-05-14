/**
 * DiplomacyPanel — alliances et pactes.
 * -------------------------------------
 * UI de la diplomatie : liste des autres nations, envoi de demandes
 * d'alliance, état des pactes. Le système serveur DiplomacySystem (Phase 2)
 * traite les demandes ; ce panneau n'envoie que des intentions.
 *
 * Pour le MVP, l'envoi de demande est câblé mais la résolution serveur est
 * un scaffold — voir docs/ROADMAP.md.
 */

import { useState } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';

export function DiplomacyPanel({ snap }: { snap: GameSnapshot }) {
  const [open, setOpen] = useState(false);
  const others = snap.players.filter((p) => p.id !== socket.sessionId && p.alive);

  return (
    <div className={`hud-panel diplomacy ${open ? 'is-open' : ''}`}>
      <button className="diplomacy-toggle" onClick={() => setOpen((o) => !o)}>
        DIPLOMATIE {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="diplomacy-body">
          {others.length === 0 && <div className="diplomacy-empty">Aucune autre nation.</div>}
          {others.map((p) => (
            <div key={p.id} className="diplomacy-row">
              <span className="diplomacy-nation">
                <span className="diplomacy-dot" style={{ background: p.color }} />
                {p.name}
                {p.isBot && <span className="diplomacy-bot">BOT</span>}
              </span>
              <span className="diplomacy-terr">{p.territoryCount} terr.</span>
              <button
                className="diplomacy-action"
                onClick={() => socket.requestAlliance(p.id)}
              >
                Proposer alliance
              </button>
            </div>
          ))}
          <div className="diplomacy-note">
            Une alliance devient active quand l'autre nation accepte. Vision
            partagée entre alliés. La trahison est instantanée — et notifiée.
          </div>
        </div>
      )}
    </div>
  );
}
