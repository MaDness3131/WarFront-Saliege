/**
 * LocalState — état de jeu en mémoire pour le mode hors-ligne.
 * ------------------------------------------------------------
 * Réplique fidèle (en plain TS, sans @colyseus/schema) de l'état que le
 * serveur autoritaire maintiendrait. Toute la simulation tourne ici quand le
 * jeu est lancé en solo : les systèmes mutent ces objets, l'UI les lit.
 *
 * Quand le jeu sera rebranché sur un vrai serveur, ce module restera utile
 * comme miroir client de l'état reçu (mais avec mutation interdite).
 */

import {
  TerrainType,
  BuildingType,
  GameMode,
  MatchPhase,
  AllianceState,
  ShipType,
  WeaponKind,
} from '@shared/types';
import { MinHeap } from './util/MinHeap';

// ──────────────────────────────────────────────────────────────────────────
// Entités
// ──────────────────────────────────────────────────────────────────────────

export interface LocalTerritory {
  id: number;
  x: number;
  y: number;
  terrain: TerrainType;
  owner: string | null;
  troops: number;
  building: BuildingType;
  buildingLevel: number;
  /** 0 = aucun chantier ; 0..100 = en cours ; reset à 0 quand terminé. */
  buildProgress: number;
  capturedAt: number;
  neighbors: number[];
  /** Tick au-delà duquel le terrain brûlé redevient utilisable. 0 = sain. */
  scorchedUntil: number;
}

export interface LocalPlayer {
  id: string;
  name: string;
  color: string;
  isBot: boolean;
  alive: boolean;
  // Économie
  gold: number;
  income: number;
  // Population / armée
  population: number;
  populationCap: number;
  army: number;
  attackRatio: number;
  // Méta
  territoryCount: number;
  allianceId: string | null;
  score: number;
  elo: number;
  // Phase 3 — cooldowns d'armes (en ticks restants)
  cooldowns: { nuke: number; hydrogen: number; tsar: number };
  /** Mode Admin (custom uniquement) : ce joueur a or + troupes illimités
   *  et ignore les cooldowns d'armes. Activé uniquement pour le joueur
   *  humain si CustomOptions.adminMode est vrai. */
  adminMode: boolean;
  // Phase 4 — apparence
  skinId: string;
  emblem: string;
  borderStyle: 'solid' | 'dashed' | 'double';
  // Diagnostique : nombre de tirs nucléaires effectués (pour les stats).
  nukesLaunched: number;
  armiesLost: number;
  armiesKilled: number;
  // Compteurs de bâtiments (mis à jour par tickEconomy une fois par tick).
  cityCount: number;
  factoryCount: number;
  portCount: number;
  defenseCount: number;
  samCount: number;
  /** Tier de force pour les bots — détermine puissance et IA. */
  tier: 'weak' | 'normal' | 'strong';
  /** Pic de territoires possédés (utilisé pour le bonus de mise à mort). */
  peakTerritories: number;
  /** Pic d'armée atteint (pour le bonus de mise à mort). */
  peakArmy: number;
  /** Dernier attaquant à avoir pris une de ses tuiles (potentiel "killer"). */
  lastAttackedBy: string | null;
  /** Tick avant lequel ce joueur ne peut pas proposer d'alliance (trahison). */
  diplomacyLockUntil: number;
  /** Tick avant lequel ce joueur est invulnérable (protection au spawn). */
  spawnProtectedUntil: number;
  /** Tick avant lequel ce joueur est en duel blackjack et ne peut pas être
   *  attaqué. Mis à 0 quand le duel se termine. */
  blackjackBusyUntil: number;
  /** Tick avant lequel ce joueur ne peut PAS proposer ni accepter un
   *  nouveau duel blackjack (cooldown 1 min après la fin d'un duel). */
  blackjackCooldownUntil: number;
  /** Ensemble des IDs d'ennemis battus au blackjack — tant qu'ils sont
   *  vivants, ce joueur a +20 % de force contre eux dans le combat. */
  blackjackBoosts: Set<string>;
  /** Nombre de casinos possédés — mis à jour par tickEconomy comme cityCount. */
  casinoCount: number;
}

/**
 * Une attaque vivante (au sens FrontWars) : entité long-running qui consomme
 * son propre pool de troupes pour conquérir des cases via une file de
 * priorité. Le défenseur perd des troupes proportionnellement à son nombre
 * de territoires (dilution). L'attaque meurt quand son pool est épuisé ou
 * que la file est vide.
 */
export interface LocalWave {
  id: string;
  owner: string;
  /** Joueur ciblé (null = terra nullius / neutre). */
  targetOwner: string | null;
  /** Pool de troupes engagées — diminue à chaque capture. */
  troops: number;
  startTick: number;
  /** File de priorité binaire : la tuile avec la plus petite priorité d'abord. */
  toConquer: MinHeap<number>;
  /** Anti-doublon. */
  queued: Set<number>;
}

export interface LocalShip {
  id: string;
  owner: string;
  type: ShipType;
  x: number;
  y: number;
  destX: number | null;
  destY: number | null;
  landTargetId: number | null;
  hp: number;
  maxHp: number;
  cargo: number;
  fireCooldown: number;
  /** Itinéraire A* précalculé (waypoints à suivre dans l'ordre). */
  path: { x: number; y: number }[];
  /** Traînée (positions récentes) — rendue avec la couleur du joueur. */
  trail: { x: number; y: number; tick: number }[];
}

