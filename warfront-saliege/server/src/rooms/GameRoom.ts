/**
 * GameRoom — salle de simulation autoritaire (Colyseus).
 * ------------------------------------------------------
 * Une instance = une partie. La salle :
 *  - génère le monde et place les joueurs / bots ;
 *  - fait tourner la boucle de simulation à TICK_RATE Hz ;
 *  - reçoit et VALIDE les ordres clients (attaque, construction, ratio) ;
 *  - laisse Colyseus diffuser les deltas d'état aux clients.
 *
 * Le client n'a aucune autorité : il envoie des intentions, il lit l'état.
 */

import { Room, Client } from '@colyseus/core';
import { WorldState, PlayerSchema } from '../game/schema';
import { generateWorld } from '../game/WorldGenerator';
import { TerritoryManager } from '../game/TerritoryManager';
import { EconomySystem } from '../game/EconomySystem';
import { PopulationSystem } from '../game/PopulationSystem';
import { MilitarySystem } from '../game/MilitarySystem';
import { BotAI } from '../game/BotAI';
import {
  TerrainType,
  BuildingType,
  MatchPhase,
  GameMode,
  ClientMessage,
  ServerEvent,
  AttackPayload,
  BuildPayload,
  SetRatioPayload,
} from '../../../shared/types';
import {
  MAP_SIZES,
  TICK_MS,
  ARMY_SPEED,
  MAX_PLAYERS,
  START_GOLD,
  START_POPULATION,
  START_ARMY,
  START_TERRITORY_TROOPS,
  DEFAULT_ATTACK_RATIO,
  PLAYER_COLORS,
  BUILDINGS,
  DOMINATION_WIN_RATIO,
} from '../../../shared/constants';

interface RoomOptions {
  mode?: GameMode;
  mapSize?: keyof typeof MAP_SIZES;
  botCount?: number;
}

export class GameRoom extends Room<WorldState> {
  maxClients = MAX_PLAYERS;

  private territoryMgr!: TerritoryManager;
  private economy!: EconomySystem;
  private population!: PopulationSystem;
  private military!: MilitarySystem;
  private bots!: BotAI;
  private landIds: number[] = [];
  private colorCursor = 0;

  onCreate(options: RoomOptions) {
    const state = new WorldState();
    const mode = options.mode ?? GameMode.Classic;
    const size = MAP_SIZES[options.mapSize ?? 'small'];

    state.mode = mode;
    state.phase = MatchPhase.Lobby;
    state.mapWidth = size.w;
    state.mapHeight = size.h;
    this.setState(state);

    // ─── Génération du monde ───────────────────────────────────────────
    const world = generateWorld(size.w, size.h);
    state.territories = world.territories;
    state.territoryById = world.byId;
    this.landIds = world.landIds;

    // ─── Systèmes ──────────────────────────────────────────────────────
    this.territoryMgr = new TerritoryManager(state, (t, by, from) => {
      this.broadcast(ServerEvent.TerritoryCaptured, { id: t.id, by, from });
    });
    this.economy = new EconomySystem(state);
    this.population = new PopulationSystem(state);
    this.military = new MilitarySystem(state);
    this.bots = new BotAI(state, this.military, this.territoryMgr, (pid, tid, b) =>
      this.tryBuild(pid, tid, b),
    );

    // ─── Bots ──────────────────────────────────────────────────────────
    const botCount = Math.min(options.botCount ?? 6, MAX_PLAYERS - 1);
    for (let i = 0; i < botCount; i++) {
      this.spawnPlayer(`bot-${i}`, `Bot ${i + 1}`, true);
    }

    // ─── Handlers de messages clients ──────────────────────────────────
    this.onMessage(ClientMessage.Attack, (client, msg: AttackPayload) => {
      this.handleAttack(client.sessionId, msg);
    });
    this.onMessage(ClientMessage.Build, (client, msg: BuildPayload) => {
      this.tryBuild(client.sessionId, msg.target, msg.building);
    });
    this.onMessage(ClientMessage.SetAttackRatio, (client, msg: SetRatioPayload) => {
      const p = this.state.players.get(client.sessionId);
      if (p) this.military.setAttackRatio(p, msg.ratio);
    });

    // ─── Boucle de simulation à fréquence fixe ─────────────────────────
    state.phase = MatchPhase.Running;
    state.startedAt = Date.now();
    this.setSimulationInterval(() => this.tick(), TICK_MS);

    console.log(
      `[GameRoom ${this.roomId}] créée — mode=${mode} carte=${size.w}x${size.h} ` +
        `territoires=${state.territories.length} bots=${botCount}`,
    );
  }

