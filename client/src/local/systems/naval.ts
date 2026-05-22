/**
 * Naval — construction, déplacement, combat, débarquement (Phase 2).
 * ------------------------------------------------------------------
 * Le port d'un territoire côtier autorise la construction de navires. Les
 * destroyers font feu sur les navires ennemis à portée ; les battleships
 * peuvent transporter des troupes et débarquer sur un territoire côtier
 * ennemi (cela résout un combat terrestre classique à l'arrivée).
 *
 * Pathfinding volontairement simple : ligne droite + slide latéral si la
 * cellule est terrestre. On n'a pas besoin de plus pour un jeu .io.
 */

import { TerrainType, BuildingType, ShipType } from '@shared/types';
import { SHIPS, SHIP_ARRIVAL_EPSILON, SHIP_BOARDING_TROOP_COST } from '@shared/constants';
import { LocalGameState, LocalShip, nextId } from '../state';
import { trySpend } from './economy';
import { areAllied, effectiveDefense, adjustTerritoryCount, reassignTile } from './territory';
import { findPath } from '../util/Pathfinder';
import { MinHeap } from '../util/MinHeap';
import { Emitter, EVENT } from '../events';

const SHIP_SPECS = {
  [ShipType.Destroyer]: SHIPS.destroyer,
  [ShipType.Battleship]: SHIPS.battleship,
} as const;

/** Construit un navire dans un port allié. */
export function commissionShip(
  state: LocalGameState,
  playerId: string,
  portId: number,
  type: ShipType,
  emit: Emitter,
): boolean {
  if (!state.enabled.naval) return false;
  const p = state.players.get(playerId);
  const port = state.territoryById.get(portId);
  if (!p || !p.alive || !port) return false;
  if (port.owner !== playerId) return false;
  if (port.building !== BuildingType.Port || port.buildingLevel <= 0) return false;

  const spec = SHIP_SPECS[type];
  if (!spec) return false;
  if (!trySpend(p, spec.cost)) return false;

  // Cherche une cellule océan adjacente au port pour faire naître le navire.
  let spawnX = port.x;
  let spawnY = port.y;
  for (const nid of port.neighbors) {
    const n = state.territoryById.get(nid);
    if (n && n.terrain === TerrainType.Ocean) {
      spawnX = n.x + 0.5;
      spawnY = n.y + 0.5;
      break;
    }
  }

  // Cargo : sur un battleship, on charge des troupes depuis la réserve du joueur.
  let cargo = 0;
  if (type === ShipType.Battleship && spec.cargo > 0) {
    const board = Math.min(spec.cargo, Math.floor(p.army * 0.5));
    if (board >= SHIP_BOARDING_TROOP_COST) {
      cargo = board;
      p.army -= board;
    }
  }

  const id = nextId(state, 's');
  const ship: LocalShip = {
    id,
    owner: playerId,
    type,
    x: spawnX,
    y: spawnY,
    destX: null,
    destY: null,
    landTargetId: null,
    hp: spec.hp,
    maxHp: spec.hp,
    cargo,
    fireCooldown: 0,
    path: [],
    trail: [],
  };
  state.ships.set(id, ship);
  emit(EVENT.ShipBuilt, { shipId: id, owner: playerId, type });
  return true;
}

/**
 * Lance une invasion navale SANS port. Spawn un battleship depuis la
 * cellule côtière la plus proche du target, A* automatique vers la cible.
 * Le navire emporte un cargo de troupes ET le joueur n'a aucun bâtiment à
 * construire au préalable.
 */