export interface LocalMissile {
  id: string;
  kind: WeaponKind;
  owner: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** Tick auquel le missile a été tiré (pour calculer la progression). */
  startTick: number;
  durationTicks: number;
}

export interface LocalAlliance {
  id: string;
  members: string[];
  state: AllianceState;
  sharedVision: boolean;
  createdAt: number;
}

export interface LocalProposal {
  id: string;
  from: string;
  to: string;
  expiresTick: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Casino — Blackjack duel
// ──────────────────────────────────────────────────────────────────────────

export interface BlackjackCard {
  /** 1=As, 2..10=numérique, 11=Valet, 12=Dame, 13=Roi. */
  rank: number;
  /** 0=♠, 1=♥, 2=♦, 3=♣. */
  suit: number;
}

/** État global d'un duel blackjack 2 joueurs (+ croupier partagé).
 *  Vit dans state.duels jusqu'à fermeture (résultat affiché côté UI). */
export interface BlackjackDuel {
  id: string;
  challengerId: string;
  opponentId: string;

  // Mises (valeurs absolues débitées au début du duel).
  challengerGoldBet: number;
  challengerTroopsBet: number;
  opponentGoldBet: number;
  opponentTroopsBet: number;

  // Mains.
  dealerCards: BlackjackCard[];
  challengerCards: BlackjackCard[];
  opponentCards: BlackjackCard[];

  // Drapeaux de fin de tour.
  challengerStood: boolean;
  opponentStood: boolean;
  dealerRevealed: boolean;

  /** Compteur de ticks pour étaler les décisions des bots. */
  botActionCooldown: number;
  /** Compteur de ticks pour étaler la pioche du croupier (révélation lente). */
  dealerCooldown: number;

  /** 'playing' = tours en cours.
   *  'resolving' = croupier joue + résultat calculé, on attend la fin de hold.
   *  'replay' = relancé suite à une double défaite (transition courte).
   *  'done' = à retirer du state.duels au prochain tick. */
  state: 'playing' | 'resolving' | 'replay' | 'done';

  /** Tick de fin (timeout safety + hold après résultat). */
  expiresTick: number;

  /** Indicateurs de résultat (remplis quand state='resolving'/'done'). */
  winnerId: string | null;
  resultMessage: string;
  challengerOutcome: 'win' | 'lose' | 'push' | null;
  opponentOutcome:   'win' | 'lose' | 'push' | null;

  /** Compteur de relances (replay). Cap à BLACKJACK_MAX_ROUNDS. */
  rounds: number;
}

// ──────────────────────────────────────────────────────────────────────────
// État global
// ──────────────────────────────────────────────────────────────────────────

export interface LocalGameState {
  phase: MatchPhase;
  mode: GameMode;
  tick: number;
  startedAt: number;
  mapWidth: number;
  mapHeight: number;
  winner: string | null;
  /** Multiplicateur global de vitesse (mode Custom). */
  speedMultiplier: number;
  /** Fonctionnalités activées (mode Custom). */
  enabled: { weapons: boolean; alliances: boolean; naval: boolean };
  /** ID de session du joueur humain local. */
  myId: string;
  players: Map<string, LocalPlayer>;
  territories: LocalTerritory[];
  territoryById: Map<number, LocalTerritory>;
  /** IDs des territoires terrestres (hors océan) — utilisé pour spawn / win. */
  landIds: number[];
  /** Index inversé : pour chaque joueur, l'ensemble de ses tuiles. Maintenu
   *  incrémentalement à chaque capture / neutralisation — évite à l'IA de
   *  scanner les 100k+ tuiles à chaque décision. */
  playerTiles: Map<string, Set<number>>;
  /** Vagues d'expansion actives. */
  waves: Map<string, LocalWave>;
  ships: Map<string, LocalShip>;
  missiles: Map<string, LocalMissile>;
  alliances: Map<string, LocalAlliance>;
  proposals: Map<string, LocalProposal>;
  /** Duels blackjack actifs. */
  duels: Map<string, BlackjackDuel>;
  /** Compteur global pour générer des IDs uniques d'entités. */
  nextEntityId: number;
}

/** Factory : initialise un état vide cohérent. */
export function createEmptyState(myId: string, mode: GameMode): LocalGameState {
  return {
    phase: MatchPhase.Lobby,
    mode,
    tick: 0,
    startedAt: 0,
    mapWidth: 0,
    mapHeight: 0,
    winner: null,
    speedMultiplier: 1,
    enabled: { weapons: true, alliances: true, naval: true },
    myId,
    players: new Map(),
    territories: [],
    territoryById: new Map(),
    landIds: [],
    playerTiles: new Map(),
    waves: new Map(),
    ships: new Map(),
    missiles: new Map(),
    alliances: new Map(),
    proposals: new Map(),
    duels: new Map(),
    nextEntityId: 1,
  };
}

export function nextId(state: LocalGameState, prefix: string): string {
  return `${prefix}${state.nextEntityId++}`;
}
