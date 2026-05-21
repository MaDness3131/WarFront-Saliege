/**
 * LocalSimulation — orchestrateur de la simulation hors-ligne.
 * ------------------------------------------------------------
 * Remplace le couple GameRoom + Colyseus pour permettre de jouer sans serveur :
 *  - génère le monde et place humains + bots ;
 *  - fait tourner la boucle de tick à TICK_RATE Hz dans le navigateur ;
 *  - valide les intentions (attaque, construction, alliance, missile, …) ;
 *  - publie l'état à l'UI et émet des événements ponctuels (capture, etc.).
 *
 * Cette classe est exposée à l'application via le `SocketClient` facade :
 * l'UI continue d'appeler `socket.attack(...)`, qui finit ici sur
 * `requestAttack(state, ...)`. Le jour où on rebranche un vrai serveur, on
 * remplace la facade — sans toucher au reste de l'UI.
 */

import {
  TerrainType,
  BuildingType,
  MatchPhase,
  GameMode,
  CustomOptions,
  WeaponKind,
  ShipType,
  MatchSummary,
} from '@shared/types';
import {
  MAP_SIZES,
  TICK_MS,
  PLAYER_COLORS,
  BUILDINGS,
  scaledBuildingCost,
  DOMINATION_WIN_RATIO,
  START_GOLD,
  START_POPULATION,
  START_ARMY,
  START_TERRITORY_TROOPS,
  DEFAULT_ATTACK_RATIO,
  DEFAULT_CUSTOM_OPTIONS,
  SKINS,
  BOT_DIFFICULTY,
  BOT_START_ARMY_MULT,
  BOT_TIER_DISTRIBUTION,
} from '@shared/constants';
import { LocalGameState, LocalPlayer, createEmptyState } from './state';
import { generateLocalWorld, loadBinaryAtlas } from './WorldGen';
import { EventBus, EVENT } from './events';
import { tickEconomy, trySpend } from './systems/economy';
import { tickPopulation } from './systems/population';
import {
  tickConstruction,
  tickScorch,
  tickWaves,
  checkElimination,
  recountTerritories,
} from './systems/territory';
import { requestAttack, setAttackRatio } from './systems/military';
import { tickNaval, commissionShip, orderMove, orderLand, launchInvasion } from './systems/naval';
import {
  proposeAlliance,
  acceptProposal,
  rejectProposal,
  breakAlliance,
  tickDiplomacy,
} from './systems/diplomacy';
import { launchWeapon, tickWeapons } from './systems/weapons';
import {
  proposeBlackjack,
  blackjackHit,
  blackjackStand,
  tickBlackjack,
} from './systems/blackjack';
import { rouletteSpin, slotsPull, RouletteBetType } from './systems/casino';
import { tickBots, resetBotMemory } from './systems/botAI';
import { resolveSkin } from './profile';

export interface SimulationOptions {
  mode: GameMode;
  playerName: string;
  custom?: Partial<CustomOptions>;
  skinId?: string;
  /** Elo du joueur — passé depuis le main thread car la simulation tourne
   *  désormais dans un Web Worker qui n'a pas accès à localStorage. Default
   *  à 1000 si non fourni. */
  playerElo?: number;
  /** Si true, la simulation est créée en état pausé : le monde est généré
   *  et l'état initial broadcast, mais aucun tick ne progresse. Utilisé
   *  pour figer la scène pendant le countdown 3-2-1 d'entrée en partie. */
  startPaused?: boolean;
}

const MY_ID = 'human';

export class LocalSimulation {
  state: LocalGameState;
  readonly bus = new EventBus();
  private timerId: number | null = null;
  private peakDomination = 0;
  private botDifficulty: keyof typeof BOT_DIFFICULTY = 'normal';
  private listeners = new Set<(state: LocalGameState) => void>();
  private summaryEmitted = false;
  /** Elo du joueur humain — injecté via options au start(), utilisé pour les
   *  calculs eloDelta de fin de partie (Worker n'a pas accès à localStorage). */
  private humanElo = 1000;
  /** Si true, tick() est un no-op (monde figé). Utilisé pour le countdown
   *  3-2-1 entre loading et game — la sim a tous les objets prêts mais ne
   *  progresse pas. setPaused(false) la débloque. */
  private paused = false;

