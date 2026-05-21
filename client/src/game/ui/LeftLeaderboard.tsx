/**
 * LeftLeaderboard — tiroir vertical sur le bord gauche.
 * ------------------------------------------------------
 * Remplace l'ancien bouton "Classement" du dock. Une poignée fine est
 * toujours visible à gauche ; clic dessus = ouvre le tiroir avec la liste
 * top 10 (rang + couleur + nom + score). Re-clic = referme. Échap aussi.
 */

import { useEffect, useState } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';

interface Props {
  snap: GameSnapshot;
}

export function LeftLeaderboard({ snap }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Top 10 par score (snap.players déjà trié desc par useGameState).
  const top = snap.players.slice(0, 10);
  const myId = socket.sessionId;

  return (
    <>
      <button
        className={`leftldr-handle ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Classement"
        aria-label="Ouvrir le classement"
      >
        <span className="leftldr-handle-chev">{open ? '◂' : '▸'}</span>
        <span className="leftldr-handle-label">CLASSEMENT</span>
      </button>

      <aside className={`leftldr ${open ? 'is-open' : ''}`} aria-hidden={!open}>
        <header className="leftldr-head">
          <div className="leftldr-title">CLASSEMENT</div>
          <div className="leftldr-sub">TOP 10 NATIONS</div>
        </header>
        <ul className="leftldr-list">
          {top.map((p, i) => {
            const isMe = p.id === myId;
            return (
              <li key={p.id} className={`leftldr-row ${isMe ? 'is-me' : ''}`}>
                <span className="leftldr-rank">{i + 1}</span>
                <span className="leftldr-dot" style={{ background: p.color }} />
                <span className="leftldr-name" title={p.name}>{p.name}</span>
                <span className="leftldr-score">{Math.round(p.score).toLocaleString('fr-FR')}</span>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}
