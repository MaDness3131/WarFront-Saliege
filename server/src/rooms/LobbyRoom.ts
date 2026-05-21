/**
 * LobbyRoom — salon de pré-partie pour le mode multijoueur amis.
 * --------------------------------------------------------------------------
 * Pas de simulation ici : juste un lieu de rassemblement où les joueurs
 * se rejoignent via un CODE de salon à 6 caractères. Le host (premier
 * arrivé) configure puis lance la partie — à ce moment-là, le serveur
 * crée une GameRoom dédiée et y matchmake tous les membres du lobby.
 *
 * Architecture du flow :
 *   1. Joueur A → createPrivateLobby() → reçoit un code (ex : "AZBK9X")
 *   2. Joueur B → joinByCode("AZBK9X") → entre dans le même LobbyRoom
 *   3. Lobby state diffuse la liste des joueurs en temps réel
 *   4. Host clique "Lancer" → le serveur génère une GameRoom dédiée
 *      et renvoie son ID aux clients via message StartGame
 *   5. Chaque client appelle joinById(gameRoomId) côté Colyseus
 *
 * Le code de salon est lisible (6 caractères majuscules + chiffres) pour
 * être partageable oralement entre amis.
 */

import { Room, Client } from '@colyseus/core';
import { Schema, MapSchema, type } from '@colyseus/schema';

export class LobbyMemberSchema extends Schema {
  @type('string') sessionId = '';
  @type('string') name = '';
  @type('string') skinId = 'default';
  @type('boolean') isHost = false;
  @type('boolean') ready = false;
}

export class LobbyState extends Schema {
  @type('string') code = '';
  @type('string') hostSessionId = '';
  @type({ map: LobbyMemberSchema }) members = new MapSchema<LobbyMemberSchema>();
  /** Une fois 'starting' : Colyseus a créé la GameRoom et chaque client
   *  doit migrer dessus via le message StartGame. */
  @type('string') status: 'open' | 'starting' | 'started' = 'open';
  /** Configuration courante du host (mise à jour via UpdateConfig). */
  @type('string') mapSize: 'small' | 'medium' | 'large' = 'medium';
  @type('uint8') botCount = 6;
}

interface CreateOptions {
  name?: string;
  skinId?: string;
  code?: string;
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // évite I/O/0/1 ambigus

function genCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

export class LobbyRoom extends Room<LobbyState> {
  maxClients = 12;

  onCreate(options: CreateOptions) {
    const state = new LobbyState();
    state.code = (options.code || genCode()).toUpperCase();
    this.setState(state);

    // Pour permettre le filterBy({ code }) côté matchmaking.
    this.setMetadata({ code: state.code });
    this.roomId = state.code; // expose le code comme roomId quand possible

    // ─── Messages ──────────────────────────────────────────────────────
    this.onMessage('toggleReady', (client) => {
      const m = state.members.get(client.sessionId);
      if (!m) return;
      m.ready = !m.ready;
    });

    this.onMessage('updateConfig', (client, msg: { mapSize?: any; botCount?: number }) => {
      // Seul le host peut changer la config.
      if (client.sessionId !== state.hostSessionId) return;
      if (msg.mapSize === 'small' || msg.mapSize === 'medium' || msg.mapSize === 'large') {
        state.mapSize = msg.mapSize;
      }
      if (typeof msg.botCount === 'number') {
        state.botCount = Math.max(0, Math.min(100, Math.floor(msg.botCount)));
      }
    });

    this.onMessage('start', (client) => {
      if (client.sessionId !== state.hostSessionId) return;
      if (state.status !== 'open') return;
      state.status = 'starting';
      // Envoie à chaque client un signal de lancement avec la config.
      this.broadcast('start', {
        mapSize: state.mapSize,
        botCount: state.botCount,
        code: state.code,
        members: [...state.members.values()].map((m) => ({
          sessionId: m.sessionId,
          name: m.name,
          skinId: m.skinId,
          isHost: m.isHost,
        })),
      });
      // Dispose la lobby room après quelques secondes (les joueurs sont
      // partis dans la GameRoom).
      this.clock.setTimeout(() => {
        state.status = 'started';
        this.disconnect();
      }, 3000);
    });

    this.onMessage('chat', (client, msg: { text?: string }) => {
      const m = state.members.get(client.sessionId);
      if (!m || typeof msg.text !== 'string') return;
      const text = msg.text.slice(0, 200);
      this.broadcast('chat', { from: m.name, sessionId: client.sessionId, text });
    });
  }

  onJoin(client: Client, options: { name?: string; skinId?: string }) {
    const member = new LobbyMemberSchema();
    member.sessionId = client.sessionId;
    member.name = (options.name ?? 'Commandant').slice(0, 20);
    member.skinId = options.skinId ?? 'default';
    member.isHost = this.state.members.size === 0;
    this.state.members.set(client.sessionId, member);
    if (member.isHost) {
      this.state.hostSessionId = client.sessionId;
    }
    console.log(`[Lobby ${this.state.code}] ${member.name} (${client.sessionId}) — host=${member.isHost}`);
  }

  onLeave(client: Client) {
    const was = this.state.members.get(client.sessionId);
    this.state.members.delete(client.sessionId);
    if (was?.isHost && this.state.members.size > 0) {
      // Transfert du host au prochain membre.
      const next = this.state.members.values().next().value;
      if (next) {
        next.isHost = true;
        this.state.hostSessionId = next.sessionId;
      }
    }
    if (this.state.members.size === 0) {
      this.disconnect();
    }
  }

  onDispose() {
    console.log(`[Lobby ${this.state.code}] disposed.`);
  }
}
