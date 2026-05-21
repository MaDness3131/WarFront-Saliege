/**
 * Blackjack — minijeu PvP de casino, version "symbolique + bonus de force".
 * --------------------------------------------------------------------------
 * Règles actuelles :
 *  - On ne peut défier qu'un joueur en CONTACT (au moins une tuile adjacente
 *    à la nôtre).
 *  - Cooldown 1 minute entre deux duels pour chaque joueur.
 *  - La mise affichée (50 % or, 30 % troupes) est PUREMENT SYMBOLIQUE :
 *    rien n'est débité ni transféré. Le seul vrai enjeu est le bonus :
 *  - VAINQUEUR : +20 % de force contre l'ennemi battu, tant qu'il est vivant.
 *  - Tour-par-tour : challenger d'abord, puis opposant, puis le croupier
 *    pioche lentement (1 carte toutes les ~1.4 s).
 *
 * Logique des rounds (replay) inchangée : si les DEUX joueurs perdent face
 * au croupier, on rejoue jusqu'à BLACKJACK_MAX_ROUNDS, sinon push.
 *
 * Pendant un duel, les deux joueurs ont `blackjackBusyUntil` actif →
 * immunisés contre les attaques.
 */

import {
  BLACKJACK_BOT_THINK_TICKS,
  BLACKJACK_DEALER_DRAW_TICKS,
  BLACKJACK_COOLDOWN_TICKS,
  BLACKJACK_TIMEOUT_TICKS,
  BLACKJACK_MAX_ROUNDS,
  BLACKJACK_RESULT_HOLD_TICKS,
  BLACKJACK_GOLD_BET_FRACTION,
  BLACKJACK_TROOPS_BET_FRACTION,
} from '@shared/constants';
import { BuildingType } from '@shared/types';
import { LocalGameState, BlackjackCard, BlackjackDuel, nextId } from '../state';
import { Emitter, EVENT } from '../events';

/** Renvoie true si `p` possède au moins un Casino niveau ≥ 1. */
export function playerHasCasino(state: LocalGameState, playerId: string): boolean {
  const tiles = state.playerTiles.get(playerId);
  if (!tiles) return false;
  for (const id of tiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    if (t.building === BuildingType.Casino && t.buildingLevel > 0) return true;
  }
  return false;
}

/** Renvoie true si deux joueurs partagent au moins une frontière de tuiles
 *  (adjacence). Utilisé pour limiter les défis aux voisins immédiats. */
export function playersInContact(state: LocalGameState, aId: string, bId: string): boolean {
  const aTiles = state.playerTiles.get(aId);
  if (!aTiles) return false;
  for (const id of aTiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    for (const nid of t.neighbors) {
      const n = state.territoryById.get(nid);
      if (n && n.owner === bId) return true;
    }
  }
  return false;
}

/** Tire une carte aléatoire (rank 1-13, suit 0-3). */
function drawCard(): BlackjackCard {
  return {
    rank: 1 + Math.floor(Math.random() * 13),
    suit: Math.floor(Math.random() * 4),
  };
}

function cardValue(c: BlackjackCard): number {
  if (c.rank === 1) return 1;
  if (c.rank >= 11) return 10;
  return c.rank;
}

export function handValue(cards: BlackjackCard[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    sum += cardValue(c);
    if (c.rank === 1) aces++;
  }
  while (aces > 0 && sum + 10 <= 21) {
    sum += 10;
    aces--;
  }
  return sum;
}

function isBust(cards: BlackjackCard[]): boolean {
  return handValue(cards) > 21;
}

/** Renvoie de qui c'est le tour : challenger → opponent → croupier. */
export function blackjackTurn(duel: BlackjackDuel): 'challenger' | 'opponent' | 'dealer' {
  if (!duel.challengerStood) return 'challenger';
  if (!duel.opponentStood)   return 'opponent';
  return 'dealer';
}

/** Proposer un duel : challengerId attaque une tuile possédée par opponentId.
 *  Vérifie casinos, contact territorial, cooldowns. PAS de débit. */
