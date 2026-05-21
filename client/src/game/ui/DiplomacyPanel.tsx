/**
 * DiplomacyPanel — alliances, propositions, trahisons (Phase 2).
 * --------------------------------------------------------------
 * Trois sections :
 *  - propositions reçues (accepter / refuser) ;
 *  - alliances actives (briser, marqué comme trahison) ;
 *  - autres nations (proposer une alliance).
 * Les actions sont des intentions envoyées à la simulation.
 */

import { useState } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';

export function DiplomacyPanel({ snap }: { snap: GameSnapshot }) {
  const [open, setOpen] = useState(true);
  if (!snap.enabled.alliances) return null;

  const me = snap.me;
  if (!me) return null;
  const others = snap.players.filter((p) => p.id !== me.id && p.alive);
  const myAlliance = snap.alliances.find((a) => a.members.includes(me.id));
  const allyId = myAlliance ? myAlliance.members.find((m) => m !== me.id) ?? null : null;
  const allyName = allyId ? snap.players.find((p) => p.id === allyId)?.name ?? '?' : null;

  return (
    <div className={`hud-panel diplomacy ${open ? 'is-open' : ''}`}>
      <button className="diplomacy-toggle" onClick={() => setOpen((o) => !o)}>
        DIPLOMATIE {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="diplomacy-body">
          {/* Propositions reçues */}
          {snap.incomingProposals.length > 0 && (
            <div className="diplomacy-section">
              <div className="diplomacy-section-title">PROPOSITIONS REÇUES</div>
              {snap.incomingProposals.map((prop) => {
                const from = snap.players.find((p) => p.id === prop.from);
                return (
                  <div key={prop.id} className="diplomacy-row">
                    <span className="diplomacy-nation">
                      <span className="diplomacy-dot" style={{ background: from?.color }} />
                      {from?.name ?? '?'}
                    </span>
                    <button className="diplomacy-action good" onClick={() => socket.acceptAlliance(prop.id)}>
                      Accepter
                    </button>
                    <button className="diplomacy-action bad" onClick={() => socket.rejectAlliance(prop.id)}>
                      Refuser
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Alliance active */}
          {myAlliance && (
            <div className="diplomacy-section">
              <div className="diplomacy-section-title">ALLIANCE ACTIVE</div>
              <div className="diplomacy-row">
                <span className="diplomacy-nation">
                  <span className="diplomacy-dot" style={{ background: snap.players.find((p) => p.id === allyId)?.color }} />
                  {allyName}
                </span>
                <button
                  className="diplomacy-action bad"
                  onClick={() => {
                    if (confirm('Briser l’alliance ? Pénalité de score + cooldown diplomatique.')) {
                      socket.breakAlliance(myAlliance.id);
                    }
                  }}
                >
                  Trahir
                </button>
              </div>
            </div>
          )}

          {/* Autres nations */}
          <div className="diplomacy-section">
            <div className="diplomacy-section-title">AUTRES NATIONS</div>
            {others.length === 0 && <div className="diplomacy-empty">Aucune autre nation.</div>}
            {others.map((p) => {
              const alreadyAllied = myAlliance && myAlliance.members.includes(p.id);
              const proposedTo = snap.outgoingProposals.find((pr) => pr.to === p.id);
              return (
                <div key={p.id} className="diplomacy-row">
                  <span className="diplomacy-nation">
                    <span className="diplomacy-dot" style={{ background: p.color }} />
                    {p.name}
                    {p.isBot && <span className="diplomacy-bot">BOT</span>}
                  </span>
                  <span className="diplomacy-terr">{p.territoryCount} terr.</span>
                  {alreadyAllied ? (
                    <span className="diplomacy-tag">allié</span>
                  ) : proposedTo ? (
                    <span className="diplomacy-tag">en attente</span>
                  ) : (
                    <button
                      className="diplomacy-action"
                      onClick={() => socket.requestAlliance(p.id)}
                      disabled={!!myAlliance || !!p.allianceId}
                    >
                      Proposer
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="diplomacy-note">
            Une alliance ⇒ vision partagée + pas d'attaque mutuelle. Trahir
            coûte du score et bloque la diplomatie pendant un temps.
          </div>
        </div>
      )}
    </div>
  );
}