  constructor() {
    this.state = createEmptyState(MY_ID, GameMode.Classic);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Démarrage / arrêt
  // ──────────────────────────────────────────────────────────────────────

  async start(options: SimulationOptions) {
    resetBotMemory();
    const custom: CustomOptions = { ...DEFAULT_CUSTOM_OPTIONS, ...(options.custom ?? {}) };
    // Par défaut on offre une carte cohérente avec la densité de la photo de
    // référence : medium pour classic, small pour rapide (parties courtes).
    const defaultSize: keyof typeof MAP_SIZES =
      options.mode === GameMode.Fast ? 'small' :
      options.mode === GameMode.Custom ? custom.mapSize : 'medium';
    const size = MAP_SIZES[defaultSize];

    this.state = createEmptyState(MY_ID, options.mode);
    this.state.mapWidth = size.w;
    this.state.mapHeight = size.h;
    this.state.startedAt = Date.now();
    this.state.speedMultiplier = options.mode === GameMode.Custom ? custom.speed : 1;
    this.state.enabled = {
      weapons: options.mode === GameMode.Custom ? custom.weaponsEnabled : true,
      alliances: options.mode === GameMode.Custom ? custom.alliancesEnabled : true,
      naval: options.mode === GameMode.Custom ? custom.navalEnabled : true,
    };
    this.botDifficulty = options.mode === GameMode.Custom ? custom.botDifficulty : 'normal';
    this.peakDomination = 0;
    this.summaryEmitted = false;

    // État pause initial (countdown 3-2-1 figera le monde via startPaused).
    this.paused = !!options.startPaused;

    // Charge l'atlas binaire (1 seul fetch par session, cached module-level)
    // PUIS génère le monde gameplay aux dimensions demandées.
    const atlas = await loadBinaryAtlas();
    const world = generateLocalWorld(atlas, size.w, size.h);
    this.state.territories = world.territories;
    this.state.territoryById = world.byId;
    this.state.landIds = world.landIds;

    // Spawn humain + bots. La simulation tourne dans un Worker → on lit le
    // profile via les options passées par le main thread (loadProfile() ne
    // peut pas accéder à localStorage ici).
    this.humanElo = options.playerElo ?? 1000;
    const skin = resolveSkin(options.skinId ?? 'default');
    // Mode Admin uniquement activable en partie personnalisée.
    const adminMode = options.mode === GameMode.Custom && custom.adminMode === true;
    this.spawnPlayer(MY_ID, options.playerName, false, skin.id, 'normal', adminMode);

    const botCount = options.mode === GameMode.Custom ? custom.botCount : 150;
    const safeBotCount = Math.max(0, botCount);
    // Mix de tiers piloté par BOT_TIER_DISTRIBUTION (constants partagées).
    // Les bots strong reçoivent un VRAI nom de pays (ex. "France", "Chine")
    // et sont affichés plus prestigieusement sur la carte — ce sont les
    // "puissances majeures" du lobby. Les autres ont des noms génériques.
    const weakCut = BOT_TIER_DISTRIBUTION.weak;
    const normalCut = weakCut + BOT_TIER_DISTRIBUTION.normal;
    let countryIndex = 0;
    for (let i = 0; i < safeBotCount; i++) {
      const r = Math.random();
      const tier: 'weak' | 'normal' | 'strong' =
        r < weakCut ? 'weak' : r < normalCut ? 'normal' : 'strong';
      const name = tier === 'strong'
        ? randomCountryName(countryIndex++)
        : randomBotName(i);
      this.spawnPlayer(`bot-${i}`, name, true, 'default', tier);
    }
    recountTerritories(this.state);

    this.state.phase = MatchPhase.Running;
    // setInterval est un global du Worker AND du Window — compatible avec
    // les deux contextes d'exécution.
    this.timerId = setInterval(() => this.tick(), TICK_MS) as unknown as number;
    this.broadcast();
  }

  stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    this.bus.clear();
    this.listeners.clear();
  }

  // ──────────────────────────────────────────────────────────────────────
  // Spawn de joueur
  // ──────────────────────────────────────────────────────────────────────