export function launchInvasion(
  state: LocalGameState,
  playerId: string,
  targetTileId: number,
  emit: Emitter,
): boolean {
  if (!state.enabled.naval) return false;
  const p = state.players.get(playerId);
  const target = state.territoryById.get(targetTileId);
  if (!p || !p.alive || !target) return false;
  if (target.terrain === TerrainType.Ocean) return false;

  // Trouve la cellule côtière du joueur la plus proche du target.
  const myTiles = state.playerTiles.get(playerId);
  if (!myTiles) return false;
  let bestCoast: any = null;
  let bestDist = Infinity;
  let bestOceanSpawn: { x: number; y: number } | null = null;
  for (const id of myTiles) {
    const t = state.territoryById.get(id);
    if (!t || t.terrain !== TerrainType.Coast) continue;
    // Trouve un océan voisin
    for (const nid of t.neighbors) {
      const n = state.territoryById.get(nid);
      if (!n || n.terrain !== TerrainType.Ocean) continue;
      const d = (n.x - target.x) ** 2 + (n.y - target.y) ** 2;
      if (d < bestDist) {
        bestDist = d;
        bestCoast = t;
        bestOceanSpawn = { x: n.x + 0.5, y: n.y + 0.5 };
      }
      break; // un seul océan voisin suffit pour cette tuile
    }
  }
  if (!bestCoast || !bestOceanSpawn) return false;

  // Cargo : 35% de l'armée, min 50.
  const cargo = Math.max(50, Math.floor(p.army * 0.35));
  if (p.army < cargo) return false;
  p.army -= cargo;

  const spec = SHIPS.battleship;
  const id = nextId(state, 's');
  const ship: LocalShip = {
    id,
    owner: playerId,
    type: ShipType.Battleship,
    x: bestOceanSpawn.x,
    y: bestOceanSpawn.y,
    destX: target.x + 0.5,
    destY: target.y + 0.5,
    landTargetId: targetTileId,
    hp: spec.hp,
    maxHp: spec.hp,
    cargo,
    fireCooldown: 0,
    path: [],
    trail: [],
  };
  // Calcule la route A*.
  ship.path = computeShipPath(state, ship, target.x + 0.5, target.y + 0.5);
  state.ships.set(id, ship);
  emit(EVENT.ShipBuilt, { shipId: id, owner: playerId, type: ShipType.Battleship });
  return true;
}

export function orderMove(state: LocalGameState, playerId: string, shipId: string, x: number, y: number) {
  const s = state.ships.get(shipId);
  if (!s || s.owner !== playerId) return;
  s.destX = x;
  s.destY = y;
  s.landTargetId = null;
  s.path = computeShipPath(state, s, x, y);
}

/** Ordonne à un battleship de débarquer ses troupes sur un territoire côtier.
 *  Le bateau se positionne sur la tuile OCÉAN adjacente à la côte cible —
 *  il ne dépasse jamais la mer. Le débarquement (et la capture de la tuile
 *  côtière) est déclenché par attemptLanding() à l'arrivée. */
export function orderLand(state: LocalGameState, playerId: string, shipId: string, targetId: number) {
  const s = state.ships.get(shipId);
  const t = state.territoryById.get(targetId);
  if (!s || s.owner !== playerId || !t) return;
  if (s.type !== ShipType.Battleship || s.cargo <= 0) return;
  if (t.terrain !== TerrainType.Coast) return;

  // Trouve une tuile OCÉAN adjacente à la côte ciblée. C'est là que le
  // bateau s'arrête — il ne monte pas sur le sable.
  let oceanX = t.x;
  let oceanY = t.y;
  let foundOcean = false;
  for (const nid of t.neighbors) {
    const n = state.territoryById.get(nid);
    if (n && n.terrain === TerrainType.Ocean) {
      oceanX = n.x;
      oceanY = n.y;
      foundOcean = true;
      break;
    }
  }
  // Fallback : on prend la côte directement si pas d'océan voisin (cas
  // limite avec petites îles entièrement côte).
  if (!foundOcean) {
    oceanX = t.x;
    oceanY = t.y;
  }

  const destX = oceanX + 0.5;
  const destY = oceanY + 0.5;
  s.destX = destX;
  s.destY = destY;
  s.landTargetId = targetId; // toujours le coast tile pour le débarquement
  s.path = computeShipPath(state, s, destX, destY);
}

