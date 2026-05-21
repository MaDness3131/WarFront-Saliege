/**
 * WorldMap — rendu de la carte en deux couches superposées.
 * ----------------------------------------------------------
 * 1. GEO BACKDROP (statique, rendue une fois à `init()`)
 *    Canvas supersamplé (GEO_SCALE = CELL_SIZE px par tuile, soit 1:1 écran
 *    au zoom 1). Pipeline emprunté à `_design/map-render.js` :
 *      - warp fbm des coords d'échantillonnage (amplitude 0.35 cellule) →
 *        frontières organiques, fini les bords droits ;
 *      - blend bilinéaire des 4 biomes voisins post-warp → biomes qui se
 *        fondent les uns dans les autres ;
 *      - champ d'altitude fbm (4 octaves) + ombrage lambertien NW →
 *        Himalaya/Andes en relief, plaines doucement modulées ;
 *      - calotte de neige sur les sommets au-delà d'un seuil d'altitude ;
 *      - profondeur d'océan via BFS distance-à-la-terre (côte → talus →
 *        abyssal, 3 paliers) ;
 *      - 5 nuances par biome avec jitter pixelisé par hash 2×2.
 *
 * 2. OWNER OVERLAY (dynamique, 1 px par tuile, alpha modulé)
 *    L'ancienne texture par tuile reste, mais elle est désormais translucide :
 *    on laisse transparaître le décor géographique sous les couleurs des
 *    joueurs. Une tuile non-possédée a un alpha = 0 → on voit le biome pur.
 *    Une tuile possédée a un alpha modéré → la couleur joueur teinte la
 *    géographie sans l'effacer (Sahara reste un Sahara orangé même sous
 *    contrôle rouge).
 *
 * Les bâtiments restent un calque séparé Graphics au-dessus des deux.
 *
 * Mémoire : geo backdrop ≈ 4 × (mapW × CELL_SIZE) × (mapH × CELL_SIZE) octets
 * (≈ 4.1 MB à 480×240 tuiles avec CELL_SIZE=3). Rendu CPU : O(pixels) une
 * seule fois à l'init. L'owner overlay reste O(tuiles dirty) par tick.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { TerrainType, BuildingType } from '@shared/types';
import {
  CELL_SIZE,
  NEUTRAL_COLOR,
} from '@shared/constants';
import { particles } from './fx/ParticleSystem';

interface PaletteEntry { r: number; g: number; b: number; }

function hexToRgb(hex: string): PaletteEntry {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff };
}

function mix(a: PaletteEntry, b: PaletteEntry, t: number): PaletteEntry {
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
}

function darken(c: PaletteEntry, amount: number): PaletteEntry {
  return {
    r: Math.max(0, Math.round(c.r * (1 - amount))),
    g: Math.max(0, Math.round(c.g * (1 - amount))),
    b: Math.max(0, Math.round(c.b * (1 - amount))),
  };
}

function lighten(c: PaletteEntry, amount: number): PaletteEntry {
  return {
    r: Math.min(255, Math.round(c.r + (255 - c.r) * amount)),
    g: Math.min(255, Math.round(c.g + (255 - c.g) * amount)),
    b: Math.min(255, Math.round(c.b + (255 - c.b) * amount)),
  };
}

// OCEAN_COLOR / MOUNTAIN_TINT ne sont plus utilisés directement : la couche
// géo gère les teintes biome et l'eau, l'owner overlay ne tinte que la couleur
// joueur. NEUTRAL sert au fallback ; les cratères ont leur propre palette.
const NEUTRAL = hexToRgb(NEUTRAL_COLOR);

/** Palette de terres brunes pour le rendu des cratères de bombes.
 *  Chaque tuile d'un cratère pioche un tons via un hash déterministe sur
 *  son index → l'aspect granuleux "terre fraîchement retournée" reste
 *  stable entre frames (pas de scintillement). */
const CRATER_BROWNS: PaletteEntry[] = [
  { r: 0x3a, g: 0x24, b: 0x14 }, // brun très foncé (cratère profond)
  { r: 0x4f, g: 0x33, b: 0x1c }, // brun terre humide
  { r: 0x67, g: 0x44, b: 0x26 }, // brun chocolat
  { r: 0x7a, g: 0x52, b: 0x30 }, // brun terre cuite
  { r: 0x8b, g: 0x5e, b: 0x38 }, // brun clair sablonneux
  { r: 0x5c, g: 0x3a, b: 0x1d }, // brun acajou
];

