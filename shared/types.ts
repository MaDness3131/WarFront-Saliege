/**
 * Warfront Saliège — Types partagés client / serveur
 * ---------------------------------------------------
 * Source de vérité unique pour les structures de données échangées sur le
 * réseau. Le client ne fait QUE lire ces structures ; le serveur est seul
 * autorisé à les muter.
 */

// ──────────────────────────────────────────────────────────────────────────
// Identifiants
// ──────────────────────────────────────────────────────────────────────────

export type PlayerId = string;
export type TerritoryId = number;
export type AllianceId = string;

// ──────────────────────────────────────────────────────────────────────────
// Carte / territoires
// ──────────────────────────────────────────────────────────────────────────

export enum TerrainType {
  Ocean = 0,
  Land = 1,
  Mountain = 2, // défense bonus
  Coast = 3,    // land adjacent à de l'océan
  Desert = 4,   // chaud, traversée légèrement plus chère
  Snow = 5,     // froid, défense moyenne
  Forest = 6,   // dense, défense légère
}

export enum BuildingType {
  None = 0,
  City = 1,        // +population cap, +revenu
  Factory = 2,     // +production militaire
  DefensePost = 3, // +défense du territoire
  Port = 4,        // autorise embarquement naval (coast only)
  SamLauncher = 5, // intercepte les missiles dans un rayon
  Casino = 6,      // débloque les minijeux (Blackjack PvP, etc.)
}

export interface Territory {
  id: TerritoryId;
  /** Coordonnées de grille (col, row) pour le rendu. */
  x: number;
  y: number;
  terrain: TerrainType;
  /** null = territoire neutre. */
  owner: PlayerId | null;
  /** Garnison défensive présente sur le territoire. */
  troops: number;
  building: BuildingType;
  buildingLevel: number;
  /** IDs des territoires adjacents (4-connexité). */
  neighbors: TerritoryId[];
  /** Timestamp serveur de la dernière capture, pour animer la propagation. */
  capturedAt: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Joueurs
// ──────────────────────────────────────────────────────────────────────────

export interface Player {
  id: PlayerId;
  name: string;
  /** Couleur hex pour les frontières (#RRGGBB). */
  color: string;
  isBot: boolean;
  connected: boolean;

  // Économie
  gold: number;
  income: number; // recalculé par tick, lecture seule côté client

  // Population
  population: number;
  populationCap: number;

  // Militaire
  army: number;          // réserve mobilisable (hors garnisons)
  /** Ratio de l'armée envoyé lors d'une attaque, réglable par le joueur. */
  attackRatio: number;

