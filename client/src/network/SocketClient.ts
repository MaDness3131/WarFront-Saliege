/**
 * SocketClient — façade vers la simulation locale (mode hors-ligne).
 * ------------------------------------------------------------------
 * Historiquement, ce module parlait au serveur autoritaire via Colyseus.
 * En mode hors-ligne (objectif actuel), la « source de vérité » devient
 * `LocalSimulation` qui tourne dans le navigateur. La signature publique
 * reste la même — toute l'UI continue d'appeler `socket.attack(...)` etc. —
 * pour qu'on puisse rebrancher un vrai serveur plus tard sans toucher au
 * reste du code.
 *
 * Anti-cheat n.b. : en local, le « serveur » et le « client » sont dans le
 * même processus. Pas de validation distante donc, mais on conserve la
 * même séparation logique : l'UI n'écrit pas l'état directement, elle
 * passe par cette facade qui appelle les systèmes.
 */

import { ClientMessage, ServerEvent, BuildingType, ShipType, WeaponKind, CustomOptions, TerritoryId, PlayerId } from '@shared/types';
import * as Colyseus from 'colyseus.js';
import { SimulationWorkerProxy } from '../local/SimulationWorkerProxy';
import { recordMatch } from '../local/profile';

type StateListener = (state: any) => void;
type EventListener = (payload: any) => void;

export interface ConnectOptions {
  custom?: Partial<CustomOptions>;
  skinId?: string;
  /** Elo du joueur — relayé au Worker car celui-ci n'a pas localStorage. */
  playerElo?: number;
  /** Démarre la sim en pause (countdown 3-2-1 avant le 1er tick). */
  startPaused?: boolean;
}

export class SocketClient {
  /** sessionId — en local = 'human', en online = celui de la Colyseus Room. */
  sessionId = 'human';
  connected = false;
  /** Mode courant : 'local' (Worker) ou 'online' (Colyseus). */
  mode: 'local' | 'online' = 'local';

  private sim: SimulationWorkerProxy | null = null;
  private remoteRoom: Colyseus.Room | null = null;
  private stateListeners = new Set<StateListener>();
  private eventListeners = new Map<string, Set<EventListener>>();
  private tilesDirtyListeners = new Set<(ids: Uint32Array, state: any) => void>();
  private unsubState?: () => void;
  private unsubTilesDirty?: () => void;
  private unsubEvents: Array<() => void> = [];

