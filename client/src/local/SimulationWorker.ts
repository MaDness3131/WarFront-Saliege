/**
 * SimulationWorker — entrypoint Web Worker.
 * ------------------------------------------
 * Héberge LocalSimulation dans un thread dédié. Le main thread (rendering
 * Pixi + React UI) n'est plus impacté par les ticks lourds (economy, waves,
 * bots, etc) qui peuvent prendre 10-25 ms toutes les 100 ms.
 *
 * ── Sérialisation efficace ──────────────────────────────────────────────
 * Naïvement, postMessage du state (Map<id, plain object> avec 682 000
 * territoires) déclenche un structured clone de ~100 MB toutes les 200 ms
 * → catastrophe perfs. À la place :
 *
 *   1) BOOTSTRAP (1 seul broadcast, au start) : envoie l'array `territories`
 *      complet en plain objects (~50 ms one-shot). Le main thread garde la
 *      référence et la mute en place ensuite.
 *
 *   2) TICK MUTABLES (chaque broadcast) : seuls les champs MUTABLES par
 *      tuile (owner, troops, building, buildProgress, scorched) sont
 *      envoyés en TYPED ARRAYS. Owner indexé via `playerIds[]` pour rester
 *      en Int16 plutôt qu'en strings.
 *
 *   3) Les ArrayBuffers sont TRANSFÉRÉS (transferList) au lieu d'être
 *      copiés → zéro-copy entre worker et main.
 *
 * Résultat : ~10 MB transférés à chaque broadcast, < 5 ms de coût main
 * thread pour appliquer les mutations.
 *
 * ── Protocole de messages ──────────────────────────────────────────────
 *   Main → Worker
 *     { type: 'start', options }                  → démarre une partie
 *     { type: 'stop' }                            → stoppe la simulation
 *     { type: 'action', name, args }              → invoque une méthode de sim
 *
 *   Worker → Main
 *     { type: 'ready' }                           → worker prêt
 *     { type: 'started' }                         → sim.start() terminé
 *     { type: 'state', state: WireState }         → broadcast d'état (throttle 200 ms)
 *     { type: 'event', event, payload }           → événement serveur
 *     { type: 'error', message }                  → erreur sim
 */

import { LocalSimulation, SimulationOptions } from './LocalSimulation';
import { LocalGameState, LocalWave, LocalTerritory } from './state';
import { ServerEvent } from '@shared/types';

let sim: LocalSimulation | null = null;
let unsubState: (() => void) | null = null;
const unsubEvents: Array<() => void> = [];
let bootstrapSent = false;

// ─── Snapshot précédent pour calculer les deltas ───────────────────────
// On garde les valeurs envoyées au dernier broadcast → diff vs courant
// donne exactement les tuiles qui ont muté. Évite d'envoyer 682k tuiles
// quand 50 seulement changent. Alloué au premier broadcast.
let prevOwner: Int16Array | null = null;
let prevTroops: Float32Array | null = null;
let prevBuilding: Uint8Array | null = null;
let prevBuildingLevel: Uint8Array | null = null;
let prevBuildProgress: Uint8Array | null = null;
let prevScorched: Int32Array | null = null;

function resetDeltaState() {
  prevOwner = null;
  prevTroops = null;
  prevBuilding = null;
  prevBuildingLevel = null;
  prevBuildProgress = null;
  prevScorched = null;
}

// ─── Wire format ────────────────────────────────────────────────────────

interface WireWave {
  id: string;
  owner: string;
  targetOwner: string | null;
  troops: number;
  startTick: number;
  queueSize: number;
  frontTileId: number | null;
}

interface WireBootstrap {
  mapWidth: number;
  mapHeight: number;
  territories: LocalTerritory[];
  landIds: number[];
}

// territoryDelta : voir buildWireState() — typed arrays compactes sur les
// SEULES tuiles ayant muté depuis le dernier broadcast.

// ─── Construction du wire ──────────────────────────────────────────────

