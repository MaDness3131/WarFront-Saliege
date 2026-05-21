/**
 * useGameState — pont entre l'état de simulation et React.
 * --------------------------------------------------------
 * L'état (Colyseus en réseau, LocalGameState en hors-ligne) change ~10
 * fois par seconde. Ce hook s'abonne au SocketClient et expose un snapshot
 * plat à React. Pour le HUD c'est plus que suffisant ; le rendu PixiJS
 * passe par GameEngine et n'attend pas React.
 *
 * Phase 2/3/4 : on enrichit le snapshot avec les ships, missiles, alliances,
 * propositions, cooldowns d'armes, terrain (pour la minimap), etc.
 */

import { useEffect, useState } from 'react';
import { socket } from '../network/SocketClient';
import { TerrainType, AllianceState, WeaponKind } from '@shared/types';

export interface PlayerView {
  id: string;
  name: string;
  color: string;
  emblem: string;
  borderStyle: 'solid' | 'dashed' | 'double';
  gold: number;
  income: number;
  population: number;
  populationCap: number;
  army: number;
  attackRatio: number;
  territoryCount: number;
  allianceId: string | null;
  score: number;
  elo: number;
  alive: boolean;
  isBot: boolean;
  cooldowns: { nuke: number; hydrogen: number; tsar: number };
  cityCount: number;
  factoryCount: number;
  portCount: number;
  defenseCount: number;
  samCount: number;
  casinoCount: number;
  spawnProtectedUntil: number;
  blackjackBusyUntil: number;
  blackjackCooldownUntil: number;
  /** Tier interne (weak/normal/strong). Le rendu utilise 'strong' pour
   *  styliser distinctement les "puissances majeures" (noms de pays). */
  tier: 'weak' | 'normal' | 'strong';
}

export interface ShipView {
  id: string;
  owner: string;
  type: number; // 0 Destroyer, 1 Battleship
  x: number;
  y: number;
  destX: number | null;
  destY: number | null;
  hp: number;
  maxHp: number;
  cargo: number;
}

export interface MissileView {
  id: string;
  kind: WeaponKind;
  owner: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startTick: number;
  durationTicks: number;
}

export interface AllianceView {
  id: string;
  members: string[];
  state: AllianceState;
}

export interface ProposalView {
  id: string;
  from: string;
  to: string;
}

export interface WaveView {
  id: string;
  owner: string;
  targetOwner: string | null;
  troops: number;
  queueSize: number;
  /** Position échantillon du front (la tuile la plus prioritaire). */
  frontX: number | null;
  frontY: number | null;
}

export interface BlackjackCardView { rank: number; suit: number; }

export interface BlackjackDuelView {
  id: string;
  challengerId: string;
  opponentId: string;
  challengerGoldBet: number;
  challengerTroopsBet: number;
  opponentGoldBet: number;
  opponentTroopsBet: number;
  dealerCards: BlackjackCardView[];
  challengerCards: BlackjackCardView[];
  opponentCards: BlackjackCardView[];
  challengerStood: boolean;
  opponentStood: boolean;
  dealerRevealed: boolean;
  state: 'playing' | 'resolving' | 'replay' | 'done';
  winnerId: string | null;
  resultMessage: string;
  challengerOutcome: 'win' | 'lose' | 'push' | null;
  opponentOutcome:   'win' | 'lose' | 'push' | null;
  rounds: number;
}

export interface GameSnapshot {
  connected: boolean;
  tick: number;
  phase: number;
  winner: string | null;
  mapWidth: number;
  mapHeight: number;
  totalLand: number;
  speedMultiplier: number;
  enabled: { weapons: boolean; alliances: boolean; naval: boolean };
  me: PlayerView | null;
  players: PlayerView[];
  /** Masque terrain : 0=ocean, 1=land, 2=mountain, 3=coast (immuable après init). */
  terrain: Uint8Array;
  /** Référence DIRECTE au tableau de territoires (mainState.territories) —
   *  utilisée par le rendu Minimap pour échantillonner sans rebuild d'array
   *  ownership. Mutation en place par le proxy à chaque broadcast. */
  territories: any[];
  waves: WaveView[];
  ships: ShipView[];
  missiles: MissileView[];
  alliances: AllianceView[];
  /** Propositions entrantes pour le joueur courant. */
  incomingProposals: ProposalView[];
  /** Propositions sortantes du joueur courant. */
  outgoingProposals: ProposalView[];
  /** IDs des territoires possédés par le joueur (rapide pour l'UI). */
  myTerritoryIds: number[];
  /** Duels blackjack actifs (au plus 1 pour le joueur humain en local). */
  duels: BlackjackDuelView[];
}