  // ───────────────────────────────────────────────────────────────────────
  // Connexions
  // ───────────────────────────────────────────────────────────────────────

  onJoin(client: Client, options: { name?: string }) {
    const name = (options?.name ?? 'Commander').slice(0, 20);
    this.spawnPlayer(client.sessionId, name, false);
    console.log(`[GameRoom ${this.roomId}] ${name} a rejoint (${client.sessionId})`);
  }

  async onLeave(client: Client, consented: boolean) {
    const p = this.state.players.get(client.sessionId);
    if (!p) return;
    p.connected = false;
    // Déconnexion non consentie : on garde le joueur 30 s pour la reconnexion.
    if (!consented) {
      try {
        await this.allowReconnection(client, 30);
        p.connected = true;
        return;
      } catch {
        /* délai dépassé : on retire le joueur */
      }
    }
    this.removePlayer(client.sessionId);
  }

  private removePlayer(sessionId: string) {
    const p = this.state.players.get(sessionId);
    if (!p) return;
    // Les territoires du joueur redeviennent neutres.
    for (const t of this.state.territories) {
      if (t.owner === sessionId) t.owner = null;
    }
    this.state.players.delete(sessionId);
  }

  // ───────────────────────────────────────────────────────────────────────
  // Création de joueur
  // ───────────────────────────────────────────────────────────────────────

  private spawnPlayer(id: string, name: string, isBot: boolean) {
    const p = new PlayerSchema();
    p.id = id;
    p.name = name;
    p.isBot = isBot;
    p.connected = true;
    p.color = PLAYER_COLORS[this.colorCursor++ % PLAYER_COLORS.length];
    p.gold = START_GOLD;
    p.population = START_POPULATION;
    p.army = START_ARMY;
    p.attackRatio = DEFAULT_ATTACK_RATIO;
    p.alive = true;
    this.state.players.set(id, p);

    // Attribue un territoire de spawn libre, idéalement isolé des autres.
    const spawn = this.pickSpawnTerritory();
    if (spawn) {
      spawn.owner = id;
      spawn.troops = START_TERRITORY_TROOPS;
      spawn.capturedAt = Date.now();
      p.territoryCount = 1;
    } else {
      p.alive = false; // carte saturée : aucune case libre
    }
  }

  /** Choisit une case de terre neutre, en privilégiant l'éloignement. */
  private pickSpawnTerritory() {
    const free = this.landIds
      .map((id) => this.state.territoryById.get(id)!)
      .filter((t) => t && t.owner === null);
    if (free.length === 0) return null;

    const owned = this.state.territories.filter((t) => t.owner !== null);
    if (owned.length === 0) {
      return free[Math.floor(Math.random() * free.length)];
    }
    // Score = distance min au joueur le plus proche ⇒ on maximise l'isolement.
    // Échantillonnage borné pour rester performant sur grande carte.
    const sample = free.length > 200 ? this.sample(free, 200) : free;
    let best = sample[0];
    let bestScore = -1;
    for (const cand of sample) {
      let minDist = Infinity;
      for (const o of owned) {
        const d = Math.abs(cand.x - o.x) + Math.abs(cand.y - o.y);
        if (d < minDist) minDist = d;
      }
      if (minDist > bestScore) {
        bestScore = minDist;
        best = cand;
      }
    }
    return best;
  }