/** Calcule un chemin A* en océan (la destination peut être côtière). */
function computeShipPath(state: LocalGameState, s: LocalShip, dstX: number, dstY: number): { x: number; y: number }[] {
  const sx = Math.floor(s.x);
  const sy = Math.floor(s.y);
  const gx = Math.floor(dstX);
  const gy = Math.floor(dstY);
  const walkable = (x: number, y: number): boolean => {
    const c = state.territoryById.get(y * state.mapWidth + x);
    return !!c && c.terrain === TerrainType.Ocean;
  };
  const path = findPath(sx, sy, gx, gy, state.mapWidth, state.mapHeight, walkable, 6000);
  if (!path) return [{ x: dstX, y: dstY }];
  // Simplifie : garde 1 waypoint sur 4 + le dernier.
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < path.length; i += 3) out.push({ x: path[i].x + 0.5, y: path[i].y + 0.5 });
  out.push({ x: dstX, y: dstY });
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Boucle de simulation navale
// ────────────────────────────────────────────────────────────────────────────

export function tickNaval(state: LocalGameState, emit: Emitter) {
  if (!state.enabled.naval) return;

  const ships = [...state.ships.values()];
  for (const s of ships) {
    if (s.hp <= 0) continue;

    // 1. Suivi du chemin A* (waypoint par waypoint).
    if (s.path.length > 0) {
      const spec = SHIP_SPECS[s.type];
      const step = spec.speed * state.speedMultiplier;
      const wp = s.path[0];
      const dx = wp.x - s.x;
      const dy = wp.y - s.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= step) {
        s.x = wp.x;
        s.y = wp.y;
        s.path.shift();
        if (s.path.length === 0) {
          if (s.landTargetId !== null) attemptLanding(state, s, emit);
          s.destX = null;
          s.destY = null;
        }
      } else {
        s.x += (dx / dist) * step;
        s.y += (dy / dist) * step;
      }
      // Enregistre la position pour la traînée.
      if (!s.trail) s.trail = [];
      s.trail.push({ x: s.x, y: s.y, tick: state.tick });
      // Cap à 30 points (les anciens disparaîtront aussi par le filter d'âge).
      if (s.trail.length > 30) s.trail.shift();
    }

    // 2. Tir naval : engage le navire ennemi le plus proche à portée.
    if (s.fireCooldown > 0) s.fireCooldown -= state.speedMultiplier;
    else {
      const spec = SHIP_SPECS[s.type];
      const target = findEnemyShipInRange(state, s, spec.range);
      if (target) {
        target.hp -= spec.attack;
        s.fireCooldown = spec.fireCooldown;
        emit(EVENT.Explosion, { x: target.x, y: target.y, kind: 0 });
        if (target.hp <= 0) {
          state.ships.delete(target.id);
          emit(EVENT.ShipDestroyed, { shipId: target.id, by: s.owner });
        }
      }
    }
  }

  // 3. Nettoyage : retire les épaves (HP ≤ 0) qui restent.
  for (const s of ships) if (s.hp <= 0) state.ships.delete(s.id);
}

function cellIndex(state: LocalGameState, fx: number, fy: number): number {
  const x = Math.min(state.mapWidth - 1, Math.max(0, Math.floor(fx)));
  const y = Math.min(state.mapHeight - 1, Math.max(0, Math.floor(fy)));
  return y * state.mapWidth + x;
}

/** Vrai si (fx, fy) tombe dans une cellule océan (et dans les bornes de la carte). */
function isOcean(state: LocalGameState, fx: number, fy: number): boolean {
  if (fx < 0 || fy < 0 || fx >= state.mapWidth || fy >= state.mapHeight) return false;
  const c = state.territoryById.get(cellIndex(state, fx, fy));
  return !!c && c.terrain === TerrainType.Ocean;
}