export function proposeBlackjack(
  state: LocalGameState,
  challengerId: string,
  opponentId: string,
  emit: Emitter,
): { ok: boolean; reason?: string } {
  if (challengerId === opponentId) return { ok: false, reason: 'self' };
  const challenger = state.players.get(challengerId);
  const opponent = state.players.get(opponentId);
  if (!challenger || !opponent) return { ok: false, reason: 'no_player' };
  if (!challenger.alive || !opponent.alive) return { ok: false, reason: 'dead' };
  // Cooldown : 1 min après le dernier duel.
  if (challenger.blackjackCooldownUntil > state.tick) return { ok: false, reason: 'cooldown_self' };
  if (opponent.blackjackCooldownUntil > state.tick)   return { ok: false, reason: 'cooldown_target' };
  // Occupé : déjà en duel.
  if (challenger.blackjackBusyUntil > state.tick) return { ok: false, reason: 'busy_self' };
  if (opponent.blackjackBusyUntil > state.tick)   return { ok: false, reason: 'busy_target' };
  // Casinos obligatoires des deux côtés.
  if (!playerHasCasino(state, challengerId)) return { ok: false, reason: 'no_casino_self' };
  if (!playerHasCasino(state, opponentId))   return { ok: false, reason: 'no_casino_target' };
  // Contact territorial obligatoire.
  if (!playersInContact(state, challengerId, opponentId)) {
    return { ok: false, reason: 'not_in_contact' };
  }

  // Mises symboliques (50 % or, 30 % troupes) — calculées pour l'affichage
  // sur la table, mais aucune ressource n'est débitée. Le seul vrai enjeu
  // est le bonus de force de +20 % accordé au vainqueur.
  const cGold   = Math.floor(challenger.gold * BLACKJACK_GOLD_BET_FRACTION);
  const cTroops = Math.floor(challenger.army * BLACKJACK_TROOPS_BET_FRACTION);
  const oGold   = Math.floor(opponent.gold   * BLACKJACK_GOLD_BET_FRACTION);
  const oTroops = Math.floor(opponent.army   * BLACKJACK_TROOPS_BET_FRACTION);

  const id = nextId(state, 'bj');
  const duel: BlackjackDuel = {
    id,
    challengerId,
    opponentId,
    challengerGoldBet:   cGold,
    challengerTroopsBet: cTroops,
    opponentGoldBet:     oGold,
    opponentTroopsBet:   oTroops,
    dealerCards:     [drawCard()],
    challengerCards: [drawCard(), drawCard()],
    opponentCards:   [drawCard(), drawCard()],
    challengerStood: false,
    opponentStood:   false,
    dealerRevealed:  false,
    botActionCooldown: BLACKJACK_BOT_THINK_TICKS,
    dealerCooldown:    BLACKJACK_DEALER_DRAW_TICKS,
    state: 'playing',
    expiresTick: state.tick + BLACKJACK_TIMEOUT_TICKS,
    winnerId: null,
    resultMessage: '',
    challengerOutcome: null,
    opponentOutcome:   null,
    rounds: 1,
  };
  state.duels.set(id, duel);

  // Immunité aux attaques pendant le duel.
  challenger.blackjackBusyUntil = duel.expiresTick;
  opponent.blackjackBusyUntil   = duel.expiresTick;

  // Blackjack naturel au deal → auto-stand.
  if (handValue(duel.challengerCards) === 21) duel.challengerStood = true;
  if (handValue(duel.opponentCards)   === 21) duel.opponentStood   = true;

  emit(EVENT.BlackjackStarted, {
    duelId: id,
    challenger: challengerId,
    opponent: opponentId,
  });
  return { ok: true };
}

/** Action "tirer" — ajoute une carte à la main du joueur. */
export function blackjackHit(
  state: LocalGameState,
  playerId: string,
  duelId: string,
): { ok: boolean; reason?: string } {
  const duel = state.duels.get(duelId);
  if (!duel || duel.state !== 'playing') return { ok: false, reason: 'bad_state' };
  const isChallenger = duel.challengerId === playerId;
  const isOpponent   = duel.opponentId   === playerId;
  if (!isChallenger && !isOpponent) return { ok: false, reason: 'not_in_duel' };
  const turn = blackjackTurn(duel);
  if (isChallenger && turn !== 'challenger') return { ok: false, reason: 'not_your_turn' };
  if (isOpponent   && turn !== 'opponent')   return { ok: false, reason: 'not_your_turn' };

  const card = drawCard();
  const hand = isChallenger ? duel.challengerCards : duel.opponentCards;
  hand.push(card);
  if (isBust(hand)) {
    if (isChallenger) duel.challengerStood = true;
    else duel.opponentStood = true;
    // On reset le cooldown bot pour que la transition de tour respire.
    duel.botActionCooldown = BLACKJACK_BOT_THINK_TICKS;
  }
  return { ok: true };
}