function toPlayerView(p: any): PlayerView {
  return {
    id: p.id,
    name: p.name,
    color: p.color,
    emblem: p.emblem ?? '',
    borderStyle: p.borderStyle ?? 'solid',
    gold: p.gold,
    income: p.income,
    population: p.population,
    populationCap: p.populationCap,
    army: p.army,
    attackRatio: p.attackRatio,
    territoryCount: p.territoryCount,
    allianceId: p.allianceId ?? null,
    score: p.score,
    elo: p.elo,
    alive: p.alive,
    isBot: p.isBot,
    cooldowns: p.cooldowns ?? { nuke: 0, hydrogen: 0, tsar: 0 },
    cityCount: p.cityCount ?? 0,
    factoryCount: p.factoryCount ?? 0,
    portCount: p.portCount ?? 0,
    defenseCount: p.defenseCount ?? 0,
    samCount: p.samCount ?? 0,
    casinoCount: p.casinoCount ?? 0,
    spawnProtectedUntil: p.spawnProtectedUntil ?? 0,
    blackjackBusyUntil: p.blackjackBusyUntil ?? 0,
    blackjackCooldownUntil: p.blackjackCooldownUntil ?? 0,
    tier: (p.tier ?? 'normal') as 'weak' | 'normal' | 'strong',
  };
}

// ─── Cache static + ownership inutilisés ────────────────────────────────
// Le terrain est IMMUABLE après init (atlas figé). On le matérialise UNE
// FOIS sur le premier snapshot et on le réutilise tel quel ensuite —
// élimine 682k itérations × 5 fois/sec sur le main thread.
//
// ownership et scorch typed arrays : retirés du snapshot car aucun
// composant ne les consommait (audit grep, mai 2026). Si un usage futur
// les redemande, on les rebuild lazily.
let _cachedTerrain: Uint8Array | null = null;
let _cachedTerrainSize = 0;
let _cachedTotalLand = 0;

function getTerrainCached(state: any): Uint8Array {
  const n = state.territories.length;
  if (_cachedTerrain && _cachedTerrainSize === n) return _cachedTerrain;
  const terrain = new Uint8Array(n);
  let land = 0;
  for (let i = 0; i < n; i++) {
    const t = state.territories[i];
    terrain[t.id] = t.terrain as number;
    if (t.terrain !== TerrainType.Ocean) land++;
  }
  _cachedTerrain = terrain;
  _cachedTerrainSize = n;
  _cachedTotalLand = land;
  return terrain;
}

