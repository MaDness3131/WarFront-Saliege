/**
 * TopBar — bandeau "valance velours rouge × jetons or".
 * -----------------------------------------------------
 * Aligné sur la DA du LoadingScreen/LaunchButton :
 *   - fond noir velours avec sous-couche cardinal qui rappelle le rideau
 *   - valance dorée en bas, ondulations lentes
 *   - ressources affichées en mini-jetons de casino (or, rouge, ivoire)
 *   - typo Limelight pour le nom de nation, Cinzel pour les labels,
 *     JetBrains Mono pour les valeurs (compteurs)
 *   - count-up animation sur or et armée via useAnimatedNumber
 */

import { memo } from 'react';
import { GameSnapshot } from '../useGameState';
import { TICK_RATE } from '@shared/constants';
import { IconSettings, IconChevron } from './icons';
import { useAnimatedNumber } from './useAnimatedNumber';

interface Props {
  snap: GameSnapshot;
  onOpenSettings: () => void;
}

function TopBarInner({ snap, onOpenSettings }: Props) {
  const me = snap.me;
  // Hooks AVANT le early-return — règles de hooks React.
  const animGold = useAnimatedNumber(me ? Math.floor(me.gold) : 0, 600);
  const animArmy = useAnimatedNumber(me ? Math.floor(me.army) : 0, 600);
  if (!me) return null;

  const dominationPct = snap.totalLand > 0 ? (me.territoryCount / snap.totalLand) * 100 : 0;
  const incomePerSec = me.income * TICK_RATE;
  const incomeSign = incomePerSec >= 0 ? '+' : '';

  return (
    <div className="topbar">
      <div className="topbar-nation" style={{ borderLeftColor: me.color }}>
        <span className="topbar-nation-dot" style={{ background: me.color }} />
        {me.emblem && <span className="topbar-nation-emblem">{me.emblem}</span>}
        <span className="topbar-nation-name">{me.name}</span>
        {me.allianceId && <span className="topbar-tag topbar-tag-good">ALLIÉ</span>}
      </div>

      <div className="topbar-sep" />

      <Stat
        chip={<ChipIcon kind="gold" />}
        label="TRÉSOR"
        value={animGold}
        sub={`${incomeSign}${incomePerSec.toFixed(1)}/s`}
      />
      <Stat
        chip={<ChipIcon kind="red" />}
        label="TROUPES"
        value={animArmy}
      />
      <Stat
        chip={<ChipIcon kind="ivory" />}
        label="POPULATION"
        value={Math.floor(me.population)}
        sub={`/ ${Math.floor(me.populationCap)}`}
      />
      <Stat
        chip={<ChipIcon kind="globe" />}
        label="DOMINATION"
        value={`${dominationPct.toFixed(1)}%`}
        accent
      >
        <div className="topbar-dom-bar">
          <div className="topbar-dom-fill" style={{ width: `${Math.min(100, dominationPct)}%`, background: me.color }} />
        </div>
      </Stat>

      <div className="topbar-spacer" />

      <button className="topbar-iconbtn" onClick={onOpenSettings} title="Pause / paramètres">
        <IconSettings />
      </button>
      <IconChevron className="topbar-collapse" />
    </div>
  );
}

export const TopBar = memo(TopBarInner, (prev, next) => {
  if (prev.onOpenSettings !== next.onOpenSettings) return false;
  const a = prev.snap, b = next.snap;
  if (!a.me || !b.me) return false;
  return a.tick === b.tick;
});

/**
 * Jeton de casino miniaturisé, 4 variantes — or, rouge, ivoire, globe.
 * Rend l'identité visuelle des ressources cohérente avec la DA menu.
 */
function ChipIcon({ kind }: { kind: 'gold' | 'red' | 'ivory' | 'globe' }) {
  if (kind === 'globe') {
    return (
      <svg width="22" height="22" viewBox="0 0 22 22" className="chip-icon chip-globe">
        <circle cx="11" cy="11" r="9.5" fill="#1a0408" stroke="#f4c542" strokeWidth="1.4" />
        <path d="M 1.5 11 H 20.5 M 11 1.5 V 20.5" stroke="#f4c542" strokeWidth="0.8" opacity="0.55" />
        <path d="M 3.5 5.5 Q 11 8.5 18.5 5.5 M 3.5 16.5 Q 11 13.5 18.5 16.5" stroke="#f4c542" strokeWidth="0.7" fill="none" opacity="0.6" />
        <circle cx="11" cy="11" r="2" fill="#f4c542" />
      </svg>
    );
  }
  const palette = {
    gold:  { rim: '#b6791a', face: '#f4c542', inner: '#fff5d4' },
    red:   { rim: '#6e0a17', face: '#c5142a', inner: '#ffd4dc' },
    ivory: { rim: '#7c6a3d', face: '#e8dab5', inner: '#fff5d4' },
  }[kind];
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" className={`chip-icon chip-${kind}`}>
      <circle cx="11" cy="11" r="10" fill={palette.rim} />
      <circle cx="11" cy="11" r="8.4" fill={palette.face} />
      {/* 4 encoches périphériques */}
      {[0, 90, 180, 270].map((deg) => (
        <rect
          key={deg}
          x="10" y="1.6" width="2" height="3"
          fill={palette.rim}
          transform={`rotate(${deg} 11 11)`}
        />
      ))}
      <circle cx="11" cy="11" r="4.5" fill={palette.inner} stroke={palette.rim} strokeWidth="0.6" />
    </svg>
  );
}

function Stat({
  chip, label, value, sub, accent, children,
}: {
  chip: any;
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  children?: any;
}) {
  return (
    <div className={`topbar-stat ${accent ? 'is-accent' : ''}`}>
      <span className="topbar-stat-icon">{chip}</span>
      <span className="topbar-stat-body">
        <span className="topbar-stat-label">{label}</span>
        <span className="topbar-stat-value">
          {typeof value === 'number' ? Math.round(value).toLocaleString('fr-FR') : value}
          {sub && <span className="topbar-stat-sub">{sub}</span>}
        </span>
        {children}
      </span>
    </div>
  );
}
