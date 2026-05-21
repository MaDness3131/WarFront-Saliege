/**
 * BlackjackModal — table de jeu compacte style casino.
 * --------------------------------------------------------------------------
 * Trois mains : croupier (haut), joueur (bas gauche), adversaire (bas droite).
 * Tour-par-tour : le challenger joue, puis l'opposant, puis le croupier
 * révèle ses cartes et tire jusqu'à 17. Les boutons sont actifs uniquement
 * pendant le tour du joueur courant ; un indicateur "À toi / Tour adverse /
 * Croupier" est affiché.
 *
 * Mises personnelles affichées à côté de chaque siège. À la fin du duel,
 * le bandeau résultat annonce explicitement le gain ou la perte (or +
 * troupes).
 *
 * La table reste assez petite pour qu'on voie la carte du jeu en arrière-
 * plan à travers un voile semi-transparent (pas de blackout complet).
 */

import { useMemo } from 'react';
import { socket } from '../../network/SocketClient';
import { GameSnapshot, BlackjackDuelView, BlackjackCardView } from '../useGameState';

// ─── Utilitaires de calcul de main ────────────────────────────────────

function cardBaseValue(c: BlackjackCardView): number {
  if (c.rank === 1) return 1;
  if (c.rank >= 11) return 10;
  return c.rank;
}

function handValue(cards: BlackjackCardView[]): number {
  let sum = 0;
  let aces = 0;
  for (const c of cards) {
    sum += cardBaseValue(c);
    if (c.rank === 1) aces++;
  }
  while (aces > 0 && sum + 10 <= 21) { sum += 10; aces--; }
  return sum;
}

const SUITS = ['♠', '♥', '♦', '♣'] as const;
const RANK_LABEL = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function suitIsRed(suit: number): boolean { return suit === 1 || suit === 2; }

/** Calcule de qui c'est le tour côté UI — réplique de blackjackTurn() côté sim. */
function whoseTurn(duel: BlackjackDuelView): 'challenger' | 'opponent' | 'dealer' {
  if (!duel.challengerStood) return 'challenger';
  if (!duel.opponentStood)   return 'opponent';
  return 'dealer';
}

// ─── Carte visuelle ───────────────────────────────────────────────────

function Card({ card, hidden, delay }: { card: BlackjackCardView | null; hidden?: boolean; delay?: number }) {
  if (hidden || !card) {
    return (
      <div className="bj-card bj-card-back" style={{ animationDelay: `${delay ?? 0}ms` }}>
        <div className="bj-card-back-pattern" />
      </div>
    );
  }
  const red = suitIsRed(card.suit);
  return (
    <div className={`bj-card bj-card-face ${red ? 'is-red' : 'is-black'}`} style={{ animationDelay: `${delay ?? 0}ms` }}>
      <div className="bj-card-corner top">{RANK_LABEL[card.rank]}<span>{SUITS[card.suit]}</span></div>
      <div className="bj-card-suit">{SUITS[card.suit]}</div>
      <div className="bj-card-corner bot">{RANK_LABEL[card.rank]}<span>{SUITS[card.suit]}</span></div>
    </div>
  );
}

interface Props {
  snap: GameSnapshot;
}