/** Hash entier déterministe (Knuth multiplicative). Donne une valeur
 *  pseudo-aléatoire mais stable pour un index de tuile donné. */
function hashTile(i: number): number {
  return (i * 2654435761) >>> 0;
}

/**
 * Frontière : on mixe la couleur du joueur vers l'or-deep (#5a3a0a) puis on
 * darken → liseré chaud cuivré qui s'accorde avec la DA or/velvet.
 */
const GOLD_DEEP = hexToRgb('#5a3a0a');
function borderShade(c: PaletteEntry): PaletteEntry {
  return darken(mix(c, GOLD_DEEP, 0.35), 0.42);
}

/** Supersampling de la couche géo. CELL_SIZE garantit du 1:1 écran au zoom 1.
 *  L'image source est upscaled en nearest-neighbor pour préserver le pixel-art. */
const GEO_SCALE = CELL_SIZE;

/** URL de l'image pixel-art utilisée comme backdrop visuel (intouchée). */
const WORLD_IMAGE_URL = '/maps/world-pixel.webp';

export class WorldMap {
  readonly container = new Container();

  // ─── Couche géo (image pixel-art, peinte 1× à init) ───────────────────
  private geoCanvas: HTMLCanvasElement;
  private geoCtx: CanvasRenderingContext2D;
  private geoTexture: Texture;
  private geoSprite: Sprite;
  /** Image source — partagée par toutes les parties (chargée 1 fois). */
  private static geoImage: HTMLImageElement | null = null;
  private static geoImageLoading: Promise<HTMLImageElement> | null = null;

  // ─── Couche owner (1 px par tuile, alpha modulé) ──────────────────────
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;
  private texture: Texture;
  private sprite: Sprite;

  private buildingLayer = new Container();
  private buildingByTile = new Map<number, Graphics>();
  /** Tuiles déjà rendues comme construites (pour détecter les transitions). */
  private builtTiles = new Set<number>();
  /** Animations spring d'apparition : tileId → ms du début. */
  private buildingAnims = new Map<number, number>();

  private mapWidth = 0;
  private mapHeight = 0;
  private territories: any[] = [];
  private playerColors = new Map<string, PaletteEntry>();
  private dirty = new Set<number>();
  // Cache des derniers paramètres dessinés (pour décider de redessiner ou non).
  private lastSig: Map<number, string> = new Map();

  constructor() {
    // Couche géo (créée en bas pour être sous l'owner overlay).
    this.geoCanvas = document.createElement('canvas');
    this.geoCanvas.width = 1;
    this.geoCanvas.height = 1;
    this.geoCtx = this.geoCanvas.getContext('2d', { willReadFrequently: false })!;
    this.geoTexture = Texture.from(this.geoCanvas);
    this.geoSprite = new Sprite(this.geoTexture);

    // Couche owner (au-dessus de la géo).
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1;
    this.canvas.height = 1;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.imageData = this.ctx.createImageData(1, 1);
    this.texture = Texture.from(this.canvas);
    this.sprite = new Sprite(this.texture);

    this.container.addChild(this.geoSprite);
    this.container.addChild(this.sprite);
    this.container.addChild(this.buildingLayer);
  }

  init(territories: any[], mapWidth: number, mapHeight: number) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.territories = territories;

    // ─── Couche owner (1 px / tuile, alpha modulé) ──────────────────────
    this.canvas.width = mapWidth;
    this.canvas.height = mapHeight;
    this.imageData = this.ctx.createImageData(mapWidth, mapHeight);
    this.texture.destroy(false);
    this.texture = Texture.from(this.canvas);
    // Filtrage "nearest" pour des bords nets de territoire — c'est l'effet
    // pixel-art crisp de territorial.io / FrontWars.
    this.texture.source.scaleMode = 'nearest';
    this.sprite.texture = this.texture;
    this.sprite.scale.set(CELL_SIZE);
    this.sprite.x = 0;
    this.sprite.y = 0;