  private spawnPlayer(id: string, name: string, isBot: boolean, skinId = 'default', tier: 'weak' | 'normal' | 'strong' = 'normal', adminMode = false) {
    const skin = SKINS.find((s) => s.id === skinId) ?? SKINS[0];
    const fallbackColor = PLAYER_COLORS[this.state.players.size % PLAYER_COLORS.length];
    const elo = isBot ? 950 + Math.floor(Math.random() * 200) : this.humanElo;
    // Modulateur de start army : humain reçoit START_ARMY pleine, bots
    // reçoivent une fraction selon leur tier (alignée sur OF). Évite que
    // les bots soient instant-saturés à cap dès le spawn.
    const tierMult = !isBot ? 1 : BOT_START_ARMY_MULT[tier];
    const startArmy = START_ARMY * tierMult;
    const p: LocalPlayer = {
      id,
      name,
      isBot,
      alive: true,
      color: isBot ? fallbackColor : skin.color ?? fallbackColor,
      gold: START_GOLD,
      income: 0,
      population: START_POPULATION,
      populationCap: 0,
      army: startArmy,
      attackRatio: DEFAULT_ATTACK_RATIO,
      territoryCount: 0,
      allianceId: null,
      score: 0,
      elo,
      cooldowns: { nuke: 0, hydrogen: 0, tsar: 0 },
      adminMode,
      skinId: isBot ? 'default' : skin.id,
      emblem: isBot ? '' : skin.emblem,
      borderStyle: isBot ? 'solid' : skin.borderStyle,
      nukesLaunched: 0,
      armiesLost: 0,
      armiesKilled: 0,
      diplomacyLockUntil: 0,
      // 5 sec d'invulnérabilité au spawn — temps de prendre tes marques.
      spawnProtectedUntil: this.state.tick + 50,
      blackjackBusyUntil: 0,
      blackjackCooldownUntil: 0,
      blackjackBoosts: new Set<string>(),
      cityCount: 0,
      factoryCount: 0,
      portCount: 0,
      defenseCount: 0,
      samCount: 0,
      casinoCount: 0,
      tier,
      peakTerritories: 0,
      peakArmy: startArmy,
      lastAttackedBy: null,
    };
    this.state.players.set(id, p);

    const spawn = this.pickSpawnTerritory();
    if (spawn) {
      spawn.owner = id;
      spawn.troops = START_TERRITORY_TROOPS;
      spawn.capturedAt = Date.now();
      p.territoryCount = 1;
      let set = this.state.playerTiles.get(id);
      if (!set) { set = new Set(); this.state.playerTiles.set(id, set); }
      set.add(spawn.id);
    } else {
      p.alive = false;
    }
  }