  private sample<T>(arr: T[], n: number): T[] {
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(arr[Math.floor(Math.random() * arr.length)]);
    return out;
  }

  // ───────────────────────────────────────────────────────────────────────
  // Ordres clients
  // ───────────────────────────────────────────────────────────────────────

  private handleAttack(playerId: string, msg: AttackPayload) {
    const result = this.military.requestAttack(playerId, msg.target);
    if (!result.ok) {
      const client = this.clients.find((c) => c.sessionId === playerId);
      client?.send(ServerEvent.AttackFailed, { target: msg.target, reason: result.reason });
    }
  }

  /** Validation + lancement d'une construction. Utilisé par joueurs ET bots. */
  private tryBuild(playerId: string, targetId: number, building: BuildingType) {
    if (building === BuildingType.None) return;
    const p = this.state.players.get(playerId);
    const t = this.state.territoryById.get(targetId);
    if (!p || !p.alive || !t) return;
    if (t.owner !== playerId) return; // pas chez soi
    if (t.terrain === TerrainType.Ocean) return;
    if (building === BuildingType.Port && t.terrain !== TerrainType.Coast) return;
    if (t.buildProgress > 0 && t.buildProgress < 100) return; // chantier en cours

    const spec = BUILDINGS[building as Exclude<BuildingType, BuildingType.None>];
    const currentLevel = t.building === building ? t.buildingLevel : 0;
    if (currentLevel >= spec.maxLevel) return;
    if (t.building !== BuildingType.None && t.building !== building) return; // 1 type/case

    const cost = spec.baseCost * Math.pow(spec.costGrowth, currentLevel);
    if (!EconomySystem.trySpend(p, cost)) return;

    t.building = building;
    t.buildProgress = 0.001; // amorce le chantier (>0 ⇒ tickConstruction l'avance)
  }

  // ───────────────────────────────────────────────────────────────────────
  // Boucle de simulation
  // ───────────────────────────────────────────────────────────────────────

  private tick() {
    const state = this.state;
    if (state.phase !== MatchPhase.Running) return;
    state.tick++;

    // 1. Économie & population (revenus, croissance, production d'armée).
    this.economy.tick();
    this.population.tick();

    // 2. Constructions en cours.
    this.territoryMgr.tickConstruction();

    // 3. Déplacement des vagues + résolution des arrivées.
    const arrived: string[] = [];
    for (const army of state.armies.values()) {
      army.progress += ARMY_SPEED;
      if (army.progress >= 1) {
        this.territoryMgr.resolveArrival(army);
        arrived.push(army.id);
      }
    }
    for (const id of arrived) state.armies.delete(id);

    // 4. IA des bots.
    this.bots.tick();

    // 5. Éliminations + scores.
    for (const p of state.players.values()) {
      if (this.territoryMgr.checkElimination(p)) {
        this.broadcast(ServerEvent.PlayerEliminated, { id: p.id });
      }
      // Score simple : territoires + armée/10 + or/20.
      p.score = p.territoryCount + p.army / 10 + p.gold / 20;
    }

    // 6. Condition de victoire (domination).
    this.checkVictory();
  }

  private checkVictory() {
    const total = this.landIds.length;
    if (total === 0) return;
    for (const p of this.state.players.values()) {
      if (p.alive && p.territoryCount / total >= DOMINATION_WIN_RATIO) {
        this.endMatch(p.id, p.name);
        return;
      }
    }
    // Dernier survivant.
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    if (alive.length === 1 && this.state.players.size > 1) {
      this.endMatch(alive[0].id, alive[0].name);
    }
  }

  private endMatch(winnerId: string, winnerName: string) {
    this.state.phase = MatchPhase.Finished;
    this.state.winner = winnerId;
    this.broadcast(ServerEvent.GameOver, { winner: winnerId });
    console.log(`[GameRoom ${this.roomId}] Partie terminée — vainqueur ${winnerName}`);
  }

  onDispose() {
    console.log(`[GameRoom ${this.roomId}] disposée.`);
  }
}
