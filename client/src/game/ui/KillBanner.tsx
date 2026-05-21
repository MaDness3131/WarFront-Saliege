/**
 * KillBanner — bannière jackpot quand TU élimines un pays.
 * --------------------------------------------------------
 * Reels de slot machine qui tournent puis s'arrêtent sur le nom de la
 * victime, flash blanc à l'atterrissage, confetti or/cardinal, reward
 * count-up doré. 2.6s total — assez pour savourer.
 */

import { useEffect, useMemo, useState } from 'react';
import { socket } from '../../network/SocketClient';
import { GameSnapshot } from '../useGameState';
import { useAnimatedNumber } from './useAnimatedNumber';

interface Payload {
  victimName: string;
  victimColor: string;
  gold: number;
  peakTerr: number;
  peakArmy: number;
  bornAt: number;
}

const BANNER_TTL = 2800;
const REEL_DUR = 1100;

interface Props { snap: GameSnapshot | null; }

export function KillBanner({ snap }: Props) {
  const [banner, setBanner] = useState<Payload | null>(null);
  const meId = snap?.me?.id;
  const players = snap?.players ?? [];

  useEffect(() => {
    const unsub = socket.onEvent('KillReward', (p) => {
      if (!p || p.killer !== meId) return;
      const v = players.find((pl) => pl.id === p.victim);
      setBanner({
        victimName: v?.name ?? '???',
        victimColor: v?.color ?? '#888',
        gold: p.gold ?? 0,
        peakTerr: p.peakTerr ?? 0,
        peakArmy: p.peakArmy ?? 0,
        bornAt: performance.now(),
      });
      const t = setTimeout(() => setBanner(null), BANNER_TTL);
      return () => clearTimeout(t);
    });
    return unsub;
  }, [meId, players]);

  if (!banner) return null;
  return <KillBannerActive banner={banner} />;
}

function KillBannerActive({ banner }: { banner: Payload }) {
  const goldAnim = useAnimatedNumber(banner.gold, 1400);
  // Confetti positions générés une seule fois.
  const confetti = useMemo(() => buildConfetti(28), []);
  const upperName = banner.victimName.toUpperCase();

  return (
    <div className="kbnr">
      <div className="kbnr-bg" />
      <div className="kbnr-grid" />
      <div className="kbnr-flash" />

      {/* Confetti DOM — animations CSS indépendantes par particule */}
      <div className="kbnr-confetti">
        {confetti.map((c, i) => (
          <i
            key={i}
            style={{
              left: `${c.x}%`,
              animationDelay: `${c.delay}ms`,
              animationDuration: `${c.dur}ms`,
              background: c.color,
              transform: `rotate(${c.rot}deg)`,
            }}
          />
        ))}
      </div>

      <div className="kbnr-content">
        <div className="kbnr-tag">JACKPOT — ÉLIMINATION</div>
        <ReelTitle name={upperName} color={banner.victimColor} />
        <div className="kbnr-reward">
          + <span className="kbnr-reward-num">{Math.round(goldAnim).toLocaleString('fr-FR')}</span>
          <span className="kbnr-reward-unit">OR</span>
        </div>
        <div className="kbnr-stats">
          <span>{banner.peakTerr.toLocaleString('fr-FR')} TERRITOIRES</span>
          <span className="kbnr-sep">·</span>
          <span>{banner.peakArmy.toLocaleString('fr-FR')} TROUPES</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Reels : chaque caractère cycle des lettres aléatoires puis s'arrête
 * sur sa lettre cible, avec un décalage progressif gauche → droite pour
 * un effet "machine à sous qui s'arrête".
 */
function ReelTitle({ name, color }: { name: string; color: string }) {
  const target = name.split('');
  const [display, setDisplay] = useState<string[]>(() => target.map(() => '·'));

  useEffect(() => {
    const startedAt = performance.now();
    // Chaque char s'arrête à un moment différent (gauche → droite).
    const stopAt = target.map((_, i) => 420 + i * 75 + Math.random() * 80);
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÀÉÈÊÎÔÛÇ0123456789·×';

    let interval = window.setInterval(() => {
      const elapsed = performance.now() - startedAt;
      const next = target.map((ch, i) => {
        if (elapsed >= stopAt[i]) return ch;
        if (ch === ' ' || ch === '-' || ch === "'") return ch;
        return pool[Math.floor(Math.random() * pool.length)];
      });
      setDisplay(next);
      if (elapsed >= Math.max(...stopAt) + 60) {
        setDisplay(target);
        window.clearInterval(interval);
      }
    }, 55);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  return (
    <div className="kbnr-title">
      <span className="kbnr-dot" style={{ background: color }} />
      <span className="kbnr-reels" aria-label={name}>
        {display.map((ch, i) => (
          <span key={i} className="kbnr-reel-char">{ch === ' ' ? ' ' : ch}</span>
        ))}
      </span>
    </div>
  );
}

interface Conf { x: number; delay: number; dur: number; color: string; rot: number; }
function buildConfetti(n: number): Conf[] {
  const palette = ['#f4c542', '#ffd247', '#fff5d4', '#c5142a', '#ff5070'];
  const out: Conf[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      x: Math.random() * 100,
      delay: 280 + Math.random() * 600,    // démarrage post-impact reels
      dur: 1400 + Math.random() * 900,
      color: palette[Math.floor(Math.random() * palette.length)],
      rot: Math.random() * 360,
    });
  }
  return out;
}

// Tiny re-export pour TS — la durée totale du REEL est utilisée par les
// keyframes du flash CSS (juste référence, pas critique).
export const _REEL_DUR = REEL_DUR;