  private pickSpawnTerritory() {
    // Échantillon de candidats libres.
    const free: any[] = [];
    for (const id of this.state.landIds) {
      const t = this.state.territoryById.get(id);
      if (t && t.owner === null) free.push(t);
    }
    if (free.length === 0) return null;

    // Collecte des spawns déjà placés via l'index (O(joueurs)).
    const owned: { x: number; y: number }[] = [];
    for (const set of this.state.playerTiles.values()) {
      const firstId = set.values().next().value;
      if (firstId === undefined) continue;
      const t = this.state.territoryById.get(firstId);
      if (t) owned.push({ x: t.x, y: t.y });
    }
    if (owned.length === 0) return free[Math.floor(Math.random() * free.length)];

    // Échantillonne 80 candidats au hasard, garde celui dont le plus proche
    // spawn existant est le plus éloigné.
    const sample = free.length > 80 ? this.sample(free, 80) : free;
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

  // ──────────────────────────────────────────────────────────────────────
  // Intentions client (appelées par SocketClient facade)
  // ──────────────────────────────────────────────────────────────────────

  attack(targetId: number) {
    const r = requestAttack(this.state, MY_ID, targetId);
    if (!r.ok) this.bus.emit(EVENT.AttackFailed, { target: targetId, reason: r.reason });
  }

  build(targetId: number, building: BuildingType) {
    this.tryBuild(MY_ID, targetId, building);
  }

  setAttackRatio(ratio: number) {
    setAttackRatio(this.state, MY_ID, ratio);
  }

  requestAlliance(targetId: string) {
    proposeAlliance(this.state, MY_ID, targetId, this.bus.emit);
  }

  acceptAlliance(proposalId: string) {
    acceptProposal(this.state, MY_ID, proposalId, this.bus.emit);
  }

  rejectAlliance(proposalId: string) {
    rejectProposal(this.state, MY_ID, proposalId);
  }

  breakAlliance(allianceId: string) {
    breakAlliance(this.state, MY_ID, allianceId, this.bus.emit);
  }

  /** Transfère une fraction de l'armée à un allié (max 50%). */
  sendTroopsToAlly(allyId: string, amount: number) {
    const me = this.state.players.get(MY_ID);
    const ally = this.state.players.get(allyId);
    if (!me || !ally || !me.alive || !ally.alive) return;
    if (!me.allianceId || me.allianceId !== ally.allianceId) return;
    const give = Math.max(0, Math.min(amount, me.army * 0.5));
    if (give < 1) return;
    me.army -= give;
    ally.army += give;
  }

  /** Transfère de l'or à un allié (max 50%). */
  sendGoldToAlly(allyId: string, amount: number) {
    const me = this.state.players.get(MY_ID);
    const ally = this.state.players.get(allyId);
    if (!me || !ally || !me.alive || !ally.alive) return;
    if (!me.allianceId || me.allianceId !== ally.allianceId) return;
    const give = Math.max(0, Math.min(amount, me.gold * 0.5));
    if (give < 1) return;
    me.gold -= give;
    ally.gold += give;
  }

  launchWeapon(kind: WeaponKind, targetId: number) {
    launchWeapon(this.state, MY_ID, targetId, kind, this.bus.emit);
  }

  // ─── Casino / Blackjack ─────────────────────────────────────────────
  /** Propose un duel blackjack contre le propriétaire du territoire ciblé. */
  proposeBlackjack(targetTileId: number) {
    const t = this.state.territoryById.get(targetTileId);
    if (!t || !t.owner || t.owner === MY_ID) return;
    proposeBlackjack(this.state, MY_ID, t.owner, this.bus.emit);
  }

  blackjackHit(duelId: string) {
    blackjackHit(this.state, MY_ID, duelId);
  }

  blackjackStand(duelId: string) {
    blackjackStand(this.state, MY_ID, duelId);
  }

  // ─── Roulette & Slots (solo) ────────────────────────────────────────
  rouletteSpin(betType: string, betAmount: number, betNumber: number) {
    rouletteSpin(this.state, MY_ID, betType as RouletteBetType, betAmount, betNumber, this.bus.emit);
  }

  slotsPull() {
    slotsPull(this.state, MY_ID, this.bus.emit);
  }

  buildShip(portId: number, type: ShipType) {
    commissionShip(this.state, MY_ID, portId, type, this.bus.emit);
  }

  moveShip(shipId: string, x: number, y: number) {
    orderMove(this.state, MY_ID, shipId, x, y);
  }

  landShip(shipId: string, targetId: number) {
    orderLand(this.state, MY_ID, shipId, targetId);
  }

  /** Invasion navale en un clic : spawn auto + path A* + débarquement. */
  launchInvasion(targetTileId: number) {
    launchInvasion(this.state, MY_ID, targetTileId, this.bus.emit);
  }

  /**
   * Contre-attaque : on clique sur un attaquant en cours. Une fraction de
   * notre armée part directement combattre la/les vagues que CET ennemi
   * a lancées sur NOUS. Chaque vague ennemie ciblant le joueur perd des
   * troupes proportionnellement au ratio (les nôtres engagées vs les leurs).
   * Plus le ratio est égal, plus leur expansion ralentit (jusqu'à mourir).
   */
  counterWave(enemyId: string, fraction = 0.35) {
    const me = this.state.players.get(MY_ID);
    const enemy = this.state.players.get(enemyId);
    if (!me || !me.alive || !enemy) return;
    const committed = Math.max(1, Math.floor(me.army * fraction));
    if (me.army < committed) return;

    // Recense les vagues de l'ennemi qui me ciblent.
    const incoming: any[] = [];
    let totalEnemyTroops = 0;
    for (const w of this.state.waves.values()) {
      if (w.owner !== enemyId) continue;
      if (w.targetOwner !== MY_ID) continue;
      incoming.push(w);
      totalEnemyTroops += w.troops;
    }
    if (incoming.length === 0) return; // aucun assaut à contrer

    me.army -= committed;

    // Le combat : chaque vague ennemie perd un pourcentage proportionnel
    // au ratio (committed / enemy_total_in_those_waves), borné à 90%.
    const drainRatio = Math.min(0.9, committed / Math.max(1, totalEnemyTroops));
    let myRemaining = committed;
    for (const w of incoming) {
      const loss = w.troops * drainRatio;
      w.troops = Math.max(0, w.troops - loss);
      // Notre engagement est aussi consumé symétriquement (~50% pour qu'on
      // récupère la moitié au pool ; ne pas tout perdre).
      myRemaining -= loss * 0.5;
    }
    // Retourne le reliquat au pool — la "milice" qui n'a pas combattu rentre.
    me.army += Math.max(0, myRemaining);

    this.bus.emit('CounterEngaged', {
      defender: MY_ID, attacker: enemyId,
      committed, drained: drainRatio, waves: incoming.length,
    });
  }

  // ──────────────────────────────────────────────────────────────────────
  // Construction (mêmes règles que GameRoom.tryBuild)
  // ──────────────────────────────────────────────────────────────────────

  private tryBuild = (playerId: string, targetId: number, building: BuildingType) => {
    if (building === BuildingType.None) return;
    const p = this.state.players.get(playerId);
    const t = this.state.territoryById.get(targetId);
    if (!p || !p.alive || !t) return;
    if (t.owner !== playerId) return;
    if (t.terrain === TerrainType.Ocean) return;
    if (building === BuildingType.Port && t.terrain !== TerrainType.Coast) return;
    if (t.scorchedUntil > this.state.tick) return;
    if (t.buildProgress > 0 && t.buildProgress < 100) return;

    const spec = BUILDINGS[building as Exclude<BuildingType, BuildingType.None>];
    const currentLevel = t.building === building ? t.buildingLevel : 0;
    if (currentLevel >= spec.maxLevel) return;
    if (t.building !== BuildingType.None && t.building !== building) return;

    // Coût OpenFront : exponentiel par count puis cappé. Voir
    // shared/constants.ts → scaledBuildingCost. Le currentLevel n'est plus
    // utilisé pour amplifier (OF ne stack pas par niveau, seulement par count).
    const sameTypeCount =
      building === BuildingType.City ? p.cityCount :
      building === BuildingType.Factory ? p.factoryCount :
      building === BuildingType.Port ? p.portCount :
      building === BuildingType.DefensePost ? p.defenseCount :
      building === BuildingType.SamLauncher ? p.samCount :
      building === BuildingType.Casino ? p.casinoCount : 0;
    const cost = scaledBuildingCost(
      building as Exclude<BuildingType, BuildingType.None>,
      sameTypeCount,
    );
    void currentLevel; // gardé pour validation maxLevel uniquement
    if (!trySpend(p, cost)) return;
    t.building = building;
    t.buildProgress = 0.001;
  };

  // ──────────────────────────────────────────────────────────────────────
  // Abonnements
  // ──────────────────────────────────────────────────────────────────────

  onState(listener: (s: LocalGameState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onEvent(event: string, listener: (payload: any) => void): () => void {
    return this.bus.on(event, listener);
  }

  private broadcast() {
    for (const l of this.listeners) l(this.state);
  }

  // ──────────────────────────────────────────────────────────────────────
  // Boucle de simulation
  // ──────────────────────────────────────────────────────────────────────

  /** Bascule l'état pause. Le timer reste actif (broadcast continue à
   *  envoyer l'état figé), mais tick() est un no-op tant que paused=true. */
  setPaused(p: boolean) {
    this.paused = p;
  }

  private tick() {
    const s = this.state;
    if (s.phase !== MatchPhase.Running) return;
    if (this.paused) return;
    s.tick++;

    tickEconomy(s);
    tickPopulation(s);
    tickConstruction(s);
    tickScorch(s);

    // Propagation des vagues d'expansion (capture cellule par cellule).
    tickWaves(s, this.bus.emit);

    tickNaval(s, this.bus.emit);
    tickWeapons(s, this.bus.emit);
    tickDiplomacy(s);
    tickBlackjack(s, this.bus.emit);

    tickBots(s, this.bus.emit, this.botDifficulty, this.tryBuild);

    // Éliminations + scores.
    checkElimination(s, this.bus.emit);
    for (const p of s.players.values()) {
      p.score = p.territoryCount + p.army / 10 + p.gold / 20 + p.armiesKilled / 30;
    }

    // Suivi du pic de domination (pour les stats).
    const me = s.players.get(MY_ID);
    if (me && s.landIds.length > 0) {
      this.peakDomination = Math.max(this.peakDomination, me.territoryCount / s.landIds.length);
    }

    this.checkVictory();
    this.broadcast();
  }

  private checkVictory() {
    const total = this.state.landIds.length;
    if (total === 0) return;
    for (const p of this.state.players.values()) {
      if (p.alive && p.territoryCount / total >= DOMINATION_WIN_RATIO) {
        this.endMatch(p.id);
        return;
      }
    }
    const alive = [...this.state.players.values()].filter((p) => p.alive);
    if (alive.length === 1 && this.state.players.size > 1) {
      this.endMatch(alive[0].id);
    }
  }

  private endMatch(winnerId: string) {
    this.state.phase = MatchPhase.Finished;
    this.state.winner = winnerId;
    this.bus.emit(EVENT.GameOver, { winner: winnerId });
    if (this.summaryEmitted) return;
    this.summaryEmitted = true;

    // Persiste les stats du joueur humain — la sim tourne dans un Worker
    // qui n'a pas accès à localStorage, donc on émet un event que le main
    // thread (SocketClient) catche et qui appelle recordMatch() + applique
    // l'eloDelta retourné sur me.elo via une 2ᵉ event 'EloApplied'.
    const me = this.state.players.get(MY_ID);
    if (!me) return;
    const sorted = [...this.state.players.values()].sort((a, b) => b.score - a.score);
    const rank = sorted.findIndex((p) => p.id === MY_ID) + 1;
    const summary: Omit<MatchSummary, 'eloDelta'> = {
      endedAt: Date.now(),
      mode: this.state.mode,
      durationSec: Math.round((Date.now() - this.state.startedAt) / 1000),
      won: winnerId === MY_ID,
      finalRank: rank,
      peakDomination: this.peakDomination,
      territoriesPeak: Math.max(me.territoryCount, 0),
      armiesKilled: Math.round(me.armiesKilled),
      nukesLaunched: me.nukesLaunched,
    };
    this.bus.emit('match_ended', {
      summary,
      rank,
      participants: this.state.players.size,
      mode: this.state.mode,
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Outillage
// ────────────────────────────────────────────────────────────────────────────

// Liste de 160 noms de "nations" — chaque bot reçoit le sien par son index,
// donc le même bot a toujours le même nom toute la partie. Pas d'aléa.
const BOT_NAMES = [
  'Vanguard de Fer', 'Pacte Cramoisi', 'Reach Azur', 'Front Verdoyant',
  'Steppe Noire', 'Empire du Soleil', 'Coalition Blanche', 'Horde Argentée',
  'Règne du Nord', 'Concorde du Sud', 'Bloc de l\'Est', 'Fédération Ouest',
  'Ordre des Hauts', 'Hégémonie Côtière', 'Confédération Boréale', 'Ligue Polaire',
  'Cercle de Cendre', 'Marche d\'Onyx', 'Couronne d\'Ivoire', 'Khanat des Plaines',
  'Sérénissime', 'Triumvirat', 'République de Cithare', 'Empire de Velours',
  'Domaine de Brume', 'Principauté Sombre', 'Diocèse Solaire', 'Sultanat Doré',
  'Royaume Pourpre', 'Émirat de Sable', 'Concordat du Vent', 'Alliance d\'Acier',
  'Pacte Glaciaire', 'Confrérie du Roc', 'Sénat Indigo', 'Ordre Saphir',
  'Khanat Cuivré', 'Empire Granite', 'Hégémonie Verte', 'Ligue Stellaire',
  'Marche Tranquille', 'Couronne Volcanique', 'Reach Ténébreux', 'Coalition Pulsar',
  'Brigade Mercurielle', 'Cohorte Vermeille', 'Septentrion', 'Méridien Errant',
  'Légion Rubis', 'Légion Émeraude', 'Légion Cobalt', 'Légion Topaze',
  'Bastion Boréal', 'Bastion Austral', 'Bastion Oriental', 'Bastion Occidental',
  'Pacte de Salin', 'Pacte de Volcan', 'Pacte du Lierre', 'Pacte de Quartz',
  'Confédération Ferrigane', 'Confédération Aurigane', 'Confédération Cuprane',
  'Domaine de Verre', 'Domaine d\'Obsidienne', 'Domaine de Marbre',
  'Khanat de Tournesol', 'Khanat de Cyclone', 'Khanat de Brume', 'Khanat d\'Ambre',
  'Empire de Jade', 'Empire de Corail', 'Empire de Cendres', 'Empire de Bronze',
  'Couronne de Quartz', 'Couronne de Spinelle', 'Couronne d\'Améthyste',
  'Couronne d\'Albâtre', 'Couronne de Granit', 'Couronne d\'Antimoine',
  'Lige du Phénix', 'Lige du Dragon', 'Lige du Griffon', 'Lige du Léviathan',
  'République Saphirine', 'République Vermeille', 'République Cobaltine',
  'Sultanat Sombre', 'Sultanat Lumineux', 'Sultanat des Marées', 'Sultanat des Cieux',
  'Émirat Pulsar', 'Émirat de Nacre', 'Émirat d\'Onyx', 'Émirat d\'Ambre',
  'Principauté Polaire', 'Principauté Tropicale', 'Principauté Équatoriale',
  'Ordre des Tempêtes', 'Ordre des Marées', 'Ordre des Cieux', 'Ordre du Néant',
  'Cohorte Glaciale', 'Cohorte Volcanique', 'Cohorte Stellaire', 'Cohorte Crépusculaire',
  'Légion d\'Argent', 'Légion d\'Or', 'Légion de Plomb', 'Légion d\'Étain',
  'Brigade des Ombres', 'Brigade des Aurores', 'Brigade des Crépuscules',
  'Concordat des Vents', 'Concordat des Pluies', 'Concordat des Sables',
  'Hégémonie de Lave', 'Hégémonie de Glace', 'Hégémonie de Sel',
  'Marche Boréale', 'Marche Australe', 'Marche du Couchant', 'Marche du Levant',
  'Diocèse Lunaire', 'Diocèse Solaire', 'Diocèse Stellaire',
  'Cercle de Jade', 'Cercle de Bronze', 'Cercle de Pierre',
  'Sénat de Cendre', 'Sénat de Pourpre', 'Sénat d\'Indigo',
  'Triumvirat Ardent', 'Triumvirat Glacé', 'Triumvirat Tellurique',
  'Khanat Doré', 'Khanat Sanglant', 'Khanat des Brumes',
  'Couronne Mercurielle', 'Couronne Aurifère', 'Couronne Ferrigane',
  'Empire Polaire', 'Empire Solaire', 'Empire Tellurique', 'Empire Sidéral',
  'Reach Vermeille', 'Reach Argentée', 'Reach Pourprée',
  'Bastion d\'Obsidienne', 'Bastion d\'Albâtre', 'Bastion de Corail',
  'Pacte des Cyclones', 'Pacte des Calmes', 'Pacte des Moussons',
];

function randomBotName(index: number): string {
  return BOT_NAMES[index % BOT_NAMES.length];
}

// Liste de pays réels — utilisée UNIQUEMENT par les bots de tier 'strong'
// (les "puissances majeures"). Voir spawn() : ces bots ont un nom de pays
// reconnaissable + sont affichés en grand + or sur la carte.
const COUNTRY_NAMES = [
  'France',          'États-Unis',     'Russie',          'Chine',
  'Allemagne',       'Japon',          'Royaume-Uni',     'Inde',
  'Brésil',          'Italie',         'Canada',          'Australie',
  'Espagne',         'Corée du Sud',   'Turquie',         'Mexique',
  'Iran',            'Égypte',         'Indonésie',       'Argentine',
  'Pologne',         'Vietnam',        'Nigeria',         'Afrique du Sud',
  'Thaïlande',       'Pays-Bas',       'Arabie Saoudite', 'Suède',
  'Ukraine',         'Norvège',        'Pakistan',        'Israël',
];

function randomCountryName(index: number): string {
  return COUNTRY_NAMES[index % COUNTRY_NAMES.length];
}
