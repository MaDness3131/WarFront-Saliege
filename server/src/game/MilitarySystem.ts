/**
 * MilitarySystem — validation des ordres militaires.
 * --------------------------------------------------
 * Reçoit les ordres d'attaque (déjà désérialisés), les VALIDE côté serveur,
 * puis fait naître une vague (`ArmySchema`) depuis le territoire frontalier
 * possédé le plus proche de la cible. La résolution du combat à l'arrivée
 * est déléguée au `TerritoryManager`.
 *
 * Anti-cheat : le client ne fait que demander « j'attaque le territoire X ».
 * Tout le reste (adjacence, coût, force engagée) est décidé ici.
 */

import { WorldState, ArmySchema, PlayerSchema, TerritorySchema } from './schema';
import { TerrainType } from '../../../shared/types';
import { MIN_ATTACK_FORCE, MIN_ATTACK_RATIO, MAX_ATTACK_RATIO } from '../../../shared/constants';

export type AttackReason =
  | 'ok'
  | 'no_player'
  | 'bad_target'
  | 'not_adjacent'
  | 'is_ocean'
  | 'insufficient_force';

export interface AttackResult {
  ok: boolean;
  reason: AttackReason;
}

let armyCounter = 0;

export class MilitarySystem {
  constructor(private state: WorldState) {}

  /**
   * Valide et lance un ordre d'attaque.
   * Règle d'adjacence : la cible doit toucher au moins un territoire possédé
   * par le joueur. La vague part de ce territoire frontalier.
   */
  requestAttack(playerId: string, targetId: number): AttackResult {
    const p = this.state.players.get(playerId);
    if (!p || !p.alive) return { ok: false, reason: 'no_player' };

    const target = this.state.territoryById.get(targetId);
    if (!target) return { ok: false, reason: 'bad_target' };
    if (target.terrain === TerrainType.Ocean) return { ok: false, reason: 'is_ocean' };

    // Cherche un territoire possédé adjacent à la cible (point de départ).
    const source = this.findBorderSource(p.id, target);
    if (!source) return { ok: false, reason: 'not_adjacent' };

    // Force engagée = ratio configuré par le joueur appliqué à sa réserve.
    const ratio = Math.min(MAX_ATTACK_RATIO, Math.max(MIN_ATTACK_RATIO, p.attackRatio));
    const force = p.army * ratio;
    if (force < MIN_ATTACK_FORCE) return { ok: false, reason: 'insufficient_force' };

    // Débit immédiat : une attaque coûte des troupes, qu'elle réussisse ou non.
    p.army -= force;

    const wave = new ArmySchema();
    wave.id = `a${armyCounter++}`;
    wave.owner = p.id;
    wave.from = source.id;
    wave.to = target.id;
    wave.amount = force;
    wave.progress = 0;
    wave.reinforcement = target.owner === p.id;
    this.state.armies.set(wave.id, wave);

    return { ok: true, reason: 'ok' };
  }

  /** Production d'armée passive : déléguée à PopulationSystem (pop → armée). */

  /** Premier territoire possédé par `playerId` adjacent à `target`. */
  private findBorderSource(playerId: string, target: TerritorySchema): TerritorySchema | null {
    for (const nid of target.neighbors) {
      const n = this.state.territoryById.get(nid);
      if (n && n.owner === playerId && n.terrain !== TerrainType.Ocean) {
        return n;
      }
    }
    return null;
  }

  /** Règle le ratio d'attaque d'un joueur (validé serveur). */
  setAttackRatio(player: PlayerSchema, ratio: number) {
    player.attackRatio = Math.min(MAX_ATTACK_RATIO, Math.max(MIN_ATTACK_RATIO, ratio));
  }
}
