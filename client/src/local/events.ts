/**
 * Events — bus d'événements ponctuels de la simulation locale.
 * ------------------------------------------------------------
 * Les systèmes émettent des événements (capture, explosion, alliance, etc.)
 * que l'UI/VFX consomment. C'est l'équivalent local des `Server.broadcast()`
 * de Colyseus. Typage souple : la simulation s'autorise des payloads variés,
 * les consommateurs vérifient ce qui les intéresse.
 */

import { ServerEvent } from '@shared/types';

/** Nom d'événement (clé courte) → payload arbitraire. */
export type EventName = keyof typeof ServerEvent | string;

/** Signature d'un émetteur passé aux systèmes. */
export type Emitter = (event: EventName, payload: Record<string, unknown>) => void;

/** Bus minimaliste : abonnement par nom, broadcast d'une émission. */
export class EventBus {
  private listeners = new Map<string, Set<(payload: any) => void>>();

  on(event: string, listener: (payload: any) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  emit: Emitter = (event, payload) => {
    const set = this.listeners.get(event as string);
    if (set) for (const l of set) l(payload);
  };

  clear() {
    this.listeners.clear();
  }
}

/**
 * Mappe les clés `ServerEvent` (TerritoryCaptured, etc.) vers la chaîne courte
 * que le bus utilise — alignée sur l'enum pour rester cohérent avec l'API
 * SocketClient publique.
 */
export const EVENT = {
  TerritoryCaptured: ServerEvent.TerritoryCaptured,
  AttackFailed: ServerEvent.AttackFailed,
  Explosion: ServerEvent.Explosion,
  PlayerEliminated: ServerEvent.PlayerEliminated,
  GameOver: ServerEvent.GameOver,
  AllianceFormed: ServerEvent.AllianceFormed,
  AllianceBroken: ServerEvent.AllianceBroken,
  AllianceProposed: ServerEvent.AllianceProposed,
  ShipBuilt: ServerEvent.ShipBuilt,
  ShipDestroyed: ServerEvent.ShipDestroyed,
  MissileLaunched: ServerEvent.MissileLaunched,
  MissileImpact: ServerEvent.MissileImpact,
  NukeSirenWarning: ServerEvent.NukeSirenWarning,
  BlackjackStarted: ServerEvent.BlackjackStarted,
  BlackjackEnded: ServerEvent.BlackjackEnded,
  RouletteResult: ServerEvent.RouletteResult,
  SlotsResult: ServerEvent.SlotsResult,
} as const;
