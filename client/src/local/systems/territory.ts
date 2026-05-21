/**
 * Territory — capture, défense, chantiers, terrain brûlé, propagation.
 * --------------------------------------------------------------------
 * Le cœur du jeu : ce module avance les vagues d'expansion (une cellule
 * par pas), résout les captures contre les défenses adverses, et entretient
 * les compteurs par joueur. Aussi : constructions en cours et expiration
 * du terrain brûlé.
 *
 * Règle de capture : le coût d'une cellule = défense_effective + 1.
 * Une vague consomme ce coût sur son budget jusqu'à épuisement.
 */

import { TerrainType, BuildingType } from '@shared/types';
import {
  DEFENSE_TERRAIN_BONUS,
  DEFENSE_POST_BONUS_PER_LEVEL,
  BUILDINGS,
  OF_MAG,
  OF_SPEED,
  OF_DEFENSE_POST_MAG_MULT,
  OF_DEFENSE_POST_SPEED_DIV,
  OF_DEFENSE_POST_RANGE,
  OF_TROOP_RATIO_MIN,
  OF_TROOP_RATIO_MAX,
  OF_ATTACKER_LOSS_PRIMARY_WEIGHT,
  OF_ATTACKER_LOSS_ALT_WEIGHT,
  OF_ATTACKER_BONUS,
  OF_ALT_LOSS_MULT,
  OF_BOT_DEBUFF,
  OF_TRAITOR_DEFENSE_DEBUFF,
  OF_TRAITOR_SPEED_DEBUFF,
  OF_SPEED_RATIO_MIN,
  OF_SPEED_RATIO_MAX,
  OF_TERRA_NULLIUS_LOSS_HUMAN_DIV,
  OF_TERRA_NULLIUS_LOSS_BOT_DIV,
  OF_TERRA_NULLIUS_SPEED_CONST,
  OF_TERRA_NULLIUS_TILES_MIN,
  OF_TERRA_NULLIUS_TILES_MAX,
  OF_LARGE_EMPIRE_THRESHOLD,
  BLACKJACK_VICTORY_DAMAGE_BONUS,
} from '@shared/constants';
import { LocalGameState, LocalTerritory, LocalWave } from '../state';
import { Emitter, EVENT } from '../events';

/**
 * Heuristique de défense effective d'une tuile, dans le modèle FrontWars.
 * Les troupes sont par joueur (pas par tuile) — la valeur retournée est
 * une estimation utilisée par l'IA pour comparer la "dureté" d'une cible.
 */
export function effectiveDefense(state: LocalGameState | null, t: LocalTerritory): number {
  let terrainBonus: number = DEFENSE_TERRAIN_BONUS.land;
  if (t.terrain === TerrainType.Mountain) terrainBonus = DEFENSE_TERRAIN_BONUS.mountain;
  else if (t.terrain === TerrainType.Coast) terrainBonus = DEFENSE_TERRAIN_BONUS.coast;
  else if (t.terrain === TerrainType.Ocean) terrainBonus = DEFENSE_TERRAIN_BONUS.ocean;

  let buildingBonus = 1;
  if (t.building === BuildingType.DefensePost) {
    buildingBonus = 1 + DEFENSE_POST_BONUS_PER_LEVEL * t.buildingLevel;
  }
  // Densité de troupes du propriétaire (troupes/tuile).
  let density = 1;
  if (state && t.owner) {
    const p = state.players.get(t.owner);
    if (p && p.territoryCount > 0) {
      density = Math.max(0.5, p.army / p.territoryCount);
    }
  }
  return density * terrainBonus * buildingBonus;
}

/**
 * Avance chaque vague d'un pas (selon son cooldown). Pour chaque vague :
 *   - récupère les voisins des cellules du front qui ne sont pas alliés ;
 *   - les trie par "score directionnel" (préfère les cellules vers le target) ;
 *   - capture autant de cellules que possible jusqu'à `stepWidth` ou
 *     épuisement du budget ;
 *   - met à jour le front avec les cellules tout juste capturées.
 * Une vague qui ne peut plus s'étendre meurt.
 */
