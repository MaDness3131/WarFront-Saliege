/**
 * MainMenu — écran d'accueil unifié.
 * ----------------------------------
 * Remplace l'ancien `connect-screen` brut. Met le ton de la direction
 * artistique « Tactical Command Center » : panneau central, ascii minimal,
 * accents cyan, typographie condensée.
 *
 * Quatre actions : déploiement rapide (Classic), partie personnalisée,
 * profil/stats, options. La navigation est entièrement contenue ici ;
 * App.tsx ne fait que démarrer la simulation quand on appelle `onStart`.
 */
import { LaunchButton } from './LaunchButton';
import { GroupButton } from './GroupButton';
import { useState } from 'react';
import { GameMode, CustomOptions } from '@shared/types';
import { DEFAULT_CUSTOM_OPTIONS, SKINS, XP_PER_LEVEL } from '@shared/constants';
import { LocalProfile, loadProfile, updateProfile, unlockedSkins } from '../../local/profile';
import { CustomOptionsEditor } from './CustomOptions';
import { IconPlay, IconSettings, IconBack } from './icons';
import { MenuBackground } from './MenuBackground';
import { sfx } from '../../audio/Sfx';

interface Props {
  onStart: (mode: GameMode, name: string, customOpts?: CustomOptions, skinId?: string) => void;
  /** Transition vers l'écran GROUPE. Géré par App.tsx (rideau rouge inclus). */
  onGroup: () => void;
}

type Section = 'home' | 'custom' | 'profile' | 'options';

