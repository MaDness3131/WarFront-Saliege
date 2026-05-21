/**
 * HUD — notifications, alertes, bannières.
 * ----------------------------------------
 * Les ressources et le ratio sont gérés par TopBar/BottomDock ; ici on
 * ne garde que la couche "événementielle" : toasts, sirène nucléaire,
 * bandeau de reconnexion.
 */

import { useEffect, useState } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';
import { ServerEvent } from '@shared/types';

interface Notification {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad' | 'warn';
}

let notifSeq = 0;

export function HUD({ snap }: { snap: GameSnapshot }) {
  const me = snap.me;
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [sirenAt, setSirenAt] = useState<{ x: number; y: number; until: number } | null>(null);

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
          not_adjacent: 'Pas de territoire à proximité',
          insufficient_force: 'Armée insuffisante',
          is_ocean: 'Cible océanique inaccessible',
          is_scorched: 'Terrain brûlé — inaccessible',
          allied: 'Tu ne peux pas attaquer un allié',
          bad_target: 'Cible invalide',
        };
        push(reasons[p.reason] ?? 'Attaque impossible', 'bad');
      }),
      socket.onEvent(ServerEvent.PlayerEliminated, (p) => {
        if (p.id === socket.sessionId) push('Tu as été éliminé', 'bad');
      }),
      socket.onEvent(ServerEvent.AllianceFormed, (p) => {
        if (p.members?.includes(socket.sessionId)) push('Alliance formée', 'good');
      }),
      socket.onEvent(ServerEvent.AllianceBroken, (p) => {
        if (p.members?.includes(socket.sessionId)) {
          push(p.breaker === socket.sessionId ? 'Tu as trahi ton allié' : 'Ton allié t’a trahi', 'bad');
        }
      }),
      socket.onEvent(ServerEvent.AllianceProposed, (p) => {
        if (p.to === socket.sessionId) push('Proposition d’alliance reçue', 'info');
      }),
      socket.onEvent(ServerEvent.MissileLaunched, (p) => {
        // Toutes les armes restantes (nuke/hydrogen/tsar) sont à signaler.
        push(`Détection — ${p.kind.toUpperCase()} en approche`, 'warn');
      }),
      socket.onEvent(ServerEvent.NukeSirenWarning, (p) => {
        setSirenAt({ x: p.toX, y: p.toY, until: Date.now() + 4000 });
      }),
      socket.onEvent(ServerEvent.GameOver, (p) => {
        push(p.winner === socket.sessionId ? 'VICTOIRE — domination mondiale' : 'Partie terminée', 'info');
      }),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => {
    if (!sirenAt) return;
    const t = setTimeout(() => setSirenAt(null), Math.max(0, sirenAt.until - Date.now()));
    return () => clearTimeout(t);
  }, [sirenAt]);

  if (!me) {
    return <div className="hud-banner">En attente de placement sur la carte…</div>;
  }

  return (
    <>
      {sirenAt && (
        <>
          <div className="hud-siren-vignette" />
          <div className="hud-siren">
            ⚠ ALERTE NUCLÉAIRE — IMPACT IMMINENT
          </div>
        </>
      )}

      {!snap.connected && <div className="hud-banner hud-banner-warn">Reconnexion…</div>}
    </>
  );
}
