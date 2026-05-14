/**
 * HUD — interface de jeu principale.
 * ----------------------------------
 * Affiche les ressources du joueur, sa domination mondiale, le réglage du
 * ratio d'attaque et les notifications. Style militaire futuriste minimal :
 * panneaux sombres translucides, accents néon, typographie condensée.
 *
 * Lecture seule sur l'état serveur (via useGameState). La seule écriture est
 * le ratio d'attaque, envoyé comme intention.
 */

import { useEffect, useState } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';
import { ServerEvent } from '@shared/types';
import { TICK_RATE } from '@shared/constants';

interface Notification {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

let notifSeq = 0;

export function HUD({ snap }: { snap: GameSnapshot }) {
  const me = snap.me;
  const [notifs, setNotifs] = useState<Notification[]>([]);

  // Notifications déclenchées par les événements serveur.
  useEffect(() => {
    const push = (text: string, tone: Notification['tone']) => {
      const n = { id: notifSeq++, text, tone };
      setNotifs((prev) => [...prev.slice(-4), n]);
      setTimeout(() => setNotifs((prev) => prev.filter((x) => x.id !== n.id)), 4000);
    };

    const unsubs = [
      socket.onEvent(ServerEvent.TerritoryCaptured, (p) => {
        if (p.by === socket.sessionId) push('Territoire capturé', 'good');
      }),
      socket.onEvent(ServerEvent.AttackFailed, (p) => {
        const reasons: Record<string, string> = {
          not_adjacent: 'Cible non adjacente à ton territoire',
          insufficient_force: 'Armée insuffisante pour attaquer',
          is_ocean: 'Impossible : case océan',
          bad_target: 'Cible invalide',
        };
        push(reasons[p.reason] ?? 'Attaque impossible', 'bad');
      }),
      socket.onEvent(ServerEvent.PlayerEliminated, (p) => {
        if (p.id === socket.sessionId) push('Tu as été éliminé', 'bad');
      }),
      socket.onEvent(ServerEvent.GameOver, (p) => {
        push(p.winner === socket.sessionId ? 'VICTOIRE — domination mondiale' : 'Partie terminée', 'info');
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  if (!me) {
    return <div className="hud-banner">En attente de placement sur la carte…</div>;
  }

  const dominationPct = snap.totalLand > 0 ? (me.territoryCount / snap.totalLand) * 100 : 0;
  const incomePerSec = me.income * TICK_RATE;

  return (
    <>
      {/* Bandeau ressources — haut gauche */}
      <div className="hud-panel hud-resources">
        <div className="hud-nation" style={{ borderColor: me.color }}>
          <span className="hud-nation-dot" style={{ background: me.color }} />
          {me.name}
        </div>
        <Stat label="OR" value={Math.floor(me.gold)} sub={`${incomePerSec >= 0 ? '+' : ''}${incomePerSec.toFixed(1)}/s`} />
        <Stat label="ARMÉE" value={Math.floor(me.army)} />
        <Stat
          label="POPULATION"
          value={Math.floor(me.population)}
          sub={`/ ${Math.floor(me.populationCap)}`}
        />
        <Stat label="TERRITOIRES" value={me.territoryCount} />
      </div>

      {/* Domination mondiale — haut centre */}
      <div className="hud-panel hud-domination">
        <div className="hud-domination-label">DOMINATION MONDIALE</div>
        <div className="hud-domination-bar">
          <div
            className="hud-domination-fill"
            style={{ width: `${dominationPct}%`, background: me.color }}
          />
        </div>
        <div className="hud-domination-pct">{dominationPct.toFixed(1)}%</div>
      </div>

      {/* Réglage du ratio d'attaque — bas centre */}
      <div className="hud-panel hud-ratio">
        <label htmlFor="ratio">RATIO D'ATTAQUE — {Math.round(me.attackRatio * 100)}%</label>
        <input
          id="ratio"
          type="range"
          min={5}
          max={100}
          value={Math.round(me.attackRatio * 100)}
          onChange={(e) => socket.setAttackRatio(Number(e.target.value) / 100)}
          style={{ accentColor: me.color }}
        />
        <span className="hud-ratio-hint">part de l'armée engagée à chaque clic</span>
      </div>

      {/* Notifications — bas gauche */}
      <div className="hud-notifs">
        {notifs.map((n) => (
          <div key={n.id} className={`hud-notif hud-notif-${n.tone}`}>
            {n.text}
          </div>
        ))}
      </div>

      {/* État de connexion */}
      {!snap.connected && <div className="hud-banner hud-banner-warn">Reconnexion…</div>}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="hud-stat">
      <span className="hud-stat-label">{label}</span>
      <span className="hud-stat-value">
        {value.toLocaleString('fr-FR')}
        {sub && <span className="hud-stat-sub"> {sub}</span>}
      </span>
    </div>
  );
}
