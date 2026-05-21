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

  /** Capture animations désactivées — la texture seule communique l'avancée. */
  onCapture(_territoryId: number) {
    // no-op
  }

  update(_deltaMS: number) {
    // no-op : on garde les anciennes graphics par sécurité au cas où.
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i].gfx.destroy();
      this.pulses.splice(i, 1);
    }
  }
}
