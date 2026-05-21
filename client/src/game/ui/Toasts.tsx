/**
 * Toasts — notifications animées top-center.
 * ------------------------------------------
 * Écoute les événements du moteur (kill, alliance, attaque imminente,
 * trahison…) et affiche une bannière temporaire en haut de l'écran.
 * Empilées proprement avec décalage vertical. Slide-in / slide-out CSS.
 */

import { useEffect, useState } from 'react';
import { socket } from '../../network/SocketClient';
import { GameSnapshot } from '../useGameState';

type ToastKind = 'kill' | 'killed' | 'alliance' | 'betray' | 'nuke' | 'warning' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  body?: string;
  accent?: string;
  bornAt: number;
}

const TOAST_TTL_MS = 4200;
let _toastSeq = 0;

interface Props { snap: GameSnapshot | null; }

export function Toasts({ snap }: Props) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Mémo des joueurs pour récupérer leur nom dans les events asynchrones.
  const playersRef = snap?.players ?? [];
  const meId = snap?.me?.id;

  useEffect(() => {
    const push = (t: Omit<Toast, 'id' | 'bornAt'>) => {
      const full: Toast = { ...t, id: ++_toastSeq, bornAt: performance.now() };
      setToasts((prev) => [...prev, full].slice(-5));
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== full.id));
      }, TOAST_TTL_MS);
    };

    const nameOf = (id: string) =>
      playersRef.find((p) => p.id === id)?.name ?? '???';
    const colorOf = (id: string) =>
      playersRef.find((p) => p.id === id)?.color ?? '#aaaaaa';

    const subs: Array<() => void> = [];

    // KillReward : émis quand un joueur est éliminé. Le tueur reçoit l'or.
    subs.push(
      socket.onEvent('KillReward', (p) => {
        if (!p) return;
        if (p.killer === meId) {
          push({
            kind: 'kill',
            title: `+${p.gold} OR · ANÉANTI`,
            body: `${nameOf(p.victim)} · ${p.peakTerr} territoires · ${p.peakArmy} troupes`,
            accent: colorOf(p.victim),
          });
        } else if (p.victim === meId) {
          push({
            kind: 'killed',
            title: 'NATION ÉLIMINÉE',
            body: `Par ${nameOf(p.killer)}`,
            accent: colorOf(p.killer),
          });
        } else {
          // Spectateur : note brève pour suivre la partie.
          push({
            kind: 'info',
            title: `${nameOf(p.killer)} anéantit ${nameOf(p.victim)}`,
            accent: colorOf(p.killer),
          });
        }
      })
    );

    // Alliance formée / brisée.
    subs.push(
      socket.onEvent('AllianceFormed', (p) => {
        if (!p) return;
        const otherSide = p.a === meId ? p.b : (p.b === meId ? p.a : null);
        if (!otherSide) return;
        push({
          kind: 'alliance',
          title: 'ALLIANCE SCELLÉE',
          body: nameOf(otherSide),
          accent: colorOf(otherSide),
        });
      })
    );
    subs.push(
      socket.onEvent('AllianceBroken', (p) => {
        if (!p) return;
        const otherSide = p.by === meId ? p.with : (p.with === meId ? p.by : null);
        if (!otherSide) return;
        const wasBetrayer = p.by === meId;
        push({
          kind: 'betray',
          title: wasBetrayer ? 'TRAHISON' : 'ALLIANCE BRISÉE',
          body: nameOf(otherSide),
          accent: colorOf(otherSide),
        });
      })
    );

    // Sirène nucléaire.
    subs.push(
      socket.onEvent('NukeSirenWarning', () => {
        push({
          kind: 'nuke',
          title: '⚠ MENACE NUCLÉAIRE',
          body: 'Impact imminent',
        });
      })
    );

    // Contre-attaque déclenchée (feedback joueur).
    subs.push(
      socket.onEvent('CounterEngaged', (p) => {
        if (!p || p.defender !== meId) return;
        push({
          kind: 'warning',
          title: 'CONTRE ENGAGÉE',
          body: `${p.committed} troupes · ${Math.round(p.drained * 100)}% drainés`,
        });
      })
    );

    return () => subs.forEach((u) => u());
  }, [meId, playersRef]);

  if (toasts.length === 0) return null;
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div className="toast-bar" style={{ background: t.accent }} />
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.body && <div className="toast-sub">{t.body}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