    // ─── Couche géo (image pixel-art figée, dessinée 1× à l'init) ───────
    // L'image est l'unique source visuelle — pas de warp, lighting, blend,
    // calotte ou ombrage : on la peint telle quelle, stretched aux dimensions
    // monde, en nearest-neighbor pour préserver le look pixel-art.
    const geoW = mapWidth * GEO_SCALE;
    const geoH = mapHeight * GEO_SCALE;
    this.geoCanvas.width = geoW;
    this.geoCanvas.height = geoH;
    this.geoTexture.destroy(false);
    this.geoTexture = Texture.from(this.geoCanvas);
    this.geoTexture.source.scaleMode = 'nearest';
    this.geoSprite.texture = this.geoTexture;
    this.geoSprite.scale.set(CELL_SIZE / GEO_SCALE);
    this.geoSprite.x = 0;
    this.geoSprite.y = 0;
    this.paintGeoFromImage();

    this.buildingLayer.removeChildren();
    this.buildingByTile.clear();
    this.lastSig.clear();
    this.dirty.clear();

    // Peinture initiale de l'owner overlay (tout transparent au départ).
    for (let i = 0; i < territories.length; i++) {
      this.paintInBuffer(i);
    }
    this.flushBuffer();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Rendu géo : image pixel-art servie telle quelle (zéro post-traitement)
  // ──────────────────────────────────────────────────────────────────────

