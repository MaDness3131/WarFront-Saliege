/**
 * BotAI v2 — IA stratégique adaptative.
 * ---------------------------------------------------------------------------
 * Objectifs vs v1 :
 *  - **Focus-fire** : un bot garde la même cible pendant `focusTicks` au lieu
 *    de papillonner entre toutes les frontières (cause majeure de bots nuls).
 *  - **Réaction aux menaces** : si `lastAttackedBy` ou si on perd des
 *    territoires (peak - current > 5), on baisse l'attackRatio, on construit
 *    un DefensePost en frontière, et on contre-attaque l'agresseur.
 *  - **Construction stratégique** : DefensePost sur tuiles frontalières,
 *    SAM si la map a des armes actives, Factory près des villes, Cité à
 *    l'intérieur (loin du front).
 *  - **Alliances proactives** : on propose à un voisin de taille similaire
 *    (pas plus faible — il ne servirait à rien), et on rompt quand on est
 *    `allianceBetrayPower×` plus fort que le partenaire.
 *  - **Armes ciblées** : nuke/hydrogène sur capitales (densité bâtiments
 *    élevée), missile sur concentration de troupes.
 *  - **Difficulté impossible** : nouveau tier extrême.
 *
 * Performance : on reste sur l'index playerTiles + stride sampling.
 * Coût par tick : O(myTiles / stride) avec stride adaptatif.
 *
 * Décisions étalées : un seul groupe de bots décide à chaque tick (modulo).
 */

import { TerrainType, BuildingType, ShipType } from '@shared/types';
import { scaledBuildingCost, TICK_RATE, WEAPONS, BOT_DIFFICULTY } from '@shared/constants';
import { LocalGameState, LocalPlayer, LocalTerritory } from '../state';
import { requestAttack } from './military';
import { proposeAlliance, acceptProposal, breakAlliance } from './diplomacy';
import { commissionShip, orderLand } from './naval';
import { launchWeapon } from './weapons';
import { Emitter } from '../events';

interface BotMemory {
  cooldownTicks: number;
  aggression: number;
  pendingNuke: number;
  difficulty: keyof typeof BOT_DIFFICULTY;
  slot: number; // tick % BOT_SLOTS — étale les décisions

  // ─── Stratégie ────────────────────────────────────────────────────────
  /** Cible courante (id territoire) — on s'y tient `focusTargetTicks` ticks. */
  focusTarget: number | null;
  focusTargetTicks: number;
  /** Dernière vraie agression subie — devient une cible de revenge prioritaire. */
  revengeAgainst: string | null;
  revengeUntilTick: number;
  /** Nombre de territoires au dernier check — sert à détecter qu'on perd du terrain. */
  lastTerritoryCount: number;
  /** Ticks où on a été en perte de territoires (déclenche mode défensif). */
  beingPressuredUntil: number;
  /** Quelqu'un a lancé une arme près de nous → SAM prioritaire. */
  needsSamUntil: number;
}

const memory = new Map<string, BotMemory>();
const BOT_SLOTS = 10; // 10 sous-groupes, 1 traité par tick → tour complet en 1 sec

export function resetBotMemory() { memory.clear(); }

