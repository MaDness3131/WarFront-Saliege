/**
 * PacketSerializer — optimisation réseau complémentaire.
 * ------------------------------------------------------
 * IMPORTANT : Colyseus gère DÉJÀ la synchronisation d'état par delta binaire
 * (seuls les champs modifiés du schéma sont envoyés). Ce module ne réimplémente
 * donc pas le state sync — il sert aux messages HORS schéma à fort volume :
 * événements VFX groupés, snapshots compacts pour la minimap, replays.
 *
 * Stratégie : encodage delta + quantification des flottants + run-length sur
 * les territoires, le tout en ArrayBuffer pour minimiser la bande passante.
 */

import { Territory } from '@shared/types';

/** Snapshot ultra-compact destiné à la minimap (1 octet / territoire). */
export class MinimapEncoder {
  /**
   * Encode la propriété des territoires sur 1 octet chacun via une table
   * d'index de joueurs (max 255 joueurs). 0 = neutre/océan.
   */
  static encode(territories: Territory[], playerIndex: Map<string, number>): Uint8Array {
    const buf = new Uint8Array(territories.length);
    for (let i = 0; i < territories.length; i++) {
      const owner = territories[i].owner;
      buf[i] = owner ? (playerIndex.get(owner) ?? 0) : 0;
    }
    return buf;
  }

  /** Delta run-length : ne transmet que les segments [offset,length,value]. */
  static encodeDelta(prev: Uint8Array, next: Uint8Array): Uint8Array {
    const segments: number[] = [];
    let i = 0;
    while (i < next.length) {
      if (prev[i] === next[i]) {
        i++;
        continue;
      }
      const value = next[i];
      const offset = i;
      let length = 0;
      while (i < next.length && next[i] === value && prev[i] !== next[i]) {
        length++;
        i++;
      }
      // offset (uint16) | length (uint16) | value (uint8)
      segments.push((offset >> 8) & 0xff, offset & 0xff, (length >> 8) & 0xff, length & 0xff, value);
    }
    return new Uint8Array(segments);
  }
}

/** Quantification d'un flottant 0..max sur un uint16 (réseau) et retour. */
export const Quantize = {
  pack(value: number, max: number): number {
    return Math.round((Math.min(max, Math.max(0, value)) / max) * 65535);
  },
  unpack(packed: number, max: number): number {
    return (packed / 65535) * max;
  },
};

/**
 * File d'événements VFX agrégés sur un tick : au lieu d'envoyer N messages
 * « explosion », on envoie un seul paquet groupé par tick.
 */
export interface VfxEvent {
  kind: number; // 0=impact, 1=missile, 2=nuke
  x: number;
  y: number;
}

export class VfxBatcher {
  private queue: VfxEvent[] = [];

  push(e: VfxEvent) {
    this.queue.push(e);
  }

  /** Vide la file et renvoie le lot (à appeler une fois par broadcast). */
  flush(): VfxEvent[] {
    if (this.queue.length === 0) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }
}
