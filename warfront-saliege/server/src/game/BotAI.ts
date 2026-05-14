/**
 * BotAI — adversaires serveur légers (MVP).
 * -----------------------------------------
 * Comportement minimal mais suffisant pour rendre une partie solo vivante :
 * à intervalle régulier, chaque bot regarde la frontière de son empire et
 * attaque la case accessible la plus faible. S'il est riche, il investit
 * parfois dans une ville. L'agressivité varie d'un bot à l'autre.
 *
 * Les bots passent par EXACTEMENT les mêmes points d'entrée serveur que les
 * joueurs humains (`MilitarySystem.requestAttack`) : aucun privilège.
 *
 * Phase 2 : posture défensive, alliances simulées, débarquements navals.
 */

import { WorldState } from './schema';
import { MilitarySystem } from './MilitarySystem';
import { TerritoryManager } from './TerritoryManager';
import { TerrainType, BuildingType } from '../../../shared/types';
import { BUILDINGS, TICK_RATE } from '../../../shared/constants';

interface BotMemory {
  cooldownTicks: number;
  aggression: number; // 0..1
}

export class BotAI {
  private memory = new Map<string, BotMemory>();

  constructor(
    private state: WorldState,
    private military: MilitarySystem,
    private territory: TerritoryManager,
    private requestBuild: (playerId: string, targetId: number, b: BuildingType) => void,
  ) {}

  tick() {
    for (const p of this.state.players.values()) {
      if (!p.isBot || !p.alive) continue;

      let mem = this.memory.get(p.id);
      if (!mem) {
        mem = { cooldownTicks: 0, aggression: 0.35 + Math.random() * 0.55 };
        this.memory.set(p.id, mem);
      }

      if (mem.cooldownTicks > 0) {
        mem.cooldownTicks--;
        continue;
      }
      // Un bot agressif réfléchit ~0.6 s, un bot passif ~2.4 s.
      mem.cooldownTicks = Math.round(TICK_RATE * (2.4 - mem.aggression * 1.8));

      // Investit parfois dans une ville s'il est à l'aise financièrement.
      const cityCost = BUILDINGS[BuildingType.City].baseCost;
      if (p.gold > cityCost * 1.4 && Math.random() < 0.3) {
        const buildable = this.findBuildable(p.id);
        if (buildable !== null) {
          this.requestBuild(p.id, buildable, BuildingType.City);
          return;
        }
      }

      // Sinon : attaque la case frontalière la plus faible.
      const target = this.pickWeakestFrontier(p.id);
      if (target !== null) this.military.requestAttack(p.id, target);
    }
  }

  /** Territoire possédé sans bâtiment, candidat à une construction. */
  private findBuildable(playerId: string): number | null {
    for (const t of this.state.territories) {
      if (t.owner === playerId && t.building === BuildingType.None) return t.id;
    }
    return null;
  }

  /** Case ennemie/neutre adjacente à l'empire avec la défense la plus basse. */
  private pickWeakestFrontier(playerId: string): number | null {
    let best: number | null = null;
    let bestDef = Infinity;
    const seen = new Set<number>();

    for (const t of this.state.territories) {
      if (t.owner !== playerId) continue;
      for (const nid of t.neighbors) {
        if (seen.has(nid)) continue;
        seen.add(nid);
        const n = this.state.territoryById.get(nid);
        if (!n || n.terrain === TerrainType.Ocean || n.owner === playerId) continue;
        const def = this.territory.effectiveDefense(n);
        if (def < bestDef) {
          bestDef = def;
          best = nid;
        }
      }
    }
    return best;
  }
}
