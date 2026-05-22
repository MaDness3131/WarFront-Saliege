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
  small:  { w: 640, h: 360 },   // 230 400 cellules
  medium: { w: 1100, h: 620 },  // 682 000 cellules — défaut classic (×3 ancien medium)
  large:  { w: 1500, h: 850 },  // 1 275 000 cellules — gigantesque
} as const;

export const OCEAN_THRESHOLD = 0.42;      // hérité — désormais le générateur
export const MOUNTAIN_THRESHOLD = 0.78;   // utilise son propre seuil interne
export const CELL_SIZE = 3;               // pixels par cellule au zoom 1

// ──────────────────────────────────────────────────────────────────────────
// Joueur — valeurs de départ
// ──────────────────────────────────────────────────────────────────────────

// ─── Valeurs initiales OpenFront, scaled ÷125 (leur human=25_000 → 200) ───
// START_GOLD relevé : les bâtiments coûtent désormais beaucoup plus cher
// (économie rebalancée), il faut donc un coussin de départ pour ne pas
// attendre 30s avant la première ville.
export const START_GOLD = 350;
export const START_POPULATION = 50;
export const START_ARMY = 200;            // OF human=25_000 → 200 (÷125)
export const START_TERRITORY_TROOPS = 10;
export const DEFAULT_ATTACK_RATIO = 0.5;
export const MIN_ATTACK_RATIO = 0.05;
export const MAX_ATTACK_RATIO = 1.0;

/** Multiplicateurs de START_ARMY par tier de bot.
 *  Équilibrage demandé : weak nettement boostés (≈2.7× vs avant), normal
 *  alignés sur ~60% du spawn humain, élites quasi équivalents au joueur.
 *   - weak   : 40% de l'armée du joueur au spawn (était 15% → ×2.7)
 *   - normal : 60% (était 30% → ×2)
 *   - strong : 85% (était 80%, quasi joueur)
 */
export const BOT_START_ARMY_MULT = {
  weak:   0.40,
  normal: 0.60,
  strong: 0.85,
} as const;

