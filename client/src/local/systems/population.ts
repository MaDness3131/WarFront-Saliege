/**
 * Population — croissance des troupes (OpenFront-style).
 * ------------------------------------------------------
 * Formules portées depuis openfrontio/Config.ts :
 *   maxTroops(player)         = 2 * (numTiles^0.6 * COEFF + FLOOR) + cityBonus
 *   cityBonus                 = totalCityLevel * CITY_BONUS
 *   troopIncreaseRate(player) = (BASE + troops^0.73 / DIV) * (1 - troops/maxTroops)
 *
 * Bots : maxTroops × 1/3, growth × 0.5.
 * Constantes adaptées à notre échelle (÷200 vs OpenFront — leur START_ARMY ~10k
 * vs notre 200).
 *
 * `cityCount` est déjà maintenu par tickEconomy : on lit p.cityCount sans
 * re-scanner les territoires.
 */

import { GameMode } from '@shared/types';
import {
  MODE_MODIFIERS,
  OF_MAX_TROOPS_EXP,
  OF_MAX_TROOPS_COEFF,
  OF_MAX_TROOPS_FLOOR,
  OF_MAX_TROOPS_CITY_BONUS,
  OF_BOT_MAX_TROOPS_MULT,
  BOT_TIER_MAX_TROOPS_MULT,
  OF_GROWTH_BASE,
  OF_GROWTH_POW,
  OF_GROWTH_DIV,
  OF_BOT_GROWTH_MULT,
  BOT_TIER_GROWTH_MULT,
} from '@shared/constants';
import { LocalGameState, LocalPlayer } from '../state';

/** maxTroops OpenFront — adapté à notre échelle :
 *   2 * (numTiles^0.6 × 8 + 250) + totalCityLevel × 1250
 *
 * Exemples :
 *   100 tuiles, 0 ville  → 2*(15.85*8 + 250)            =   753
 *   500 tuiles, 3 villes → 2*(33.5*8 + 250)  + 3*1250   =  4309
 *  1000 tuiles, 8 villes → 2*(63.1*8 + 250)  + 8*1250   = 11512
 *  3000 tuiles, 20 villes→ 2*(124.6*8 + 250) + 20*1250  = 27993
 */
export function maxTroops(p: LocalPlayer, cityLevelTotal: number): number {
  const base = 2 * (Math.pow(p.territoryCount, OF_MAX_TROOPS_EXP) * OF_MAX_TROOPS_COEFF + OF_MAX_TROOPS_FLOOR);
  const cityBonus = cityLevelTotal * OF_MAX_TROOPS_CITY_BONUS;
  let cap = base + cityBonus;
  if (p.isBot) {
    // Multiplicateur global + multiplicateur de tier.
    // 90% des bots (weak+normal) finissent sous le cap du joueur.
    // Les 10% strong atteignent ~70% du cap humain équivalent.
    cap *= OF_BOT_MAX_TROOPS_MULT * BOT_TIER_MAX_TROOPS_MULT[p.tier];
  }
  return cap;
}

/** troopIncreaseRate OpenFront — adapté à notre échelle :
 *   toAdd = (1 + troops^0.73 / 12) * (1 - troops / maxTroops)
 *
 * Exemples (à empty empire 50% fill) :
 *   200 troupes,   max 1000 → (1 + 200^0.73/12)*0.8         =  3.4/tick = 34/sec
 *  3000 troupes, max 10000  → (1 + 3000^0.73/12)*0.7        = 15.4/tick = 154/sec
 * 20000 troupes, max 30000  → (1 + 20000^0.73/12)*0.33      = 28.7/tick = 287/sec
 */
export function tickPopulation(state: LocalGameState) {
  const mod = MODE_MODIFIERS[state.mode as GameMode].populationMultiplier * state.speedMultiplier;

  for (const p of state.players.values()) {
    if (!p.alive) {
      p.population = 0;
      p.populationCap = 0;
      continue;
    }
    // p.cityCount stocke le nombre de villes mais on a besoin du LEVEL total.
    // On utilise cityCount comme proxy (chaque niveau = 1) — exact si chaque
    // ville reste à lvl 1, légèrement sous-estimé sinon. Pour le moment OK.
    const cityLevelTotal = p.cityCount;
    const cap = maxTroops(p, cityLevelTotal);
    p.populationCap = cap;
    p.population = p.army;

    const fill = Math.min(1, p.army / Math.max(1, cap));
    const toAdd = (OF_GROWTH_BASE + Math.pow(Math.max(0, p.army), OF_GROWTH_POW) / OF_GROWTH_DIV)
                  * (1 - fill);

    let growth = toAdd * mod;
    if (p.isBot) {
      growth *= OF_BOT_GROWTH_MULT * BOT_TIER_GROWTH_MULT[p.tier];
    }

    p.army = Math.max(0, Math.min(cap, p.army + growth));

    // Mode Admin : on force le cap à 9 chiffres et on garde l'armée à plein.
    // L'attaque retire des troupes mais on les rétablit chaque tick.
    if (p.adminMode) {
      p.populationCap = 9_999_999;
      p.army = p.populationCap;
      p.population = p.populationCap;
    }
  }
}
