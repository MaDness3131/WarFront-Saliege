/**
 * ProfileScreen — méta-jeu local (Phase 4).
 * -----------------------------------------
 * Accessible depuis l'écran de connexion. Affiche :
 *  - profil du joueur : niveau, XP, Elo, victoires/défaites ;
 *  - sélecteur de skin (couleur + bordure + emblème) ;
 *  - historique des 10 dernières parties.
 *
 * Toutes les données sont persistées localement via `loadProfile/saveProfile`.
 */

import { useState } from 'react';
import { loadProfile, updateProfile, unlockedSkins, LocalProfile } from '../../local/profile';
import { SKINS, XP_PER_LEVEL } from '@shared/constants';

interface ProfileScreenProps {
  onBack: () => void;
}

export function ProfileScreen({ onBack }: ProfileScreenProps) {
  const [profile, setProfile] = useState<LocalProfile>(loadProfile());
  const skins = unlockedSkins(profile);

  const selectSkin = (id: string) => {
    setProfile(updateProfile({ skinId: id }));
  };

  const xpNext = XP_PER_LEVEL(profile.level);
  const xpPct = Math.min(100, (profile.xp / xpNext) * 100);

  return (
    <div className="profile-screen">
      <div className="profile-card">
        <div className="profile-header">
          <button className="profile-back" onClick={onBack}>← Retour</button>
          <h2>PROFIL</h2>
        </div>

        <div className="profile-stats">
          <Stat label="Niveau" value={profile.level} />
          <Stat label="Elo" value={profile.elo} />
          <Stat label="Victoires" value={profile.wins} />
          <Stat label="Défaites" value={profile.losses} />
          <Stat label="Parties" value={profile.matchesPlayed} />
          <Stat label="Nukes lancés" value={profile.nukesLaunched} />
        </div>

        <div className="profile-xp">
          <div className="profile-xp-label">XP {profile.xp} / {xpNext}</div>
          <div className="profile-xp-bar">
            <div className="profile-xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
        </div>

        <div className="profile-skins">
          <div className="profile-section-title">APPARENCE</div>
          <div className="profile-skin-grid">
            {SKINS.map((skin) => {
              const unlocked = skin.unlockLevel <= profile.level;
              const selected = profile.skinId === skin.id;
              return (
                <button
                  key={skin.id}
                  className={`profile-skin ${selected ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`}
                  onClick={() => unlocked && selectSkin(skin.id)}
                  disabled={!unlocked}
                  title={unlocked ? skin.name : `Niveau ${skin.unlockLevel} requis`}
                >
                  <div
                    className="profile-skin-swatch"
                    style={{ background: skin.color ?? '#888' }}
                  >
                    {skin.emblem}
                  </div>
                  <div className="profile-skin-name">{skin.name}</div>
                  {!unlocked && <div className="profile-skin-lock">Niv. {skin.unlockLevel}</div>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="profile-history">
          <div className="profile-section-title">DERNIÈRES PARTIES</div>
          {profile.history.length === 0 && (
            <div className="profile-history-empty">Aucune partie jouée pour le moment.</div>
          )}
          {profile.history.slice(0, 10).map((m, i) => (
            <div key={i} className={`profile-history-row ${m.won ? 'is-win' : 'is-loss'}`}>
              <span className="profile-history-mode">{m.mode}</span>
              <span className="profile-history-rank">#{m.finalRank}</span>
              <span className="profile-history-dom">{(m.peakDomination * 100).toFixed(0)}%</span>
              <span className="profile-history-dur">{Math.floor(m.durationSec / 60)}m{m.durationSec % 60}s</span>
              <span className={`profile-history-elo ${m.eloDelta >= 0 ? 'pos' : 'neg'}`}>
                {m.eloDelta >= 0 ? '+' : ''}{m.eloDelta}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="profile-stat">
      <div className="profile-stat-label">{label}</div>
      <div className="profile-stat-value">{value}</div>
    </div>
  );
}