/** Action "rester" — le joueur arrête de tirer. */
export function blackjackStand(
  state: LocalGameState,
  playerId: string,
  duelId: string,
): { ok: boolean; reason?: string } {
  const duel = state.duels.get(duelId);
  if (!duel || duel.state !== 'playing') return { ok: false, reason: 'bad_state' };
  const turn = blackjackTurn(duel);
  if (duel.challengerId === playerId) {
    if (turn !== 'challenger') return { ok: false, reason: 'not_your_turn' };
    duel.challengerStood = true;
  } else if (duel.opponentId === playerId) {
    if (turn !== 'opponent') return { ok: false, reason: 'not_your_turn' };
    duel.opponentStood = true;
  } else {
    return { ok: false, reason: 'not_in_duel' };
  }
  // Reset des cooldowns pour étaler proprement la transition (bot suivant
  // ou révélation du croupier).
  duel.botActionCooldown = BLACKJACK_BOT_THINK_TICKS;
  duel.dealerCooldown    = BLACKJACK_DEALER_DRAW_TICKS;
  return { ok: true };
}

/** Tick : décisions IA + révélation lente du croupier + résolution. */
export function tickBlackjack(state: LocalGameState, emit: Emitter) {
  for (const duel of state.duels.values()) {
    if (duel.state === 'done') {
      state.duels.delete(duel.id);
      continue;
    }

    // Timeout safety net.
    if (state.tick >= duel.expiresTick && duel.state === 'playing') {
      duel.challengerStood = true;
      duel.opponentStood = true;
    }

    if (duel.state === 'playing') {
      const turn = blackjackTurn(duel);

      // ── Phases joueur (challenger / opponent) ────────────────────────
      // Un bot agit avec délai BLACKJACK_BOT_THINK_TICKS entre chaque action.
      if (turn === 'challenger' || turn === 'opponent') {
        duel.botActionCooldown--;
        if (duel.botActionCooldown <= 0) {
          duel.botActionCooldown = BLACKJACK_BOT_THINK_TICKS;
          if (turn === 'challenger') {
            botMaybeAct(state, duel.challengerId, duel.challengerCards,
              () => duel.challengerStood, () => { duel.challengerStood = true; });
          } else {
            botMaybeAct(state, duel.opponentId, duel.opponentCards,
              () => duel.opponentStood, () => { duel.opponentStood = true; });
          }
        }
      }

      // ── Phase croupier : pioche LENTE, une carte à chaque cooldown ───
      else if (turn === 'dealer') {
        duel.dealerCooldown--;
        if (duel.dealerCooldown <= 0) {
          duel.dealerCooldown = BLACKJACK_DEALER_DRAW_TICKS;
          if (!duel.dealerRevealed) {
            // Révélation de la carte cachée.
            duel.dealerCards.push(drawCard());
            duel.dealerRevealed = true;
          } else if (handValue(duel.dealerCards) < 17) {
            duel.dealerCards.push(drawCard());
          } else {
            // Croupier figé : on résout.
            applyResult(state, duel, emit);
          }
        }
      }
    } else if (duel.state === 'replay') {
      redeal(state, duel);
    } else if (duel.state === 'resolving') {
      if (state.tick >= duel.expiresTick) {
        const a = state.players.get(duel.challengerId);
        const b = state.players.get(duel.opponentId);
        if (a) {
          a.blackjackBusyUntil = 0;
          a.blackjackCooldownUntil = state.tick + BLACKJACK_COOLDOWN_TICKS;
        }
        if (b) {
          b.blackjackBusyUntil = 0;
          b.blackjackCooldownUntil = state.tick + BLACKJACK_COOLDOWN_TICKS;
        }
        duel.state = 'done';
      }
    }
  }
}