/** Probabilités de tier pour les bots spawnés. La somme doit être 1. */
export const BOT_TIER_DISTRIBUTION = {
  weak:   0.65,   // 65% de proies faciles
  normal: 0.25,   // 25% un cran en dessous du joueur
  strong: 0.10,   // 10% d'élites (noms de pays, niveau joueur)
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Économie
// ──────────────────────────────────────────────────────────────────────────

export const GOLD_PER_TERRITORY = 0.012;  // /tick
export const GOLD_PER_CITY_LEVEL = 0.08;
export const GOLD_PER_FACTORY_LEVEL = 0.04;
export const ARMY_UPKEEP_PER_UNIT = 0;
/** Anti-snowball : le revenu est multiplié par ce facteur décroissant. */
export const SNOWBALL_DAMPING = (territoryCount: number) =>
  Math.max(0.3, 1 - territoryCount * 0.001);

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
// OpenFront combat logic — formules portées depuis openfrontio/Config.ts
// (attackLogic, lines 772-857). Constantes adaptées à notre échelle de jeu
// (~3000 troupes max par vague vs leurs centaines de milliers).
// ──────────────────────────────────────────────────────────────────────────

/** Magnitude par terrain — détermine le coût de prise en pertes attaquant.
 *  Source OpenFront : Plains=80, Highland=100, Mountain=120. Divisé par ~20
 *  pour notre échelle (wave troops max ~3k vs leurs 50k+). */
export const OF_MAG = {
  plains:   4,
  highland: 5,
  mountain: 6,
} as const;

/** Vitesse de prise par terrain (tilesPerTickUsed multiplicateur).
 *  Inspiré du wiki OpenFront : Plains +10% speed, Mountain -25% speed. */
export const OF_SPEED = {
  plains:   5.5,
  highland: 5.0,
  mountain: 3.75,
} as const;

/** Defense post : multiplie la magnitude par ×5 et la speed par /×3.
 *  Range OpenFront = 30 tuiles. Scaled à 15 pour notre échelle de map
 *  (1100×620) — proportionnellement équivalent. */
export const OF_DEFENSE_POST_MAG_MULT   = 5;
export const OF_DEFENSE_POST_SPEED_DIV  = 3;
export const OF_DEFENSE_POST_RANGE      = 15;

/** Clamp du ratio défenseur/attaquant pour la perte attaquant primaire.
 *  attT >> defT → ratio = 0.6 (pertes minimes). defT >> attT → ratio = 2. */
export const OF_TROOP_RATIO_MIN = 0.6;
export const OF_TROOP_RATIO_MAX = 2;

/** Pondération des deux termes de perte attaquant : 60% courant + 40% alt. */
export const OF_ATTACKER_LOSS_PRIMARY_WEIGHT = 0.6;
export const OF_ATTACKER_LOSS_ALT_WEIGHT     = 0.4;
/** Multiplicateur global "bonus attaquant" appliqué sur la perte primaire. */
export const OF_ATTACKER_BONUS = 0.8;
/** Multiplicateur sur le terme alt = 1.3 × defenderLoss × (mag/100). */
export const OF_ALT_LOSS_MULT  = 1.3;

/** Quand un joueur humain ou une nation attaque un BOT, la mag est réduite
 *  → on prend les bots plus facilement (×0.7 sur mag). */
export const OF_BOT_DEBUFF = 0.7;

/** Si le défenseur a TRAHI récemment, ses défenses chutent et la prise
 *  s'accélère. Appliqués comme multiplicateurs (1 = pas de malus). */
export const OF_TRAITOR_DEFENSE_DEBUFF = 0.5;
export const OF_TRAITOR_SPEED_DEBUFF   = 0.8;

/** Clamp du ratio défensif → speed (tilesPerTickUsed). 0.2 = floor (1 tuile
 *  prise toutes les 5 ticks min), 1.5 = cap (max 1.5 × speed). */
export const OF_SPEED_RATIO_MIN = 0.2;
export const OF_SPEED_RATIO_MAX = 1.5;

/** Terra Nullius : pertes attaquant = mag / X. Bot = -X plus dur, humain = -X. */
export const OF_TERRA_NULLIUS_LOSS_HUMAN_DIV = 5;
export const OF_TERRA_NULLIUS_LOSS_BOT_DIV   = 10;
/** Vitesse Terra Nullius : (CONST * max(10, speed)) / attackTroops, clampé.
 *  OpenFront CONST=2000 à leur échelle. Notre échelle ÷40 ⇒ 50. */
export const OF_TERRA_NULLIUS_SPEED_CONST = 50;
export const OF_TERRA_NULLIUS_TILES_MIN   = 0.5;
export const OF_TERRA_NULLIUS_TILES_MAX   = 18;

/** Large-empire penalties : empires > THRESHOLD subissent un malus de prise
 *  (rééquilibre anti-snowball OpenFront). Adaptés à notre échelle :
 *  THRESHOLD = 5000 tuiles (plutôt que 100_000 chez eux). */
export const OF_LARGE_EMPIRE_THRESHOLD = 5000;

// ──────────────────────────────────────────────────────────────────────────
// OpenFront population logic — maxTroops + troopIncreaseRate
// ──────────────────────────────────────────────────────────────────────────

/**
 * maxTroops = 2 * (numTiles^EXP * COEFF + FLOOR) + totalCityLevel * CITY_BONUS
 * Source OpenFront : EXP=0.6, COEFF=1000, FLOOR=50_000, CITY_BONUS=250_000.
 * Adapté ÷125 pour notre échelle :
 *   - FLOOR=500 (était 250) — donne de la marge aux bots qui sont à ×0.5
 *     de cap pour qu'ils ne soient pas instantanément max au spawn.
 *   - COEFF=12 (était 8) — récompense plus l'expansion territoriale.
 *   - CITY_BONUS=1000 — chaque ville ajoute 1000 au cap.
 *
 * Exemples : 100 tiles, 0 ville → 1380. 500 tiles, 5 cities → 6804.
 *           1000 tiles, 10 cities → 11512. Cohérent avec START_ARMY=200.
 */
export const OF_MAX_TROOPS_EXP        = 0.6;
export const OF_MAX_TROOPS_COEFF      = 12;
export const OF_MAX_TROOPS_FLOOR      = 500;
/** Bonus de troupes par niveau de ville — augmenté à 2500 (était 1000) :
 *  les villes coûtent désormais 300+ donc elles doivent rapporter plus.
 *  3 villes lvl 1 = +7500 troupes au cap → vraie différence de puissance. */
export const OF_MAX_TROOPS_CITY_BONUS = 2500;

/**
 * Échelle de troupes des bots. Les valeurs ci-dessous représentent
 * DIRECTEMENT la part du maxTroops d'un humain d'empire équivalent —
 * pas de multiplicateur global, c'est plus lisible et plus contrôlable.
 *
 *   weak   : 55% du cap humain — proies notables mais conquérables
 *   normal : 80% — concurrent sérieux (≈ 80% de la croissance joueur)
 *   strong : 95% — élite quasi à l'égal du joueur (95% croissance)
 */
export const OF_BOT_MAX_TROOPS_MULT = 1.0;

/** Multiplicateurs de maxTroops par tier de bot (= ratio direct vs joueur). */
export const BOT_TIER_MAX_TROOPS_MULT = {
  weak:   0.55,
  normal: 0.80,
  strong: 0.95,
} as const;

/**
 * Croissance : toAdd = (BASE + troops^POW / DIV) * (1 - troops / maxTroops).
 * Source OpenFront : BASE=10, POW=0.73, DIV=4 (humans). Bots ×0.5.
 * Notre échelle :
 *   - BASE=1   (10/125≈0.08 puis bumpé à 1 pour garantir min 10 troupes/sec)
 *   - POW=0.73 (identique OF)
 *   - DIV=12   (4×3 — adapte le terme exponentiel à notre échelle)
 *   - BOT_MULT=0.75 (vs 0.5 OF, augmenté car nos bots sont moins agressifs)
 *
 * Exemples (50% fill) :
 *   200 troops, max 1000 → 1.4/tick = 14/sec
 *   3000 troops, max 10k → 13/tick = 130/sec
 */
export const OF_GROWTH_BASE     = 1;
export const OF_GROWTH_POW      = 0.73;
export const OF_GROWTH_DIV      = 12;
/** Croissance bot — sans multiplicateur global, le tier mult ci-dessous
 *  représente DIRECTEMENT la fraction de croissance vs joueur. */
export const OF_BOT_GROWTH_MULT = 1.0;

/** Croissance par tier de bot (= fraction du taux de croissance humain).
 *   weak   : 55% — boostés vs avant pour rester une vraie menace
 *   normal : 80% — exactement 80% du joueur (spec demandée)
 *   strong : 95% — quasi égal (spec demandée) */
export const BOT_TIER_GROWTH_MULT = {
  weak:   0.55,
  normal: 0.80,
  strong: 0.95,
} as const;

// ──────────────────────────────────────────────────────────────────────────
// OpenFront economy — taux fixe de gold + bonus trade
// ──────────────────────────────────────────────────────────────────────────

/** Gold rate fixe (revenu passif sans bâtiment).
 *  Volontairement bas : on veut que CONSTRUIRE soit la vraie source de
 *  richesse. Sans usine/ville, on accumule lentement.
 *  Humain : 1.2/tick = 12 gold/sec. Bot : 0.6/tick = 6 gold/sec.
 *  Première ville (300 or) en ~25 sec si on attend passivement. */
export const OF_GOLD_RATE_HUMAN = 1.2;
export const OF_GOLD_RATE_BOT   = 0.6;

// ──────────────────────────────────────────────────────────────────────────
// Construction
// ──────────────────────────────────────────────────────────────────────────

export interface BuildingSpec {
  baseCost: number;
  costGrowth: number;   // coût pour la nième construction = baseCost * costGrowth^n (OpenFront ×2)
  costCap: number;      // plafond du coût scaledCost — OpenFront capped
  buildTicks: number;
  maxLevel: number;
}

/**
 * Coûts rebalancés : construire coûte cher, mais chaque bâtiment a un
 * impact significatif. Le but est de transformer chaque achat en VRAIE
 * décision stratégique au lieu d'un spam automatique.
 *
 * Échelle :
 *   City   1ère = 300, 2e = 600, 3e = 1200, 4e = 2400, cap 4000
 *   Factory 1ère = 400, 2e = 800, 3e = 1600, 4e = 3200, cap 5000
 *   Port    1ère = 600, 2e = 1080, 3e = 1944, 4e = 3500, cap 4000
 *   DefensePost (n+1) × 200, cap 1200 — abordable, on en veut plusieurs
 *   SAM      (n+1) × 3000, cap 8000 — protection nucléaire, gros invest
 *
 * Impact (voir économie / population) :
 *   - City : +2500 troupes au cap PAR ville (était 1000)
 *   - Factory : +0.15 or/tick par niveau (était 0.05) + booste le trade ×2
 *   - Port : +0.30 or/tick par port (revenu commercial maritime, nouveau)
 *   - DefensePost : aura ×5 mag / ÷3 speed dans rayon 15 (inchangé)
 *   - SAM : intercepte missiles entrants (inchangé)
 */
export const BUILDINGS: Record<Exclude<BuildingType, BuildingType.None>, BuildingSpec> = {
  [BuildingType.City]:        { baseCost: 300,  costGrowth: 2.0, costCap: 4000, buildTicks: 25, maxLevel: 5 },
  [BuildingType.Factory]:     { baseCost: 400,  costGrowth: 2.0, costCap: 5000, buildTicks: 25, maxLevel: 5 },
  [BuildingType.Port]:        { baseCost: 600,  costGrowth: 1.8, costCap: 4000, buildTicks: 60, maxLevel: 3 },
  [BuildingType.DefensePost]: { baseCost: 200,  costGrowth: 1.0, costCap: 1200, buildTicks: 50, maxLevel: 5 },
  [BuildingType.SamLauncher]: { baseCost: 3000, costGrowth: 1.0, costCap: 8000, buildTicks: 300, maxLevel: 2 },
  // Casino : pas cher (100 or) → tout le monde peut s'en payer un tôt,
  // les minijeux PvP deviennent un mécanisme central plutôt qu'un luxe.
  [BuildingType.Casino]:      { baseCost: 100, costGrowth: 1.5, costCap: 800, buildTicks: 40, maxLevel: 3 },
};

/**
 * Calcule le coût effectif d'un bâtiment selon le nombre déjà construits.
 *   - DefensePost / SAM : (count + 1) * baseCost, capped
 *   - City / Factory / Port : baseCost * 2^count, capped
 * Format OpenFront. À utiliser à la fois côté tryBuild ET côté UI.
 */
export function scaledBuildingCost(
  type: Exclude<BuildingType, BuildingType.None>,
  countAlreadyBuilt: number,
): number {
  const spec = BUILDINGS[type];
  let raw: number;
  if (type === BuildingType.DefensePost || type === BuildingType.SamLauncher) {
    raw = (countAlreadyBuilt + 1) * spec.baseCost;
  } else {
    raw = spec.baseCost * Math.pow(spec.costGrowth, countAlreadyBuilt);
  }
  return Math.min(spec.costCap, Math.round(raw));
}

/** Rayon (en tuiles) dans lequel un SAM intercepte les missiles entrants. */
export const SAM_INTERCEPT_RADIUS = 18;
/** Probabilité d'interception (par niveau de SAM, cumulatif). */
export const SAM_INTERCEPT_CHANCE_PER_LEVEL = 0.4;

// ──────────────────────────────────────────────────────────────────────────
// Casino — Blackjack
// ──────────────────────────────────────────────────────────────────────────

/** Mise nominale en or : 50 % de l'or du joueur. Affichée sur la table
 *  mais NON débitée — la partie est purement symbolique côté éco. */
export const BLACKJACK_GOLD_BET_FRACTION = 0.50;
/** Mise nominale en troupes : 30 % de l'armée. NON débitée non plus. */
export const BLACKJACK_TROOPS_BET_FRACTION = 0.30;
/** Délai (ticks) entre deux décisions du bot pendant le blackjack —
 *  bumpé à 12 (1.2 s) pour qu'on voie chaque carte arriver. */
export const BLACKJACK_BOT_THINK_TICKS = 12;
/** Délai (ticks) entre deux cartes piochées par le croupier. Légèrement
 *  plus long que le bot pour ajouter de la tension à la résolution. */
export const BLACKJACK_DEALER_DRAW_TICKS = 14;
/** Cooldown entre deux duels blackjack pour un même joueur (1 minute). */
export const BLACKJACK_COOLDOWN_TICKS = 600;
/** Bonus de force (×) octroyé au gagnant CONTRE le perdant uniquement.
 *  Appliqué dans le calcul de combat (defenderLoss) tant que le perdant
 *  est vivant. */
export const BLACKJACK_VICTORY_DAMAGE_BONUS = 0.20;
/** Timeout total d'un duel (ticks) — anti-zombie si quelqu'un se déconnecte. */
export const BLACKJACK_TIMEOUT_TICKS = 1800;
/** Limite de rounds (replays) avant qu'on déclare un match nul forcé. */
export const BLACKJACK_MAX_ROUNDS = 5;
/** Délai d'affichage du résultat final avant fermeture (ticks). */
export const BLACKJACK_RESULT_HOLD_TICKS = 40;

// ──────────────────────────────────────────────────────────────────────────
// Roulette — European wheel (37 cases : 0 + 1-36).
// ──────────────────────────────────────────────────────────────────────────

/** Numéros rouges (European roulette). Le reste 1-36 = noirs, 0 = vert. */
export const ROULETTE_RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

/** Multiplicateurs de gain par type de pari (× mise). Si tu mises 100 sur
 *  rouge et tu gagnes, tu reçois 200 (200 = 2× ta mise). */
export const ROULETTE_PAYOUTS = {
  red:    2,   // rouge   (P=18/37)
  black:  2,   // noir    (P=18/37)
  even:   2,   // pair    (P=18/37, 0 ne compte pas)
  odd:    2,   // impair  (P=18/37)
  low:    2,   // 1-18    (P=18/37)
  high:   2,   // 19-36   (P=18/37)
  number: 36,  // plein numéro (P=1/37)
} as const;

/** Mise minimale et maximale (or). */
export const ROULETTE_MIN_BET = 50;
export const ROULETTE_MAX_BET = 50000;

// ──────────────────────────────────────────────────────────────────────────
// Slots — Machine à sous 3 rouleaux × 5 symboles
// ──────────────────────────────────────────────────────────────────────────

/** Coût fixe d'un pull. */
export const SLOTS_BET_COST = 100;

/** Symboles : 0=Cherry, 1=City, 2=Factory, 3=Diamond, 4=Wild.
 *  Pondération par rouleau (somme arbitraire ; les ratios comptent). */
export const SLOTS_REEL_WEIGHTS = [40, 25, 20, 10, 5] as const;

/** Gains pour 3 symboles identiques alignés. Indexé par symbole.
 *  Espérance ≈ 92 or par pull → house edge ~8 %, conforme à un slot
 *  de casino réaliste. */
export const SLOTS_PAYOUTS = [
  300,    // 3 Cherries
  1500,   // 3 Cities
  3500,   // 3 Factories
  15000,  // 3 Diamonds
  50000,  // 3 Wilds (jackpot)
] as const;


// ──────────────────────────────────────────────────────────────────────────
// Armes (Phase 3)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Arsenal — trois paliers (le missile tactique a été retiré du jeu) :
 *   nuke     : stratégique, rayon 9.
 *   hydrogen : apocalyptique, rayon 23.
 *   tsar     : Tsar Bomba, raseur de continent. Très cher, cooldown long,
 *              rayon énorme (60), flash écran, champignon spectaculaire.
 *              Référence : la vraie Tsar Bomba (58 Mt) avait un rayon
 *              de destruction de ~35 km — on lui donne ~60 cellules ici,
 *              soit > 1/4 de la carte standard.
 *
 * scorchTicks reste défini pour compat mais n'est plus utilisé : le
 * cratère est désormais de la terre neutre reprenable immédiatement
 * (cf. weapons.ts → detonate). Le champ subsiste pour les imports tiers.
 */
export const WEAPONS = {
  nuke:     { cost: 6000,   cooldownTicks: 0,    radius: 9,  damage: 9999, flightTicks: 36, scorchTicks: 0 },
  hydrogen: { cost: 40000,  cooldownTicks: 3600, radius: 23, damage: 9999, flightTicks: 48, scorchTicks: 0 },
  tsar:     { cost: 200000, cooldownTicks: 9000, radius: 60, damage: 9999, flightTicks: 90, scorchTicks: 0 },
} as const;

/** Délai entre la sirène et l'impact d'un missile nucléaire (ticks). */
export const NUKE_SIREN_LEAD_TICKS = 10;
/** Le terrain brûlé ne peut être ni traversé ni cible d'attaque. */
export const SCORCH_DARKEN_ALPHA = 0.55;

// ──────────────────────────────────────────────────────────────────────────
// Naval (Phase 2)
// ──────────────────────────────────────────────────────────────────────────

export const SHIPS = {
  destroyer:  { cost: 200, hp: 60,  speed: 0.36, cargo: 0,  attack: 25, range: 3.5, fireCooldown: 12 },
  battleship: { cost: 500, hp: 160, speed: 0.20, cargo: 40, attack: 60, range: 4.5, fireCooldown: 20 },
} as const;

/** Distance (cellules) en dessous de laquelle on considère qu'un navire est arrivé. */
export const SHIP_ARRIVAL_EPSILON = 0.4;
/** Distance max à un port allié pour pouvoir embarquer. */
export const SHIP_BOARDING_RANGE = 1.2;
/** Coût en troupes d'un embarquement (extrait de l'armée terrestre). */
export const SHIP_BOARDING_TROOP_COST = 1;

// ──────────────────────────────────────────────────────────────────────────
// Diplomatie (Phase 2)
// ──────────────────────────────────────────────────────────────────────────

/** Durée de validité d'une proposition d'alliance en ticks (≈ 30 s à 10 Hz). */
export const ALLIANCE_PROPOSAL_TTL_TICKS = 300;
/** Pénalité de score immédiate appliquée à un traître. */
export const ALLIANCE_BETRAYAL_SCORE_MALUS = 80;
/** Cooldown avant qu'un traître puisse reproposer une alliance. */
export const ALLIANCE_BETRAYAL_COOLDOWN_TICKS = 600;

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
  '#d35400', '#16a085', '#2c3e50', '#ecf0f1', '#34495e',
  '#e74c3c', '#3498db', '#1f618d', '#117a65', '#229954',
  '#239b56', '#28b463', '#52be80', '#7d6608', '#9a7d0a',
  '#b7950b', '#d4ac0d', '#f1c40f', '#cb4335', '#a93226',
  '#922b21', '#7b241c', '#641e16', '#76448a', '#5b2c6f',
  '#4a235a', '#21618c', '#1a5276', '#154360', '#7e5109',
  '#7d3c98', '#6c3483', '#5b2c6f', '#4a235a', '#2e86c1',
  '#85c1e9', '#5dade2', '#3498db', '#2874a6', '#1b4f72',
  '#a3e4d7', '#76d7c4', '#48c9b0', '#1abc9c', '#148f77',
  '#117864', '#0e6251', '#abebc6', '#7dcea0', '#52be80',
  '#27ae60', '#1e8449', '#196f3d', '#145a32', '#f9e79f',
  '#f7dc6f', '#f4d03f', '#f1c40f', '#d4ac0d', '#9a7d0a',
  '#7d6608', '#fad7a0', '#f8c471', '#f5b041', '#f39c12',
  '#d68910', '#b9770e', '#9c640c', '#7e5109', '#edbb99',
  '#e59866', '#dc7633', '#d35400', '#ba4a00', '#a04000',
  '#873600', '#6e2c00', '#d7bde2', '#bb8fce', '#a569bd',
  '#8e44ad', '#76448a', '#6c3483', '#5b2c6f', '#4a235a',
];

