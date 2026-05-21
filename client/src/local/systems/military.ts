/**
 * Military — déclenchement d'une attaque (à la FrontWars).
 * --------------------------------------------------------
 * Quand un joueur attaque, on crée une `LocalWave` (attaque vivante) qui
 * possède son propre pool de troupes. La file `toConquer` est amorcée à
 * partir de TOUTES les cellules-frontières du joueur ; chaque tick consomme
 * la tête de file (la plus prioritaire), conquiert la tuile, puis ajoute
 * ses voisins à la file. La progression cesse quand pool=0 ou file vide.
 *
 * Pas de notion de "direction" — la vague mange en priorité les enclaves
 * (cellules entourées par l'attaquant) et progresse de proche en proche.
 */

import { TerrainType } from '@shared/types';
import { MIN_ATTACK_FORCE, MIN_ATTACK_RATIO, MAX_ATTACK_RATIO } from '@shared/constants';
import { LocalGameState, LocalTerritory, nextId } from '../state';
import { MinHeap } from '../util/MinHeap';
import { areAllied } from './territory';

export type AttackReason =
  | 'ok'
  | 'no_player'
  | 'bad_target'
  | 'no_frontier'
  | 'is_ocean'
  | 'is_scorched'
  | 'allied'
  | 'insufficient_force'
  | 'in_blackjack'
  | 'target_in_blackjack';

export interface AttackResult { ok: boolean; reason: AttackReason; }

export function requestAttack(
  state: LocalGameState,
  playerId: string,
  targetId: number,
): AttackResult {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return { ok: false, reason: 'no_player' };
  // L'attaquant ne peut pas attaquer pendant qu'il est dans un duel blackjack.
  if (p.blackjackBusyUntil > state.tick) return { ok: false, reason: 'in_blackjack' };

  const target = state.territoryById.get(targetId);
  if (!target) return { ok: false, reason: 'bad_target' };
  if (target.terrain === TerrainType.Ocean) return { ok: false, reason: 'is_ocean' };
  // Note : les cratères (scorchedUntil > 0) sont conquérables — on ne
  // bloque plus l'attaque dessus, c'est juste un marqueur visuel.
  if (target.owner && target.owner !== playerId &&
      areAllied(state, target.owner, playerId)) {
    return { ok: false, reason: 'allied' };
  }
  // La cible est protégée pendant qu'elle joue un blackjack.
  if (target.owner && target.owner !== playerId) {
    const def = state.players.get(target.owner);
    if (def && def.blackjackBusyUntil > state.tick) {
      return { ok: false, reason: 'target_in_blackjack' };
    }
  }

  const ratio = Math.min(MAX_ATTACK_RATIO, Math.max(MIN_ATTACK_RATIO, p.attackRatio));
  const troops = Math.floor(p.army * ratio);
  if (troops < MIN_ATTACK_FORCE) return { ok: false, reason: 'insufficient_force' };

  // Fusionne avec une attaque en cours sur le même target.
  const targetOwner = target.owner ?? null;
  for (const w of state.waves.values()) {
    if (w.owner === playerId && w.targetOwner === targetOwner) {
      w.troops += troops;
      p.army -= troops;
      return { ok: true, reason: 'ok' };
    }
  }

  // Amorce la file avec toutes les cellules-frontières du joueur.
  const queue = new MinHeap<number>();
  const queued = new Set<number>();
  seedFrontier(state, playerId, target, queue, queued);
  if (queue.size === 0) return { ok: false, reason: 'no_frontier' };

  p.army -= troops;

  const id = nextId(state, 'w');
  state.waves.set(id, {
    id,
    owner: playerId,
    targetOwner,
    troops,
    startTick: state.tick,
    toConquer: queue,
    queued,
  });
  return { ok: true, reason: 'ok' };
}

export function setAttackRatio(state: LocalGameState, playerId: string, ratio: number) {
  const p = state.players.get(playerId);
  if (!p) return;
  p.attackRatio = Math.min(MAX_ATTACK_RATIO, Math.max(MIN_ATTACK_RATIO, ratio));
}

/**
 * Initialise la file `toConquer` avec toutes les cellules attaquables qui
 * touchent un territoire de l'attaquant, et qui appartiennent au target
 * (ou sont neutres si la cible est neutre).
 */
function seedFrontier(
  state: LocalGameState,
  playerId: string,
  target: LocalTerritory,
  queue: MinHeap<number>,
  queued: Set<number>,
) {
  const targetOwner = target.owner ?? null;
  const myTiles = state.playerTiles.get(playerId);
  if (!myTiles) return;
  for (const ownedId of myTiles) {
    const owned = state.territoryById.get(ownedId);
    if (!owned) continue;
    if (owned.terrain === TerrainType.Ocean) continue;
    for (const nid of owned.neighbors) {
      if (queued.has(nid)) continue;
      const n = state.territoryById.get(nid);
      if (!n) continue;
      if (n.terrain === TerrainType.Ocean) continue;
      // Les cratères ne sont plus exclus — on peut les annexer normalement.
      const nOwner = n.owner ?? null;
      if (nOwner === playerId) continue;
      if (nOwner !== targetOwner) continue;
      if (nOwner && areAllied(state, nOwner, playerId)) continue;
      queue.push(nid, computePriority(state, nid, playerId, state.tick));
      queued.add(nid);
    }
  }
}

/**
 * Priorité de conquête (FrontWars-like) : petit nombre = pris en premier.
 * - Bonus si la tuile est déjà entourée par l'attaquant (enclaves).
 * - Malus si la tuile est une montagne (magnitude plus grande).
 * - tickNow → file FIFO entre lots successifs.
 */
export function computePriority(
  state: LocalGameState,
  tileId: number,
  attackerId: string,
  tickNow: number,
): number {
  const t = state.territoryById.get(tileId);
  if (!t) return 1e9;
  let ownedByAttacker = 0;
  for (const nid of t.neighbors) {
    const n = state.territoryById.get(nid);
    if (n && n.owner === attackerId) ownedByAttacker++;
  }
  const mag = terrainMagnitude(t);
  // (rand+10) * (1 - own*0.5 + mag/2) + tick — directement transposé de FrontWars.
  const rand = Math.floor(Math.random() * 8);
  return (rand + 10) * (1 - ownedByAttacker * 0.5 + mag / 2) + tickNow;
}

export function terrainMagnitude(t: LocalTerritory): number {
  if (t.terrain === TerrainType.Mountain) return 2;
  // Côte = plaine pour le coût ; on garde "1" pour les terres normales.
  return 1;
}

/** Conservé pour la compat — utilisé par naval/bot pour valider une source d'attaque. */
export function findBorderSource(
  state: LocalGameState,
  playerId: string,
  target: LocalTerritory,
): LocalTerritory | null {
  for (const nid of target.neighbors) {
    const n = state.territoryById.get(nid);
    if (n && n.owner === playerId && n.terrain !== TerrainType.Ocean) return n;
  }
  return null;
}
