/**
 * PopulationSystem — croissance de la population.
 * -----------------------------------------------
 * La population suit une croissance logistique vers une capacité d'accueil
 * dérivée du nombre de territoires et de villes. Une fraction de la
 * croissance est convertie en armée mobilisable : perdre du territoire
 * étrangle la machine de guerre, mais avec un délai (pas instantanément).
 */

import { WorldState } from './schema';
import { BuildingType, GameMode } from '../../../shared/types';
import {
  POP_GROWTH_RATE,
  POP_CAP_BASE,
  POP_CAP_PER_TERRITORY,
  POP_CAP_PER_CITY_LEVEL,
  POP_TO_ARMY_RATIO,
  MODE_MODIFIERS,
} from '../../../shared/constants';

export class PopulationSystem {
  constructor(private state: WorldState) {}

  tick() {
    const mod = MODE_MODIFIERS[this.state.mode as GameMode].populationMultiplier;

    // Niveaux de ville cumulés par joueur (augmentent la capacité d'accueil).
    const cityLevels = new Map<string, number>();
    for (const t of this.state.territories) {
      if (t.owner && t.building === BuildingType.City && t.buildingLevel > 0) {
        cityLevels.set(t.owner, (cityLevels.get(t.owner) ?? 0) + t.buildingLevel);
      }
    }

    for (const p of this.state.players.values()) {
      if (!p.alive) {
        p.population = 0;
        p.populationCap = 0;
        continue;
      }
      p.populationCap =
        POP_CAP_BASE +
        p.territoryCount * POP_CAP_PER_TERRITORY +
        (cityLevels.get(p.id) ?? 0) * POP_CAP_PER_CITY_LEVEL;

      const cap = Math.max(1, p.populationCap);
      // Courbe logistique : rapide au milieu, plafonne près de la capacité.
      const growth = POP_GROWTH_RATE * p.population * (1 - p.population / cap) * mod;
      const newPop = Math.max(0, Math.min(cap, p.population + growth));

      // La part positive de la croissance alimente l'armée.
      const delta = newPop - p.population;
      if (delta > 0) p.army += delta * POP_TO_ARMY_RATIO;

      p.population = newPop;
    }
  }
}
