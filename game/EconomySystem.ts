/**
 * EconomySystem — revenus, entretien, anti-snowball.
 * --------------------------------------------------
 * À chaque tick : revenu = (territoires + bâtiments) * amortissement anti-
 * snowball, moins l'entretien de l'armée. Le client n'effectue jamais ce
 * calcul ; il lit seulement `player.gold` et `player.income`.
 */

import { WorldState, PlayerSchema } from './schema';
import { BuildingType, GameMode } from '@shared/types';
import {
  GOLD_PER_TERRITORY,
  GOLD_PER_CITY_LEVEL,
  GOLD_PER_FACTORY_LEVEL,
  ARMY_UPKEEP_PER_UNIT,
  SNOWBALL_DAMPING,
  MODE_MODIFIERS,
} from '@shared/constants';

export class EconomySystem {
  constructor(private state: WorldState) {}

  /** Recalcule le revenu de chaque joueur et applique le gain de ce tick. */
  tick() {
    const mod = MODE_MODIFIERS[this.state.mode as GameMode].economyMultiplier;

    // Agrégation des bonus de bâtiments par propriétaire en une passe O(N).
    const cityLevels = new Map<string, number>();
    const factoryLevels = new Map<string, number>();
    for (const t of this.state.territories) {
      if (!t.owner || t.buildingLevel <= 0) continue;
      if (t.building === BuildingType.City) {
        cityLevels.set(t.owner, (cityLevels.get(t.owner) ?? 0) + t.buildingLevel);
      } else if (t.building === BuildingType.Factory) {
        factoryLevels.set(t.owner, (factoryLevels.get(t.owner) ?? 0) + t.buildingLevel);
      }
    }

    for (const p of this.state.players.values()) {
      if (!p.alive) {
        p.income = 0;
        continue;
      }
      const territorial = p.territoryCount * GOLD_PER_TERRITORY;
      const cityBonus = (cityLevels.get(p.id) ?? 0) * GOLD_PER_CITY_LEVEL;
      const factoryBonus = (factoryLevels.get(p.id) ?? 0) * GOLD_PER_FACTORY_LEVEL;

      const gross = (territorial + cityBonus + factoryBonus) * mod;
      // Amortissement anti-snowball : plus l'empire est grand, moins chaque
      // territoire rapporte. Empêche la partie de se figer trop tôt.
      const damped = gross * SNOWBALL_DAMPING(p.territoryCount);
      const upkeep = p.army * ARMY_UPKEEP_PER_UNIT;

      const net = damped - upkeep;
      p.income = net; // valeur /tick ; le HUD la convertit en /seconde
      p.gold = Math.max(0, p.gold + net);
    }
  }

  /** Tente une dépense atomique. Retourne false si fonds insuffisants. */
  static trySpend(player: PlayerSchema, amount: number): boolean {
    if (player.gold < amount) return false;
    player.gold -= amount;
    return true;
  }
}