export function MainMenu({ onStart, onGroup }: Props) {
  const [section, setSection] = useState<Section>('home');
  const [profile, setProfile] = useState<LocalProfile>(() => loadProfile());
  const [name, setName] = useState(profile.name);

  const persistName = () => {
    if (name.trim()) setProfile(updateProfile({ name: name.trim() }));
  };

  const launch = (mode: GameMode, opts?: CustomOptions) => {
    persistName();
    onStart(mode, name.trim() || 'Commander', opts, profile.skinId);
  };

  return (
    <div className="menu-screen">
      {/* Décor : canvas animé (silhouette monde + radar + réseau) */}
      <MenuBackground />
      <div className="menu-bg-grid" aria-hidden />

      <div className="menu-shell">
        <header className="menu-header">
          <div className="menu-logo">
            <div className="menu-logo-mark">▲</div>
            <div className="menu-logo-text">
              <span>WARFRONT</span>
              <span className="menu-logo-text-sub">SALIÈGE · COMMAND</span>
            </div>
          </div>
          <div className="menu-header-right">
            <ProfileChip profile={profile} />
          </div>
        </header>

        <main className="menu-main">
          {section === 'home' && (
            <HomeSection
              name={name}
              setName={setName}
              onLaunchClassic={() => launch(GameMode.Classic)}
              onLaunchFast={() => launch(GameMode.Fast)}
              onGroup={() => { persistName(); onGroup(); }}
              onNav={setSection}
            />
          )}
          {section === 'custom' && (
            <CustomSection
              onBack={() => setSection('home')}
              onLaunch={(opts) => launch(GameMode.Custom, opts)}
            />
          )}
          {section === 'profile' && (
            <ProfileSection profile={profile} onProfileChange={setProfile} onBack={() => setSection('home')} />
          )}
          {section === 'options' && (
            <OptionsSection onBack={() => setSection('home')} />
          )}
        </main>

        <footer className="menu-footer">
          <span>v0.4 · solo offline</span>
          <span>WASD caméra · Q/E zoom · clic gauche conquête · clic droit construction</span>
        </footer>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sections
// ────────────────────────────────────────────────────────────────────────────

function HomeSection({
  name, setName, onLaunchClassic, onLaunchFast, onGroup, onNav,
}: {
  name: string; setName: (s: string) => void;
  onLaunchClassic: () => void; onLaunchFast: () => void;
  onGroup: () => void;
  onNav: (s: Section) => void;
}) {
  return (
      <div className="menu-home-flow">
        {/* Aurora ribbons — bandes de couleur qui pulsent */}
        <div className="aurora aurora-1" aria-hidden />

      {/* Hero — pas de carré, juste du texte fluide */}
      <div className="home-hero">
        <div className="home-hero-label">DÉPLOIEMENT</div>
        <div className="home-hero-prompt">QUEL EST LE NOM DE TA NATION ?</div>
        <div className="home-hero-input">
          <input
            value={name}
            maxLength={20}
            placeholder="Entre ton nom de commandant"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onLaunchClassic()}
            autoFocus
          />
          <div className="home-hero-input-underline" />
        </div>
        <div className="home-cta-row">
          <LaunchButton onLaunch={onLaunchClassic} />
          <GroupButton onLaunch={onGroup} />
        </div>
        <button className="home-fast" onClick={onLaunchFast}>
          → mode rapide
        </button>
      </div>

      {/* Actions flottantes — pas de boîte, juste des labels animés */}
      <div className="home-actions">
        <FlowAction label="Partie personnalisée" hint="Carte · vitesse · bots" onClick={() => onNav('custom')} />
        <FlowAction label="Profil & statistiques" hint="Elo · skins · historique" onClick={() => onNav('profile')} />
        <FlowAction label="Options" hint="Audio · affichage · contrôles" onClick={() => onNav('options')} />
      </div>

    </div>
  );
}

function FlowAction({ label, hint, onClick }: { label: string; hint: string; onClick: () => void }) {
  return (
    <button className="flow-action" onClick={onClick}>
      <span className="flow-action-label">{label}</span>
      <span className="flow-action-hint">{hint}</span>
      <span className="flow-action-line" />
    </button>
  );
}

function CustomSection({ onBack, onLaunch }: { onBack: () => void; onLaunch: (o: CustomOptions) => void }) {
  const [opts, setOpts] = useState<CustomOptions>(DEFAULT_CUSTOM_OPTIONS);
  return (
    <div className="menu-section">
      <SectionHeader title="PARTIE PERSONNALISÉE" onBack={onBack} />
      <div className="menu-section-body">
        <CustomOptionsEditor value={opts} onChange={setOpts} />
        <button className="menu-button-primary" onClick={() => onLaunch(opts)}>
          <IconPlay /> LANCER LA PARTIE
        </button>
      </div>
    </div>
  );
}

function ProfileSection({
  profile, onProfileChange, onBack,
}: {
  profile: LocalProfile; onProfileChange: (p: LocalProfile) => void; onBack: () => void;
}) {
  const xpNext = XP_PER_LEVEL(profile.level);
  const xpPct = Math.min(100, (profile.xp / xpNext) * 100);
  const unlocked = unlockedSkins(profile);

  const selectSkin = (id: string) => onProfileChange(updateProfile({ skinId: id }));

  return (
    <div className="menu-section">
      <SectionHeader title="PROFIL DE COMMANDEMENT" onBack={onBack} />
      <div className="menu-section-body">
        <div className="menu-stats-grid">
          <Stat label="Niveau" value={profile.level} />
          <Stat label="Elo" value={profile.elo} />
          <Stat label="Victoires" value={profile.wins} />
          <Stat label="Défaites" value={profile.losses} />
          <Stat label="Parties" value={profile.matchesPlayed} />
          <Stat label="Nukes" value={profile.nukesLaunched} />
        </div>

        <div className="menu-xp">
          <div className="menu-xp-label">XP {profile.xp} / {xpNext}</div>
          <div className="menu-xp-bar">
            <div className="menu-xp-fill" style={{ width: `${xpPct}%` }} />
          </div>
        </div>

        <div className="menu-section-title">APPARENCE</div>
        <div className="menu-skin-grid">
          {SKINS.map((s) => {
            const isUnlocked = unlocked.includes(s);
            const isSelected = profile.skinId === s.id;
            return (
              <button
                key={s.id}
                className={`menu-skin ${isSelected ? 'is-selected' : ''} ${isUnlocked ? '' : 'is-locked'}`}
                onClick={() => isUnlocked && selectSkin(s.id)}
                disabled={!isUnlocked}
              >
                <div className="menu-skin-swatch" style={{ background: s.color ?? '#888' }}>
                  {s.emblem}
                </div>
                <div className="menu-skin-name">{s.name}</div>
                {!isUnlocked && <div className="menu-skin-lock">Niv. {s.unlockLevel}</div>}
              </button>
            );
          })}
        </div>

        <div className="menu-section-title">DERNIÈRES PARTIES</div>
        {profile.history.length === 0 && <div className="menu-empty">Aucune partie jouée.</div>}
        {profile.history.slice(0, 10).map((m, i) => (
          <div key={i} className={`menu-history-row ${m.won ? 'is-win' : 'is-loss'}`}>
            <span>{m.mode.toUpperCase()}</span>
            <span>#{m.finalRank}</span>
            <span>{(m.peakDomination * 100).toFixed(0)}%</span>
            <span>{Math.floor(m.durationSec / 60)}m{m.durationSec % 60}s</span>
            <span className={m.eloDelta >= 0 ? 'pos' : 'neg'}>
              {m.eloDelta >= 0 ? '+' : ''}{m.eloDelta} elo
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OptionsSection({ onBack }: { onBack: () => void }) {
  // Lecture des préférences sauvegardées.
  const loadOpts = (): { musicVol: number; sfxVol: number; muteAll: boolean; showFps: boolean; colorBlind: boolean } => {
    try {
      const raw = JSON.parse(localStorage.getItem('warfront.options.v1') ?? '{}');
      return {
        musicVol: typeof raw.musicVol === 'number' ? raw.musicVol : 35,
        sfxVol: typeof raw.sfxVol === 'number' ? raw.sfxVol : 70,
        muteAll: !!raw.muteAll,
        showFps: !!raw.showFps,
        colorBlind: !!raw.colorBlind,
      };
    } catch { return { musicVol: 35, sfxVol: 70, muteAll: false, showFps: false, colorBlind: false }; }
  };
  const initial = loadOpts();
  const [musicVol, setMusicVol] = useState(initial.musicVol);
  const [sfxVol, setSfxVol] = useState(initial.sfxVol);
  const [muteAll, setMuteAll] = useState(initial.muteAll);
  const [showFps, setShowFps] = useState(initial.showFps);
  const [colorBlind, setColorBlind] = useState(initial.colorBlind);

  const save = (patch: Record<string, any>) => {
    try {
      const prev = JSON.parse(localStorage.getItem('warfront.options.v1') ?? '{}');
      localStorage.setItem('warfront.options.v1', JSON.stringify({ ...prev, ...patch }));
    } catch {}
  };

  return (
    <div className="menu-section">
      <SectionHeader title="OPTIONS" onBack={onBack} />
      <div className="menu-section-body">
        <div className="menu-option-group">
          <div className="menu-section-title">AUDIO</div>
          <OptionRow label={`Musique · ${musicVol}%`}>
            <input type="range" min={0} max={100} value={musicVol}
              onChange={(e) => { const v = Number(e.target.value); setMusicVol(v); save({ musicVol: v }); sfx.setVolumes({ music: v / 100 }); }}
            />
          </OptionRow>
          <OptionRow label={`Effets · ${sfxVol}%`}>
            <input type="range" min={0} max={100} value={sfxVol}
              onChange={(e) => { const v = Number(e.target.value); setSfxVol(v); save({ sfxVol: v }); sfx.setVolumes({ sfx: v / 100 }); }}
            />
          </OptionRow>
          <OptionRow label="Tout couper">
            <Toggle on={muteAll} onChange={(v) => { setMuteAll(v); save({ muteAll: v }); sfx.setMuted(v); }} />
          </OptionRow>
        </div>

        <div className="menu-option-group">
          <div className="menu-section-title">AFFICHAGE</div>
          <OptionRow label="Compteur FPS">
            <Toggle on={showFps} onChange={(v) => { setShowFps(v); save({ showFps: v }); }} />
          </OptionRow>
          <OptionRow label="Mode daltonien (palette accrue)">
            <Toggle on={colorBlind} onChange={(v) => { setColorBlind(v); save({ colorBlind: v }); }} />
          </OptionRow>
        </div>

        <div className="menu-option-group">
          <div className="menu-section-title">CONTRÔLES</div>
          <div className="menu-keys">
            <KeyRow keys={['W', 'A', 'S', 'D']} label="Déplacer la caméra" />
            <KeyRow keys={['Q', 'E']} label="Zoom −/+ (ou molette)" />
            <KeyRow keys={['CLIC G.']} label="Conquérir / tirer" />
            <KeyRow keys={['CLIC D.']} label="Construire (avec bâtiment sélectionné)" />
            <KeyRow keys={['ÉCHAP']} label="Annuler le mode courant" />
          </div>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers locaux
// ────────────────────────────────────────────────────────────────────────────

function SectionHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="menu-section-header">
      <button className="menu-iconbtn" onClick={onBack}><IconBack /></button>
      <h2>{title}</h2>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="menu-stat">
      <div className="menu-stat-label">{label}</div>
      <div className="menu-stat-value">{value}</div>
    </div>
  );
}

function OptionRow({ label, children }: { label: string; children: any }) {
  return (
    <div className="menu-option-row">
      <span className="menu-option-label">{label}</span>
      <span className="menu-option-control">{children}</span>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`menu-toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
      {on ? 'ON' : 'OFF'}
    </button>
  );
}

function KeyRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="menu-key-row">
      <span className="menu-keys-stack">
        {keys.map((k) => <kbd key={k}>{k}</kbd>)}
      </span>
      <span className="menu-key-label">{label}</span>
    </div>
  );
}

function ProfileChip({ profile }: { profile: LocalProfile }) {
  return (
    <div className="menu-profile-chip">
      <div className="menu-profile-chip-row">
        <span className="menu-profile-chip-name">{profile.name}</span>
        <span className="menu-profile-chip-level">NIV {profile.level}</span>
      </div>
      <div className="menu-profile-chip-row">
        <span className="menu-profile-chip-elo">ELO {profile.elo}</span>
        <span className="menu-profile-chip-record">{profile.wins}V · {profile.losses}D</span>
      </div>
    </div>
  );
}

// pour éviter la lib "unused" sur l'icone settings (utilisée en interne plus tard)
export const _ICON_REF = IconSettings;