  /** Démarre une nouvelle partie hors-ligne. */
  async connect(
    mode: 'classic' | 'fast' | 'custom',
    playerName: string,
    options: ConnectOptions = {},
  ): Promise<void> {
    this.disconnect();

    // SimulationWorkerProxy : LocalSimulation tourne dans un Web Worker
    // dédié. Le main thread n'exécute plus les ticks lourds → rendering
    // Pixi + React jamais bloqué par economy/waves/bots.
    const sim = new SimulationWorkerProxy();
    this.sim = sim;

    // S'abonner AVANT le start — sinon on rate le broadcast initial qui
    // pousse la première version de l'état (phase=Running + territoires).
    this.unsubState = sim.onState((state) => {
      for (const l of this.stateListeners) l(state);
    });
    this.unsubTilesDirty = sim.onTilesDirty((ids, state) => {
      for (const l of this.tilesDirtyListeners) l(ids, state);
    });
    for (const evt of Object.values(ServerEvent)) {
      this.unsubEvents.push(
        sim.onEvent(evt, (payload) => {
          const set = this.eventListeners.get(evt);
          if (set) for (const l of set) l(payload);
        }),
      );
    }

    // MatchEnded : la sim (worker) ne peut pas écrire dans localStorage,
    // donc elle nous renvoie le résumé brut. On persiste ici (main thread).
    this.unsubEvents.push(
      sim.onEvent(ServerEvent.MatchEnded, (payload: any) => {
        try {
          recordMatch({
            won: payload.summary.won,
            rank: payload.rank,
            participants: payload.participants,
            mode: payload.mode,
            summary: payload.summary,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[SocketClient] recordMatch failed:', e);
        }
      }),
    );

    // sim.start est asynchrone (load du binaire atlas via fetch).
    await sim.start({
      mode: mode as any,
      playerName,
      custom: options.custom,
      skinId: options.skinId,
      playerElo: options.playerElo,
      startPaused: options.startPaused,
    });

    this.connected = true;
  }

  /**
   * Démarre une partie EN LIGNE sur une friends_game room déjà créée par
   * le LobbyRoom (matchée par code). À utiliser après le signal 'start'
   * envoyé par la lobby.
   *
   * NB : le serveur tourne actuellement avec un GameRoom Phase 1 — les
   * features récentes (casino, blackjack, cratère…) ne sont PAS encore
   * networkées. Les boutons correspondants seront sans effet en online.
   */
  async connectOnline(
    serverUrl: string,
    code: string,
    playerName: string,
  ): Promise<void> {
    this.disconnect();

    let url = serverUrl.trim().replace(/\/+$/, '');
    if (url.startsWith('https://')) url = 'wss://' + url.slice(8);
    else if (url.startsWith('http://')) url = 'ws://' + url.slice(7);
    else if (!url.startsWith('ws://') && !url.startsWith('wss://')) url = 'ws://' + url;

    const client = new Colyseus.Client(url);
    const room = await client.joinOrCreate('friends_game', { code, name: playerName });
    this.remoteRoom = room;
    this.sessionId = room.sessionId;
    this.mode = 'online';

    // Bridge Colyseus state → stateListeners (snapshot complet à chaque change).
    room.onStateChange((state: any) => {
      for (const l of this.stateListeners) l(state);
    });

    // Bridge Colyseus messages → eventListeners.
    for (const evt of Object.values(ServerEvent)) {
      room.onMessage(evt as any, (payload: any) => {
        const set = this.eventListeners.get(evt);
        if (set) for (const l of set) l(payload);
      });
    }

    this.connected = true;
  }

  disconnect() {
    this.unsubState?.();
    this.unsubState = undefined;
    this.unsubTilesDirty?.();
    this.unsubTilesDirty = undefined;
    for (const u of this.unsubEvents) u();
    this.unsubEvents = [];
    // Online : quitte la Colyseus room proprement.
    if (this.remoteRoom) {
      try { this.remoteRoom.leave(); } catch { /* noop */ }
      this.remoteRoom = null;
    }
    // Local : stop + terminate du worker.
    this.sim?.stop();
    this.sim?.terminate();
    this.sim = null;
    this.connected = false;
    this.mode = 'local';
    this.sessionId = 'human';
  }

  // ─── Abonnements ──────────────────────────────────────────────────────

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onEvent(event: ServerEvent | string, listener: EventListener): () => void {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, new Set());
    this.eventListeners.get(event)!.add(listener);
    return () => this.eventListeners.get(event)?.delete(listener);
  }

  /** Notification rapide à 5 Hz : juste les IDs des tuiles ayant muté.
   *  Permet à WorldMap de skip son scan 682k → repeint uniquement dirty. */
  onTilesDirty(listener: (ids: Uint32Array, state: any) => void): () => void {
    this.tilesDirtyListeners.add(listener);
    return () => this.tilesDirtyListeners.delete(listener);
  }

  // ─── Intentions ───────────────────────────────────────────────────────
  // En mode local : transitent vers le Worker. En mode online : envoyées
  // au serveur Colyseus comme ClientMessage standard (Phase 1 only — les
  // intents casino/blackjack/etc. sont silencieusement ignorées online).

  setPaused(p: boolean) {
    if (this.mode === 'online') return; // pas de pause en online
    this.sim?.setPaused(p);
  }
  attack(target: TerritoryId) {
    if (this.mode === 'online') return void this.remoteRoom?.send(ClientMessage.Attack, { target });
    this.sim?.attack(target);
  }
  build(target: TerritoryId, building: BuildingType) {
    if (this.mode === 'online') return void this.remoteRoom?.send(ClientMessage.Build, { target, building });
    this.sim?.build(target, building);
  }
  setAttackRatio(ratio: number) {
    if (this.mode === 'online') return void this.remoteRoom?.send(ClientMessage.SetAttackRatio, { ratio });
    this.sim?.setAttackRatio(ratio);
  }
  requestAlliance(target: PlayerId) { this.sim?.requestAlliance(target); }
  acceptAlliance(proposalId: string) { this.sim?.acceptAlliance(proposalId); }
  rejectAlliance(proposalId: string) { this.sim?.rejectAlliance(proposalId); }
  breakAlliance(allianceId: string) { this.sim?.breakAlliance(allianceId); }
  sendTroopsToAlly(allyId: string, amount: number) { this.sim?.sendTroopsToAlly(allyId, amount); }
  sendGoldToAlly(allyId: string, amount: number) { this.sim?.sendGoldToAlly(allyId, amount); }
  launchInvasion(targetTileId: number) { this.sim?.launchInvasion(targetTileId); }
  counterWave(enemyId: string) { this.sim?.counterWave(enemyId); }
  launchWeapon(kind: WeaponKind, target: TerritoryId) { this.sim?.launchWeapon(kind, target); }
  buildShip(portId: TerritoryId, type: ShipType) { this.sim?.buildShip(portId, type); }
  moveShip(shipId: string, x: number, y: number) { this.sim?.moveShip(shipId, x, y); }
  landShip(shipId: string, targetId: TerritoryId) { this.sim?.landShip(shipId, targetId); }
  // Casino / Blackjack
  proposeBlackjack(targetTileId: TerritoryId) { this.sim?.proposeBlackjack(targetTileId); }
  blackjackHit(duelId: string) { this.sim?.blackjackHit(duelId); }
  blackjackStand(duelId: string) { this.sim?.blackjackStand(duelId); }
  // Casino solo
  rouletteSpin(betType: string, betAmount: number, betNumber: number) {
    this.sim?.rouletteSpin(betType, betAmount, betNumber);
  }
  slotsPull() { this.sim?.slotsPull(); }
}

/** Singleton — un seul socket pour toute l'application cliente. */
export const socket = new SocketClient();

// Référence à `ClientMessage` pour empêcher tree-shaking si nécessaire
// (utile si quelqu'un veut sérialiser les intentions pour un futur serveur).
export { ClientMessage };
