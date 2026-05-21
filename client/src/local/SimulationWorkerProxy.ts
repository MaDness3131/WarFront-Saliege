/**
 * SimulationWorkerProxy — façade main-thread sur SimulationWorker.
 * -----------------------------------------------------------------
 * Expose la même API publique que LocalSimulation (drop-in replacement) :
 *   - start(options) async
 *   - stop()
 *   - onState(listener) → unsubscriber
 *   - onEvent(event, listener) → unsubscriber
 *   - actions : attack, build, setAttackRatio, …
 *
 * Sous le capot : ouvre un Web Worker et relaie via postMessage. Le main
 * thread n'exécute PLUS la simulation — il ne fait que recevoir des
 * broadcasts d'état et envoyer des commandes utilisateur.
 *
 * ── Reconstruction du state main-thread ──────────────────────────────
 * Pour éviter de copier 100 MB de territoires à chaque broadcast, le
 * worker envoie :
 *   - 1 fois au démarrage : un BOOTSTRAP avec l'array `territories` complet
 *   - Chaque tick suivant : seulement les TYPED ARRAYS mutables (owner,
 *     troops, building, scorched…) + Maps petites (players/ships/…)
 *
 * Le proxy maintient ici un `mainState` persistant. À chaque broadcast,
 * il MUTE les territoires en place avec les valeurs du typed array,
 * puis transmet le mainState (toujours la même réf) aux listeners. Les
 * consommateurs (GameEngine, useGameState) ne voient pas la différence —
 * ils continuent d'itérer `state.territories.forEach` comme avant.
 */

import { SimulationOptions } from './LocalSimulation';
import { LocalGameState, LocalTerritory } from './state';
import { GameMode, MatchPhase, TerritoryId, PlayerId, BuildingType, WeaponKind, ShipType } from '@shared/types';

type StateListener = (state: any) => void;
type EventListener = (payload: any) => void;
type TilesDirtyListener = (dirtyIds: Uint32Array, state: any) => void;

export class SimulationWorkerProxy {
  private worker: Worker | null = null;
  private stateListeners = new Set<StateListener>();
  private eventListeners = new Map<string, Set<EventListener>>();
  private tilesDirtyListeners = new Set<TilesDirtyListener>();
  /** Promise qui se résout dès que le worker poste 'ready' (init module). */
  private readyP: Promise<void>;
  private resolveReady!: () => void;
  /** Promise qui se résout dès que sim.start() côté worker termine. */
  private startedP: Promise<void> | null = null;
  private resolveStarted: (() => void) | null = null;
  /** État maintenu sur le main thread — muté en place à chaque broadcast. */
  private mainState: LocalGameState | null = null;

