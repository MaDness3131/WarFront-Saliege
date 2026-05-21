/**
 * Casino solo — Roulette et Machine à sous.
 * --------------------------------------------------------------------------
 * Deux minijeux PvE accessibles depuis le bâtiment Casino du joueur.
 *
 *  - Roulette européenne (37 numéros : 0 vert + 18 rouges + 18 noirs).
 *    Paris standard : rouge/noir, pair/impair, low/high, plein numéro.
 *    Multiplicateurs OpenFront-style respectant le 2.7 % d'edge de la
 *    maison (les paris "outside" payent ×2, les plein numéro ×36 pour
 *    1/37 de chance).
 *
 *  - Slot machine à 3 rouleaux × 5 symboles pondérés.
 *    Pull fixe à SLOTS_BET_COST or. Trois symboles identiques alignés
 *    = gros lot, sinon perte de la mise. Edge maison ≈ 8 %.
 *
 * Aucune dépendance UI : le module se contente de valider, débiter,
 * tirer et émettre un événement avec le résultat. Le rendu / animation
 * sont gérés côté React (RouletteModal, SlotsModal).
 */

import {
  ROULETTE_RED_NUMBERS,
  ROULETTE_PAYOUTS,
  ROULETTE_MIN_BET,
  ROULETTE_MAX_BET,
  SLOTS_BET_COST,
  SLOTS_REEL_WEIGHTS,
  SLOTS_PAYOUTS,
} from '@shared/constants';
import { BuildingType } from '@shared/types';
import { LocalGameState } from '../state';
import { trySpend } from './economy';
import { Emitter, EVENT } from '../events';

/** Renvoie true si le joueur a au moins un Casino fini. Réutilise la même
 *  règle que pour le blackjack pour rester cohérent. */
function playerHasCasino(state: LocalGameState, playerId: string): boolean {
  const tiles = state.playerTiles.get(playerId);
  if (!tiles) return false;
  for (const id of tiles) {
    const t = state.territoryById.get(id);
    if (!t) continue;
    if (t.building === BuildingType.Casino && t.buildingLevel > 0) return true;
  }
  return false;
}

// ─── Roulette ─────────────────────────────────────────────────────────

export type RouletteBetType = 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' | 'number';

function rouletteWins(betType: RouletteBetType, betNumber: number, result: number): boolean {
  if (result === 0) return betType === 'number' && betNumber === 0;
  switch (betType) {
    case 'red':    return ROULETTE_RED_NUMBERS.has(result);
    case 'black':  return !ROULETTE_RED_NUMBERS.has(result) && result !== 0;
    case 'even':   return result % 2 === 0;
    case 'odd':    return result % 2 === 1;
    case 'low':    return result >= 1 && result <= 18;
    case 'high':   return result >= 19 && result <= 36;
    case 'number': return result === betNumber;
  }
}

/** Lance un tour de roulette. Validation, débit, tirage, paiement, event. */
export function rouletteSpin(
  state: LocalGameState,
  playerId: string,
  betType: RouletteBetType,
  betAmount: number,
  betNumber: number,
  emit: Emitter,
): { ok: boolean; reason?: string } {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return { ok: false, reason: 'no_player' };
  if (!playerHasCasino(state, playerId)) return { ok: false, reason: 'no_casino' };

  // Validation de la mise.
  const amount = Math.floor(betAmount);
  if (!Number.isFinite(amount) || amount < ROULETTE_MIN_BET) return { ok: false, reason: 'bet_too_small' };
  if (amount > ROULETTE_MAX_BET) return { ok: false, reason: 'bet_too_large' };
  if (betType === 'number' && (betNumber < 0 || betNumber > 36)) return { ok: false, reason: 'bad_number' };

  // Débit (admin mode → trySpend retourne true sans déduire).
  if (!trySpend(p, amount)) return { ok: false, reason: 'no_gold' };

  // Tirage de la bille.
  const result = Math.floor(Math.random() * 37);  // 0..36

  const won = rouletteWins(betType, betNumber, result);
  let payout = 0;
  if (won) {
    payout = amount * ROULETTE_PAYOUTS[betType];
    p.gold += payout;
  }

  emit(EVENT.RouletteResult, {
    playerId,
    number: result,
    betType,
    betAmount: amount,
    betNumber,
    payout,
    won,
  });

  return { ok: true };
}

// ─── Slots ────────────────────────────────────────────────────────────

/** Tire un symbole pondéré (0..4) selon SLOTS_REEL_WEIGHTS. */
function drawSlotSymbol(): number {
  const totalWeight = SLOTS_REEL_WEIGHTS.reduce((s, w) => s + w, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < SLOTS_REEL_WEIGHTS.length; i++) {
    r -= SLOTS_REEL_WEIGHTS[i];
    if (r <= 0) return i;
  }
  return SLOTS_REEL_WEIGHTS.length - 1;
}

/** Pull de machine à sous. 3 rouleaux indépendants ; 3-identique = payout. */
export function slotsPull(
  state: LocalGameState,
  playerId: string,
  emit: Emitter,
): { ok: boolean; reason?: string } {
  const p = state.players.get(playerId);
  if (!p || !p.alive) return { ok: false, reason: 'no_player' };
  if (!playerHasCasino(state, playerId)) return { ok: false, reason: 'no_casino' };

  if (!trySpend(p, SLOTS_BET_COST)) return { ok: false, reason: 'no_gold' };

  // Tirage des 3 rouleaux.
  const symbols = [drawSlotSymbol(), drawSlotSymbol(), drawSlotSymbol()];

  // 3-identique uniquement (pas de combinaisons partielles pour rester lisible).
  let payout = 0;
  let jackpot = false;
  if (symbols[0] === symbols[1] && symbols[1] === symbols[2]) {
    payout = SLOTS_PAYOUTS[symbols[0]];
    p.gold += payout;
    jackpot = symbols[0] === 4; // 3 Wilds = giga jackpot
  }

  emit(EVENT.SlotsResult, {
    playerId,
    symbols,
    payout,
    jackpot,
  });

  return { ok: true };
}
