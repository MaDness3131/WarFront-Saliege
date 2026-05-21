/**
 * Components — flood-fill par joueur pour identifier les régions connexes.
 * ----------------------------------------------------------------------
 * Une "région" = un ensemble maximal de tuiles connexes (4-connexité)
 * appartenant au même joueur. Un empire éclaté (Europe + Asie séparées
 * par océan) a 2 régions, chacune avec son nom et sa garnison estimée.
 *
 * Coût : O(N) où N = somme des tuiles de tous les joueurs. Throttler à
 * une fois toutes les 5-10 secondes (recompute total chaque fois).
 */

import { LocalGameState } from '../state';
import { territoryName } from './TerritoryName';

export interface TerritoryRegion {
  owner: string;
  /** Identifiant déterministe basé sur la plus petite tuile de la région. */
  rootTileId: number;
  name: string;
  size: number;
  /** Centroïde (en coordonnées de grille). */
  cx: number;
  cy: number;
}

const MIN_REGION_SIZE = 6; // ignore les micro-îlots (< 6 tuiles)

export function computeRegions(state: LocalGameState): TerritoryRegion[] {
  const out: TerritoryRegion[] = [];
  const visited = new Set<number>();

  for (const [owner, tiles] of state.playerTiles) {
    for (const startId of tiles) {
      if (visited.has(startId)) continue;

      // BFS sur les tuiles connexes du même propriétaire.
      const queue: number[] = [startId];
      visited.add(startId);
      let sx = 0, sy = 0, size = 0;
      let rootId = startId;

      while (queue.length > 0) {
        const id = queue.pop()!;
        const t = state.territoryById.get(id);
        if (!t) continue;
        size++;
        sx += t.x; sy += t.y;
        if (id < rootId) rootId = id;
        for (const nid of t.neighbors) {
          if (visited.has(nid)) continue;
          const n = state.territoryById.get(nid);
          if (!n || n.owner !== owner) continue;
          visited.add(nid);
          queue.push(nid);
        }
      }

      if (size >= MIN_REGION_SIZE) {
        out.push({
          owner,
          rootTileId: rootId,
          name: territoryName(rootId),
          size,
          cx: sx / size,
          cy: sy / size,
        });
      }
    }
  }
  return out;
}