export function tickBots(
  state: LocalGameState,
  emit: Emitter,
  defaultDifficulty: keyof typeof BOT_DIFFICULTY,
  tryBuildFn: (playerId: string, targetId: number, b: BuildingType) => void,
) {
  const currentSlot = state.tick % BOT_SLOTS;
  let slotCounter = 0;

  for (const p of state.players.values()) {
    if (!p.isBot || !p.alive) continue;

    let mem = memory.get(p.id);
    if (!mem) {
      // Les bots de tier 'strong' adoptent une difficulté supérieure interne :
      //   weak    → easy
      //   normal  → defaultDifficulty
      //   strong  → un cran au-dessus (max impossible)
      const tierBump: Record<LocalPlayer['tier'], number> = { weak: -1, normal: 0, strong: 1 };
      const ladder: (keyof typeof BOT_DIFFICULTY)[] = ['easy', 'normal', 'hard', 'impossible'];
      const baseIdx = ladder.indexOf(defaultDifficulty);
      const adjIdx = Math.min(ladder.length - 1, Math.max(0, baseIdx + tierBump[p.tier]));
      const personalDiff = ladder[adjIdx];
      const diff = BOT_DIFFICULTY[personalDiff];

      mem = {
        cooldownTicks: 0,
        aggression: diff.aggressionMin + Math.random() * (diff.aggressionMax - diff.aggressionMin),
        pendingNuke: TICK_RATE * (40 + Math.random() * 60),
        difficulty: personalDiff,
        slot: slotCounter++ % BOT_SLOTS,
        focusTarget: null,
        focusTargetTicks: 0,
        revengeAgainst: null,
        revengeUntilTick: 0,
        lastTerritoryCount: p.territoryCount,
        beingPressuredUntil: 0,
        needsSamUntil: 0,
      };
      memory.set(p.id, mem);
    }

    // Tick "passif" : même hors créneau, on récupère lastAttackedBy → revenge.
    if (p.lastAttackedBy && p.lastAttackedBy !== mem.revengeAgainst) {
      mem.revengeAgainst = p.lastAttackedBy;
      mem.revengeUntilTick = state.tick + TICK_RATE * 30; // rancune ~30 sec
    }

    // ── Placement prioritaire du Casino (premiers 20 secondes) ──────────
    // Spec utilisateur : TOUS les bots posent leur casino dans les 20s.
    // On s'exécute hors slot pour ne pas dépendre de la dispatch round-robin.
    // Avec buildTicks=40 (4s) + un placement au plus tard à 15s, tous les
    // casinos sont opérationnels avant la limite des 20s.
    if (state.tick < TICK_RATE * 15 && p.casinoCount === 0) {
      const tiles = state.playerTiles.get(p.id);
      if (tiles && tiles.size > 0 && !hasCasinoInProgress(state, tiles)) {
        const tile = pickCasinoTile(state, tiles);
        if (tile !== null && p.gold >= scaledBuildingCost(BuildingType.Casino, 0)) {
          tryBuildFn(p.id, tile, BuildingType.Casino);
        }
      }
    }

    // Seul le slot du tick courant agit cette frame.
    if (mem.slot !== currentSlot) continue;

    const diff = BOT_DIFFICULTY[mem.difficulty];

    // ── Auto-accept alliances reçues ────────────────────────────────────
    // On accepte plus volontiers quand on est faible ou pressé.
    for (const prop of state.proposals.values()) {
      if (prop.to !== p.id) continue;
      const proposer = state.players.get(prop.from);
      let chance: number = diff.allianceChance;
      // Sous pression → on accepte presque toujours (besoin de paix).
      if (state.tick < mem.beingPressuredUntil) chance = Math.min(1, chance + 0.4);
      // Le proposant est trop faible (< 50% de nous) → on refuse (inutile).
      if (proposer && proposer.territoryCount * 2 < p.territoryCount) chance *= 0.2;
      if (Math.random() < chance) {
        acceptProposal(state, p.id, prop.id, emit);
      }
    }

    if (mem.cooldownTicks > 0) {
      mem.cooldownTicks -= state.speedMultiplier * BOT_SLOTS;
      continue;
    }

    // ── Détection de pression : on perd-t-il du terrain ? ───────────────
    const lostThisRound = mem.lastTerritoryCount - p.territoryCount;
    mem.lastTerritoryCount = p.territoryCount;
    if (lostThisRound >= 3) {
      mem.beingPressuredUntil = state.tick + TICK_RATE * 15;
    }
    const pressured = state.tick < mem.beingPressuredUntil;

    // Rush initial : on accélère franchement la phase de remplissage.
    const earlyRush = p.territoryCount < 80;
    // Phases : early(<80), mid(<300), late(>=300)
    const phase: 'early' | 'mid' | 'late' = earlyRush ? 'early' : (p.territoryCount < 300 ? 'mid' : 'late');

    const baseCooldown = Math.round(diff.reactionTicks * (2 - mem.aggression));
    mem.cooldownTicks = earlyRush ? Math.max(1, Math.floor(baseCooldown * 0.25)) : baseCooldown;

    const myTiles = state.playerTiles.get(p.id);
    if (!myTiles || myTiles.size === 0) continue;

    // ── Attack ratio adaptatif ──────────────────────────────────────────
    // - rush  : 0.80 (vide tout pour expansion)
    // - mid   : 0.55-0.85 selon agression
    // - late  : 0.50-0.75 (on garde des troupes pour défendre)
    // - sous pression : on baisse encore (threatReact module la défensive)
    let ratio: number;
    if (phase === 'early') ratio = 0.80;
    else if (phase === 'mid') ratio = 0.55 + mem.aggression * 0.30;
    else ratio = 0.50 + mem.aggression * 0.25;
    if (pressured) ratio = Math.max(0.30, ratio - diff.threatReact * 0.35);
    p.attackRatio = ratio;

    // ── 1. Construction ─────────────────────────────────────────────────
    // En rush on évite (gaspille de l'or), sauf urgence défensive.
    if (!earlyRush || pressured) {
      if (tryBotBuild(state, p, myTiles, mem, pressured, tryBuildFn)) continue;
    }

    // ── 2. Alliance — proposition proactive ─────────────────────────────
    // On propose surtout quand on est pressé OU quand un voisin est plus fort.
    if (
      !earlyRush &&
      state.enabled.alliances &&
      !p.allianceId &&
      state.tick >= p.diplomacyLockUntil &&
      Math.random() < diff.allianceChance * (pressured ? 0.8 : 0.35)
    ) {
      const candidate = findAllianceCandidate(state, p, myTiles, pressured);
      if (candidate) { proposeAlliance(state, p.id, candidate, emit); continue; }
    }

    // ── 2b. Alliance — trahison opportuniste ────────────────────────────
    // Si on est `allianceBetrayPower×` plus fort que notre allié, on rompt.
    if (
      p.allianceId &&
      diff.allianceBetrayPower < 99 &&
      state.tick >= p.diplomacyLockUntil &&
      Math.random() < 0.08 // décision rare (sinon ils trahissent en boucle)
    ) {
      const al = state.alliances.get(p.allianceId);
      if (al) {
        let weakestAlly: LocalPlayer | null = null;
        for (const mid of al.members) {
          if (mid === p.id) continue;
          const ally = state.players.get(mid);
          if (ally && ally.alive && (!weakestAlly || ally.territoryCount < weakestAlly.territoryCount)) {
            weakestAlly = ally;
          }
        }
        if (weakestAlly && p.territoryCount > weakestAlly.territoryCount * diff.allianceBetrayPower) {
          breakAlliance(state, p.id, p.allianceId, emit);
          // On ne `continue` pas — on en profite pour attaquer dans le même tick.
        }
      }
    }

    // ── 3. Armes ────────────────────────────────────────────────────────
    // Le missile a été retiré : on ne tire qu'à partir de la nuke (6000 or).
    if (state.enabled.weapons && diff.useWeapons && p.gold > WEAPONS.nuke.cost) {
      mem.pendingNuke -= state.speedMultiplier * BOT_SLOTS;
      if (mem.pendingNuke <= 0 && p.cooldowns.nuke <= 0) {
        const juicy = findJuicyEnemyTarget(state, p, myTiles, mem);
        if (juicy !== null) {
          // Échelle des armes : tsar > hydrogène > nuke.
          // Tsar Bomba : ultra rare, réservée aux bots élites avec fortune.
          let kind: 'nuke' | 'hydrogen' | 'tsar' = 'nuke';
          if (p.gold > WEAPONS.tsar.cost && p.cooldowns.tsar <= 0
              && Math.random() < diff.nukeOnCapitalChance * 0.15) {
            kind = 'tsar';
          } else if (p.gold > WEAPONS.hydrogen.cost && p.cooldowns.hydrogen <= 0
              && Math.random() < diff.nukeOnCapitalChance * 0.5) {
            kind = 'hydrogen';
          }
          launchWeapon(state, p.id, juicy, kind, emit);
          mem.pendingNuke = TICK_RATE * (60 + Math.random() * 60);
          continue;
        }
      }
    }

    // ── 4. Naval ────────────────────────────────────────────────────────
    if (state.enabled.naval && diff.useWeapons) {
      let myActiveShips = 0;
      let availableTroopship: any = null;
      for (const s of state.ships.values()) {
        if (s.owner !== p.id) continue;
        if (s.hp <= 0) continue;
        myActiveShips++;
        if (s.type === ShipType.Battleship && s.cargo > 0 && s.landTargetId === null) {
          availableTroopship = s;
        }
      }
      const landing = (myActiveShips < 2 || availableTroopship) ? findOverseaLanding(state, p.id, myTiles) : null;
      if (landing !== null) {
        if (availableTroopship) {
          orderLand(state, p.id, availableTroopship.id, landing);
          continue;
        }
        const port = findIdlePort(state, p.id, myTiles);
        if (port !== null && p.gold > 600 && myActiveShips < 2 && Math.random() < 0.15) {
          commissionShip(state, p.id, port, ShipType.Battleship, emit);
          continue;
        }
      }
    }

    // ── 5. Attaque — avec focus-fire ────────────────────────────────────
    // On garde la même cible tant que `focusTargetTicks > 0` et qu'elle
    // est encore une cible valide (existe + pas à nous + pas alliée).
    let target: number | null = null;
    if (mem.focusTarget !== null && mem.focusTargetTicks > 0) {
      const cur = state.territoryById.get(mem.focusTarget);
      if (cur && cur.owner !== p.id && !isAlly(state, p, cur.owner)) {
        // Vérifie qu'il existe encore une de nos tuiles adjacente, sinon on switch.
        let adjacent = false;
        for (const nid of cur.neighbors) {
          const n = state.territoryById.get(nid);
          if (n && n.owner === p.id) { adjacent = true; break; }
        }
        if (adjacent) {
          target = mem.focusTarget;
          mem.focusTargetTicks--;
        }
      }
    }
    if (target === null) {
      target = pickWeakestFrontier(state, p, myTiles, mem);
      if (target !== null) {
        mem.focusTarget = target;
        mem.focusTargetTicks = diff.focusTicks;
      }
    }
    if (target !== null) requestAttack(state, p.id, target);
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers — opèrent sur l'index playerTiles, pas sur state.territories.
// ────────────────────────────────────────────────────────────────────────────

const MIN_BUILDING_SPACING = 6;

function isAlly(state: LocalGameState, me: LocalPlayer, otherId: string | null): boolean {
  if (!otherId || !me.allianceId) return false;
  const al = state.alliances.get(me.allianceId);
  return !!al && al.members.includes(otherId);
}

/**
 * Construction stratégique :
 *  - PRIORITÉ 1 (urgence) : DefensePost sur tuile frontalière si sous pression
 *    OU si beaucoup de tuiles capturées sans défense.
 *  - PRIORITÉ 2 : SAM si on a été menacé par des armes récemment.
 *  - PRIORITÉ 3 : Port si on est insulaire / côtier et qu'on en manque.
 *  - PRIORITÉ 4 : équilibre Factory/City (1 usine pour 2 villes), villes
 *    placées à l'intérieur (pas en frontière → exposées).
 */
function tryBotBuild(
  state: LocalGameState,
  p: LocalPlayer,
  myTiles: Set<number>,
  mem: BotMemory,
  pressured: boolean,
  tryBuildFn: (playerId: string, targetId: number, b: BuildingType) => void,
): boolean {
  // Capacité globale — plus de territoires = plus de bâtiments autorisés.
  const totalBuildings = p.cityCount + p.factoryCount + p.portCount + p.defenseCount + p.samCount;
  const cap = Math.floor(p.territoryCount / 10) + 3;
  if (totalBuildings >= cap) return false;

  // ── DefensePost : urgence ou frontline non protégée ─────────────────
  // Si on est sous pression OU si on a moins d'1 defense pour 60 tuiles.
  const wantsDefense = pressured || (p.defenseCount * 60 < p.territoryCount && p.territoryCount > 50);
  if (wantsDefense) {
    const defCost = scaledBuildingCost(BuildingType.DefensePost, p.defenseCount);
    if (p.gold >= defCost) {
      const tile = findFrontierTileForBuilding(state, p, myTiles);
      if (tile !== null) {
        tryBuildFn(p.id, tile, BuildingType.DefensePost);
        return true;
      }
    }
  }

  // ── SAM : on en construit si menace d'armes ─────────────────────────
  if (state.enabled.weapons && state.tick < mem.needsSamUntil && p.samCount < 3) {
    const samCost = scaledBuildingCost(BuildingType.SamLauncher, p.samCount);
    if (p.gold >= samCost) {
      const tile = findInteriorTileForBuilding(state, p, myTiles);
      if (tile !== null) {
        tryBuildFn(p.id, tile, BuildingType.SamLauncher);
        return true;
      }
    }
  }

  // ── Décide entre Factory / City / Port ──────────────────────────────
  // Affordabilité : test sur le moins cher entre Factory et City — on
  // ne stoppe pas tout si la cité coûte trop cher mais l'usine non.
  const cityCost = scaledBuildingCost(BuildingType.City, p.cityCount);
  const factoryCost = scaledBuildingCost(BuildingType.Factory, p.factoryCount);
  const minEco = Math.min(cityCost, factoryCost);
  if (p.gold < minEco) return false;

  // Probabilité de construction : si on a beaucoup d'or, on construit
  // toujours ; sinon on attend (variance évite le spam d'un seul coup).
  const goldBuffer = p.gold / Math.max(1, minEco);
  if (goldBuffer < 1.3 && Math.random() > 0.55) return false;

  // Choisit le type recherché : Factory si déséquilibre, sinon Cité.
  // Casino : une fois qu'on a une base économique (≥ 1 ville + 1 usine),
  // un bot sur deux investit dans un casino pour permettre les duels PvP
  // (le joueur humain peut alors le défier). On en construit max 1.
  let target: BuildingType;
  let pickCost: number;
  const casinoCost = scaledBuildingCost(BuildingType.Casino, p.casinoCount);
  if (p.casinoCount === 0 && p.cityCount >= 1 && p.factoryCount >= 1
      && p.gold >= casinoCost && Math.random() < 0.45) {
    target = BuildingType.Casino;
    pickCost = casinoCost;
  } else if (p.factoryCount * 2 < p.cityCount) {
    target = BuildingType.Factory;
    pickCost = factoryCost;
  } else if (state.enabled.naval && p.portCount < Math.floor(p.territoryCount / 60) + (p.portCount === 0 ? 1 : 0)) {
    target = BuildingType.Port;
    pickCost = scaledBuildingCost(BuildingType.Port, p.portCount);
  } else {
    target = BuildingType.City;
    pickCost = cityCost;
  }
  if (p.gold < pickCost) return false;

  // Port : tuile côtière. Factory/City : tuile intérieure (loin des frontières).
  let chosen: number | null;
  if (target === BuildingType.Port) {
    chosen = findCoastTileForBuilding(state, p, myTiles);
  } else {
    chosen = findInteriorTileForBuilding(state, p, myTiles);
  }
  if (chosen === null) return false;

  tryBuildFn(p.id, chosen, target);
  return true;
}

/** Vrai si la tuile (x,y) a au moins un voisin direct non-ami → frontière. */
function tileIsFrontier(state: LocalGameState, owner: string, t: LocalTerritory, allianceMembers: Set<string>): boolean {
  for (const nid of t.neighbors) {
    const n = state.territoryById.get(nid);
    if (!n) continue;
    if (n.terrain === TerrainType.Ocean) continue;
    if (n.owner === owner) continue;
    if (n.owner && allianceMembers.has(n.owner)) continue;
    return true;
  }
  return false;
}

function getAllianceMembers(state: LocalGameState, p: LocalPlayer): Set<string> {
  const s = new Set<string>();
  if (p.allianceId) {
    const al = state.alliances.get(p.allianceId);
    if (al) for (const m of al.members) s.add(m);
  }
  return s;
}

function findFrontierTileForBuilding(state: LocalGameState, p: LocalPlayer, myTiles: Set<number>): number | null {
  const allies = getAllianceMembers(state, p);
  const samples = Math.min(400, myTiles.size);
  const stride = Math.max(1, Math.floor(myTiles.size / samples));
  let i = 0;
  for (const id of myTiles) {
    if (i++ % stride !== 0) continue;
    const t = state.territoryById.get(id);
    if (!t || t.building !== BuildingType.None || t.buildProgress > 0) continue;
    if (t.terrain === TerrainType.Ocean || t.terrain === TerrainType.Mountain) continue;
    if (!tileIsFrontier(state, p.id, t, allies)) continue;
    if (hasBuildingNear(state, p.id, t.x, t.y, MIN_BUILDING_SPACING)) continue;
    return id;
  }
  return null;
}

function findInteriorTileForBuilding(state: LocalGameState, p: LocalPlayer, myTiles: Set<number>): number | null {
  const allies = getAllianceMembers(state, p);
  // Premier passage : tuiles strictement intérieures (aucun voisin ennemi).
  const samples = Math.min(400, myTiles.size);
  const stride = Math.max(1, Math.floor(myTiles.size / samples));
  let interior: number | null = null;
  let frontier: number | null = null; // fallback
  let i = 0;
  for (const id of myTiles) {
    if (i++ % stride !== 0) continue;
    const t = state.territoryById.get(id);
    if (!t || t.building !== BuildingType.None || t.buildProgress > 0) continue;
    if (t.terrain === TerrainType.Ocean || t.terrain === TerrainType.Mountain) continue;
    if (hasBuildingNear(state, p.id, t.x, t.y, MIN_BUILDING_SPACING)) continue;
    if (tileIsFrontier(state, p.id, t, allies)) {
      if (frontier === null) frontier = id;
    } else {
      interior = id;
      break;
    }
  }
  return interior ?? frontier;
}

function findCoastTileForBuilding(state: LocalGameState, p: LocalPlayer, myTiles: Set<number>): number | null {
  const samples = Math.min(400, myTiles.size);
  const stride = Math.max(1, Math.floor(myTiles.size / samples));
  let i = 0;
  for (const id of myTiles) {
    if (i++ % stride !== 0) continue;
    const t = state.territoryById.get(id);
    if (!t || t.building !== BuildingType.None || t.buildProgress > 0) continue;
    if (t.terrain !== TerrainType.Coast) continue;
    if (hasBuildingNear(state, p.id, t.x, t.y, MIN_BUILDING_SPACING)) continue;
    return id;
  }
  return null;
}

/** Vrai si l'une des tuiles de `myTiles` héberge déjà un casino fini OU
 *  en construction. Évite que le bot relance plusieurs placements pendant
 *  le délai entre l'appel à tryBuildFn et le tick suivant. */
function hasCasinoInProgress(state: LocalGameState, myTiles: Set<number>): boolean {
  for (const id of myTiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    if (t.building === BuildingType.Casino) return true;
  }
  return false;
}

/** Choisit une tuile pour poser un casino — n'importe quelle tuile possédée,
 *  sans bâtiment ni chantier, terrain non-océan, non-montagne. Pour ce
 *  placement early-game on prend le PREMIER candidat sans sampling : on
 *  veut juste poser vite, l'emplacement importe peu (la zone est petite). */
function pickCasinoTile(state: LocalGameState, myTiles: Set<number>): number | null {
  for (const id of myTiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    if (t.terrain === TerrainType.Ocean || t.terrain === TerrainType.Mountain) continue;
    if (t.building !== BuildingType.None) continue;
    if (t.buildProgress > 0) continue;
    return id;
  }
  return null;
}

function hasBuildingNear(state: LocalGameState, owner: string, x: number, y: number, radius: number): boolean {
  const w = state.mapWidth;
  for (let dy = -radius; dy <= radius; dy++) {
    const yy = y + dy;
    if (yy < 0 || yy >= state.mapHeight) continue;
    for (let dx = -radius; dx <= radius; dx++) {
      const xx = x + dx;
      if (xx < 0 || xx >= w) continue;
      const t = state.territoryById.get(yy * w + xx);
      if (!t || t.owner !== owner) continue;
      if (t.building > 0 && t.buildingLevel > 0) return true;
      if (t.buildProgress > 0) return true;
    }
  }
  return false;
}

/**
 * Frontière voisine la plus juteuse — score composite :
 *   - faible densité défensive (army/territory du voisin)
 *   - bonus si voisin = revenge target
 *   - bonus si voisin neutre (très juteux, 0 défense)
 *   - bonus si tuile contient un bâtiment (objectif stratégique)
 *   - pénalité si voisin = géant (territoryCount > nous ×2) — évite les
 *     suicides contre des leaders
 *   - bonus terrain : montagne = pénalité (mag×1.5 défense), plaine = neutre
 */
function pickWeakestFrontier(state: LocalGameState, me: LocalPlayer, myTiles: Set<number>, mem: BotMemory): number | null {
  const allies = getAllianceMembers(state, me);
  let best: number | null = null;
  let bestScore = -Infinity;
  const seen = new Set<number>();
  const samples = Math.min(500, myTiles.size);
  const stride = Math.max(1, Math.floor(myTiles.size / samples));
  let i = 0;
  const revengeActive = mem.revengeAgainst !== null && state.tick < mem.revengeUntilTick;

  for (const id of myTiles) {
    if (i++ % stride !== 0) continue;
    const t = state.territoryById.get(id);
    if (!t) continue;
    for (const nid of t.neighbors) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      const n = state.territoryById.get(nid);
      if (!n || n.terrain === TerrainType.Ocean) continue;
      if (n.owner === me.id) continue;
      if (n.owner && allies.has(n.owner)) continue;
      // Cratères : conquérables — pas de filtrage scorchedUntil.

      // Score positif = bonne cible. On veut MAXIMISER.
      let score = 0;
      if (!n.owner) {
        // Neutre = idéal pour l'expansion (pas de défense, terrain libre).
        score = 100;
      } else {
        const def = state.players.get(n.owner);
        if (!def || !def.alive) { score = 80; }
        else {
          // Densité défensive (army/tile) — plus c'est faible, mieux c'est.
          const density = def.army / Math.max(1, def.territoryCount);
          // Inversion : low density → high score.
          score = 100 / (1 + density / 30);
          // Géant : pénalité forte si voisin >2× notre taille.
          if (def.territoryCount > me.territoryCount * 2) score *= 0.4;
          // Voisin spawn-protégé : skip.
          if (def.spawnProtectedUntil > state.tick) score *= 0.05;
          // Revenge : énorme bonus sur l'agresseur récent.
          if (revengeActive && n.owner === mem.revengeAgainst) score *= 2.5;
        }
      }

      // Bonus stratégique : bâtiment ennemi = cible juteuse (cripple éco).
      if (n.buildingLevel > 0) score += n.buildingLevel * 15;
      // Pénalité terrain défensif.
      if (n.terrain === TerrainType.Mountain) score *= 0.55;

      if (score > bestScore) { bestScore = score; best = nid; }
    }
  }
  return best;
}

/**
 * Trouve un voisin avec qui on a intérêt à s'allier.
 *  - Sous pression : on s'allie avec n'importe qui qui a au moins notre taille.
 *  - Normal : on cible un voisin de taille comparable (0.7..1.5×) — un faible
 *    apporte rien, un géant nous écrase et ne signera pas.
 */
function findAllianceCandidate(state: LocalGameState, me: LocalPlayer, myTiles: Set<number>, pressured: boolean): string | null {
  const counts = new Map<string, number>();
  const samples = Math.min(200, myTiles.size);
  const stride = Math.max(1, Math.floor(myTiles.size / samples));
  let i = 0;
  for (const id of myTiles) {
    if (i++ % stride !== 0) continue;
    const t = state.territoryById.get(id);
    if (!t) continue;
    for (const nid of t.neighbors) {
      const n = state.territoryById.get(nid);
      if (!n || !n.owner || n.owner === me.id) continue;
      counts.set(n.owner, (counts.get(n.owner) ?? 0) + 1);
    }
  }

  let best: string | null = null;
  let bestScore = 0;
  for (const id of counts.keys()) {
    const other = state.players.get(id);
    if (!other || !other.alive || other.allianceId) continue;
    if (other.diplomacyLockUntil > state.tick) continue;
    const ratio = other.territoryCount / Math.max(1, me.territoryCount);
    let score: number;
    if (pressured) {
      // Sous pression : on veut un plus gros que nous (qui peut nous protéger).
      if (ratio < 0.9) continue;
      score = ratio;
    } else {
      // Normal : taille comparable, idéalement légèrement plus grosse.
      if (ratio < 0.7 || ratio > 1.8) continue;
      score = 1 - Math.abs(ratio - 1.1); // optimum à ratio=1.1
    }
    // Bonus : plus on a de frontière commune, plus l'alliance fait sens.
    const adjacency = counts.get(id) ?? 0;
    score += adjacency * 0.02;
    if (score > bestScore) { bestScore = score; best = id; }
  }
  return best;
}

/**
 * Trouve la cible la plus juteuse pour une arme :
 *  - capitale = forte densité de bâtiments dans un voisinage
 *  - concentration de troupes (army/territory élevé)
 *  - ne tape pas un allié, ne gaspille pas sur du faible
 */
function findJuicyEnemyTarget(state: LocalGameState, me: LocalPlayer, myTiles: Set<number>, _mem: BotMemory): number | null {
  const allies = getAllianceMembers(state, me);
  let best: number | null = null;
  let bestScore = 0;
  const seen = new Set<number>();
  const samples = Math.min(400, myTiles.size);
  const stride = Math.max(1, Math.floor(myTiles.size / samples));
  let i = 0;
  for (const id of myTiles) {
    if (i++ % stride !== 0) continue;
    const t = state.territoryById.get(id);
    if (!t) continue;
    for (const nid of t.neighbors) {
      if (seen.has(nid)) continue;
      seen.add(nid);
      const n = state.territoryById.get(nid);
      if (!n || !n.owner || n.owner === me.id) continue;
      if (allies.has(n.owner)) continue;
      // Cratères : conquérables — pas de filtrage scorchedUntil.

      const def = state.players.get(n.owner);
      if (!def || !def.alive) continue;
      // On évite de gaspiller un missile sur un mini-bot.
      if (def.territoryCount < 30) continue;

      let score = 0;
      // Bâtiment = très juteux.
      if (n.buildingLevel > 0) score += n.buildingLevel * 50;
      // Densité de troupes ennemies sur cette tuile.
      score += Math.min(60, n.troops / 5);
      // Cible plus grande = plus utile à frapper.
      score += Math.min(60, def.territoryCount / 10);

      if (score > bestScore) { bestScore = score; best = nid; }
    }
  }
  return bestScore > 40 ? best : null;
}

function findIdlePort(state: LocalGameState, playerId: string, myTiles: Set<number>): number | null {
  for (const id of myTiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    if (t.building === BuildingType.Port && t.buildingLevel > 0) return id;
  }
  return null;
}

function findOverseaLanding(state: LocalGameState, playerId: string, myTiles: Set<number>): number | null {
  const direct = new Set<number>();
  for (const id of myTiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    for (const nid of t.neighbors) direct.add(nid);
  }
  const landIds = state.landIds;
  if (landIds.length === 0) return null;
  for (let i = 0; i < 200; i++) {
    const id = landIds[Math.floor(Math.random() * landIds.length)];
    const cand = state.territoryById.get(id);
    if (!cand) continue;
    if (cand.terrain !== TerrainType.Coast) continue;
    if (!cand.owner || cand.owner === playerId) continue;
    if (direct.has(cand.id)) continue;
    // Cratère = terrain neutre conquérable, on n'exclut plus.
    return cand.id;
  }
  return null;
}

/** Appelé depuis les systèmes d'armes — flag un bot qu'une arme l'a visé,
 *  ce qui pousse l'IA à prioriser un SAM. */
export function notifyBotWeaponThreat(playerId: string, currentTick: number) {
  const mem = memory.get(playerId);
  if (mem) mem.needsSamUntil = currentTick + TICK_RATE * 60;
}
