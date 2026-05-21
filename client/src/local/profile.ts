/**
 * Profile — persistance locale du méta-jeu (Phase 4).
 * ---------------------------------------------------
 * Sans backend, on stocke les stats du joueur dans `localStorage` :
 *  - Elo personnel (mis à jour à chaque partie selon résultat) ;
 *  - XP / niveau (débloque les skins haut-niveau) ;
 *  - historique des parties (résumé concis, plafonné à 30 entrées) ;
 *  - skin sélectionné, nom préféré.
 *
 * Tolère un storage absent (mode privé / SSR) : tous les accès passent par
 * un wrapper safe qui retombe sur des valeurs par défaut.
 */

import { GameMode, MatchSummary } from '@shared/types';
import {
  PROFILE_STORAGE_KEY,
  ELO_K_FACTOR,
  XP_PER_LEVEL,
  SKINS,
} from '@shared/constants';

export interface LocalProfile {
  version: 1;
  name: string;
  skinId: string;
  elo: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  nukesLaunched: number;
  territoriesPeak: number;
  history: MatchSummary[];
}

const DEFAULT_PROFILE: LocalProfile = {
  version: 1,
  name: 'Commander',
  skinId: 'default',
  elo: 1000,
  xp: 0,
  level: 1,
  wins: 0,
  losses: 0,
  matchesPlayed: 0,
  nukesLaunched: 0,
  territoriesPeak: 0,
  history: [],
};

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function loadProfile(): LocalProfile {
  const s = safeStorage();
  if (!s) return { ...DEFAULT_PROFILE };
  try {
    const raw = s.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<LocalProfile>;
    return { ...DEFAULT_PROFILE, ...parsed, version: 1 };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function saveProfile(profile: LocalProfile) {
  const s = safeStorage();
  if (!s) return;
  try {
    s.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* quota ou storage désactivé */
  }
}

export function updateProfile(patch: Partial<LocalProfile>): LocalProfile {
  const next = { ...loadProfile(), ...patch };
  saveProfile(next);
  return next;
}

/**
 * Met à jour Elo + XP + historique après une partie.
 * On utilise une variante simplifiée de l'Elo : on suppose 1 000 d'Elo moyen
 * pour les adversaires, et on bonifie selon le rang final.
 */
export function recordMatch(
  outcome: { won: boolean; rank: number; participants: number; mode: GameMode; summary: Omit<MatchSummary, 'eloDelta'> },
): { profile: LocalProfile; eloDelta: number } {
  const profile = loadProfile();
  const expected = 1 / (1 + Math.pow(10, (1000 - profile.elo) / 400));
  const score = outcome.won ? 1 : 1 - outcome.rank / Math.max(1, outcome.participants);
  const eloDelta = Math.round(ELO_K_FACTOR * (score - expected));
  profile.elo = Math.max(0, profile.elo + eloDelta);

  // XP : participation + bonus victoire + nukes
  const xpGain = 40 + (outcome.won ? 80 : 0) + outcome.summary.nukesLaunched * 5;
  profile.xp += xpGain;
  while (profile.xp >= XP_PER_LEVEL(profile.level)) {
    profile.xp -= XP_PER_LEVEL(profile.level);
    profile.level += 1;
  }

  profile.matchesPlayed += 1;
  if (outcome.won) profile.wins += 1;
  else profile.losses += 1;
  profile.nukesLaunched += outcome.summary.nukesLaunched;
  profile.territoriesPeak = Math.max(profile.territoriesPeak, outcome.summary.territoriesPeak);
  profile.history = [{ ...outcome.summary, eloDelta }, ...profile.history].slice(0, 30);
  saveProfile(profile);
  return { profile, eloDelta };
}

/** Skins déverrouillés à partir du niveau courant. */
export function unlockedSkins(profile: LocalProfile) {
  return SKINS.filter((s) => s.unlockLevel <= profile.level);
}

export function resolveSkin(skinId: string) {
  return SKINS.find((s) => s.id === skinId) ?? SKINS[0];
}
