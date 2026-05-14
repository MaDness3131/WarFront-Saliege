/**
 * Postgres — couche de persistance.
 * ---------------------------------
 * Gère ce qui survit à une partie : comptes, statistiques cumulées,
 * progression, classement Elo. La simulation temps réel n'écrit JAMAIS en
 * base pendant un tick ; seuls les événements de début/fin de partie le font.
 *
 * Le pool est paresseux : si DATABASE_URL n'est pas défini, le serveur
 * tourne quand même (mode dev sans persistance) et ces méthodes no-op.
 */

import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
const pool: Pool | null = connectionString ? new Pool({ connectionString }) : null;

if (!pool) {
  console.warn('[Postgres] DATABASE_URL absent — persistance désactivée (mode dev).');
}

// ──────────────────────────────────────────────────────────────────────────
// Schéma — à exécuter une fois (migration).
// ──────────────────────────────────────────────────────────────────────────

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS accounts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT UNIQUE NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stats (
  account_id      UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  elo             INTEGER NOT NULL DEFAULT 1000,
  games_played    INTEGER NOT NULL DEFAULT 0,
  games_won       INTEGER NOT NULL DEFAULT 0,
  territories_taken BIGINT NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode        TEXT NOT NULL,
  winner_id   UUID REFERENCES accounts(id),
  player_count INTEGER NOT NULL,
  duration_s  INTEGER NOT NULL,
  ended_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stats_elo ON stats(elo DESC);
`;

export async function migrate(): Promise<void> {
  if (!pool) return;
  await pool.query(SCHEMA_SQL);
  console.log('[Postgres] migration appliquée.');
}

// ──────────────────────────────────────────────────────────────────────────
// Comptes
// ──────────────────────────────────────────────────────────────────────────

export interface AccountStats {
  accountId: string;
  username: string;
  elo: number;
  gamesPlayed: number;
  gamesWon: number;
}

export async function findOrCreateAccount(username: string): Promise<AccountStats | null> {
  if (!pool) return null;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let res = await client.query('SELECT id FROM accounts WHERE username = $1', [username]);
    let id: string;
    if (res.rowCount === 0) {
      res = await client.query('INSERT INTO accounts(username) VALUES($1) RETURNING id', [username]);
      id = res.rows[0].id;
      await client.query('INSERT INTO stats(account_id) VALUES($1)', [id]);
    } else {
      id = res.rows[0].id;
    }
    const stats = await client.query(
      'SELECT elo, games_played, games_won FROM stats WHERE account_id = $1',
      [id],
    );
    await client.query('COMMIT');
    return {
      accountId: id,
      username,
      elo: stats.rows[0].elo,
      gamesPlayed: stats.rows[0].games_played,
      gamesWon: stats.rows[0].games_won,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Postgres] findOrCreateAccount échoué :', err);
    return null;
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Elo — système classique (K=32).
// ──────────────────────────────────────────────────────────────────────────

const ELO_K = 32;

/** Espérance de score de A face à B. */
export function eloExpected(ratingA: number, ratingB: number): number {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

/** Nouveau classement après un résultat (1 = victoire, 0 = défaite). */
export function eloUpdate(rating: number, expected: number, score: number): number {
  return Math.round(rating + ELO_K * (score - expected));
}

// ──────────────────────────────────────────────────────────────────────────
// Enregistrement de fin de partie
// ──────────────────────────────────────────────────────────────────────────

export interface MatchOutcome {
  mode: string;
  winnerId: string | null;
  playerCount: number;
  durationSeconds: number;
  /** Pour chaque joueur : son nouvel Elo et nb de territoires pris. */
  results: { accountId: string; newElo: number; won: boolean; territoriesTaken: number }[];
}

export async function recordMatch(outcome: MatchOutcome): Promise<void> {
  if (!pool) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'INSERT INTO matches(mode, winner_id, player_count, duration_s) VALUES($1,$2,$3,$4)',
      [outcome.mode, outcome.winnerId, outcome.playerCount, outcome.durationSeconds],
    );
    for (const r of outcome.results) {
      await client.query(
        `UPDATE stats SET
           elo = $2,
           games_played = games_played + 1,
           games_won = games_won + $3,
           territories_taken = territories_taken + $4,
           updated_at = now()
         WHERE account_id = $1`,
        [r.accountId, r.newElo, r.won ? 1 : 0, r.territoriesTaken],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Postgres] recordMatch échoué :', err);
  } finally {
    client.release();
  }
}

/** Top N du classement mondial. */
export async function leaderboard(limit = 100): Promise<AccountStats[]> {
  if (!pool) return [];
  const res = await pool.query(
    `SELECT a.id, a.username, s.elo, s.games_played, s.games_won
       FROM stats s JOIN accounts a ON a.id = s.account_id
       ORDER BY s.elo DESC LIMIT $1`,
    [limit],
  );
  return res.rows.map((r) => ({
    accountId: r.id,
    username: r.username,
    elo: r.elo,
    gamesPlayed: r.games_played,
    gamesWon: r.games_won,
  }));
}
