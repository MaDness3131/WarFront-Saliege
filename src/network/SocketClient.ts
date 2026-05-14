/**
 * SocketClient — communication temps réel avec le serveur autoritaire.
 * --------------------------------------------------------------------
 * Encapsule Colyseus.js : connexion, synchronisation d'état (deltas),
 * envoi d'intentions, reconnexion automatique. C'est le SEUL point de
 * contact réseau du client — rien d'autre ne parle au serveur.
 *
 * Le client n'envoie que des INTENTIONS ("j'attaque le territoire X").
 * Il ne reçoit que de l'ÉTAT. Aucun calcul de jeu n'a lieu ici.
 */

import { Client, Room } from 'colyseus.js';
import {
  ClientMessage,
  ServerEvent,
  BuildingType,
  TerritoryId,
  PlayerId,
} from '@shared/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'ws://localhost:2567';

type StateListener = (state: any) => void;
type EventListener = (payload: any) => void;

export class SocketClient {
  private client: Client;
  private room: Room | null = null;
  private stateListeners = new Set<StateListener>();
  private eventListeners = new Map<string, Set<EventListener>>();

  /** sessionId attribué par le serveur — identifie « notre » joueur. */
  sessionId = '';
  connected = false;

  // Reconnexion avec backoff exponentiel.
  private reconnectToken: string | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 6;

  constructor() {
    this.client = new Client(SERVER_URL);
  }

  /** Rejoint (ou crée) une salle pour le mode demandé. */
  async connect(mode: 'classic' | 'fast' | 'custom', playerName: string): Promise<void> {
    this.room = await this.client.joinOrCreate(mode, { name: playerName });
    this.bindRoom();
  }

  private bindRoom() {
    if (!this.room) return;
    const room = this.room;

    this.sessionId = room.sessionId;
    this.reconnectToken = room.reconnectionToken;
    this.connected = true;
    this.reconnectAttempts = 0;

    // Diffusion de l'état à chaque patch reçu.
    room.onStateChange((state) => {
      for (const l of this.stateListeners) l(state);
    });

    // Événements ponctuels hors schéma (captures, explosions, etc.).
    for (const evt of Object.values(ServerEvent)) {
      room.onMessage(evt, (payload) => {
        const set = this.eventListeners.get(evt);
        if (set) for (const l of set) l(payload);
      });
    }

    room.onError((code, message) => {
      console.error(`[SocketClient] erreur salle ${code}: ${message}`);
    });

    room.onLeave((code) => {
      this.connected = false;
      if (code >= 1000 && code !== 4000) {
        console.log('[SocketClient] déconnexion volontaire.');
        return;
      }
      this.attemptReconnect();
    });
  }

  /** Reconnexion automatique avec backoff exponentiel. */
  private async attemptReconnect() {
    if (!this.reconnectToken) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SocketClient] reconnexion abandonnée.');
      return;
    }
    const delay = Math.min(8000, 500 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    console.log(`[SocketClient] reconnexion dans ${delay}ms (essai ${this.reconnectAttempts})`);

    setTimeout(async () => {
      try {
        this.room = await this.client.reconnect(this.reconnectToken!);
        this.bindRoom();
        console.log('[SocketClient] reconnecté.');
      } catch {
        this.attemptReconnect();
      }
    }, delay);
  }

  // ─── Abonnements ──────────────────────────────────────────────────────

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onEvent(event: ServerEvent, listener: EventListener): () => void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
    this.eventListeners.get(event)!.add(listener);
    return () => this.eventListeners.get(event)?.delete(listener);
  }

  // ─── Envoi d'intentions ───────────────────────────────────────────────

  attack(target: TerritoryId) {
    this.room?.send(ClientMessage.Attack, { target });
  }

  build(target: TerritoryId, building: BuildingType) {
    this.room?.send(ClientMessage.Build, { target, building });
  }

  setAttackRatio(ratio: number) {
    this.room?.send(ClientMessage.SetAttackRatio, { ratio });
  }

  requestAlliance(target: PlayerId) {
    this.room?.send(ClientMessage.RequestAlliance, { target });
  }

  disconnect() {
    this.reconnectToken = null;
    this.room?.leave(true);
    this.connected = false;
  }
}

// Singleton — un seul socket pour toute l'application cliente.
export const socket = new SocketClient();
