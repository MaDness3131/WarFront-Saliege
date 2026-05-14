/**
 * TerritorySystem — animations de conquête côté client.
 * -----------------------------------------------------
 * Quand le serveur signale une capture, ce système joue l'effet visuel de
 * « vague de conquête » : une pulsation lumineuse qui se propage depuis la
 * case capturée. Purement cosmétique — la propriété réelle vient déjà de
 * l'état serveur appliqué par WorldMap.
 */

import { Graphics } from 'pixi.js';
import { WorldMap } from './WorldMap';
import { CELL_SIZE } from '../../../shared/constants';

interface Pulse {
  gfx: Graphics;
  age: number;
  ttl: number;
  cx: number;
  cy: number;
}

const PULSE_TTL = 550; // ms

export class TerritorySystem {
  private pulses: Pulse[] = [];

  constructor(private map: WorldMap) {}

  /** Déclenché par GameEngine sur l'événement TerritoryCaptured. */
  onCapture(territoryId: number) {
    // On récupère la position via la grille (id = row*width + col).
    const bounds = this.map.pixelBounds;
    const cols = Math.round(bounds.w / CELL_SIZE);
    const col = territoryId % cols;
    const row = Math.floor(territoryId / cols);

    const g = new Graphics();
    g.x = (col + 0.5) * CELL_SIZE;
    g.y = (row + 0.5) * CELL_SIZE;
    this.map.container.addChild(g);

    this.pulses.push({ gfx: g, age: 0, ttl: PULSE_TTL, cx: g.x, cy: g.y });
  }

  /** Anime et nettoie les pulsations actives. */
  update(deltaMS: number) {
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const p = this.pulses[i];
      p.age += deltaMS;
      const t = p.age / p.ttl;
      if (t >= 1) {
        p.gfx.destroy();
        this.pulses.splice(i, 1);
        continue;
      }
      // Cercle qui grandit et s'estompe : la « vague ».
      const radius = CELL_SIZE * (0.4 + t * 2.4);
      const alpha = (1 - t) * 0.7;
      p.gfx.clear();
      p.gfx.circle(0, 0, radius).stroke({ width: 2, color: 0xffffff, alpha });
    }
  }
}
