/**
 * WorldGen — carte du monde fixe (NON-procédurale).
 * --------------------------------------------------
 * La carte gameplay est dérivée du binaire `client/public/maps/world.bin`,
 * lui-même généré par `map-generator/build-map.py` à partir de l'image
 * pixel-art `client/public/maps/world-pixel.webp`. Pipeline identique à
 * OpenFront / Territorial.io :
 *
 *   PNG → classification couleur → filtrage îles+lacs → BFS dist-à-la-côte
 *       → bit-packing (3 bits biome + 5 bits magnitude) → world.bin
 *
 * Les frontières gameplay (côtes, océan, biomes) suivent donc exactement
 * le tracé visuel de l'image — pas de désalignement entre ce qu'on voit
 * et ce qu'on joue. La détection Coast (terre adjacente à l'eau) est
 * pré-calculée côté Python, plus de 2ᵉ passe runtime.
 *
 * Le résultat est strictement déterministe, identique à chaque partie.
 */

import { TerrainType } from '@shared/types';
import { NEUTRAL_TERRITORY_TROOPS } from '@shared/constants';
import { LocalTerritory } from './state';
import { BinaryAtlas, loadBinaryAtlas } from './binary-atlas';

export interface GeneratedWorld {
  territories: LocalTerritory[];
  byId: Map<number, LocalTerritory>;
  landIds: number[];
}

/**
 * Échantillonne le binaire atlas à la résolution `width × height` du gameplay.
 * Sans interpolation — on lit l'octet le plus proche. Strictement déterministe.
 *
 * Le voisinage 4-connexe est calculé dans une 2ᵉ passe (utilisé par la
 * simulation pour BFS de vagues, propagation, etc.).
 *
 * Le biome Coast est déjà encodé dans l'atlas (pré-calculé au build via
 * BFS distance-à-l'eau), donc inutile de le re-détecter ici.
 */
export function generateLocalWorld(
  atlas: BinaryAtlas,
  width: number,
  height: number,
  _seed?: number,
): GeneratedWorld {
  const territories: LocalTerritory[] = new Array(width * height);
  const byId = new Map<number, LocalTerritory>();
  const landIds: number[] = [];

  const aw = atlas.width;
  const ah = atlas.height;

  for (let y = 0; y < height; y++) {
    const sy = Math.min(ah - 1, Math.floor((y + 0.5) * ah / height));
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const sx = Math.min(aw - 1, Math.floor((x + 0.5) * aw / width));
      const biome = atlas.getBiome(sx, sy);
      const terrain = atlas.toTerrain(biome);

      const t: LocalTerritory = {
        id: idx,
        x, y,
        terrain,
        owner: null,
        troops: terrain === TerrainType.Ocean ? 0 : NEUTRAL_TERRITORY_TROOPS,
        building: 0,
        buildingLevel: 0,
        buildProgress: 0,
        capturedAt: 0,
        neighbors: [],
        scorchedUntil: 0,
      };
      territories[idx] = t;
      byId.set(idx, t);
      if (terrain !== TerrainType.Ocean) landIds.push(idx);
    }
  }

  // 2e passe : voisinage 4-connexité uniquement (la détection Coast est
  // déjà encodée dans le binaire au build-time via BFS dist-eau ≤ 1).
  // On garde toutefois un fallback si une tuile Land se retrouve isolée
  // adjacente à de l'eau après upsampling (rare, peut arriver aux frontières).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const t = territories[idx];
      let touchesOcean = false;
      if (x > 0)          { t.neighbors.push(idx - 1);     if (territories[idx - 1].terrain === TerrainType.Ocean) touchesOcean = true; }
      if (x < width - 1)  { t.neighbors.push(idx + 1);     if (territories[idx + 1].terrain === TerrainType.Ocean) touchesOcean = true; }
      if (y > 0)          { t.neighbors.push(idx - width); if (territories[idx - width].terrain === TerrainType.Ocean) touchesOcean = true; }
      if (y < height - 1) { t.neighbors.push(idx + width); if (territories[idx + width].terrain === TerrainType.Ocean) touchesOcean = true; }
      // Fallback : tuile terre adjacente à l'océan après upsampling.
      if (touchesOcean && (
        t.terrain === TerrainType.Land ||
        t.terrain === TerrainType.Desert ||
        t.terrain === TerrainType.Snow ||
        t.terrain === TerrainType.Forest
      )) {
        t.terrain = TerrainType.Coast;
      }
    }
  }

  return { territories, byId, landIds };
}

// ─── Re-export pour les call sites (LocalSimulation, etc.) ───────────────
export { loadBinaryAtlas };