export const OCEAN_COLOR = '#0a1a2a';
export const NEUTRAL_COLOR = '#2b3340';
export const MOUNTAIN_TINT = '#4a4a52';
export const SCORCH_COLOR = '#1a0d08';

// ──────────────────────────────────────────────────────────────────────────
// Mode personnalisé (Phase 4)
// ──────────────────────────────────────────────────────────────────────────

import type { CustomOptions, SkinDef } from './types';

export const DEFAULT_CUSTOM_OPTIONS: CustomOptions = {
  mapSize: 'medium',
  speed: 1.0,
  botCount: 150,
  botDifficulty: 'normal',
  weaponsEnabled: true,
  alliancesEnabled: true,
  navalEnabled: true,
  adminMode: false,
};

/**
 * Profils d'IA — chaque champ contrôle un aspect du comportement :
 *  - reactionTicks : cadence de décision (plus bas = plus réactif)
 *  - aggressionMin/Max : variance par bot (ratio d'attaque, prise de risque)
 *  - allianceChance : probabilité d'accepter/proposer une alliance
 *  - useWeapons : autorise missiles/nukes/hydrogène
 *  - focusTicks : durée minimale (ticks) où le bot garde la même cible
 *                 → évite l'AI papillon qui change de cible à chaque tick
 *  - threatReact : réactivité défensive (0..1) — quand attaqué, le bot
 *                 baisse son attackRatio et construit des DefensePost
 *  - nukeOnCapitalChance : prob. d'utiliser nuke/H sur une grosse cible
 *  - allianceBetrayPower : si nous sommes ≥ ce ratio plus forts qu'un allié,
 *                 on rompt pour le gober (1.5 = on doit faire 50% de plus)
 */
