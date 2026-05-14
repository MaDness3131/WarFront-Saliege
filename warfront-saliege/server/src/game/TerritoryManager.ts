/**
 * TerritoryManager — autorité sur les territoires.
 * ------------------------------------------------
 * Responsabilités :
 *  - résolution des combats à l'arrivée d'une vague (capture / échec) ;
 *  - calcul de la défense effective d'un territoire ;
 *  - progression et achèvement des constructions ;
 *  - maintien des compteurs `territoryCount` par joueur.
 *
 * Règle de capture : capture si force_attaque > défense_effective.
 */

import { WorldState, TerritorySchema, ArmySchema, PlayerSchema } from './schema';
import { TerrainType, BuildingType } from '../../../shared/types';
import {
  DEFENSE_TERRAIN_BONUS,
  DEFENSE_POST_BONUS_PER_LEVEL,
  GARRISON_AFTER_CAPTURE,
  BUILDINGS,
} from '../../../shared/constants';

export type CaptureCallback = (
  territory: TerritorySchema,
  by: string,
  from: number | null,
) => void;

export class TerritoryManager {
  constructor(
    private state: WorldState,
    private onCapture: CaptureCallback,
  ) {}

  /** Défense effective = garnison * bonus terrain * bonus poste de défense. */
  effectiveDefense(t: TerritorySchema): number {
    let terrainBonus = DEFENSE_TERRAIN_BONUS.land;
    if (t.terrain === TerrainType.Mountain) terrainBonus = DEFENSE_TERRAIN_BONUS.mountain;
    else if (t.terrain === TerrainType.Coast) terrainBonus = DEFENSE_TERRAIN_BONUS.coast;
    else if (t.terrain === TerrainType.Ocean) terrainBonus = DEFENSE_TERRAIN_BONUS.ocean;

    let buildingBonus = 1;
    if (t.building === BuildingType.DefensePost) {
      buildingBonus = 1 + DEFENSE_POST_BONUS_PER_LEVEL * t.buildingLevel;
    }
    return t.troops * terrainBonus * buildingBonus;
  }

  /**
   * Résout l'arrivée d'une vague sur son territoire cible.
   * Retourne true si la vague doit être supprimée (toujours, ici).
   */
  resolveArrival(army: ArmySchema): boolean {
    const target = this.state.territoryById.get(army.to);
    if (!target || target.terrain === TerrainType.Ocean) return true;

    const attacker = this.state.players.get(army.owner);
    if (!attacker || !attacker.alive) return true;

    // Renfort vers un territoire encore allié.
    if (target.owner === army.owner) {
      target.troops += army.amount;
      return true;
    }

    // Renfort dont la cible a changé de main entre-temps : devient une attaque.
    const defense = this.effectiveDefense(target);

    if (army.amount > defense) {
      // Capture réussie.
      const previousOwner = target.owner;
      this.adjustTerritoryCount(previousOwner, -1);

      target.owner = army.owner;
      target.troops = Math.max(1, army.amount - defense) * GARRISON_AFTER_CAPTURE + 1;
      target.capturedAt = Date.now();

      this.adjustTerritoryCount(army.owner, +1);
      this.onCapture(target, army.owner, army.from);

      // Un territoire capturé conserve éventuellement son bâtiment mais pas
      // sa progression de construction en cours.
      if (target.buildProgress > 0 && target.buildProgress < 100) {
        target.buildProgress = 0;
      }
    } else {
      // Attaque repoussée : la garnison est entamée.
      target.troops = Math.max(0, target.troops - army.amount / Math.max(0.01, defense / Math.max(1, target.troops)));
    }
    return true;
  }

  private adjustTerritoryCount(playerId: string | null, delta: number) {
    if (!playerId) return;
    const p = this.state.players.get(playerId);
    if (!p) return;
    p.territoryCount = Math.max(0, p.territoryCount + delta);
  }

  /** Avance les constructions en cours d'un tick. */
  tickConstruction() {
    for (const t of this.state.territories) {
      if (t.buildProgress <= 0 || t.buildProgress >= 100) continue;
      const spec = BUILDINGS[t.building as Exclude<BuildingType, BuildingType.None>];
      if (!spec) {
        t.buildProgress = 0;
        continue;
      }
      const step = 100 / spec.buildTicks;
      t.buildProgress = Math.min(100, t.buildProgress + step);
      if (t.buildProgress >= 100) {
        t.buildingLevel += 1;
        t.buildProgress = 0;
      }
    }
  }

  /** Recompte les territoires possédés (appelé au démarrage / resync). */
  recountTerritories() {
    for (const p of this.state.players.values()) p.territoryCount = 0;
    for (const t of this.state.territories) {
      if (t.owner) {
        const p = this.state.players.get(t.owner);
        if (p) p.territoryCount += 1;
      }
    }
  }

  /** Un joueur sans territoire est éliminé. */
  checkElimination(player: PlayerSchema): boolean {
    if (player.alive && player.territoryCount === 0 && this.state.tick > 50) {
      player.alive = false;
      player.army = 0;
      return true;
    }
    return false;
  }
}