function snapshot(state: any): GameSnapshot {
  const players: PlayerView[] = [];
  state.players.forEach((p: any) => players.push(toPlayerView(p)));

  // Terrain cached + totalLand idem (immuable).
  const terrain = getTerrainCached(state);
  const totalLand = _cachedTotalLand;

  // myTerritoryIds : pris du Set du humain (alimenté par le proxy via
  // myTilesArr — pas de scan de 682k tuiles). Le Set est typiquement
  // 10-2000 entrées en jeu.
  const myTerritoryIds: number[] = [];
  const mySet: Set<number> | undefined = state.playerTiles?.get?.(socket.sessionId);
  if (mySet) {
    mySet.forEach((id) => myTerritoryIds.push(id));
  }

  // Vagues d'expansion en cours (uniquement métadonnées — le rendu front
  // utilise directement state.waves pour itérer la file).
  const waves: WaveView[] = [];
  if (state.waves) {
    state.waves.forEach((w: any) => {
      const top = w.toConquer?.peekTopN?.(1)?.[0];
      let frontX: number | null = null;
      let frontY: number | null = null;
      if (top) {
        const t = state.territoryById?.get?.(top.value);
        if (t) { frontX = t.x; frontY = t.y; }
      }
      waves.push({
        id: w.id,
        owner: w.owner,
        targetOwner: w.targetOwner ?? null,
        troops: w.troops,
        queueSize: w.toConquer?.size ?? 0,
        frontX, frontY,
      });
    });
  }

  // Ships : on convertit l'éventuelle Map.
  const ships: ShipView[] = [];
  if (state.ships) {
    state.ships.forEach((s: any) => {
      ships.push({
        id: s.id,
        owner: s.owner,
        type: s.type,
        x: s.x,
        y: s.y,
        destX: s.destX,
        destY: s.destY,
        hp: s.hp,
        maxHp: s.maxHp,
        cargo: s.cargo,
      });
    });
  }

  const missiles: MissileView[] = [];
  if (state.missiles) {
    state.missiles.forEach((m: any) => {
      missiles.push({
        id: m.id,
        kind: m.kind,
        owner: m.owner,
        fromX: m.fromX,
        fromY: m.fromY,
        toX: m.toX,
        toY: m.toY,
        startTick: m.startTick,
        durationTicks: m.durationTicks,
      });
    });
  }

  const alliances: AllianceView[] = [];
  if (state.alliances) {
    state.alliances.forEach((al: any) => {
      alliances.push({ id: al.id, members: [...al.members], state: al.state });
    });
  }

  const incomingProposals: ProposalView[] = [];
  const outgoingProposals: ProposalView[] = [];
  if (state.proposals) {
    state.proposals.forEach((pr: any) => {
      const view = { id: pr.id, from: pr.from, to: pr.to };
      if (pr.to === socket.sessionId) incomingProposals.push(view);
      else if (pr.from === socket.sessionId) outgoingProposals.push(view);
    });
  }

  // Duels blackjack — on n'expose à l'UI que ceux où le joueur humain
  // est impliqué (challenger OU opponent). Les duels bot vs bot tournent
  // côté sim mais n'ont pas d'interface visible.
  const duels: BlackjackDuelView[] = [];
  if (state.duels) {
    state.duels.forEach((d: any) => {
      if (d.state === 'done') return;
      if (d.challengerId !== socket.sessionId && d.opponentId !== socket.sessionId) return;
      duels.push({
        id: d.id,
        challengerId: d.challengerId,
        opponentId: d.opponentId,
        challengerGoldBet: d.challengerGoldBet,
        challengerTroopsBet: d.challengerTroopsBet,
        opponentGoldBet: d.opponentGoldBet,
        opponentTroopsBet: d.opponentTroopsBet,
        dealerCards: d.dealerCards,
        challengerCards: d.challengerCards,
        opponentCards: d.opponentCards,
        challengerStood: d.challengerStood,
        opponentStood: d.opponentStood,
        dealerRevealed: d.dealerRevealed,
        state: d.state,
        winnerId: d.winnerId,
        resultMessage: d.resultMessage,
        challengerOutcome: d.challengerOutcome,
        opponentOutcome: d.opponentOutcome,
        rounds: d.rounds,
      });
    });
  }

  return {
    connected: socket.connected,
    tick: state.tick,
    phase: state.phase,
    winner: state.winner,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    totalLand,
    speedMultiplier: state.speedMultiplier ?? 1,
    enabled: state.enabled ?? { weapons: true, alliances: true, naval: true },
    me: players.find((p) => p.id === socket.sessionId) ?? null,
    players: players.sort((a, b) => b.score - a.score),
    terrain,
    territories: state.territories,
    waves,
    ships,
    missiles,
    alliances,
    incomingProposals,
    outgoingProposals,
    myTerritoryIds,
    duels,
  };
}

export function useGameState(): GameSnapshot | null {
  const [snap, setSnap] = useState<GameSnapshot | null>(null);
  useEffect(() => {
    // Throttle : on rebuild le snapshot au plus toutes les 200ms.
    // À 10 Hz simulation, ça divise le coût par 2 sans perte visible pour l'UI.
    let lastAt = 0;
    let pending: any = null;
    let timer: number | null = null;
    const flush = () => {
      if (pending) { setSnap(snapshot(pending)); pending = null; }
      timer = null;
    };
    return socket.onState((state) => {
      const now = performance.now();
      const elapsed = now - lastAt;
      if (elapsed >= 200) {
        lastAt = now;
        if (timer !== null) { clearTimeout(timer); timer = null; }
        setSnap(snapshot(state));
      } else {
        pending = state;
        if (timer === null) timer = window.setTimeout(flush, 200 - elapsed);
      }
    });
  }, []);
  return snap;
}