export function BlackjackModal({ snap }: Props) {
  // On affiche le premier duel impliquant le joueur. Local = max 1.
  const duel = snap.duels.find((d) => d.state !== 'done') ?? null;
  if (!duel) return null;

  const myId = snap.me?.id;
  const iAmChallenger = duel.challengerId === myId;
  const myCards   = iAmChallenger ? duel.challengerCards : duel.opponentCards;
  const oppCards  = iAmChallenger ? duel.opponentCards   : duel.challengerCards;
  const myStood   = iAmChallenger ? duel.challengerStood : duel.opponentStood;
  const oppStood  = iAmChallenger ? duel.opponentStood   : duel.challengerStood;
  const myOutcome = iAmChallenger ? duel.challengerOutcome : duel.opponentOutcome;

  // Ma mise personnelle (et celle de l'adversaire pour l'afficher en face).
  const myGoldBet     = iAmChallenger ? duel.challengerGoldBet     : duel.opponentGoldBet;
  const myTroopsBet   = iAmChallenger ? duel.challengerTroopsBet   : duel.opponentTroopsBet;
  const oppGoldBet    = iAmChallenger ? duel.opponentGoldBet       : duel.challengerGoldBet;
  const oppTroopsBet  = iAmChallenger ? duel.opponentTroopsBet     : duel.challengerTroopsBet;

  const opponentPlayer = snap.players.find(
    (p) => p.id === (iAmChallenger ? duel.opponentId : duel.challengerId),
  );

  const myValue     = handValue(myCards);
  const oppValue    = handValue(oppCards);
  const dealerValue = handValue(duel.dealerCards);

  const myBust  = myValue  > 21;
  const oppBust = oppValue > 21;

  const isPlaying    = duel.state === 'playing';
  const isResolving  = duel.state === 'resolving';

  // Tour-par-tour : seul le joueur dont c'est le tour peut cliquer.
  const turn = whoseTurn(duel);
  const myTurnId = iAmChallenger ? 'challenger' : 'opponent';
  const isMyTurn = isPlaying && turn === myTurnId && !myStood && !myBust;

  // Libellé d'indication de tour.
  let turnHint = '';
  if (isPlaying) {
    if (turn === 'challenger') turnHint = iAmChallenger ? 'À toi de jouer' : `Au tour de ${opponentPlayer?.name ?? 'l\'adversaire'}`;
    else if (turn === 'opponent') turnHint = !iAmChallenger ? 'À toi de jouer' : `Au tour de ${opponentPlayer?.name ?? 'l\'adversaire'}`;
    else turnHint = 'Le croupier joue…';
  }

  const onHit = () => socket.blackjackHit(duel.id);
  const onStand = () => socket.blackjackStand(duel.id);

  return (
    <div className="bj-overlay">
      {/* Halo doré rotatif décoratif derrière la table */}
      <div className="bj-halo" />
      <div className="bj-table">

        {/* ── Croupier (haut) ─────────────────────────────────── */}
        <div className="bj-seat bj-seat-dealer">
          <div className="bj-seat-label">CROUPIER · {duel.dealerRevealed ? dealerValue : '?'}</div>
          <div className="bj-hand">
            {duel.dealerCards.map((c, i) => (
              <Card key={`d-${i}-${c.rank}-${c.suit}`} card={c} delay={i * 90} />
            ))}
            {!duel.dealerRevealed && (
              <Card card={null} hidden delay={duel.dealerCards.length * 90} />
            )}
          </div>
        </div>

        {/* Bandeau central : indication de tour + round */}
        <div className="bj-banner">
          <div className="bj-banner-title">DUEL BLACKJACK</div>
          <div className="bj-banner-turn">
            {turnHint}
            {duel.rounds > 1 && <span className="bj-round"> — Round {duel.rounds}</span>}
          </div>
        </div>

        {/* ── Joueurs (bas) ───────────────────────────────────── */}
        <div className="bj-players">
          <div className={`bj-seat bj-seat-me ${myStood ? 'is-stood' : ''} ${myBust ? 'is-bust' : ''} ${turn === myTurnId && isPlaying ? 'is-active' : ''}`}>
            <div className="bj-seat-label">VOUS · {myValue}{myBust ? ' (BUST)' : ''}{myStood && !myBust ? ' ✓' : ''}</div>
            <div className="bj-hand">
              {myCards.map((c, i) => (
                <Card key={`m-${i}-${c.rank}-${c.suit}`} card={c} delay={i * 90} />
              ))}
            </div>
            <div className="bj-stake">
              <span className="bj-chip bj-chip-gold">{myGoldBet}</span> or
              <span className="bj-stake-sep">·</span>
              <span className="bj-chip bj-chip-army">{myTroopsBet}</span> troupes
            </div>
          </div>

          <div className={`bj-seat bj-seat-opp ${oppStood ? 'is-stood' : ''} ${oppBust ? 'is-bust' : ''} ${turn !== myTurnId && turn !== 'dealer' && isPlaying ? 'is-active' : ''}`}>
            <div className="bj-seat-label">
              {opponentPlayer?.name ?? 'Adversaire'} · {oppValue}{oppBust ? ' (BUST)' : ''}{oppStood && !oppBust ? ' ✓' : ''}
            </div>
            <div className="bj-hand">
              {oppCards.map((c, i) => (
                <Card key={`o-${i}-${c.rank}-${c.suit}`} card={c} delay={i * 90} />
              ))}
            </div>
            <div className="bj-stake">
              <span className="bj-chip bj-chip-gold">{oppGoldBet}</span> or
              <span className="bj-stake-sep">·</span>
              <span className="bj-chip bj-chip-army">{oppTroopsBet}</span> troupes
            </div>
          </div>
        </div>

        {/* Boutons d'action */}
        <div className="bj-actions">
          <button className="bj-btn bj-btn-hit" onClick={onHit} disabled={!isMyTurn}>
            <span className="bj-btn-glyph">＋</span>
            <span>Tirer</span>
          </button>
          <button className="bj-btn bj-btn-stand" onClick={onStand} disabled={!isMyTurn}>
            <span className="bj-btn-glyph">✋</span>
            <span>Rester</span>
          </button>
        </div>

        {/* Bandeau résultat */}
        {isResolving && (
          <ResultBanner
            outcome={myOutcome}
            message={duel.resultMessage}
            opponentName={opponentPlayer?.name ?? 'l\'adversaire'}
          />
        )}
      </div>
    </div>
  );
}

function ResultBanner({
  outcome, message, opponentName,
}: {
  outcome: 'win' | 'lose' | 'push' | null;
  message: string;
  opponentName: string;
}) {
  const cls = outcome === 'win' ? 'bj-result-win'
            : outcome === 'lose' ? 'bj-result-lose'
            : 'bj-result-push';
  const title = outcome === 'win' ? 'VICTOIRE'
              : outcome === 'lose' ? 'DÉFAITE'
              : 'ÉGALITÉ';

  // Annonce du bonus de force (les ressources ne bougent pas).
  let payoutLabel = '';
  if (outcome === 'win') {
    payoutLabel = `+20 % de force contre ${opponentName}`;
  } else if (outcome === 'lose') {
    payoutLabel = `${opponentName} obtient +20 % de force contre vous`;
  } else {
    payoutLabel = 'Aucun bonus accordé';
  }

  // Confettis dorés à la victoire uniquement.
  const confetti = useMemo(() => {
    if (outcome !== 'win') return [];
    return Array.from({ length: 24 }).map((_, i) => ({
      key: i,
      left: Math.random() * 100,
      delay: Math.random() * 600,
      dur: 1200 + Math.random() * 800,
      color: ['#f1c40f', '#fff', '#ffd247', '#ff4060'][i % 4],
    }));
  }, [outcome]);
  return (
    <div className={`bj-result ${cls}`}>
      {outcome === 'win' && (
        <div className="bj-confetti">
          {confetti.map((c) => (
            <span
              key={c.key}
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}ms`,
                animationDuration: `${c.dur}ms`,
              }}
            />
          ))}
        </div>
      )}
      <div className="bj-result-title">{title}</div>
      <div className="bj-result-payout">{payoutLabel}</div>
      <div className="bj-result-msg">{message}</div>
    </div>
  );
}
