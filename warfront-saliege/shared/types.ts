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
  Mountain = 2, // défense bonus, pas de port
  Coast = 3,    // land adjacent à de l'océan, autorise les ports
}

export enum BuildingType {
  None = 0,
  City = 1,        // +population cap, +revenu
  Factory = 2,     // +production militaire
  DefensePost = 3, // +défense du territoire
  Port = 4,        // autorise embarquement naval (coast only)
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
// Messages réseau (client → serveur)
// ──────────────────────────────────────────────────────────────────────────

export enum ClientMessage {
  Attack = 'attack',           // { target: TerritoryId }
  Build = 'build',             // { target: TerritoryId, building: BuildingType }
  SetAttackRatio = 'set_ratio',// { ratio: number }
  RequestAlliance = 'ally_req',// { target: PlayerId }
  AcceptAlliance = 'ally_acc', // { allianceId: AllianceId }
}

export interface AttackPayload { target: TerritoryId; }
export interface BuildPayload { target: TerritoryId; building: BuildingType; }
export interface SetRatioPayload { ratio: number; }

// ──────────────────────────────────────────────────────────────────────────
// Événements serveur → client (en plus du state sync Colyseus)
// ──────────────────────────────────────────────────────────────────────────

export enum ServerEvent {
  TerritoryCaptured = 'territory_captured', // { id, by, from }
  AttackFailed = 'attack_failed',           // { target, reason }
  Explosion = 'explosion',                  // { x, y, kind }
  PlayerEliminated = 'player_eliminated',   // { id }
  GameOver = 'game_over',                   // { winner }
}