function findEnemyShipInRange(state: LocalGameState, s: LocalShip, range: number): LocalShip | null {
  let best: LocalShip | null = null;
  let bestDist = range;
  for (const other of state.ships.values()) {
    if (other === s) continue;
    if (other.hp <= 0) continue;
    if (other.owner === s.owner) continue;
    if (areAllied(state, s.owner, other.owner)) continue;
    const d = Math.hypot(other.x - s.x, other.y - s.y);
    if (d < bestDist) {
      best = other;
      bestDist = d;
    }
  }
  return best;
}

/** Débarque le cargo en lançant une vraie attaque depuis la tuile côtière. */
function attemptLanding(state: LocalGameState, ship: LocalShip, emit: Emitter) {
  if (ship.landTargetId === null) return;
  const t = state.territoryById.get(ship.landTargetId);
  ship.landTargetId = null;
  if (!t || ship.cargo <= 0) return;

  const attacker = state.players.get(ship.owner);
  if (!attacker || !attacker.alive) return;

  // Cas 1 : tuile alliée/propre → cargo retourne au pool de troupes du joueur.
  if (t.owner === ship.owner || (t.owner && areAllied(state, t.owner, ship.owner))) {
    attacker.army += ship.cargo;
    ship.cargo = 0;
    return;
  }

  // Cas 2 : neutre → capture gratuite + cargo reversé au pool, puis attaque
  // automatique de proche en proche déclenchée par les routines normales.
  if (!t.owner) {
    reassignTile(state, t.id, null, ship.owner);
    t.owner = ship.owner;
    t.capturedAt = Date.now();
    adjustTerritoryCount(state, ship.owner, +1);
    attacker.army += ship.cargo;
    emit(EVENT.TerritoryCaptured, { id: t.id, by: ship.owner, from: null });
    ship.cargo = 0;
    return;
  }

  // Cas 3 : ennemi → on prend la tuile par la force (proportionnel à la défense)
  // PUIS on spawne une attaque qui va se propager dans son territoire avec
  // le cargo restant. C'est ça l'invasion : pas une seule case, une tête de pont.
  const previousOwner = t.owner;
  const defense = effectiveDefense(state, t);
  if (ship.cargo <= defense * 0.5) {
    // Pas assez fort pour prendre la tête de pont — cargo perdu.
    attacker.armiesLost += ship.cargo;
    ship.cargo = 0;
    return;
  }
  // Capture la tête de pont.
  const beachheadCost = Math.min(ship.cargo, defense * 0.5);
  let landed = ship.cargo - beachheadCost;
  adjustTerritoryCount(state, previousOwner, -1);
  reassignTile(state, t.id, previousOwner, ship.owner);
  t.owner = ship.owner;
  t.capturedAt = Date.now();
  adjustTerritoryCount(state, ship.owner, +1);
  attacker.armiesKilled += defense * 0.5;
  emit(EVENT.TerritoryCaptured, { id: t.id, by: ship.owner, from: null });

  // Spawn une attaque qui va se propager dans le territoire de previousOwner
  // depuis cette tête de pont, avec le reste du cargo.
  if (landed >= 2) {
    const queue = new MinHeap<number>();
    const queued = new Set<number>();
    for (const nid of t.neighbors) {
      const n = state.territoryById.get(nid);
      if (!n) continue;
      if (n.terrain === TerrainType.Ocean) continue;
      if (n.owner === ship.owner) continue;
      if (n.owner !== previousOwner) continue;
      // Cratères conquérables : pas de filtrage sur scorchedUntil.
      // Priorité tickNow + petit offset pour ordre FIFO stable.
      queue.push(nid, state.tick + Math.random() * 4);
      queued.add(nid);
    }
    if (queue.size > 0) {
      const id = nextId(state, 'w');
      state.waves.set(id, {
        id,
        owner: ship.owner,
        targetOwner: previousOwner,
        troops: landed,
        startTick: state.tick,
        toConquer: queue,
        queued,
      });
    } else {
      // Pas de voisin attaquable — renvoie le surplus dans l'armée.
      attacker.army += landed;
    }
  } else {
    attacker.army += landed;
  }
  ship.cargo = 0;
}