  /** Peint l'image source dans le geoCanvas, stretched aux dimensions monde.
   *  L'image est cachée statiquement → 1 seul fetch par session, peu importe
   *  combien de parties on lance. Si l'image n'est pas encore chargée, on
   *  remplit d'abord avec un fond ocean neutre puis on repaint au load. */
  private paintGeoFromImage() {
    // Fond temporaire = océan deep (au cas où l'image charge en différé).
    this.geoCtx.fillStyle = '#0a1a2a';
    this.geoCtx.fillRect(0, 0, this.geoCanvas.width, this.geoCanvas.height);
    this.geoTexture.source.update();

    const drawImage = (img: HTMLImageElement) => {
      // imageSmoothingEnabled=false → upscale en nearest (gros pixels nets).
      this.geoCtx.imageSmoothingEnabled = false;
      // @ts-ignore — propriété non-standardisée mais largement supportée
      (this.geoCtx as any).imageSmoothingQuality = 'low';
      this.geoCtx.drawImage(img, 0, 0, this.geoCanvas.width, this.geoCanvas.height);
      this.geoTexture.source.update();
    };

    if (WorldMap.geoImage && WorldMap.geoImage.complete && WorldMap.geoImage.naturalWidth > 0) {
      drawImage(WorldMap.geoImage);
      return;
    }
    // Pas encore chargée : kick le chargement (idempotent), puis paint au ready.
    if (!WorldMap.geoImageLoading) {
      WorldMap.geoImageLoading = new Promise((resolve, reject) => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => { WorldMap.geoImage = img; resolve(img); };
        img.onerror = (err) => reject(err);
        img.src = WORLD_IMAGE_URL;
      });
    }
    WorldMap.geoImageLoading.then(drawImage).catch((err) => {
      // Pas grave — on reste sur le fond océan, le gameplay reste jouable
      // via l'overlay owner.
      console.warn('[WorldMap] image map non chargée :', err);
    });
  }

  setPlayerColors(colors: Map<string, number>) {
    const next = new Map<string, PaletteEntry>();
    colors.forEach((v, k) => next.set(k, {
      r: (v >> 16) & 0xff, g: (v >> 8) & 0xff, b: v & 0xff,
    }));
    // Skip si rien n'a changé (cas usuel : la palette joueurs est figée
    // après le bootstrap, donc inutile de marquer 682k tuiles dirty).
    if (this.playerColors.size === next.size) {
      let identical = true;
      for (const [id, c] of next) {
        const prev = this.playerColors.get(id);
        if (!prev || prev.r !== c.r || prev.g !== c.g || prev.b !== c.b) {
          identical = false; break;
        }
      }
      if (identical) return;
    }
    this.playerColors = next;
    // Couleur joueur réellement changée → on repeindra tout (rare).
    for (let i = 0; i < this.territories.length; i++) this.dirty.add(i);
  }

  /** Version full scan — reste utilisée au bootstrap (1ʳᵉ frame avec
   *  l'état complet). Coûte O(N) en string-concat, à éviter en steady state. */
  sync(territories: any[], currentTick: number) {
    this.territories = territories;
    for (let i = 0; i < territories.length; i++) {
      const t = territories[i];
      const scorchedFlag = (t.scorchedUntil ?? 0) > currentTick ? 1 : 0;
      const buildBucket = Math.floor((t.buildProgress ?? 0) / 5);
      const sig = `${t.owner ?? ''}:${t.building}:${t.buildingLevel}:${scorchedFlag}:${buildBucket}`;
      if (this.lastSig.get(i) !== sig) {
        this.lastSig.set(i, sig);
        this.dirty.add(i);
        const x = t.x; const y = t.y;
        if (x > 0) this.dirty.add(i - 1);
        if (x < this.mapWidth - 1) this.dirty.add(i + 1);
        if (y > 0) this.dirty.add(i - this.mapWidth);
        if (y < this.mapHeight - 1) this.dirty.add(i + this.mapWidth);
      }
    }
    this.flushDirty();
  }

  /** Version delta — appelée à chaque broadcast worker avec les IDs déjà
   *  identifiés comme modifiés. Évite la boucle 682k de scan. */
  syncIncremental(territories: any[], dirtyIds: Uint32Array, currentTick: number) {
    this.territories = territories;
    const W = this.mapWidth;
    const H = this.mapHeight;
    for (let k = 0; k < dirtyIds.length; k++) {
      const i = dirtyIds[k];
      const t = territories[i];
      if (!t) continue;
      const scorchedFlag = (t.scorchedUntil ?? 0) > currentTick ? 1 : 0;
      const buildBucket = Math.floor((t.buildProgress ?? 0) / 5);
      const sig = `${t.owner ?? ''}:${t.building}:${t.buildingLevel}:${scorchedFlag}:${buildBucket}`;
      if (this.lastSig.get(i) !== sig) {
        this.lastSig.set(i, sig);
        this.dirty.add(i);
        // Repaint aussi les 4 voisins : un changement de bordure côté X
        // affecte le rendu border de X ET de ses voisins.
        const x = i % W; const y = (i / W) | 0;
        if (x > 0)      this.dirty.add(i - 1);
        if (x < W - 1)  this.dirty.add(i + 1);
        if (y > 0)      this.dirty.add(i - W);
        if (y < H - 1)  this.dirty.add(i + W);
      }
    }
    this.flushDirty();
  }

  /** Repaint des tuiles dirty + upload partiel canvas. Commun à sync et
   *  syncIncremental. */
  private flushDirty() {
    if (this.dirty.size === 0) return;
    let minX = this.mapWidth, minY = this.mapHeight, maxX = -1, maxY = -1;
    for (const i of this.dirty) {
      this.paintInBuffer(i);
      const x = i % this.mapWidth;
      const y = (i / this.mapWidth) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    if (maxX >= 0) this.flushBufferRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
    this.dirty.clear();
  }

  // ─── Peinture buffer (1 px = 1 tuile) ──────────────────────────────────

  private paintInBuffer(i: number) {
    const t = this.territories[i];
    if (!t) return;
    const off = i * 4;
    const data = this.imageData.data;

    // ─── Owner overlay translucide ──────────────────────────────────────
    // L'arrière-plan géo gère le rendu visuel des biomes (Sahara, forêts,
    // montagnes, océan…). Cette couche n'ajoute QUE la couleur d'appartenance.
    // - Ocean / neutre → alpha 0, on voit la géo telle quelle.
    // - Possédée → alpha ~145, la géo transparaît encore (Sahara reste
    //   reconnaissable même sous une teinte rouge).
    // - Frontière → alpha 215 + couleur bord cuivrée pour bien démarquer.
    // - Brûlé → alpha 230, rouge sombre.
    let col: PaletteEntry = NEUTRAL;
    let alpha = 0;
    // Un cratère est marqué par scorchedUntil > 0 (durée quasi-permanente
    // posée par weapons.detonate). Il est conquérable : dès qu'un joueur
    // capture la tuile, reassignTile remet scorchedUntil à 0 et la tuile
    // reprend l'aspect normal sous la couleur du joueur.
    const isCrater = !t.owner && (t.scorchedUntil ?? 0) > 0;

    if (t.terrain === TerrainType.Ocean) {
      // L'océan reste 100 % géo — pas de tint joueur (les flottes apportent
      // leurs propres VFX par-dessus).
      alpha = 0;
    } else if (isCrater) {
      // Cratère = terre brune variée pixel par pixel. Hash déterministe
      // sur l'index → motif granuleux stable, sans scintillement entre
      // frames. 6 tons couvrent du brun foncé profond au sable cuit.
      const h = hashTile(i);
      const baseIdx = h % CRATER_BROWNS.length;
      const base = CRATER_BROWNS[baseIdx];
      // Petit jitter ±8 sur chaque canal pour casser encore plus
      // l'uniformité — donne un aspect "scoria" / cendres dispersées.
      const jitterR = ((h >> 8)  & 0xf) - 8;
      const jitterG = ((h >> 12) & 0xf) - 8;
      const jitterB = ((h >> 16) & 0xf) - 8;
      col = {
        r: Math.max(0, Math.min(255, base.r + jitterR)),
        g: Math.max(0, Math.min(255, base.g + jitterG)),
        b: Math.max(0, Math.min(255, base.b + jitterB)),
      };
      alpha = 245; // quasi-opaque : on veut que la terre brune masque la géo
    } else if (t.owner) {
      const player = this.playerColors.get(t.owner) ?? NEUTRAL;
      if (this.isBorderTile(t)) {
        // Liseré : couleur joueur shifted gold-deep, opacité quasi pleine.
        col = borderShade(player);
        alpha = 215;
      } else {
        // Intérieur : couleur joueur, alpha modéré pour laisser la géo
        // (relief, neige, calottes…) transparaître clairement.
        col = player;
        // Les biomes "forts visuellement" (montagne / désert / neige) gardent
        // un peu plus de visibilité que les plaines uniformes.
        if (t.terrain === TerrainType.Mountain) alpha = 125;
        else if (t.terrain === TerrainType.Snow) alpha = 130;
        else if (t.terrain === TerrainType.Desert) alpha = 135;
        else if (t.terrain === TerrainType.Forest) alpha = 145;
        else alpha = 150;
      }
    }
    // Note : sans MOUNT_TINT ici — le relief vient du backdrop géo, pas du tint.

    data[off]     = col.r;
    data[off + 1] = col.g;
    data[off + 2] = col.b;
    data[off + 3] = alpha;

    // Maintien du calque bâtiments en parallèle.
    this.updateBuildingSprite(i, t);
  }

  private isBorderTile(t: any): boolean {
    for (const nid of t.neighbors) {
      const n = this.territories[nid];
      if (!n) continue;
      if (n.terrain === TerrainType.Ocean) return true;
      if (n.owner !== t.owner) return true;
    }
    return false;
  }

  private flushBuffer() {
    this.ctx.putImageData(this.imageData, 0, 0);
    this.texture.source.update();
  }

  /** Variante : upload uniquement la sous-region [x,y,w,h] du buffer. */
  private flushBufferRect(x: number, y: number, w: number, h: number) {
    this.ctx.putImageData(this.imageData, 0, 0, x, y, w, h);
    this.texture.source.update();
  }

  // ─── Calque bâtiments (overlay) ────────────────────────────────────────

  private updateBuildingSprite(i: number, t: any) {
    const isBuilding = t.buildProgress > 0 && t.buildProgress < 100;
    const isBuilt = t.building > 0 && t.buildingLevel > 0 && (t.scorchedUntil ?? 0) === 0;
    const has = isBuilt || isBuilding;
    const existing = this.buildingByTile.get(i);
    if (!has) {
      if (existing) {
        this.buildingLayer.removeChild(existing);
        existing.destroy();
        this.buildingByTile.delete(i);
      }
      return;
    }

    let g = existing;
    if (!g) {
      g = new Graphics();
      // Pivot au centre de la tuile pour les anims de scale.
      g.pivot.set(CELL_SIZE / 2, CELL_SIZE / 2);
      g.x = t.x * CELL_SIZE + CELL_SIZE / 2;
      g.y = t.y * CELL_SIZE + CELL_SIZE / 2;
      this.buildingLayer.addChild(g);
      this.buildingByTile.set(i, g);
    }
    g.clear();

    // Détection de "fraîchement construit" : on n'avait pas de bâtiment
    // affiché précédemment et maintenant on en a un complet.
    const wasBuilt = this.builtTiles.has(i);
    if (isBuilt && !wasBuilt) {
      this.builtTiles.add(i);
      this.buildingAnims.set(i, performance.now());
      // Burst de jetons dorés à la position du bâtiment (coord monde).
      const wx = (t.x + 0.5) * CELL_SIZE;
      const wy = (t.y + 0.5) * CELL_SIZE;
      particles.spawn({
        x: wx, y: wy, count: 6, kind: 'chip-gold',
        speed: 0.18, spread: Math.PI, gravity: 0.0008,
        life: 800, scale: 0.4, scaleEnd: 0.25,
      });
      particles.spawn({
        x: wx, y: wy, count: 2, kind: 'star',
        speed: 0.12, spread: Math.PI, gravity: 0,
        life: 500, scale: 1, scaleEnd: 1.8,
      });
    } else if (!isBuilt && wasBuilt) {
      this.builtTiles.delete(i);
      this.buildingAnims.delete(i);
    }

    const colors: Record<number, number> = {
      [BuildingType.City]: 0xffffff,
      [BuildingType.Factory]: 0xffd966,
      [BuildingType.DefensePost]: 0x6ed9e8,
      [BuildingType.Port]: 0x3d8be0,
      [BuildingType.SamLauncher]: 0x9b59b6,
      [BuildingType.Casino]: 0xf1c40f,
    };
    const c = colors[t.building] ?? 0xffffff;
    const cx = CELL_SIZE / 2;
    const cy = CELL_SIZE / 2;

    if (isBuilding) {
      // Chantier en cours : carré sombre + barre de progression au-dessus.
      const barW = Math.max(4, CELL_SIZE * 2);
      const barH = 1.2;
      const bx = cx - barW / 2;
      const by = -barH - 1;
      // Fond du chantier — petit carré du type
      g.rect(cx - CELL_SIZE * 0.4, cy - CELL_SIZE * 0.4, CELL_SIZE * 0.8, CELL_SIZE * 0.8)
        .stroke({ width: 0.6, color: c, alpha: 0.7 });
      // Barre de progression
      g.rect(bx, by, barW, barH).fill({ color: 0x0a0e14, alpha: 0.8 });
      g.rect(bx, by, barW * (t.buildProgress / 100), barH).fill({ color: c, alpha: 0.95 });
      g.rect(bx, by, barW, barH).stroke({ width: 0.3, color: c, alpha: 0.8 });
      return;
    }

    // Bâtiment terminé : pastille ronde.
    const r = Math.max(1.5, CELL_SIZE * 0.6);
    g.circle(cx, cy, r).fill({ color: c, alpha: 0.92 });
    g.circle(cx, cy, r).stroke({ width: 0.6, color: 0x0a0e14, alpha: 0.9 });
    if (t.buildingLevel > 1) {
      for (let k = 1; k < t.buildingLevel; k++) {
        g.circle(cx + k * 1.2, CELL_SIZE + 1, 0.6).fill({ color: c, alpha: 0.95 });
      }
    }
  }

  /**
   * Anime les bâtiments fraîchement construits — spring overshoot 350 ms.
   * Appelée par GameEngine.render(deltaMS) à chaque frame.
   */
  tickBuildings() {
    if (this.buildingAnims.size === 0) return;
    const now = performance.now();
    const DUR = 380;
    for (const [id, startedAt] of this.buildingAnims) {
      const k = Math.min(1, (now - startedAt) / DUR);
      const g = this.buildingByTile.get(id);
      if (!g) { this.buildingAnims.delete(id); continue; }
      // easeOutBack — overshoot puis settle.
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const eased = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      g.scale.set(eased);
      if (k >= 1) {
        g.scale.set(1);
        this.buildingAnims.delete(id);
      }
    }
  }

  get pixelBounds() {
    return { w: this.mapWidth * CELL_SIZE, h: this.mapHeight * CELL_SIZE };
  }
}

