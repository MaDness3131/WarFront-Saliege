/**
 * Pathfinder — A* sur la grille pour les navires.
 * ------------------------------------------------
 * Distance Manhattan, 8-connexité avec coût diagonal √2. La fonction de
 * walkable est paramétrable — pour les navires on accepte uniquement les
 * tuiles océan + un anneau côtier au point de destination (pour permettre
 * l'arrivée près d'un port).
 *
 * Complexité : O(visited × log(open)) — sur une zone océan plausible
 * (~quelques centaines de tuiles), c'est < 1 ms.
 */

import { MinHeap } from './MinHeap';

export interface PathTile { x: number; y: number; }

const DIRS: [number, number, number][] = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],
  [-1, -1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [1, 1, 1.41],
];

export function findPath(
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  width: number,
  height: number,
  walkable: (x: number, y: number) => boolean,
  maxVisited = 4000,
): PathTile[] | null {
  const start = (startY * width + startX) | 0;
  const goal = (goalY * width + goalX) | 0;
  if (start === goal) return [{ x: goalX, y: goalY }];

  const gScore = new Map<number, number>();
  const cameFrom = new Map<number, number>();
  const open = new MinHeap<number>();
  gScore.set(start, 0);
  open.push(start, manhattan(startX, startY, goalX, goalY));

  let visited = 0;
  while (open.size > 0 && visited < maxVisited) {
    const top = open.pop()!;
    const cur = top.value;
    if (cur === goal) return reconstruct(cameFrom, cur, width);
    visited++;
    const cx = cur % width;
    const cy = (cur / width) | 0;
    const curG = gScore.get(cur) ?? Infinity;

    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx; const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (!walkable(nx, ny) && (nx !== goalX || ny !== goalY)) continue;
      const n = ny * width + nx;
      const tentative = curG + cost;
      if (tentative < (gScore.get(n) ?? Infinity)) {
        gScore.set(n, tentative);
        cameFrom.set(n, cur);
        open.push(n, tentative + manhattan(nx, ny, goalX, goalY));
      }
    }
  }
  return null;
}

function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function reconstruct(cameFrom: Map<number, number>, end: number, width: number): PathTile[] {
  const out: PathTile[] = [];
  let cur: number | undefined = end;
  while (cur !== undefined) {
    out.push({ x: cur % width, y: (cur / width) | 0 });
    cur = cameFrom.get(cur);
  }
  return out.reverse();
}
