/**
 * Weapons — missiles, frappes nucléaires, hydrogène (Phase 3).
 * ------------------------------------------------------------
 * Trois types d'armes, trois échelles :
 *  - missile : impact unique, dégâts à la garnison, pas de scorch ;
 *  - nuke    : rayon 3 cellules, anéantit garnisons + bâtiments, terrain
 *              brûlé temporaire (territoire inutilisable) ;
 *  - hydrogen : rayon 5, durée de scorch doublée.
 *
 * Le tir est instantanément débité (or + cooldown), mais l'impact est différé
 * d'une durée de vol (`flightTicks`) pendant laquelle un missile est animé
 * comme un projectile. Une sirène nucléaire avertit les joueurs en amont.
 */

import { TerrainType, BuildingType, WeaponKind } from '@shared/types';
import {
  WEAPONS,
  NUKE_SIREN_LEAD_TICKS,
  SAM_INTERCEPT_RADIUS,
  SAM_INTERCEPT_CHANCE_PER_LEVEL,
} from '@shared/constants';
import { LocalGameState, LocalMissile, nextId } from '../state';
import { adjustTerritoryCount, reassignTile, areAllied } from './territory';
import { trySpend } from './economy';
import { notifyBotWeaponThreat } from './botAI';
import { Emitter, EVENT } from '../events';

const WEAPON_KINDS: WeaponKind[] = ['nuke', 'hydrogen', 'tsar'];

export interface LaunchResult { ok: boolean; reason?: string; }

/** Tire une arme depuis un territoire-base vers une cible terrestre. */
export function launchWeapon(
  state: LocalGameState,
  playerId: string,
  targetId: number,
  kind: WeaponKind,
  emit: Emitter,
): LaunchResult {
  if (!state.enabled.weapons) return { ok: false, reason: 'disabled' };
  const p = state.players.get(playerId);
  if (!p || !p.alive) return { ok: false, reason: 'no_player' };
  const spec = WEAPONS[kind];
  if (!spec) return { ok: false, reason: 'bad_kind' };

  if (p.cooldowns[kind] > 0) return { ok: false, reason: 'cooldown' };

  const target = state.territoryById.get(targetId);
  if (!target) return { ok: false, reason: 'bad_target' };
  if (target.terrain === TerrainType.Ocean) return { ok: false, reason: 'is_ocean' };

  // Base de lancement : un territoire possédé (idéalement avec usine ou ville).
  const base = pickLaunchSite(state, playerId);
  if (!base) return { ok: false, reason: 'no_base' };

  if (!trySpend(p, spec.cost)) return { ok: false, reason: 'no_gold' };
  p.cooldowns[kind] = spec.cooldownTicks;
  p.nukesLaunched++;

  const id = nextId(state, 'm');
  const missile: LocalMissile = {
    id,
    kind,
    owner: playerId,
    fromX: base.x + 0.5,
    fromY: base.y + 0.5,
    toX: target.x + 0.5,
    toY: target.y + 0.5,
    startTick: state.tick,
    durationTicks: spec.flightTicks,
  };
  state.missiles.set(id, missile);

  emit(EVENT.MissileLaunched, {
    missileId: id,
    fromX: missile.fromX,
    fromY: missile.fromY,
    toX: missile.toX,
    toY: missile.toY,
    kind,
  });
  // Toutes les armes sont nucléaires → sirène systématique.
  setTimeout(() => emit(EVENT.NukeSirenWarning, { toX: missile.toX, toY: missile.toY }), 0);
  // Flag les bots proches de l'impact → ils prioriseront un SAM.
  // On considère le propriétaire visé + ses voisins immédiats.
  const targetOwner = target.owner;
  if (targetOwner && targetOwner !== playerId) {
    notifyBotWeaponThreat(targetOwner, state.tick);
  }
  return { ok: true };
}

/** Décompte cooldowns, anime missiles, résout impacts. */
export function tickWeapons(state: LocalGameState, emit: Emitter) {
  // Cooldowns des joueurs.
  for (const p of state.players.values()) {
    // Mode Admin : tous les cooldowns à 0 en permanence (spam autorisé).
    if (p.adminMode) {
      for (const k of WEAPON_KINDS) p.cooldowns[k] = 0;
      continue;
    }
    for (const k of WEAPON_KINDS) {
      if (p.cooldowns[k] > 0) {
        p.cooldowns[k] = Math.max(0, p.cooldowns[k] - state.speedMultiplier);
      }
    }
  }

  // Missiles en vol.
  for (const [id, m] of state.missiles) {
    const elapsed = state.tick - m.startTick;

    // Tentative d'interception par SAM ennemi proche de la position courante.
    if (tryIntercept(state, m, elapsed, emit)) {
      state.missiles.delete(id);
      continue;
    }

    if (elapsed >= m.durationTicks) {
      detonate(state, m, emit);
      state.missiles.delete(id);
    }
  }
}

/** Vérifie chaque tick si un SAM ennemi se déclenche contre ce missile. */
function tryIntercept(state: LocalGameState, m: LocalMissile, elapsed: number, emit: Emitter): boolean {
  // Position interpolée du missile sur sa trajectoire.
  const progress = Math.min(1, elapsed / m.durationTicks);
  const px = m.fromX + (m.toX - m.fromX) * progress;
  const py = m.fromY + (m.toY - m.fromY) * progress;

  // Probabilité d'être intercepté par tick — somme sur tous les SAMs en portée.
  let chance = 0;
  for (const [, player] of state.players) {
    if (player.id === m.owner) continue;
    if (areAllied(state, player.id, m.owner)) continue;
    const tiles = state.playerTiles.get(player.id);
    if (!tiles) continue;
    for (const tid of tiles) {
      const t = state.territoryById.get(tid);
      if (!t || t.building !== BuildingType.SamLauncher || t.buildingLevel <= 0) continue;
      const d = Math.hypot(t.x - px, t.y - py);
      if (d > SAM_INTERCEPT_RADIUS) continue;
      // Plus on est proche du centre, plus l'interception est probable.
      const proximity = 1 - d / SAM_INTERCEPT_RADIUS;
      chance += SAM_INTERCEPT_CHANCE_PER_LEVEL * t.buildingLevel * proximity * 0.1; // /tick
    }
  }
  if (chance > 0 && Math.random() < chance) {
    emit(EVENT.Explosion, { x: px, y: py, kind: 0 });
    return true;
  }
  return false;
}