export const BOT_DIFFICULTY = {
  easy:       { reactionTicks: 18, aggressionMin: 0.25, aggressionMax: 0.55, allianceChance: 0.12, useWeapons: false, focusTicks: 8,  threatReact: 0.25, nukeOnCapitalChance: 0.15, allianceBetrayPower: 99 },
  normal:     { reactionTicks: 10, aggressionMin: 0.45, aggressionMax: 0.80, allianceChance: 0.35, useWeapons: true,  focusTicks: 14, threatReact: 0.50, nukeOnCapitalChance: 0.35, allianceBetrayPower: 2.5 },
  hard:       { reactionTicks: 6,  aggressionMin: 0.65, aggressionMax: 0.98, allianceChance: 0.55, useWeapons: true,  focusTicks: 20, threatReact: 0.75, nukeOnCapitalChance: 0.55, allianceBetrayPower: 1.8 },
  impossible: { reactionTicks: 3,  aggressionMin: 0.85, aggressionMax: 1.00, allianceChance: 0.75, useWeapons: true,  focusTicks: 26, threatReact: 0.95, nukeOnCapitalChance: 0.75, allianceBetrayPower: 1.4 },
} as const;

// ──────────────────────────────────────────────────────────────────────────
// Skins / cosmétiques (Phase 4)
// ──────────────────────────────────────────────────────────────────────────