function buildWireState(s: LocalGameState, includeBootstrap: boolean) {
  const N = s.territories.length;

  // Map owner string → idx pour compresser en Int16.
  const playerIds: string[] = [];
  const playerIdToIdx = new Map<string, number>();
  s.players.forEach((_, id) => {
    playerIdToIdx.set(id, playerIds.length);
    playerIds.push(id);
  });

  // ── Calcul DELTA : on collecte uniquement les IDs des tuiles qui ont
  //    changé depuis le dernier broadcast. Init lazy au 1er passage. ──
  if (!prevOwner || prevOwner.length !== N) {
    prevOwner = new Int16Array(N);
    prevTroops = new Float32Array(N);
    prevBuilding = new Uint8Array(N);
    prevBuildingLevel = new Uint8Array(N);
    prevBuildProgress = new Uint8Array(N);
    prevScorched = new Int32Array(N);
    // Force ALL tiles dirty au 1er passage : owner sentinel -2 ≠ -1/idx.
    prevOwner.fill(-2);
  }

  // 1ʳᵉ passe : scan O(N) pour collecter les IDs dirty.
  const dirtyIds: number[] = [];
  for (let i = 0; i < N; i++) {
    const t = s.territories[i];
    const newOwner = t.owner != null ? (playerIdToIdx.get(t.owner) ?? -1) : -1;
    if (
      newOwner !== prevOwner[i] ||
      t.troops !== prevTroops![i] ||
      t.building !== prevBuilding![i] ||
      t.buildingLevel !== prevBuildingLevel![i] ||
      t.buildProgress !== prevBuildProgress![i] ||
      t.scorchedUntil !== prevScorched![i]
    ) {
      dirtyIds.push(i);
    }
  }

  // 2ᵉ passe : allocation compacte des deltas (taille = dirty.length).
  const D = dirtyIds.length;
  const ids = new Uint32Array(D);
  const owner = new Int16Array(D);
  const troops = new Float32Array(D);
  const building = new Uint8Array(D);
  const buildingLevel = new Uint8Array(D);
  const buildProgress = new Uint8Array(D);
  const scorched = new Int32Array(D);

  for (let k = 0; k < D; k++) {
    const i = dirtyIds[k];
    const t = s.territories[i];
    const ownerIdx = t.owner != null ? (playerIdToIdx.get(t.owner) ?? -1) : -1;
    ids[k] = i;
    owner[k] = ownerIdx;
    troops[k] = t.troops;
    building[k] = t.building;
    buildingLevel[k] = t.buildingLevel;
    buildProgress[k] = t.buildProgress;
    scorched[k] = t.scorchedUntil;
    // Update the prev arrays so next broadcast diffs correctly.
    prevOwner[i] = ownerIdx;
    prevTroops![i] = t.troops;
    prevBuilding![i] = t.building;
    prevBuildingLevel![i] = t.buildingLevel;
    prevBuildProgress![i] = t.buildProgress;
    prevScorched![i] = t.scorchedUntil;
  }

  // Waves : strip MinHeap (toConquer) + Set (queued), garder front + meta.
  const wireWaves = new Map<string, WireWave>();
  s.waves.forEach((w: LocalWave, id) => {
    const top = w.toConquer.size > 0 ? w.toConquer.peek() : null;
    wireWaves.set(id, {
      id: w.id,
      owner: w.owner,
      targetOwner: w.targetOwner,
      troops: w.troops,
      startTick: w.startTick,
      queueSize: w.toConquer.size,
      frontTileId: top ? top.value : null,
    });
  });

  // territoryDelta : SEULEMENT les tuiles qui ont changé. `ids[k]` est
  // l'index dans state.territories de la k-ème tuile dirty. Le main thread
  // applique uniquement ces tuiles → loop O(D) au lieu de O(N).
  const territoryDelta = {
    dirtyCount: D,
    playerIds,
    ids,
    owner,
    troops,
    building,
    buildingLevel,
    buildProgress,
    scorchedUntil: scorched,
  };

  // playerTiles : ENORME (Map<string, Set<number>>, jusqu'à ~750k entrées
  // au total en mid-game). On envoie SEULEMENT le set du joueur humain
  // (utilisé uniquement par renderSpawnProtection pendant la garantie de
  // spawn). Pour les autres joueurs, le main thread n'en a pas besoin.
  const meTiles = s.playerTiles.get(s.myId);
  const myTilesArr: Uint32Array | null = meTiles
    ? new Uint32Array(meTiles.size)
    : null;
  if (meTiles && myTilesArr) {
    let i = 0;
    meTiles.forEach((tid) => { myTilesArr[i++] = tid; });
  }

  // ─── Centroïdes des alliés du joueur humain ─────────────────────────────
  // Calculés ici (worker) puis envoyés au main thread pour afficher la
  // "main verte" au centre du territoire allié. Visible uniquement par les
  // membres de l'alliance (filtrage côté serveur de fait : on n'envoie
  // QUE les centroïdes des alliés réels du joueur local — un joueur non
  // allié ne reçoit jamais cette info).
  const me = s.players.get(s.myId);
  const allyCentroids: Array<{ playerId: string; x: number; y: number; color: string }> = [];
  if (me && me.allianceId) {
    s.players.forEach((p, pid) => {
      if (pid === s.myId) return;
      if (p.allianceId !== me.allianceId) return;
      const tiles = s.playerTiles.get(pid);
      if (!tiles || tiles.size === 0) return;
      let sumX = 0, sumY = 0, n = 0;
      tiles.forEach((tid) => {
        const t = s.territories[tid];
        if (t) { sumX += t.x; sumY += t.y; n++; }
      });
      if (n > 0) {
        allyCentroids.push({
          playerId: pid,
          x: sumX / n,
          y: sumY / n,
          color: p.color,
        });
      }
    });
  }

  const wire: any = {
    // Per-tick state (Maps clonées par structured clone — petites, OK).
    tick: s.tick,
    phase: s.phase,
    mode: s.mode,
    winner: s.winner,
    startedAt: s.startedAt,
    speedMultiplier: s.speedMultiplier,
    enabled: s.enabled,
    myId: s.myId,
    players: s.players,
    ships: s.ships,
    missiles: s.missiles,
    alliances: s.alliances,
    proposals: s.proposals,
    duels: s.duels,
    waves: wireWaves,
    myTilesArr,  // remplace playerTiles : juste le humain
    allyCentroids, // pour afficher la main verte sur le territoire allié
    nextEntityId: s.nextEntityId,
    territoryDelta,
  };

  // Bootstrap : envoyé une seule fois (au 1er broadcast).
  if (includeBootstrap) {
    const bootstrap: WireBootstrap = {
      mapWidth: s.mapWidth,
      mapHeight: s.mapHeight,
      territories: s.territories,
      landIds: s.landIds,
    };
    wire.bootstrap = bootstrap;
  }

  // Liste des ArrayBuffers à TRANSFÉRER (ownership move, pas de copy).
  // Cast vers ArrayBuffer — les typed arrays standards sont toujours backed
  // par un ArrayBuffer (jamais SharedArrayBuffer dans ce flot).
  const transferables: ArrayBuffer[] = [
    owner.buffer as ArrayBuffer,
    troops.buffer as ArrayBuffer,
    building.buffer as ArrayBuffer,
    buildingLevel.buffer as ArrayBuffer,
    buildProgress.buffer as ArrayBuffer,
    scorched.buffer as ArrayBuffer,
  ];
  if (myTilesArr) transferables.push(myTilesArr.buffer as ArrayBuffer);

  return { wire, transferables };
}

