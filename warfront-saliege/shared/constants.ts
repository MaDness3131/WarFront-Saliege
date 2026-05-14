/**
 * Warfront Saliège — Constantes d'équilibrage partagées
 * -----------------------------------------------------
 * Toutes les valeurs critiques de gameplay sont centralisées ici afin de
 * pouvoir équilibrer le jeu sans toucher à la logique. Le serveur applique
 * ces valeurs ; le client les utilise uniquement pour l'affichage prédictif.
 */

import { BuildingType, GameMode } from './types';

// ──────────────────────────────────────────────────────────────────────────
// Boucle de simulation
// ──────────────────────────────────────────────────────────────────────────

export const TICK_RATE = 10;              // ticks de simulation par seconde
export const TICK_MS = 1000 / TICK_RATE;
export const STATE_BROADCAST_RATE = 10;   // broadcasts d'état par seconde
export const ARMY_SPEED = 0.045;          // progression par tick d'une vague (0..1)

// ──────────────────────────────────────────────────────────────────────────
// Carte
// ──────────────────────────────────────────────────────────────────────────

export const MAP_SIZES = {
  small:  { w: 60,  h: 40 },
  medium: { w: 100, h: 64 },
  large:  { w: 160, h: 100 },
} as const;

export const OCEAN_THRESHOLD = 0.42;      // bruit < seuil ⇒ océan
export const MOUNTAIN_THRESHOLD = 0.78;   // bruit > seuil ⇒ montagne
export const CELL_SIZE = 16;              // pixels par cellule au zoom 1

// ──────────────────────────────────────────────────────────────────────────
// Joueur — valeurs de départ
// ──────────────────────────────────────────────────────────────────────────

export const START_GOLD = 100;
export const START_POPULATION = 50;
export const START_ARMY = 30;
export const START_TERRITORY_TROOPS = 10; // garnison du territoire de spawn
export const DEFAULT_ATTACK_RATIO = 0.5;  // 50 % de l'armée envoyée par défaut
export const MIN_ATTACK_RATIO = 0.05;
export const MAX_ATTACK_RATIO = 1.0;

// ──────────────────────────────────────────────────────────────────────────
// Économie
// ──────────────────────────────────────────────────────────────────────────

export const GOLD_PER_TERRITORY = 0.06;   // /tick
export const GOLD_PER_CITY_LEVEL = 0.25;  // /tick
export const GOLD_PER_FACTORY_LEVEL = 0.1;
export const ARMY_UPKEEP_PER_UNIT = 0.0008; // or consommé par unité d'armée /tick
/** Anti-snowball : le revenu est multiplié par ce facteur décroissant. */
export const SNOWBALL_DAMPING = (territoryCount: number) =>
  Math.max(0.35, 1 - territoryCount * 0.0025);

// ──────────────────────────────────────────────────────────────────────────
// Population
// ──────────────────────────────────────────────────────────────────────────

export const POP_GROWTH_RATE = 0.018;     // croissance logistique /tick
export const POP_CAP_BASE = 80;
export const POP_CAP_PER_TERRITORY = 12;
export const POP_CAP_PER_CITY_LEVEL = 120;
/** Fraction de la croissance de population convertie en armée. */
export const POP_TO_ARMY_RATIO = 0.35;

// ──────────────────────────────────────────────────────────────────────────
// Militaire
// ──────────────────────────────────────────────────────────────────────────

export const DEFENSE_TERRAIN_BONUS = {
  land: 1.0,
  coast: 1.0,
  mountain: 1.6,   // les montagnes sont coûteuses à prendre
  ocean: 0,
} as const;

export const DEFENSE_POST_BONUS_PER_LEVEL = 0.5; // +50 % défense par niveau
export const NEUTRAL_TERRITORY_TROOPS = 8;       // garnison des territoires neutres
export const GARRISON_AFTER_CAPTURE = 0.25;      // part des troupes laissées en garnison
export const MIN_ATTACK_FORCE = 2;               // en-dessous, attaque refusée

// ──────────────────────────────────────────────────────────────────────────
// Construction
// ──────────────────────────────────────────────────────────────────────────

export interface BuildingSpec {
  baseCost: number;
  costGrowth: number;   // coût niveau N = baseCost * costGrowth^(N-1)
  buildTicks: number;
  maxLevel: number;
}

export const BUILDINGS: Record<Exclude<BuildingType, BuildingType.None>, BuildingSpec> = {
  [BuildingType.City]:        { baseCost: 120, costGrowth: 1.6, buildTicks: 80, maxLevel: 5 },
  [BuildingType.Factory]:     { baseCost: 160, costGrowth: 1.7, buildTicks: 100, maxLevel: 5 },
  [BuildingType.DefensePost]: { baseCost: 90,  costGrowth: 1.5, buildTicks: 60, maxLevel: 4 },
  [BuildingType.Port]:        { baseCost: 140, costGrowth: 1.8, buildTicks: 90, maxLevel: 3 },
};

// ──────────────────────────────────────────────────────────────────────────
// Armes (Phase 3)
// ──────────────────────────────────────────────────────────────────────────

export const WEAPONS = {
  missile:  { cost: 250,  cooldownTicks: 300,  radius: 1, damage: 40 },
  nuke:     { cost: 1200, cooldownTicks: 1800, radius: 3, damage: 9999, scorchTicks: 600 },
  hydrogen: { cost: 3000, cooldownTicks: 3600, radius: 5, damage: 9999, scorchTicks: 1200 },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Naval (Phase 2)
// ──────────────────────────────────────────────────────────────────────────

export const SHIPS = {
  destroyer:  { cost: 200, hp: 60,  speed: 0.9, cargo: 0,  attack: 25 },
  battleship: { cost: 500, hp: 160, speed: 0.5, cargo: 40, attack: 60 },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Modificateurs de mode de jeu
// ──────────────────────────────────────────────────────────────────────────

export interface ModeModifiers {
  economyMultiplier: number;
  populationMultiplier: number;
  weaponCooldownMultiplier: number;
}

export const MODE_MODIFIERS: Record<GameMode, ModeModifiers> = {
  [GameMode.Classic]: { economyMultiplier: 1.0, populationMultiplier: 1.0, weaponCooldownMultiplier: 1.0 },
  [GameMode.Fast]:    { economyMultiplier: 2.5, populationMultiplier: 2.0, weaponCooldownMultiplier: 0.4 },
  [GameMode.Custom]:  { economyMultiplier: 1.0, populationMultiplier: 1.0, weaponCooldownMultiplier: 1.0 },
};

// ──────────────────────────────────────────────────────────────────────────
// Conditions de victoire
// ──────────────────────────────────────────────────────────────────────────

export const DOMINATION_WIN_RATIO = 0.7;  // 70 % de la carte ⇒ victoire
export const MAX_PLAYERS = 150;
export const MIN_PLAYERS_TO_START = 1;    // 1 pour tester en solo + bots

// ──────────────────────────────────────────────────────────────────────────
// Palette des nations
// ──────────────────────────────────────────────────────────────────────────

export const PLAYER_COLORS = [
  '#e0533d', '#3d8be0', '#4caf50', '#e0c93d', '#9b59b6',
  '#e07b3d', '#1abc9c', '#e03d8b', '#7f8c8d', '#3dcee0',
  '#c0392b', '#2980b9', '#27ae60', '#f39c12', '#8e44ad',
];

export const OCEAN_COLOR = '#0a1a2a';
export const NEUTRAL_COLOR = '#2b3340';
export const MOUNTAIN_TINT = '#4a4a52';
