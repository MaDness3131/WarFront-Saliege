/**
 * WorldMap — rendu de la carte du monde (PixiJS).
 * -----------------------------------------------
 * Affiche les milliers de cellules territoriales de façon optimisée :
 *  - chaque cellule est un rectangle dans un conteneur unique ;
 *  - le rendu n'est mis à jour QUE pour les territoires qui changent
 *    (le serveur via Colyseus nous dit lesquels) ;
 *  - culling : les cellules hors écran ne sont pas redessinées ;
 *  - les frontières dynamiques sont tracées par-dessus en une passe.
 *
 * Le client ne décide RIEN ici : il peint l'état reçu du serveur.
 */

import { Container, Graphics, Rectangle } from 'pixi.js';
import { TerrainType } from '../../../shared/types';
import { CELL_SIZE, OCEAN_COLOR, NEUTRAL_COLOR, MOUNTAIN_TINT } from '../../../shared/constants';

interface CellView {
  gfx: Graphics;
  lastOwner: string | null;
  lastBuilding: number;
  lastCapturedAt: number;
}

export class WorldMap {
  readonly container = new Container();
  private cellLayer = new Container();
  private borderLayer = new Graphics();
  private cells: CellView[] = [];

  private mapWidth = 0;
  private mapHeight = 0;
  /** Couleur par joueur, fournie par GameEngine depuis l'état. */
  private playerColors = new Map<string, number>();

  constructor() {
    this.container.addChild(this.cellLayer);
    this.container.addChild(this.borderLayer);
    // sortableChildren désactivé : un seul layer, ordre stable ⇒ moins de coût.
    this.cellLayer.cullable = true;
  }

  /** Initialise la grille une seule fois, au premier état reçu. */
  init(territories: any[], mapWidth: number, mapHeight: number) {
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.cellLayer.removeChildren();
    this.cells = [];

    for (let i = 0; i < territories.length; i++) {
      const t = territories[i];
      const g = new Graphics();
      g.x = t.x * CELL_SIZE;
      g.y = t.y * CELL_SIZE;
      // hitArea fixe ⇒ pas de recalcul de bounds à chaque frame.
      g.hitArea = new Rectangle(0, 0, CELL_SIZE, CELL_SIZE);
      g.eventMode = t.terrain === TerrainType.Ocean ? 'none' : 'static';
      (g as any).territoryId = t.id;
      this.cellLayer.addChild(g);

      const view: CellView = { gfx: g, lastOwner: null, lastBuilding: -1, lastCapturedAt: -1 };
      this.cells.push(view);
      this.paintCell(view, t);
    }
  }

  setPlayerColors(colors: Map<string, number>) {
    this.playerColors = colors;
  }

  /**
   * Synchronise le rendu avec l'état serveur. Ne repeint que les cellules
   * dont la propriété, le bâtiment ou la date de capture ont changé.
   */
  sync(territories: any[]) {
    let dirty = false;
    for (let i = 0; i < territories.length; i++) {
      const t = territories[i];
      const view = this.cells[i];
      if (!view) continue;
      if (
        view.lastOwner !== t.owner ||
        view.lastBuilding !== t.building ||
        view.lastCapturedAt !== t.capturedAt
      ) {
        this.paintCell(view, t);
        dirty = true;
      }
    }
    if (dirty) this.redrawBorders(territories);
  }

  /** Couleur de fond d'une cellule selon terrain / propriétaire. */
  private paintCell(view: CellView, t: any) {
    const g = view.gfx;
    g.clear();

    let fill: number;
    if (t.terrain === TerrainType.Ocean) {
      fill = parseInt(OCEAN_COLOR.slice(1), 16);
    } else if (t.owner) {
      fill = this.playerColors.get(t.owner) ?? parseInt(NEUTRAL_COLOR.slice(1), 16);
    } else {
      fill = parseInt(NEUTRAL_COLOR.slice(1), 16);
    }

    g.rect(0, 0, CELL_SIZE, CELL_SIZE).fill({ color: fill });

    // Montagnes : surcouche teintée pour la lisibilité.
    if (t.terrain === TerrainType.Mountain) {
      g.rect(0, 0, CELL_SIZE, CELL_SIZE).fill({
        color: parseInt(MOUNTAIN_TINT.slice(1), 16),
        alpha: 0.35,
      });
    }

    // Marqueur de bâtiment (petit carré central).
    if (t.building > 0 && t.buildingLevel > 0) {
      const s = CELL_SIZE * 0.4;
      const o = (CELL_SIZE - s) / 2;
      g.rect(o, o, s, s).fill({ color: 0xffffff, alpha: 0.85 });
    }

    // Glow de capture récente (animé côté GameEngine via alpha decay).
    const since = Date.now() - t.capturedAt;
    if (t.capturedAt > 0 && since < 600) {
      g.rect(0, 0, CELL_SIZE, CELL_SIZE).stroke({ width: 2, color: 0xffffff, alpha: 1 });
    }

    view.lastOwner = t.owner;
    view.lastBuilding = t.building;
    view.lastCapturedAt = t.capturedAt;
  }

  /**
   * Trace les frontières : une ligne entre deux cellules de propriétaires
   * différents. Une seule passe sur la grille, uniquement arêtes droite/bas
   * pour éviter de dessiner deux fois chaque segment.
   */
  private redrawBorders(territories: any[]) {
    const g = this.borderLayer;
    g.clear();
    const w = this.mapWidth;
    const h = this.mapHeight;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = territories[y * w + x];
        if (!t || t.terrain === TerrainType.Ocean || !t.owner) continue;
        const px = x * CELL_SIZE;
        const py = y * CELL_SIZE;

        // Arête droite.
        if (x + 1 < w) {
          const r = territories[y * w + x + 1];
          if (!r || r.owner !== t.owner) {
            g.moveTo(px + CELL_SIZE, py).lineTo(px + CELL_SIZE, py + CELL_SIZE);
          }
        }
        // Arête bas.
        if (y + 1 < h) {
          const b = territories[(y + 1) * w + x];
          if (!b || b.owner !== t.owner) {
            g.moveTo(px, py + CELL_SIZE).lineTo(px + CELL_SIZE, py + CELL_SIZE);
          }
        }
      }
    }
    g.stroke({ width: 1.5, color: 0x0a0e14, alpha: 0.9 });
  }

  /** Bornes pixel de la carte (pour clamp caméra). */
  get pixelBounds() {
    return { w: this.mapWidth * CELL_SIZE, h: this.mapHeight * CELL_SIZE };
  }
}
