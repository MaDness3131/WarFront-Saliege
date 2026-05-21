/**
 * Diplomacy — alliances, propositions, trahisons (Phase 2).
 * ---------------------------------------------------------
 * Une alliance regroupe deux joueurs (MVP) avec vision partagée et
 * impossibilité de s'attaquer. Briser une alliance est instantané mais coûte
 * du score et bloque toute nouvelle proposition pendant un cooldown.
 */

import { AllianceState } from '@shared/types';
import {
  ALLIANCE_PROPOSAL_TTL_TICKS,
  ALLIANCE_BETRAYAL_SCORE_MALUS,
  ALLIANCE_BETRAYAL_COOLDOWN_TICKS,
} from '@shared/constants';
import { LocalGameState, nextId } from '../state';
import { Emitter, EVENT } from '../events';

/** Crée une proposition d'alliance de `from` vers `to`. */
export function proposeAlliance(
  state: LocalGameState,
  fromId: string,
  toId: string,
  emit: Emitter,
): boolean {
  if (!state.enabled.alliances) return false;
  if (fromId === toId) return false;
  const from = state.players.get(fromId);
  const to = state.players.get(toId);
  if (!from || !to || !from.alive || !to.alive) return false;
  if (from.allianceId || to.allianceId) return false;
  if (state.tick < from.diplomacyLockUntil) return false;

  // Pas deux propositions simultanées.
  for (const p of state.proposals.values()) {
    if ((p.from === fromId && p.to === toId) || (p.from === toId && p.to === fromId)) {
      return false;
    }
  }

  const id = nextId(state, 'prop');
  state.proposals.set(id, {
    id,
    from: fromId,
    to: toId,
    expiresTick: state.tick + ALLIANCE_PROPOSAL_TTL_TICKS,
  });
  emit(EVENT.AllianceProposed, { proposalId: id, from: fromId, to: toId });
  return true;
}

/** Accepte une proposition existante → forme l'alliance. */
export function acceptProposal(
  state: LocalGameState,
  accepterId: string,
  proposalId: string,
  emit: Emitter,
): boolean {
  const prop = state.proposals.get(proposalId);
  if (!prop || prop.to !== accepterId) return false;
  state.proposals.delete(proposalId);

  const a = state.players.get(prop.from);
  const b = state.players.get(prop.to);
  if (!a || !b || !a.alive || !b.alive) return false;
  if (a.allianceId || b.allianceId) return false;

  const id = nextId(state, 'al');
  state.alliances.set(id, {
    id,
    members: [a.id, b.id],
    state: AllianceState.Active,
    sharedVision: true,
    createdAt: state.tick,
  });
  a.allianceId = id;
  b.allianceId = id;
  emit(EVENT.AllianceFormed, { allianceId: id, members: [a.id, b.id] });
  return true;
}

export function rejectProposal(state: LocalGameState, accepterId: string, proposalId: string): boolean {
  const prop = state.proposals.get(proposalId);
  if (!prop || prop.to !== accepterId) return false;
  state.proposals.delete(proposalId);
  return true;
}

/** Brise une alliance — le « briseur » est marqué comme traître. */
export function breakAlliance(
  state: LocalGameState,
  breakerId: string,
  allianceId: string,
  emit: Emitter,
): boolean {
  const al = state.alliances.get(allianceId);
  if (!al) return false;
  if (!al.members.includes(breakerId)) return false;

  for (const m of al.members) {
    const p = state.players.get(m);
    if (!p) continue;
    p.allianceId = null;
    if (m === breakerId) {
      p.score = Math.max(0, p.score - ALLIANCE_BETRAYAL_SCORE_MALUS);
      p.diplomacyLockUntil = state.tick + ALLIANCE_BETRAYAL_COOLDOWN_TICKS;
    }
  }
  al.state = AllianceState.Broken;
  state.alliances.delete(allianceId);
  emit(EVENT.AllianceBroken, { allianceId, breaker: breakerId, members: al.members });
  return true;
}

/** Expire les propositions trop vieilles ; à appeler chaque tick. */
export function tickDiplomacy(state: LocalGameState) {
  if (!state.enabled.alliances) return;
  for (const [id, prop] of state.proposals) {
    if (state.tick >= prop.expiresTick) state.proposals.delete(id);
  }
  // Une alliance dont un membre meurt se dissout silencieusement.
  for (const [id, al] of state.alliances) {
    const alive = al.members.filter((m) => state.players.get(m)?.alive);
    if (alive.length < 2) {
      for (const m of al.members) {
        const p = state.players.get(m);
        if (p) p.allianceId = null;
      }
      state.alliances.delete(id);
    }
  }
}