// ─── Throttle broadcast (10 Hz max — aligne avec la tickRate sim) ──────
// Avec les deltas, chaque broadcast coûte ~1 ms main thread au lieu de
// ~50 ms. On peut donc remonter à 10 Hz pour que l'animation d'expansion
// suive le rythme réel de la simulation (1 capture / tick = 10 captures/s
// visibles, vs 5 avant qui rendait l'expansion saccadée).
const BROADCAST_THROTTLE_MS = 100;
let lastBroadcastAt = 0;
let pendingState: LocalGameState | null = null;
let throttleTimer: any = null;

function postState(state: LocalGameState) {
  const includeBootstrap = !bootstrapSent;
  const { wire, transferables } = buildWireState(state, includeBootstrap);
  bootstrapSent = true;
  (self as any).postMessage({ type: 'state', state: wire }, transferables);
}

function maybeBroadcast(state: LocalGameState) {
  const now = performance.now();
  const elapsed = now - lastBroadcastAt;
  if (elapsed >= BROADCAST_THROTTLE_MS) {
    lastBroadcastAt = now;
    if (throttleTimer !== null) { clearTimeout(throttleTimer); throttleTimer = null; }
    postState(state);
  } else {
    pendingState = state;
    if (throttleTimer === null) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        if (pendingState) {
          lastBroadcastAt = performance.now();
          postState(pendingState);
          pendingState = null;
        }
      }, BROADCAST_THROTTLE_MS - elapsed);
    }
  }
}

// ─── Handlers ───────────────────────────────────────────────────────────

async function handleStart(options: SimulationOptions) {
  if (sim) {
    sim.stop();
    sim = null;
  }
  bootstrapSent = false;
  resetDeltaState();
  lastBroadcastAt = 0;
  pendingState = null;
  if (throttleTimer !== null) { clearTimeout(throttleTimer); throttleTimer = null; }
  for (const u of unsubEvents) u();
  unsubEvents.length = 0;
  if (unsubState) { unsubState(); unsubState = null; }

  sim = new LocalSimulation();

  unsubState = sim.onState((state) => maybeBroadcast(state));
  for (const evt of Object.values(ServerEvent)) {
    unsubEvents.push(
      sim.onEvent(evt, (payload) => {
        (self as any).postMessage({ type: 'event', event: evt, payload });
      }),
    );
  }

  await sim.start(options);
  (self as any).postMessage({ type: 'started' });
}

function handleStop() {
  if (throttleTimer !== null) { clearTimeout(throttleTimer); throttleTimer = null; }
  pendingState = null;
  bootstrapSent = false;
  resetDeltaState();
  for (const u of unsubEvents) u();
  unsubEvents.length = 0;
  if (unsubState) { unsubState(); unsubState = null; }
  sim?.stop();
  sim = null;
}

function handleAction(name: string, args: any[]) {
  if (!sim) return;
  const fn = (sim as any)[name];
  if (typeof fn === 'function') {
    fn.apply(sim, args);
  } else {
    (self as any).postMessage({ type: 'error', message: `unknown action: ${name}` });
  }
}

// ─── Message dispatcher ─────────────────────────────────────────────────

self.addEventListener('message', async (ev: MessageEvent) => {
  const msg = ev.data;
  if (!msg || typeof msg !== 'object') return;

  try {
    switch (msg.type) {
      case 'start':
        await handleStart(msg.options);
        break;
      case 'stop':
        handleStop();
        break;
      case 'action':
        handleAction(msg.name, msg.args ?? []);
        break;
      default:
        (self as any).postMessage({ type: 'error', message: `unknown msg: ${msg.type}` });
    }
  } catch (err: any) {
    (self as any).postMessage({
      type: 'error',
      message: `worker: ${err?.message ?? String(err)}`,
      stack: err?.stack,
    });
  }
});

(self as any).postMessage({ type: 'ready' });