  // Méta
  territoryCount: number;
  allianceId: AllianceId | null;
  score: number;
  elo: number;
  alive: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Armées en transit (vagues de conquête)
// ──────────────────────────────────────────────────────────────────────────

export interface Army {
  id: string;
  owner: PlayerId;
  from: TerritoryId;
  to: TerritoryId;
  amount: number;
  /** Progression 0..1 le long du segment from→to. */
  progress: number;
  /** true = renfort vers un territoire allié, false = attaque. */
  reinforcement: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Naval (Phase 2)
// ──────────────────────────────────────────────────────────────────────────

export enum ShipType {
  Destroyer = 0,
  Battleship = 1,
}

export interface Ship {
  id: string;
  owner: PlayerId;
  type: ShipType;
  x: number;
  y: number;
  hp: number;
  /** Troupes embarquées en vue d'un débarquement. */
  cargo: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Diplomatie (Phase 2)
// ──────────────────────────────────────────────────────────────────────────

export enum AllianceState {
  Pending = 0,
  Active = 1,
  Broken = 2,
}

export interface Alliance {
  id: AllianceId;
  members: PlayerId[];
  state: AllianceState;
  sharedVision: boolean;
  createdAt: number;
}

// ──────────────────────────────────────────────────────────────────────────
// État de match
// ──────────────────────────────────────────────────────────────────────────

export enum MatchPhase {
  Lobby = 0,
  Running = 1,
  Finished = 2,
}

export enum GameMode {
  Classic = 'classic',
  Fast = 'fast',
  Custom = 'custom',
}

export interface MatchState {
  phase: MatchPhase;
  mode: GameMode;
  tick: number;
  startedAt: number;
  mapWidth: number;
  mapHeight: number;
  winner: PlayerId | null;
}

// ──────────────────────────────────────────────────────────────────────────
// Armes (Phase 3)
// ──────────────────────────────────────────────────────────────────────────

export type WeaponKind = 'nuke' | 'hydrogen' | 'tsar';

/** Tir en vol — synchronisé pour permettre l'animation de trajectoire. */
export interface Missile {
  id: string;
  kind: WeaponKind;
  owner: PlayerId;
  fromX: number; // coordonnées de cellule (peuvent être fractionnaires)
  fromY: number;
  toX: number;
  toY: number;
  progress: number;        // 0..1 le long de la parabole
  durationTicks: number;   // total prévu
}

// ──────────────────────────────────────────────────────────────────────────
// Diplomatie (Phase 2) — propositions en attente
// ──────────────────────────────────────────────────────────────────────────

export interface AllianceProposal {
  id: string;
  from: PlayerId;
  to: PlayerId;
  expiresTick: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Méta-jeu (Phase 4)
// ──────────────────────────────────────────────────────────────────────────

/** Options d'une partie personnalisée (mode Custom). */
export interface CustomOptions {
  mapSize: 'small' | 'medium' | 'large';
  speed: number;        // multiplicateur global (0.5..3)
  botCount: number;     // 0..14
  botDifficulty: 'easy' | 'normal' | 'hard';
  weaponsEnabled: boolean;
  alliancesEnabled: boolean;
  navalEnabled: boolean;
  /** Mode Admin : troupes + or illimités, cooldowns d'armes ignorés.
   *  Pour tester / bidouiller sans les contraintes économiques. */
  adminMode: boolean;
}

/** Définition d'une apparence cosmétique. */
export interface SkinDef {
  id: string;
  name: string;
  /** Couleur de remplacement ; null = couleur attribuée par le jeu. */
  color: string | null;
  /** Motif de bordure : solide, rayé, double. */
  borderStyle: 'solid' | 'dashed' | 'double';
  /** Émoji ou code icône affiché sur la capitale (vide si aucun). */
  emblem: string;
  /** Conditions de déverrouillage (fictif local) : niveau requis. */
  unlockLevel: number;
}

/** Résumé d'une partie persistant côté client (Phase 4). */
export interface MatchSummary {
  endedAt: number;          // timestamp epoch ms
  mode: GameMode;
  durationSec: number;
  won: boolean;
  finalRank: number;        // 1 = vainqueur
  peakDomination: number;   // 0..1, plus grand ratio atteint
  territoriesPeak: number;
  armiesKilled: number;
  nukesLaunched: number;
  eloDelta: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Messages réseau (client → serveur) — ou intentions vers la sim locale
// ──────────────────────────────────────────────────────────────────────────

export enum ClientMessage {
  Attack = 'attack',              // { target: TerritoryId }
  Build = 'build',                // { target: TerritoryId, building: BuildingType }
  SetAttackRatio = 'set_ratio',   // { ratio: number }
  RequestAlliance = 'ally_req',   // { target: PlayerId }
  AcceptAlliance = 'ally_acc',    // { allianceId: AllianceId }
  RejectAlliance = 'ally_rej',    // { proposalId: string }
  BreakAlliance = 'ally_break',   // { allianceId: AllianceId }
  LaunchWeapon = 'weapon',        // { target: TerritoryId, kind: WeaponKind }
  BuildShip = 'ship_build',       // { portId: TerritoryId, type: ShipType }
  MoveShip = 'ship_move',         // { shipId: string, x: number, y: number }
  LandShip = 'ship_land',         // { shipId: string, targetId: TerritoryId }
}

export interface AttackPayload { target: TerritoryId; }
export interface BuildPayload { target: TerritoryId; building: BuildingType; }
export interface SetRatioPayload { ratio: number; }
export interface LaunchWeaponPayload { target: TerritoryId; kind: WeaponKind; }
export interface BuildShipPayload { portId: TerritoryId; type: ShipType; }
export interface MoveShipPayload { shipId: string; x: number; y: number; }
export interface LandShipPayload { shipId: string; targetId: TerritoryId; }

// ──────────────────────────────────────────────────────────────────────────
// Événements serveur → client (en plus du state sync)
// ──────────────────────────────────────────────────────────────────────────

export enum ServerEvent {
  TerritoryCaptured = 'territory_captured', // { id, by, from }
  AttackFailed = 'attack_failed',           // { target, reason }
  Explosion = 'explosion',                  // { x, y, kind, radius? }
  PlayerEliminated = 'player_eliminated',   // { id }
  GameOver = 'game_over',                   // { winner }
  // Phase 2
  AllianceFormed = 'alliance_formed',       // { allianceId, members }
  AllianceBroken = 'alliance_broken',       // { allianceId, breaker }
  AllianceProposed = 'alliance_proposed',   // { proposalId, from, to }
  ShipBuilt = 'ship_built',                 // { shipId, owner }
  ShipDestroyed = 'ship_destroyed',         // { shipId, by? }
  // Phase 3
  MissileLaunched = 'missile_launched',     // { missileId, fromX, fromY, toX, toY, kind }
  MissileImpact = 'missile_impact',         // { x, y, kind, radius }
  NukeSirenWarning = 'nuke_siren',          // { toX, toY }
  // Phase Worker — émis par la sim (Worker) pour persister stats côté main.
  // Le main thread reçoit le résumé brut + recompose Elo via loadProfile()
  // + saveProfile() (le Worker n'a pas accès à localStorage).
  MatchEnded = 'match_ended',               // { summary, rank, participants, mode }
  // Phase Casino — duel blackjack PvP
  BlackjackStarted = 'bj_started',          // { duelId, challenger, opponent }
  BlackjackCardDealt = 'bj_card',           // { duelId, to: 'dealer'|'challenger'|'opponent' }
  BlackjackEnded = 'bj_ended',              // { duelId, winnerId, message }
  // Casino solo
  RouletteResult = 'rl_result',             // { playerId, number, betType, betAmount, payout, won }
  SlotsResult = 'sl_result',                // { playerId, symbols: [n,n,n], payout, jackpot }
}