  constructor() {
    this.readyP = new Promise((res) => { this.resolveReady = res; });
    this.worker = new Worker(
      new URL('./SimulationWorker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.addEventListener('message', this.onMessage);
    this.worker.addEventListener('error', this.onError);
  }

  private onMessage = (ev: MessageEvent) => {
    const msg = ev.data;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.type) {
      case 'ready':
        this.resolveReady();
        break;
      case 'started':
        this.resolveStarted?.();
        this.resolveStarted = null;
        break;
      case 'state':
        this.applyState(msg.state);
        break;
      case 'event': {
        const set = this.eventListeners.get(msg.event);
        if (set) for (const l of set) l(msg.payload);
        break;
      }
      case 'error':
        // eslint-disable-next-line no-console
        console.error('[SimWorker]', msg.message, msg.stack);
        break;
    }
  };

  private onError = (ev: ErrorEvent) => {
    // eslint-disable-next-line no-console
    console.error('[SimWorker] crashed:', ev.message, ev);
  };

  // ─── Reconstruction state ──────────────────────────────────────────

  private applyState(wire: any) {
    // 1) Si bootstrap, initialise mainState avec les territoires + dimensions.
    if (wire.bootstrap && !this.mainState) {
      const bs = wire.bootstrap;
      const territories: LocalTerritory[] = bs.territories;
      const byId = new Map<number, LocalTerritory>();
      for (const t of territories) byId.set(t.id, t);
      this.mainState = {
        phase: wire.phase as MatchPhase,
        mode: wire.mode as GameMode,
        tick: wire.tick,
        startedAt: wire.startedAt,
        mapWidth: bs.mapWidth,
        mapHeight: bs.mapHeight,
        winner: wire.winner,
        speedMultiplier: wire.speedMultiplier,
        enabled: wire.enabled,
        myId: wire.myId,
        players: wire.players,
        territories,
        territoryById: byId,
        landIds: bs.landIds,
        // playerTiles : rebuild juste pour le humain ci-dessous, autres
        // joueurs vides (la sim côté worker maintient la version complète).
        playerTiles: new Map(),
        waves: wire.waves,
        ships: wire.ships,
        missiles: wire.missiles,
        alliances: wire.alliances,
        proposals: wire.proposals,
        duels: wire.duels ?? new Map(),
        nextEntityId: wire.nextEntityId,
      };
    }

    if (!this.mainState) {
      // Un broadcast est arrivé avant bootstrap (race condition). On ignore.
      return;
    }

    // 2) Sync des champs scalaires / Maps légères (refs neuves chaque tick).
    const s = this.mainState;
    s.tick = wire.tick;
    s.phase = wire.phase;
    s.winner = wire.winner;
    s.speedMultiplier = wire.speedMultiplier;
    s.enabled = wire.enabled;
    s.players = wire.players;
    s.ships = wire.ships;
    s.missiles = wire.missiles;
    s.alliances = wire.alliances;
    s.proposals = wire.proposals;
    s.duels = wire.duels ?? new Map();
    s.waves = wire.waves;
    s.nextEntityId = wire.nextEntityId;

    // playerTiles : remplacé par juste les tuiles du humain. On REUTILISE le
    // même Set entre broadcasts (clear + add) pour éviter le GC churn.
    const myArr: Uint32Array | null = wire.myTilesArr;
    let mySet = s.playerTiles.get(s.myId);
    if (!mySet) { mySet = new Set<number>(); s.playerTiles.set(s.myId, mySet); }
    else mySet.clear();
    if (myArr) {
      for (let i = 0; i < myArr.length; i++) mySet.add(myArr[i]);
    }

    // 3) Apply DELTA : seulement les tuiles qui ont changé (typiquement
    //    10-500 par broadcast au lieu de 682k). Boucle O(D), pas O(N).
    let dirtyIds: Uint32Array | null = null;
    const td = wire.territoryDelta;
    if (td) {
      const playerIds: string[] = td.playerIds;
      const ids: Uint32Array = td.ids;
      const owner: Int16Array = td.owner;
      const troops: Float32Array = td.troops;
      const building: Uint8Array = td.building;
      const buildingLevel: Uint8Array = td.buildingLevel;
      const buildProgress: Uint8Array = td.buildProgress;
      const scorched: Int32Array = td.scorchedUntil;
      const D = td.dirtyCount;
      const tiles = s.territories;
      for (let k = 0; k < D; k++) {
        const i = ids[k];
        const t = tiles[i];
        const idx = owner[k];
        t.owner = idx >= 0 ? playerIds[idx] : null;
        t.troops = troops[k];
        t.building = building[k];
        t.buildingLevel = buildingLevel[k];
        t.buildProgress = buildProgress[k];
        t.scorchedUntil = scorched[k];
      }
      dirtyIds = ids;
    }

    // 4) Notifie les listeners.
    //    - onTilesDirty : channel rapide, juste les IDs modifiés. Permet à
    //      WorldMap.syncIncremental() de skip son scan 682k.
    //    - onState : channel "lourd" pour useGameState + composants HUD.
    if (dirtyIds && dirtyIds.length > 0) {
      for (const l of this.tilesDirtyListeners) l(dirtyIds, s);
    }
    for (const l of this.stateListeners) l(s);
  }

  onTilesDirty(listener: TilesDirtyListener): () => void {
    this.tilesDirtyListeners.add(listener);
    return () => { this.tilesDirtyListeners.delete(listener); };
  }

  // ─── API LocalSimulation (drop-in) ────────────────────────────────────

  async start(options: SimulationOptions): Promise<void> {
    if (!this.worker) throw new Error('SimulationWorkerProxy: worker not initialized');
    await this.readyP;
    this.startedP = new Promise((res) => { this.resolveStarted = res; });
    this.worker.postMessage({ type: 'start', options });
    return this.startedP;
  }

  stop() {
    this.worker?.postMessage({ type: 'stop' });
    this.mainState = null;
  }

  terminate() {
    if (!this.worker) return;
    this.worker.removeEventListener('message', this.onMessage);
    this.worker.removeEventListener('error', this.onError);
    this.worker.terminate();
    this.worker = null;
    this.stateListeners.clear();
    this.eventListeners.clear();
    this.mainState = null;
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => { this.stateListeners.delete(listener); };
  }

  onEvent(event: string, listener: EventListener): () => void {
    let set = this.eventListeners.get(event);
    if (!set) { set = new Set(); this.eventListeners.set(event, set); }
    set.add(listener);
    return () => { set!.delete(listener); };
  }

  // ─── Actions (relai postMessage) ──────────────────────────────────────

  private send(name: string, ...args: any[]) {
    this.worker?.postMessage({ type: 'action', name, args });
  }

  setPaused(paused: boolean)                               { this.send('setPaused', paused); }
  attack(target: TerritoryId)                              { this.send('attack', target); }
  build(target: TerritoryId, building: BuildingType)       { this.send('build', target, building); }
  setAttackRatio(ratio: number)                            { this.send('setAttackRatio', ratio); }
  requestAlliance(target: PlayerId)                        { this.send('requestAlliance', target); }
  acceptAlliance(proposalId: string)                       { this.send('acceptAlliance', proposalId); }
  rejectAlliance(proposalId: string)                       { this.send('rejectAlliance', proposalId); }
  breakAlliance(allianceId: string)                        { this.send('breakAlliance', allianceId); }
  sendTroopsToAlly(allyId: string, amount: number)         { this.send('sendTroopsToAlly', allyId, amount); }
  sendGoldToAlly(allyId: string, amount: number)           { this.send('sendGoldToAlly', allyId, amount); }
  launchInvasion(targetTileId: number)                     { this.send('launchInvasion', targetTileId); }
  counterWave(enemyId: string, fraction?: number)          { this.send('counterWave', enemyId, fraction); }
  launchWeapon(kind: WeaponKind, target: TerritoryId)      { this.send('launchWeapon', kind, target); }
  buildShip(portId: number, type: ShipType)                { this.send('buildShip', portId, type); }
  moveShip(shipId: string, x: number, y: number)           { this.send('moveShip', shipId, x, y); }
  landShip(shipId: string, targetId: number)               { this.send('landShip', shipId, targetId); }
  // Casino / Blackjack
  proposeBlackjack(targetTileId: number)                   { this.send('proposeBlackjack', targetTileId); }
  blackjackHit(duelId: string)                             { this.send('blackjackHit', duelId); }
  blackjackStand(duelId: string)                           { this.send('blackjackStand', duelId); }
  // Casino solo
  rouletteSpin(betType: string, betAmount: number, betNumber: number) { this.send('rouletteSpin', betType, betAmount, betNumber); }
  slotsPull()                                              { this.send('slotsPull'); }
}
