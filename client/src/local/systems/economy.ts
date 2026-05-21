/**
 * Economy — revenus de gold (OpenFront-style).
 * --------------------------------------------
 * Source : openfrontio/Config.ts → goldAdditionRate(player) renvoie un taux
 * FIXE par tick (100/tick humain, 50/tick bot). Pas d'upkeep d'armée chez
 * OpenFront. Le gold supplémentaire vient de :
 *   - bonus par usine (production locale)
 *   - bonus de trade-route ville × usine (réseau marchand, similaire à leur
 *     tradeShipGold qui scale avec la distance)
 *
 * On garde notre système de réseau commercial (city × factory × distance)
 * en supplément du taux flat, pour conserver l'intérêt stratégique de
 * construire des villes ET des usines diversifiées.
 *
 * Effet de bord : on en profite pour maintenir cityCount / factoryCount /
 * portCount / defenseCount / samCount sur chaque LocalPlayer, une seule
 * fois par tick — utilisés par l'UI et par la population.
 */

import { BuildingType, GameMode } from '@shared/types';
import {
  MODE_MODIFIERS,
  OF_GOLD_RATE_HUMAN,
  OF_GOLD_RATE_BOT,
} from '@shared/constants';
import { LocalGameState, LocalPlayer } from '../state';

/** Bonus de gold par niveau d'usine — rebalancé à 0.15 (était 0.05) :
 *  les usines coûtent 400+ donc elles doivent rapporter visiblement.
 *  Une usine lvl 1 = +1.5 or/sec, soit +125% vs le rate de base humain. */
const GOLD_PER_FACTORY_LEVEL = 0.15;
/** Bonus par port — revenu commercial maritime (nouveau, indépendant du
 *  réseau ville×usine). Un port = +0.30 or/tick = +3 or/sec. */
const GOLD_PER_PORT = 0.30;
/** Bonus de réseau commercial : (villes × usines) × distance. ×2 vs avant. */
const TRADE_NETWORK_BASE = 0.025;
/** Exposant léger pour récompenser les empires diversifiés. */
const TRADE_NETWORK_EXPONENT = 1.10;
/** Bonus par 100 cellules de distance entre barycentre ville et usine. */
const TRADE_NETWORK_DISTANCE_BONUS = 0.7;

export function tickEconomy(state: LocalGameState) {
  const mod = MODE_MODIFIERS[state.mode as GameMode].economyMultiplier * state.speedMultiplier;

  // Agrégation des bâtiments par joueur en UN seul passage.
  type Agg = {
    cityLvl: number; factoryLvl: number;
    portCount: number; defenseCount: number; samCount: number;
    cityCount: number; factoryCount: number; casinoCount: number;
    citySumX: number; citySumY: number;
    factSumX: number; factSumY: number;
  };
  const agg = new Map<string, Agg>();
  const blank = (): Agg => ({
    cityLvl: 0, factoryLvl: 0, portCount: 0, defenseCount: 0, samCount: 0,
    cityCount: 0, factoryCount: 0, casinoCount: 0,
    citySumX: 0, citySumY: 0, factSumX: 0, factSumY: 0,
  });

  for (const t of state.territories) {
    if (!t.owner || t.buildingLevel <= 0) continue;
    let a = agg.get(t.owner);
    if (!a) { a = blank(); agg.set(t.owner, a); }
    if (t.building === BuildingType.City) {
      a.cityLvl += t.buildingLevel;
      a.cityCount += 1;
      a.citySumX += t.x; a.citySumY += t.y;
    } else if (t.building === BuildingType.Factory) {
      a.factoryLvl += t.buildingLevel;
      a.factoryCount += 1;
      a.factSumX += t.x; a.factSumY += t.y;
    } else if (t.building === BuildingType.Port) {
      a.portCount += 1;
    } else if (t.building === BuildingType.DefensePost) {
      a.defenseCount += 1;
    } else if (t.building === BuildingType.SamLauncher) {
      a.samCount += 1;
    } else if (t.building === BuildingType.Casino) {
      a.casinoCount += 1;
    }
  }

  for (const p of state.players.values()) {
    if (!p.alive) {
      p.income = 0;
      p.cityCount = 0; p.factoryCount = 0;
      p.portCount = 0; p.defenseCount = 0; p.samCount = 0;
      p.casinoCount = 0;
      continue;
    }
    const a = agg.get(p.id) ?? blank();
    p.cityCount = a.cityCount;
    p.factoryCount = a.factoryCount;
    p.portCount = a.portCount;
    p.defenseCount = a.defenseCount;
    p.samCount = a.samCount;
    p.casinoCount = a.casinoCount;

    // ─── OpenFront base rate : taux FIXE par tick, humain × 2 bot ─────
    const baseRate = p.isBot ? OF_GOLD_RATE_BOT : OF_GOLD_RATE_HUMAN;

    // ─── Bonus usine (production locale, scale avec niveau) ─────────────
    const factoryIncome = a.factoryLvl * GOLD_PER_FACTORY_LEVEL;

    // ─── Bonus port (commerce maritime, scale linéaire) ─────────────────
    const portIncome = a.portCount * GOLD_PER_PORT;

    // ─── Bonus trade route ville × usine ────────────────────────────────
    // Inspiration : tradeShipGold OpenFront = f(distance). On synthétise
    // un revenu de réseau interne quand le joueur a villes ET usines.
    let trade = 0;
    if (a.cityCount > 0 && a.factoryCount > 0) {
      const cx = a.citySumX / a.cityCount;
      const cy = a.citySumY / a.cityCount;
      const fx = a.factSumX / a.factoryCount;
      const fy = a.factSumY / a.factoryCount;
      const avgDist = Math.hypot(cx - fx, cy - fy);
      const distMult = 1 + (avgDist / 100) * TRADE_NETWORK_DISTANCE_BONUS;
      const pairs = a.cityLvl * a.factoryLvl;
      trade = Math.pow(pairs, TRADE_NETWORK_EXPONENT) * TRADE_NETWORK_BASE * distMult;
    }

    // Pas d'upkeep d'armée chez OpenFront — net = gross.
    const net = (baseRate + factoryIncome + portIncome + trade) * mod;
    p.income = net;
    p.gold = Math.max(0, p.gold + net);

    // Mode Admin : on plafonne en haut à 9 chiffres (lisible "∞" côté UI).
    if (p.adminMode) {
      p.gold = 999_999_999;
      p.income = 0; // pas pertinent en admin
    }
  }
}

export function trySpend(player: LocalPlayer, amount: number): boolean {
  // Mode Admin : or illimité, on accepte toutes les dépenses sans débiter.
  if (player.adminMode) return true;
  if (player.gold < amount) return false;
  player.gold -= amount;
  return true;
}