export const SKINS: SkinDef[] = [
  { id: 'default',  name: 'Standard',    color: null,      borderStyle: 'solid',  emblem: '',  unlockLevel: 0 },
  { id: 'crimson',  name: 'Cramoisi',    color: '#c0392b', borderStyle: 'solid',  emblem: '★', unlockLevel: 0 },
  { id: 'azure',    name: 'Azur',        color: '#2980b9', borderStyle: 'solid',  emblem: '◆', unlockLevel: 0 },
  { id: 'jade',     name: 'Jade',        color: '#16a085', borderStyle: 'solid',  emblem: '✦', unlockLevel: 0 },
  { id: 'iron',     name: 'Fer',         color: '#7f8c8d', borderStyle: 'double', emblem: '✠', unlockLevel: 2 },
  { id: 'gold',     name: 'Or impérial', color: '#f1c40f', borderStyle: 'double', emblem: '✪', unlockLevel: 5 },
  { id: 'shadow',   name: 'Ombre',       color: '#2c2c34', borderStyle: 'dashed', emblem: '☠', unlockLevel: 10 },
  { id: 'plasma',   name: 'Plasma',      color: '#9b59b6', borderStyle: 'dashed', emblem: '✸', unlockLevel: 15 },
];

// ──────────────────────────────────────────────────────────────────────────
// Profil local (Phase 4) — clés localStorage
// ──────────────────────────────────────────────────────────────────────────

export const PROFILE_STORAGE_KEY = 'warfront.profile.v1';
/** Elo gagné/perdu par partie selon résultat + adversaire moyen. */
export const ELO_K_FACTOR = 24;
/** XP nécessaire pour passer du niveau N à N+1 (croissance quadratique). */
export const XP_PER_LEVEL = (level: number) => 100 + level * level * 25;
