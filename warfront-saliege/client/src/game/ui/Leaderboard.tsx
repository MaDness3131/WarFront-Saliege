/**
 * Leaderboard — classement en direct.
 * -----------------------------------
 * Top joueurs triés par score (le snapshot arrive déjà trié). Affiche
 * domination, armée, Elo. Le joueur courant est surligné.
 */

import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';

export function Leaderboard({ snap }: { snap: GameSnapshot }) {
  const rows = snap.players.slice(0, 8);

  return (
    <div className="hud-panel leaderboard">
      <div className="leaderboard-title">CLASSEMENT</div>
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Nation</th>
            <th>Terr.</th>
            <th>Armée</th>
            <th>Elo</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const isMe = p.id === socket.sessionId;
            return (
              <tr key={p.id} className={isMe ? 'is-me' : p.alive ? '' : 'is-dead'}>
                <td>{i + 1}</td>
                <td>
                  <span className="leaderboard-dot" style={{ background: p.color }} />
                  {isMe ? 'Toi' : p.name}
                </td>
                <td>{p.territoryCount}</td>
                <td>{Math.floor(p.army)}</td>
                <td>{p.elo}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
