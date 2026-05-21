/**
 * binary-atlas.ts — Loader runtime du binaire généré par `map-generator/`.
 * ------------------------------------------------------------------------
 * Pipeline emprunté à OpenFront / Territorial.io : on évite les très gros
 * fichiers source TS (l'ancien ASCII atlas faisait ~190 KB) en chargeant un
 * fichier .bin compact via fetch(). Bit-packing 1 octet par tuile :
 *
 *   Bits 5-7 : biome (3 bits, 0..7)
 *     0 = Ocean       4 = Forest
 *     1 = OceanShore  5 = Desert
 *     2 = Coast       6 = Snow
 *     3 = Plains      7 = Mountain (réservé)
 *   Bits 0-4 : magnitude (5 bits, 0..31)
 *     Land : distance à la côte (0 = bord, ↗ vers l'intérieur)
 *     Water : distance à la terre (0 = touche côte, ↗ vers abysse)
 *
 * Côté gameplay on n'a besoin que du biome → mapping vers TerrainType. La
 * magnitude est conservée pour usages visuels futurs (shading altitude,
 * profondeur océan procédurale, etc.).
 */

import { TerrainType } from '@shared/types';

/** Constantes biome (doivent rester alignées avec build-map.py). */
export const BIOME = {
  Ocean:      0,
  OceanShore: 1,
  Coast:      2,
  Plains:     3,
  Forest:     4,
  Desert:     5,
  Snow:       6,
  Mountain:   7,
} as const;
export type Biome = typeof BIOME[keyof typeof BIOME];

/** Mapping biome binaire → TerrainType côté simulation. */
const BIOME_TO_TERRAIN: TerrainType[] = [
  TerrainType.Ocean,    // 0 Ocean
  TerrainType.Ocean,    // 1 OceanShore (toujours Ocean pour le gameplay)
  TerrainType.Coast,    // 2 Coast
  TerrainType.Land,     // 3 Plains
  TerrainType.Forest,   // 4 Forest
  TerrainType.Desert,   // 5 Desert
  TerrainType.Snow,     // 6 Snow
  TerrainType.Mountain, // 7 Mountain
];

export interface AtlasManifest {
  version: number;
  source: string;
  width: number;
  height: number;
  land_tiles: number;
  coast_tiles: number;
  shore_tiles: number;
  lod: {
    full: { file: string; width: number; height: number; bytes: number };
    '4x': { file: string; width: number; height: number; bytes: number };
    '16x': { file: string; width: number; height: number; bytes: number };
  };
}

export interface BinaryAtlas {
  /** Largeur en cellules. */
  readonly width: number;
  /** Hauteur en cellules. */
  readonly height: number;
  /** Buffer brut : 1 octet par tuile, row-major. */
  readonly data: Uint8Array;
  /** Manifest associé (stats, dimensions, etc.). */
  readonly manifest: AtlasManifest;
  /** Lecture biome+magnitude d'une cellule (x, y). */
  getCell(x: number, y: number): { biome: Biome; magnitude: number };
  /** Lecture biome seul (plus rapide quand on n'a pas besoin de l'altitude). */
  getBiome(x: number, y: number): Biome;
  /** Convertit un biome en TerrainType côté simulation. */
  toTerrain(biome: Biome): TerrainType;
}

// ─── Cache module-level : 1 seul fetch par session ──────────────────────
let _atlasPromise: Promise<BinaryAtlas> | null = null;

/** URL des fichiers binaires (servis statiquement par Vite). */
const MANIFEST_URL = '/maps/world-manifest.json';
const BIN_URL      = '/maps/world.bin';

/** Lit le manifest + le binaire full-res, parse et expose l'API d'atlas.
 *  Idempotent : appels multiples renvoient la même promise. */
export function loadBinaryAtlas(): Promise<BinaryAtlas> {
  if (_atlasPromise) return _atlasPromise;

  _atlasPromise = (async () => {
    const [manifestRes, binRes] = await Promise.all([
      fetch(MANIFEST_URL),
      fetch(BIN_URL),
    ]);
    if (!manifestRes.ok) throw new Error(`Atlas manifest fetch failed: ${manifestRes.status}`);
    if (!binRes.ok)      throw new Error(`Atlas binary fetch failed: ${binRes.status}`);

    const manifest = (await manifestRes.json()) as AtlasManifest;
    const buf = await binRes.arrayBuffer();
    const data = new Uint8Array(buf);

    const expected = manifest.width * manifest.height;
    if (data.length !== expected) {
      throw new Error(`Atlas binary size mismatch: ${data.length} vs ${expected} (${manifest.width}×${manifest.height})`);
    }

    const width  = manifest.width;
    const height = manifest.height;

    const atlas: BinaryAtlas = {
      width,
      height,
      data,
      manifest,
      getCell(x, y) {
        const b = data[y * width + x];
        return { biome: ((b >>> 5) & 0x07) as Biome, magnitude: b & 0x1F };
      },
      getBiome(x, y) {
        return ((data[y * width + x] >>> 5) & 0x07) as Biome;
      },
      toTerrain(biome) {
        return BIOME_TO_TERRAIN[biome];
      },
    };
    return atlas;
  })();

  return _atlasPromise;
}

/** Reset le cache — utile pour les tests / l'éditeur live. */
export function _resetAtlasCache() { _atlasPromise = null; }
