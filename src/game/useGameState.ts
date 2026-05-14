/**
 * useGameState — pont entre l'état serveur (Colyseus) et React.
 * ------------------------------------------------------------
 * Le HUD et les panneaux sont du React classique ; ils ont besoin de
 * re-render quand l'état serveur change. Ce hook s'abonne au SocketClient
 * et expose un snapshot simple (objets JS plats) à la fréquence de broadcast.
 *
 * On ne re-render pas à 60 FPS : Colyseus envoie ~10 patchs/s, on suit ce
 * rythme — largement suffisant pour des chiffres de HUD.
 */

import { useEffect, useState } from 'react';
import { socket } from '../network/SocketClient';

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  gold: number;
  income: number;
  population: number;
  populationCap: number;
  army: number;
  attackRatio: number;
  territoryCount: number;
  score: number;
  elo: number;
  alive: boolean;
  isBot: boolean;
}

export interface GameSnapshot {
  connected: boolean;
  tick: number;
  phase: number;
  winner: string | null;
  mapWidth: number;
  mapHeight: number;
  totalLand: number;
  me: PlayerView | null;
  players: PlayerView[];
  /** Propriétaire de chaque territoire, indexé par id — pour la minimap. */
  ownership: (string | null)[];
}

function snapshot(state: any): GameSnapshot {
  const players: PlayerView[] = [];
  state.players.forEach((p: any) => {
    players.push({
      id: p.id,
      name: p.name,
      color: p.color,
      gold: p.gold,
      income: p.income,
      population: p.population,
      populationCap: p.populationCap,
      army: p.army,
      attackRatio: p.attackRatio,
      territoryCount: p.territoryCount,
      score: p.score,
      elo: p.elo,
      alive: p.alive,
      isBot: p.isBot,
    });
  });

  const ownership: (string | null)[] = [];
  let totalLand = 0;
  state.territories.forEach((t: any) => {
    ownership[t.id] = t.owner;
    if (t.terrain !== 0) totalLand++; // 0 = Ocean
  });

  return {
    connected: socket.connected,
    tick: state.tick,
    phase: state.phase,
    winner: state.winner,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    totalLand,
    me: players.find((p) => p.id === socket.sessionId) ?? null,
    players: players.sort((a, b) => b.score - a.score),
    ownership,
  };
}

export function useGameState(): GameSnapshot | null {
  const [snap, setSnap] = useState<GameSnapshot | null>(null);

  useEffect(() => {
    return socket.onState((state) => {
      setSnap(snapshot(state));
    });
  }, []);

  return snap;
}