// ────────────────────────────────────────────────────────────────────────────
// Système d'attaque FrontWars-like.
// ────────────────────────────────────────────────────────────────────────────

import { computePriority } from './military';

/** Magnitude OpenFront par terrain de la tuile à conquérir. */
function tileMagnitude(t: LocalTerritory): number {
  if (t.terrain === TerrainType.Mountain) return OF_MAG.mountain;
  // Highlands = terre intérieure ; ici on assimile Forest/Desert/Snow.
  if (t.terrain === TerrainType.Forest ||
      t.terrain === TerrainType.Desert ||
      t.terrain === TerrainType.Snow) return OF_MAG.highland;
  return OF_MAG.plains;
}

/** Vitesse OpenFront par terrain (tilesPerTickUsed multiplicateur). */
function tileSpeed(t: LocalTerritory): number {
  if (t.terrain === TerrainType.Mountain) return OF_SPEED.mountain;
  if (t.terrain === TerrainType.Forest ||
      t.terrain === TerrainType.Desert ||
      t.terrain === TerrainType.Snow) return OF_SPEED.highland;
  return OF_SPEED.plains;
}

/** Clamp d'un nombre dans [lo, hi]. */
function within(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Plancher du coût par tuile (au cas où largeAttackBonus pousse à 0). */
const MIN_TILES_USED = 0.5;

export function tickWaves(state: LocalGameState, emit: Emitter) {
  const toRemove: string[] = [];

  for (const wave of state.waves.values()) {
    if (wave.troops < 1 || wave.toConquer.size === 0) {
      toRemove.push(wave.id);
      continue;
    }

    const attacker = state.players.get(wave.owner);
    if (!attacker) { toRemove.push(wave.id); continue; }
    const defender = wave.targetOwner ? state.players.get(wave.targetOwner) ?? null : null;

    // ─── Budget par tick ─────────────────────────────────────────────────
    // OpenFront ne calcule pas un budget global — ils traitent UNE tuile
    // par appel attackLogic, qui retourne `tilesPerTickUsed` consommé sur un
    // budget interne. On garde une boucle while bornée pour éviter le frame
    // hang sur de grandes vagues — le budget est porté par tilesPerTickUsed.
    let budgetThisTick = 30;

    while (budgetThisTick > 0 && wave.troops >= 1 && wave.toConquer.size > 0) {
      const top = wave.toConquer.pop();
      if (!top) break;
      const bestId = top.value;
      const bestPrio = top.prio;

      const t = state.territoryById.get(bestId);
      if (!t) continue;
      if (t.owner === wave.owner) continue;
      const tOwner = t.owner ?? null;
      if (tOwner !== wave.targetOwner) continue;
      if (tOwner && areAllied(state, tOwner, wave.owner)) continue;
      if (t.terrain === TerrainType.Ocean) continue;
      // Cratères : conquérables, on ne saute pas la tuile.
      if (!touchesPlayer(state, t, wave.owner)) continue;
      if (defender && defender.spawnProtectedUntil > state.tick) continue;

      // ═══════════════════════════════════════════════════════════════════
      //   attackLogic OpenFront (Config.ts lignes 772-857)
      // ═══════════════════════════════════════════════════════════════════
      //
      // Variables sources :
      //   mag       = magnitude par terrain (4/5/6) × ×5 si defense post
      //   speed     = vitesse par terrain (5.5/5/3.75) ÷ ×3 si defense post
      //   bot debuff: ×0.7 sur mag quand humain/nation attaque bot
      //   traitor   : ×0.5 sur defense, ×0.8 sur speed si défenseur traître
      //   large empire penalties : sqrt(THRESHOLD/numTiles) pour empires énormes
      //
      // Sortie :
      //   attackerTroopLoss = pertes attaquant sur cette tuile
      //   defenderTroopLoss = pertes défenseur sur cette tuile (=troops/numTiles)
      //   tilesPerTickUsed  = budget consommé pour prendre cette tuile

      let mag = tileMagnitude(t);
      let speed = tileSpeed(t);

      // Defense post aura → ×5 mag, ÷3 speed (range 30).
      if (hasDefenseAura(state, t, tOwner)) {
        mag *= OF_DEFENSE_POST_MAG_MULT;
        speed /= OF_DEFENSE_POST_SPEED_DIV;
      }

      // Bot debuff : humain attaque bot → ×0.7 sur mag.
      if (defender && defender.isBot && !attacker.isBot) mag *= OF_BOT_DEBUFF;

      // Traître : si le défenseur a une marque de traîtrise (diplomacyLockUntil
      // récente), il subit des debuffs. On lit ça comme "diplomacyLockUntil > tick".
      let traitorMod = 1;
      let traitorSpeedDebuff = 1;
      if (defender && defender.diplomacyLockUntil > state.tick) {
        traitorMod = OF_TRAITOR_DEFENSE_DEBUFF;
        traitorSpeedDebuff = OF_TRAITOR_SPEED_DEBUFF;
      }

      // Large-empire penalties (anti-snowball OpenFront).
      let largeAttackBonus = 1;
      let largeAttackerSpeedBonus = 1;
      if (attacker.territoryCount > OF_LARGE_EMPIRE_THRESHOLD) {
        const r = OF_LARGE_EMPIRE_THRESHOLD / attacker.territoryCount;
        largeAttackBonus = Math.pow(Math.sqrt(r), 0.7);
        largeAttackerSpeedBonus = Math.pow(r, 0.6);
      }
      let largeDefenderAttackDebuff = 1;
      let largeDefenderSpeedDebuff = 1;
      if (defender && defender.territoryCount > OF_LARGE_EMPIRE_THRESHOLD) {
        const defenseSig = Math.min(1, OF_LARGE_EMPIRE_THRESHOLD / defender.territoryCount);
        largeDefenderAttackDebuff = 0.7 + 0.3 * defenseSig;
        largeDefenderSpeedDebuff = 0.7 + 0.3 * defenseSig;
      }

      let attackerLoss: number;
      let defenderLoss: number;
      let tilesUsed: number;

      if (defender) {
        // defenderLoss : troupes / tuiles possédées (dilution OpenFront).
        defenderLoss = defender.army / Math.max(1, defender.territoryCount);
        // Bonus blackjack : +20 % de dégâts contre un ennemi battu au casino.
        if (attacker.blackjackBoosts && attacker.blackjackBoosts.has(defender.id)) {
          defenderLoss *= 1 + BLACKJACK_VICTORY_DAMAGE_BONUS;
        }

        // currentAttackerLoss : terme dominant — pondéré par le ratio
        //   défenseur/attaquant (clampé 0.6-2), la magnitude, le bonus
        //   attaquant 0.8, et les grands-empire / traître modificateurs.
        const troopRatio = within(
          defender.army / Math.max(1, wave.troops),
          OF_TROOP_RATIO_MIN, OF_TROOP_RATIO_MAX,
        );
        const currentAttackerLoss =
          troopRatio * mag * OF_ATTACKER_BONUS
          * largeDefenderAttackDebuff * largeAttackBonus * traitorMod;

        // altAttackerLoss : terme corrélé à defenderLoss (les pertes saignent
        //   l'attaquant proportionnellement aux pertes infligées au défenseur).
        const altAttackerLoss = OF_ALT_LOSS_MULT * defenderLoss * (mag / 100) * traitorMod;

        // Pondération finale : 60% courant + 40% alt.
        attackerLoss =
          OF_ATTACKER_LOSS_PRIMARY_WEIGHT * currentAttackerLoss
          + OF_ATTACKER_LOSS_ALT_WEIGHT * altAttackerLoss;

        // tilesPerTickUsed : vitesse de prise, dictée par le ratio armée
        //   défenseur / (5 × troupes attaquant), clampé 0.2-1.5.
        const speedRatio = within(
          defender.army / (5 * Math.max(1, wave.troops)),
          OF_SPEED_RATIO_MIN, OF_SPEED_RATIO_MAX,
        );
        tilesUsed = Math.max(
          MIN_TILES_USED,
          speedRatio * speed * largeDefenderSpeedDebuff * largeAttackerSpeedBonus * traitorSpeedDebuff,
        );
      } else {
        // Terra Nullius : pertes attaquant = mag / 5 (humain), mag/10 (bot).
        const lossDiv = attacker.isBot ? OF_TERRA_NULLIUS_LOSS_BOT_DIV : OF_TERRA_NULLIUS_LOSS_HUMAN_DIV;
        attackerLoss = mag / lossDiv;
        defenderLoss = 0;
        // Vitesse Terra Nullius : (CONST × max(10, speed)) / troupes, clampé.
        tilesUsed = within(
          (OF_TERRA_NULLIUS_SPEED_CONST * Math.max(10, speed)) / Math.max(1, wave.troops),
          OF_TERRA_NULLIUS_TILES_MIN,
          OF_TERRA_NULLIUS_TILES_MAX,
        );
      }

      if (wave.troops < attackerLoss) {
        wave.toConquer.push(bestId, bestPrio);
        break;
      }

      // Capture effective.
      wave.troops -= attackerLoss;
      if (defender) defender.army = Math.max(0, defender.army - defenderLoss);
      attacker.armiesKilled += defenderLoss;
      if (defender) defender.armiesLost += defenderLoss;

      const prevOwner = t.owner;
      if (prevOwner) {
        adjustTerritoryCount(state, prevOwner, -1);
        const prev = state.players.get(prevOwner);
        if (prev) prev.lastAttackedBy = wave.owner;
      }
      t.owner = wave.owner;
      t.capturedAt = Date.now();
      if (t.buildProgress > 0 && t.buildProgress < 100) t.buildProgress = 0;
      adjustTerritoryCount(state, wave.owner, +1);
      reassignTile(state, t.id, prevOwner, wave.owner);
      emit(EVENT.TerritoryCaptured, { id: t.id, by: wave.owner, from: -1 });

      budgetThisTick -= tilesUsed;

      // Ajoute les voisins valides à la file.
      for (const nid of t.neighbors) {
        if (wave.queued.has(nid)) continue;
        const n = state.territoryById.get(nid);
        if (!n) continue;
        if (n.terrain === TerrainType.Ocean) continue;
        // Cratères conquérables : pas de filtrage.
        const nOwner = n.owner ?? null;
        if (nOwner === wave.owner) continue;
        if (nOwner !== wave.targetOwner) continue;
        if (nOwner && areAllied(state, nOwner, wave.owner)) continue;
        wave.toConquer.push(nid, computePriority(state, nid, wave.owner, state.tick));
        wave.queued.add(nid);
      }
    }

    if (wave.troops < 1 || wave.toConquer.size === 0) toRemove.push(wave.id);
  }

  for (const id of toRemove) {
    const w = state.waves.get(id);
    if (w && w.troops > 1) {
      // Retour des troupes restantes au joueur.
      const p = state.players.get(w.owner);
      if (p) p.army += w.troops;
    }
    state.waves.delete(id);
  }
}

function touchesPlayer(state: LocalGameState, t: LocalTerritory, playerId: string): boolean {
  for (const nid of t.neighbors) {
    const n = state.territoryById.get(nid);
    if (n && n.owner === playerId) return true;
  }
  return false;
}

function hasDefenseAura(state: LocalGameState, t: LocalTerritory, owner: string | null): boolean {
  if (!owner) return false;
  // OpenFront : range 30 tuiles, distance de Manhattan (diamant). On garde
  // le balayage carré pour la simplicité mais on filtre via |dx|+|dy| ≤ R.
  const R = OF_DEFENSE_POST_RANGE;
  const w = state.mapWidth;
  const h = state.mapHeight;
  for (let dy = -R; dy <= R; dy++) {
    const absDy = Math.abs(dy);
    const remX = R - absDy;
    if (remX < 0) continue;
    const y = t.y + dy;
    if (y < 0 || y >= h) continue;
    for (let dx = -remX; dx <= remX; dx++) {
      const x = t.x + dx;
      if (x < 0 || x >= w) continue;
      const n = state.territoryById.get(y * w + x);
      if (!n) continue;
      if (n.owner === owner
          && n.building === BuildingType.DefensePost
          && n.buildingLevel > 0) {
        return true;
      }
    }
  }
  return false;
}

export function adjustTerritoryCount(state: LocalGameState, playerId: string | null, delta: number) {
  if (!playerId) return;
  const p = state.players.get(playerId);
  if (!p) return;
  p.territoryCount = Math.max(0, p.territoryCount + delta);
}

/** Maintient l'index playerTiles : déplace `tileId` de `oldOwner` à `newOwner`. */
export function reassignTile(
  state: LocalGameState,
  tileId: number,
  oldOwner: string | null,
  newOwner: string | null,
) {
  if (oldOwner) {
    const set = state.playerTiles.get(oldOwner);
    if (set) set.delete(tileId);
  }
  if (newOwner) {
    let set = state.playerTiles.get(newOwner);
    if (!set) { set = new Set(); state.playerTiles.set(newOwner, set); }
    set.add(tileId);
    // Reconquête d'un cratère : on efface le marqueur de terre brûlée pour
    // que la tuile reprenne l'aspect normal sous la couleur du joueur.
    const t = state.territoryById.get(tileId);
    if (t && t.scorchedUntil > 0) t.scorchedUntil = 0;
  }
}

export function tickConstruction(state: LocalGameState) {
  for (const t of state.territories) {
    if (t.buildProgress <= 0 || t.buildProgress >= 100) continue;
    const spec = BUILDINGS[t.building as Exclude<BuildingType, BuildingType.None>];
    if (!spec) { t.buildProgress = 0; continue; }
    const step = (100 / spec.buildTicks) * state.speedMultiplier;
    t.buildProgress = Math.min(100, t.buildProgress + step);
    if (t.buildProgress >= 100) {
      t.buildingLevel += 1;
      t.buildProgress = 0;
    }
  }
}

export function tickScorch(state: LocalGameState) {
  for (const t of state.territories) {
    if (t.scorchedUntil > 0 && state.tick >= t.scorchedUntil) {
      t.scorchedUntil = 0;
    }
  }
}

export function recountTerritories(state: LocalGameState) {
  for (const p of state.players.values()) p.territoryCount = 0;
  for (const t of state.territories) {
    if (t.owner) {
      const p = state.players.get(t.owner);
      if (p) p.territoryCount += 1;
    }
  }
}

export function checkElimination(state: LocalGameState, emit: Emitter) {
  for (const p of state.players.values()) {
    // Suit les pics — utilisés pour le bonus de mise à mort.
    if (p.territoryCount > p.peakTerritories) p.peakTerritories = p.territoryCount;
    if (p.army > p.peakArmy) p.peakArmy = p.army;

    if (p.alive && p.territoryCount === 0 && state.tick > 50) {
      p.alive = false;
      p.army = 0;
      // Nettoyage : le boost blackjack +20 % vs ce joueur n'a plus de
      // sens. On le retire de TOUS les autres joueurs.
      for (const other of state.players.values()) {
        if (other.blackjackBoosts) other.blackjackBoosts.delete(p.id);
      }
      // Bonus proportionnel : 0.4 or par tuile de pic + 0.04 or par troupe de pic.
      // Une nation de 100 tuiles / 500 troupes ⇒ ~60 or. Une de 1000 / 5000 ⇒ ~600.
      if (p.lastAttackedBy) {
        const killer = state.players.get(p.lastAttackedBy);
        if (killer && killer.alive) {
          const bonus = Math.max(20, p.peakTerritories * 0.4 + p.peakArmy * 0.04);
          killer.gold += bonus;
          emit('KillReward', {
            killer: killer.id, victim: p.id,
            gold: Math.round(bonus), peakTerr: p.peakTerritories, peakArmy: Math.round(p.peakArmy),
          });
        }
      }
      emit(EVENT.PlayerEliminated, { id: p.id });
    }
  }
}

export function areAllied(state: LocalGameState, a: string, b: string): boolean {
  if (a === b) return true;
  const pa = state.players.get(a);
  if (!pa || !pa.allianceId) return false;
  const pb = state.players.get(b);
  if (!pb) return false;
  return pa.allianceId === pb.allianceId;
}