/** IA bot : stratégie basique (hit ≤16, stand sinon). */
function botMaybeAct(
  state: LocalGameState,
  playerId: string,
  cards: BlackjackCard[],
  getStood: () => boolean,
  setStood: () => void,
) {
  if (getStood()) return;
  const p = state.players.get(playerId);
  if (!p || !p.isBot) return;
  const v = handValue(cards);
  if (v >= 17) { setStood(); return; }
  cards.push(drawCard());
  if (isBust(cards)) setStood();
}

/** Calcule le résultat à partir des trois mains. AUCUN transfert d'or ni
 *  de troupes — seul un bonus de force est appliqué au vainqueur. */
function applyResult(state: LocalGameState, duel: BlackjackDuel, emit: Emitter) {
  const cV = handValue(duel.challengerCards);
  const oV = handValue(duel.opponentCards);
  const dV = handValue(duel.dealerCards);
  const cBust = cV > 21;
  const oBust = oV > 21;
  const dBust = dV > 21;

  const challengerBeatsDealer = !cBust && (dBust || cV > dV);
  const opponentBeatsDealer   = !oBust && (dBust || oV > dV);

  let winner: string | null = null;
  let push = false;

  if (challengerBeatsDealer && opponentBeatsDealer) {
    if (cV > oV) winner = duel.challengerId;
    else if (oV > cV) winner = duel.opponentId;
    else push = true;
  } else if (challengerBeatsDealer) {
    winner = duel.challengerId;
  } else if (opponentBeatsDealer) {
    winner = duel.opponentId;
  } else {
    if (duel.rounds < BLACKJACK_MAX_ROUNDS) {
      duel.rounds++;
      duel.state = 'replay';
      duel.expiresTick = state.tick + BLACKJACK_TIMEOUT_TICKS;
      return;
    }
    push = true;
  }

  const a = state.players.get(duel.challengerId);
  const b = state.players.get(duel.opponentId);

  if (push) {
    duel.challengerOutcome = 'push';
    duel.opponentOutcome   = 'push';
    duel.resultMessage = 'Égalité — aucun bonus accordé';
  } else if (winner === duel.challengerId) {
    duel.challengerOutcome = 'win';
    duel.opponentOutcome   = 'lose';
    duel.winnerId = duel.challengerId;
    duel.resultMessage = `${a?.name ?? 'Challenger'} domine ${b?.name ?? 'Opponent'} !`;
    // Bonus de force : +20 % du vainqueur CONTRE le perdant.
    if (a) a.blackjackBoosts.add(duel.opponentId);
  } else {
    duel.challengerOutcome = 'lose';
    duel.opponentOutcome   = 'win';
    duel.winnerId = duel.opponentId;
    duel.resultMessage = `${b?.name ?? 'Opponent'} domine ${a?.name ?? 'Challenger'} !`;
    if (b) b.blackjackBoosts.add(duel.challengerId);
  }

  duel.state = 'resolving';
  duel.expiresTick = state.tick + BLACKJACK_RESULT_HOLD_TICKS;

  emit(EVENT.BlackjackEnded, {
    duelId: duel.id,
    winnerId: duel.winnerId,
    message: duel.resultMessage,
  });
}

/** Redistribue de nouvelles cartes pour un round de replay. */
function redeal(state: LocalGameState, duel: BlackjackDuel) {
  duel.dealerCards     = [drawCard()];
  duel.challengerCards = [drawCard(), drawCard()];
  duel.opponentCards   = [drawCard(), drawCard()];
  duel.challengerStood = false;
  duel.opponentStood   = false;
  duel.dealerRevealed  = false;
  duel.state = 'playing';
  duel.botActionCooldown = BLACKJACK_BOT_THINK_TICKS;
  duel.dealerCooldown    = BLACKJACK_DEALER_DRAW_TICKS;
  if (handValue(duel.challengerCards) === 21) duel.challengerStood = true;
  if (handValue(duel.opponentCards)   === 21) duel.opponentStood   = true;
  const a = state.players.get(duel.challengerId);
  const b = state.players.get(duel.opponentId);
  if (a) a.blackjackBusyUntil = duel.expiresTick;
  if (b) b.blackjackBusyUntil = duel.expiresTick;
}
