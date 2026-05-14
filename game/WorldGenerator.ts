/**
 * WorldGenerator — génération procédurale de la carte.
 * ----------------------------------------------------
 * Produit une grille de territoires (océans / terres / côtes / montagnes)
 * à partir d'un bruit de valeur déterministe (seed). Le voisinage est en
 * 4-connexité ; les côtes sont les terres adjacentes à au moins un océan.
 *
 * Pourquoi une grille et pas une vraie carte du monde : pour le MVP, une
 * grille procédurale donne un gameplay testable immédiatement. Le rendu
 * "carte du monde pixelisée" se branche en remplaçant ce générateur par un
 * import de heightmap, sans toucher au reste du serveur.
 */

import { ArraySchema } from '@colyseus/schema';
import { TerritorySchema } from './schema';
import { TerrainType } from '@shared/types';
import {
  OCEAN_THRESHOLD,
  MOUNTAIN_THRESHOLD,
  NEUTRAL_TERRITORY_TROOPS,
} from '@shared/constants';

/** PRNG déterministe (mulberry32) pour des cartes reproductibles. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit de valeur lissé : moyenne d'une grille aléatoire basse résolution. */
function valueNoise(w: number, h: number, rng: () => number, octaveScale = 8): number[] {
  const gw = Math.ceil(w / octaveScale) + 2;
  const gh = Math.ceil(h / octaveScale) + 2;
  const grid: number[] = [];
  for (let i = 0; i < gw * gh; i++) grid.push(rng());

  const out: number[] = new Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x / octaveScale;
      const gy = y / octaveScale;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      // interpolation bilinéaire + smoothstep
      const s = (t: number) => t * t * (3 - 2 * t);
      const a = grid[y0 * gw + x0];
      const b = grid[y0 * gw + x0 + 1];
      const c = grid[(y0 + 1) * gw + x0];
      const d = grid[(y0 + 1) * gw + x0 + 1];
      const top = a + (b - a) * s(fx);
      const bot = c + (d - c) * s(fx);
      out[y * w + x] = top + (bot - top) * s(fy);
    }
  }
  return out;
}

export interface GeneratedWorld {
  territories: ArraySchema<TerritorySchema>;
  byId: Map<number, TerritorySchema>;
  landIds: number[];
}

export function generateWorld(
  width: number,
  height: number,
  seed = Date.now() & 0xffffffff,
): GeneratedWorld {
  const rng = mulberry32(seed);
  // Combinaison de deux octaves pour des continents plus naturels.
  const base = valueNoise(width, height, rng, 14);
  const detail = valueNoise(width, height, rng, 5);

  const territories = new ArraySchema<TerritorySchema>();
  const byId = new Map<number, TerritorySchema>();
  const landIds: number[] = [];

  // 1ère passe : terrain de base (océan / terre / montagne).
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const n = base[idx] * 0.65 + detail[idx] * 0.35;
      // Atténuation vers les bords ⇒ la carte est entourée d'océan.
      const edge =
        Math.min(x, width - 1 - x, y, height - 1 - y) /
        Math.min(width, height);
      const elevation = n * Math.min(1, edge * 3.5);

      const t = new TerritorySchema();
      t.id = idx;
      t.x = x;
      t.y = y;
      t.troops = 0;
      t.owner = null;

      if (elevation < OCEAN_THRESHOLD) {
        t.terrain = TerrainType.Ocean;
      } else if (elevation > MOUNTAIN_THRESHOLD) {
        t.terrain = TerrainType.Mountain;
        t.troops = NEUTRAL_TERRITORY_TROOPS;
        landIds.push(idx);
      } else {
        t.terrain = TerrainType.Land;
        t.troops = NEUTRAL_TERRITORY_TROOPS;
        landIds.push(idx);
      }

      territories.push(t);
      byId.set(idx, t);
    }
  }

  // 2e passe : voisinage 4-connexité + détection des côtes.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = byId.get(y * width + x)!;
      const candidates = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ];
      let touchesOcean = false;
      for (const [nx, ny] of candidates) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const nid = ny * width + nx;
        t.neighbors.push(nid);
        if (byId.get(nid)!.terrain === TerrainType.Ocean) touchesOcean = true;
      }
      if (t.terrain === TerrainType.Land && touchesOcean) {
        t.terrain = TerrainType.Coast;
      }
    }
  }

  return { territories, byId, landIds };
}