/** Applique le blast d'une arme au territoire d'impact + rayon.
 *  Cratère CIRCULAIRE (distance euclidienne, pas Chebyshev) avec dispersion
 *  vers les bords : noyau plein de 0 → 0.7×R, puis frange probabiliste de
 *  0.7×R → R où la chance de destruction décroît linéairement de 1 à 0.
 *  Visuellement : disque plein avec contour effiloché / pointillé.
 *
 *  Le terrain touché devient NEUTRE (owner=null) et reprenable
 *  IMMÉDIATEMENT — pas de scorch gameplay. Le cratère sombre dessiné par
 *  ExplosionSystem est purement visuel et fade tout seul. */
function detonate(state: LocalGameState, m: LocalMissile, emit: Emitter) {
  const spec = WEAPONS[m.kind];
  const cx = Math.floor(m.toX);
  const cy = Math.floor(m.toY);
  const attacker = state.players.get(m.owner);

  emit(EVENT.MissileImpact, { x: m.toX, y: m.toY, kind: m.kind, radius: spec.radius });
  // Kind d'explosion : 2=nuke/hydrogen, 3=tsar (raseur de continent).
  const explosionKind = m.kind === 'tsar' ? 3 : 2;
  emit(EVENT.Explosion, { x: m.toX, y: m.toY, kind: explosionKind });

  // Comptabilité des pertes du défenseur (dilution × tuiles touchées).
  const tilesByOwner = new Map<string, number>();

  // ─── Cratère circulaire avec dispersion sur la frange ───────────────
  // Noyau : d <= 0.7 R → toujours détruit.
  // Frange : 0.7 R < d <= R → proba (R - d) / (0.3 R) — pointillage circulaire.
  const r = spec.radius;
  const coreSq = (r * 0.7) * (r * 0.7);
  const edgeSq = r * r;
  const edgeWidth = r - r * 0.7;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= state.mapWidth || y >= state.mapHeight) continue;
      const distSq = dx * dx + dy * dy;
      if (distSq > edgeSq) continue; // hors disque circulaire

      const t = state.territoryById.get(y * state.mapWidth + x);
      if (!t || t.terrain === TerrainType.Ocean) continue;

      // Frange probabiliste : on tire un dé pour la zone externe.
      if (distSq > coreSq) {
        const d = Math.sqrt(distSq);
        const probability = (r - d) / edgeWidth; // 1 au bord du noyau, 0 au bord externe
        if (Math.random() > probability) continue;
      }

      // Tuile détruite → terre brûlée NEUTRE, conquérable immédiatement.
      // On marque scorchedUntil avec une valeur quasi-permanente : le
      // rendu WorldMap dessine alors un cratère brun à variations pixelisées.
      // Le marqueur est effacé par reassignTile dès qu'un joueur reprend
      // la tuile (cf. systems/territory.ts).
      if (t.owner) {
        tilesByOwner.set(t.owner, (tilesByOwner.get(t.owner) ?? 0) + 1);
        adjustTerritoryCount(state, t.owner, -1);
        reassignTile(state, t.id, t.owner, null);
      }
      t.owner = null;
      t.troops = 0;
      t.building = BuildingType.None;
      t.buildingLevel = 0;
      t.buildProgress = 0;
      // 1e9 ticks ≈ permanent ; comparaison `> state.tick` reste vraie
      // jusqu'à reconquête (où reassignTile remet à 0). Pas de blocage
      // gameplay — les checks scorchedUntil > tick ont été supprimés.
      t.scorchedUntil = state.tick + 1_000_000_000;
    }
  }

  // Pertes en troupes : tiles_touchées × density × multiplicateur d'arme.
  // Multiplicateur baissé pour nuke/hydro — la dévastation territoriale
  // est déjà colossale (rayons 9 / 23). Tsar Bomba : ×2.5.
  const mult =
    m.kind === 'nuke' ? 1.5 :
    m.kind === 'hydrogen' ? 1.8 :
    m.kind === 'tsar' ? 2.5 : 1;
  for (const [ownerId, count] of tilesByOwner) {
    const def = state.players.get(ownerId);
    if (!def) continue;
    const density = def.territoryCount > 0 ? def.army / def.territoryCount : 0;
    const losses = Math.min(def.army, density * count * mult);
    def.army = Math.max(0, def.army - losses);
    def.armiesLost += losses;
    if (attacker) attacker.armiesKilled += losses;
  }
}

/** Préfère un territoire avec une usine, sinon n'importe quel territoire. */
function pickLaunchSite(state: LocalGameState, playerId: string) {
  const myTiles = state.playerTiles.get(playerId);
  if (!myTiles) return null;
  let factory = null;
  let fallback = null;
  for (const id of myTiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    if (t.building === BuildingType.Factory && t.buildingLevel > 0) {
      factory = t;
      break;
    }
    if (!fallback) fallback = t;
  }
  return factory ?? fallback;
}
