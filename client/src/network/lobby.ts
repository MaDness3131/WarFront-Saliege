/**
 * lobby.ts — système de salons multijoueurs P2P via PeerJS.
 * --------------------------------------------------------------------------
 * Pas de serveur à gérer : on s'appuie sur le broker public PeerJS pour la
 * signalisation, puis tout passe en WebRTC peer-to-peer entre navigateurs.
 *
 * Modèle de connexion :
 *   - HOST : crée un Peer avec ID = `wf-saliege-<CODE>` (le préfixe évite
 *            les collisions avec d'autres apps qui squatteraient le broker).
 *            Il accepte les connexions entrantes via peer.on('connection').
 *   - GUEST : crée un Peer avec ID aléatoire, puis peer.connect(`wf-saliege-<CODE>`).
 *            Une DataChannel s'ouvre, le host envoie son state à chaque update.
 *
 * Le HOST détient l'état canonique du lobby (membres, config). Les guests le
 * reçoivent en push. Quand un guest agit (ready, chat), il envoie au host
 * qui mute le state et rebroadcast à tous.
 *
 * Une fois le host clique "Lancer", il envoie un message 'start' à tous les
 * guests, et chacun lance sa partie locale avec les options négociées.
 *
 * Limitations honnêtes :
 *   - Si le host quitte / perd la connexion, le lobby meurt.
 *   - Le broker public PeerJS peut être rate-limité ; pour production il
 *     faut self-host (voir docs PeerJS).
 *   - Pas de NAT traversal extrême (TURN) → ~95 % des réseaux passent via
 *     les STUN Google par défaut.
 */

import Peer, { DataConnection } from 'peerjs';

// Préfixe d'ID — namespace l'app pour éviter les collisions de code avec
// d'autres applis qui utiliseraient le même broker public.
const ID_PREFIX = 'wf-saliege-';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function genCode(): string {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// ─── Types exposés à l'UI ─────────────────────────────────────────────

export interface LobbyMemberView {
  sessionId: string;
  name: string;
  skinId: string;
  isHost: boolean;
  ready: boolean;
}

export interface LobbyStateView {
  code: string;
  hostSessionId: string;
  status: 'open' | 'starting' | 'started';
  mapSize: 'small' | 'medium' | 'large';
  botCount: number;
  members: LobbyMemberView[];
}

export interface StartPayload {
  mapSize: 'small' | 'medium' | 'large';
  botCount: number;
  code: string;
  members: { sessionId: string; name: string; skinId: string; isHost: boolean }[];
}

// ─── Wire messages échangés sur DataChannel ───────────────────────────

type WireMsg =
  | { type: 'hello'; name: string; skinId: string }
  | { type: 'state'; state: LobbyStateView }
  | { type: 'toggleReady' }
  | { type: 'updateConfig'; mapSize?: LobbyStateView['mapSize']; botCount?: number }
  | { type: 'chat'; text: string }
  | { type: 'chatBroadcast'; from: string; text: string }
  | { type: 'start'; payload: StartPayload }
  | { type: 'kick'; reason: string };

// ─── Interface "Room" exposée à l'UI ──────────────────────────────────
// API stable même quand on changera de transport.

export interface LobbyRoom {
  /** ID local du joueur dans le lobby (= peer.id du guest, ou code pour host). */
  sessionId: string;
  /** Listener de changements d'état. Renvoie une fonction d'unsubscribe. */
  onStateChange(cb: (state: LobbyStateView) => void): () => void;
  /** Listener du signal "start" envoyé par le host. */
  onStart(cb: (payload: StartPayload) => void): () => void;
  /** Listener d'erreurs / déconnexions. */
  onError(cb: (msg: string) => void): () => void;
  /** Toggle son propre statut "prêt". */
  toggleReady(): void;
  /** Update de la config (ignoré si pas host). */
  updateConfig(patch: { mapSize?: LobbyStateView['mapSize']; botCount?: number }): void;
  /** Envoyer "start" (host only). */
  start(): void;
  /** Envoyer un message de chat. */
  sendChat(text: string): void;
  /** Quitter le lobby. */
  leave(): void;
  /** État courant (utile pour render initial). */
  getState(): LobbyStateView;
  /** True si on est le host. */
  isHost(): boolean;
}

// ──────────────────────────────────────────────────────────────────────
// Host implementation
// ──────────────────────────────────────────────────────────────────────

class HostRoom implements LobbyRoom {
  sessionId: string;
  private peer: Peer;
  private state: LobbyStateView;
  private connections = new Map<string, DataConnection>(); // peerId → conn
  private memberByPeerId = new Map<string, LobbyMemberView>();
  private stateListeners = new Set<(s: LobbyStateView) => void>();
  private startListeners = new Set<(p: StartPayload) => void>();
  private errorListeners = new Set<(m: string) => void>();
  private destroyed = false;

  constructor(code: string, peer: Peer, hostName: string, hostSkin: string) {
    this.peer = peer;
    this.sessionId = peer.id; // = ID_PREFIX + CODE
    const hostMember: LobbyMemberView = {
      sessionId: this.sessionId,
      name: hostName,
      skinId: hostSkin,
      isHost: true,
      ready: true, // host est toujours prêt
    };
    this.memberByPeerId.set(this.sessionId, hostMember);
    this.state = {
      code,
      hostSessionId: this.sessionId,
      status: 'open',
      mapSize: 'medium',
      botCount: 6,
      members: [hostMember],
    };

    peer.on('connection', (conn) => this.handleNewConnection(conn));
    peer.on('error', (err) => {
      // PeerJS error → on remonte à l'UI.
      this.fireError(`PeerJS: ${err.type || err.message || 'erreur réseau'}`);
    });
  }

  private handleNewConnection(conn: DataConnection) {
    if (this.destroyed) { try { conn.close(); } catch { /* noop */ } return; }
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });
    conn.on('data', (data) => this.onGuestMessage(conn, data as WireMsg));
    conn.on('close', () => this.removeMember(conn.peer));
    conn.on('error', () => this.removeMember(conn.peer));
  }

  private onGuestMessage(conn: DataConnection, msg: WireMsg) {
    if (this.destroyed) return;
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      // 1er message du guest : on l'ajoute aux membres.
      const member: LobbyMemberView = {
        sessionId: conn.peer,
        name: String(msg.name || 'Invité').slice(0, 20),
        skinId: String(msg.skinId || 'default'),
        isHost: false,
        ready: false,
      };
      this.memberByPeerId.set(conn.peer, member);
      this.rebuildMembers();
      this.broadcastState();
    } else if (msg.type === 'toggleReady') {
      const m = this.memberByPeerId.get(conn.peer);
      if (m) { m.ready = !m.ready; this.broadcastState(); }
    } else if (msg.type === 'chat') {
      const m = this.memberByPeerId.get(conn.peer);
      if (m && typeof msg.text === 'string') {
        const text = msg.text.slice(0, 200);
        this.broadcast({ type: 'chatBroadcast', from: m.name, text });
      }
    }
    // updateConfig / start ignorés des guests (host-only)
  }

  private removeMember(peerId: string) {
    this.connections.delete(peerId);
    this.memberByPeerId.delete(peerId);
    this.rebuildMembers();
    this.broadcastState();
  }

  private rebuildMembers() {
    this.state.members = [...this.memberByPeerId.values()];
  }

  private broadcastState() {
    this.fireState();
    this.broadcast({ type: 'state', state: this.state });
  }

  private broadcast(msg: WireMsg) {
    for (const c of this.connections.values()) {
      if (c.open) try { c.send(msg); } catch { /* noop */ }
    }
  }

  private fireState() {
    for (const l of this.stateListeners) l(this.state);
  }
  private fireError(m: string) {
    for (const l of this.errorListeners) l(m);
  }

  onStateChange(cb: (s: LobbyStateView) => void): () => void {
    this.stateListeners.add(cb);
    // Push immédiat pour que l'UI ait l'état dès l'attache.
    Promise.resolve().then(() => cb(this.state));
    return () => this.stateListeners.delete(cb);
  }
  onStart(cb: (p: StartPayload) => void): () => void {
    this.startListeners.add(cb);
    return () => this.startListeners.delete(cb);
  }
  onError(cb: (m: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }

  toggleReady() { /* host est toujours prêt — no-op */ }
  updateConfig(patch: { mapSize?: LobbyStateView['mapSize']; botCount?: number }) {
    if (patch.mapSize === 'small' || patch.mapSize === 'medium' || patch.mapSize === 'large') {
      this.state.mapSize = patch.mapSize;
    }
    if (typeof patch.botCount === 'number') {
      this.state.botCount = Math.max(0, Math.min(50, Math.floor(patch.botCount)));
    }
    this.broadcastState();
  }
  start() {
    if (this.state.status !== 'open') return;
    this.state.status = 'starting';
    const payload: StartPayload = {
      mapSize: this.state.mapSize,
      botCount: this.state.botCount,
      code: this.state.code,
      members: this.state.members.map((m) => ({
        sessionId: m.sessionId,
        name: m.name,
        skinId: m.skinId,
        isHost: m.isHost,
      })),
    };
    this.broadcast({ type: 'start', payload });
    // Et on déclenche localement aussi.
    for (const l of this.startListeners) l(payload);
    this.broadcastState();
  }
  sendChat(text: string) {
    const m = this.memberByPeerId.get(this.sessionId);
    if (!m) return;
    this.broadcast({ type: 'chatBroadcast', from: m.name, text: text.slice(0, 200) });
  }
  leave() {
    if (this.destroyed) return;
    this.destroyed = true;
    // Préviens les guests qu'on ferme.
    this.broadcast({ type: 'kick', reason: 'Le salon a été fermé par l\'hôte.' });
    setTimeout(() => {
      for (const c of this.connections.values()) try { c.close(); } catch { /* noop */ }
      try { this.peer.destroy(); } catch { /* noop */ }
    }, 100);
  }
  getState() { return this.state; }
  isHost() { return true; }
}

// ──────────────────────────────────────────────────────────────────────
// Guest implementation
// ──────────────────────────────────────────────────────────────────────

class GuestRoom implements LobbyRoom {
  sessionId: string;
  private peer: Peer;
  private conn: DataConnection;
  private state: LobbyStateView;
  private stateListeners = new Set<(s: LobbyStateView) => void>();
  private startListeners = new Set<(p: StartPayload) => void>();
  private errorListeners = new Set<(m: string) => void>();
  private destroyed = false;

  constructor(code: string, peer: Peer, conn: DataConnection, myName: string, mySkin: string) {
    this.peer = peer;
    this.conn = conn;
    this.sessionId = peer.id;
    // État initial vide — le host nous enverra le vrai dans un instant.
    this.state = {
      code, hostSessionId: '', status: 'open',
      mapSize: 'medium', botCount: 6,
      members: [],
    };

    conn.on('data', (data) => this.onHostMessage(data as WireMsg));
    conn.on('close', () => {
      if (!this.destroyed) this.fireError('Le host s\'est déconnecté.');
    });
    conn.on('error', () => {
      if (!this.destroyed) this.fireError('Erreur de connexion au host.');
    });
    peer.on('error', (err) => {
      if (!this.destroyed) this.fireError(`PeerJS: ${err.type || err.message}`);
    });

    // 1er message : se présenter au host.
    conn.send({ type: 'hello', name: myName, skinId: mySkin });
  }

  private onHostMessage(msg: WireMsg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'state') {
      this.state = msg.state;
      for (const l of this.stateListeners) l(this.state);
    } else if (msg.type === 'start') {
      for (const l of this.startListeners) l(msg.payload);
    } else if (msg.type === 'kick') {
      this.fireError(msg.reason || 'Vous avez été déconnecté du salon.');
    }
  }

  private fireError(m: string) {
    for (const l of this.errorListeners) l(m);
  }

  onStateChange(cb: (s: LobbyStateView) => void): () => void {
    this.stateListeners.add(cb);
    Promise.resolve().then(() => cb(this.state));
    return () => this.stateListeners.delete(cb);
  }
  onStart(cb: (p: StartPayload) => void): () => void {
    this.startListeners.add(cb);
    return () => this.startListeners.delete(cb);
  }
  onError(cb: (m: string) => void): () => void {
    this.errorListeners.add(cb);
    return () => this.errorListeners.delete(cb);
  }
  toggleReady() {
    if (this.conn.open) this.conn.send({ type: 'toggleReady' });
  }
  updateConfig() { /* guests ne peuvent pas changer la config */ }
  start() { /* guests ne peuvent pas lancer */ }
  sendChat(text: string) {
    if (this.conn.open) this.conn.send({ type: 'chat', text });
  }
  leave() {
    if (this.destroyed) return;
    this.destroyed = true;
    try { this.conn.close(); } catch { /* noop */ }
    try { this.peer.destroy(); } catch { /* noop */ }
  }
  getState() { return this.state; }
  isHost() { return false; }
}

// ──────────────────────────────────────────────────────────────────────
// API publique
// ──────────────────────────────────────────────────────────────────────

/**
 * Crée un nouveau salon. Génère un code à 6 caractères, ouvre un Peer
 * dont l'ID est `wf-saliege-<CODE>`, et attend les connexions des amis.
 *
 * Renvoie le code (à partager) + la Room (à passer à l'UI).
 */
export async function createLobby(
  name: string,
  skinId: string,
): Promise<{ code: string; room: LobbyRoom }> {
  // Boucle de retry sur collision d'ID (rare, mais possible si le broker
  // a déjà un peer du même nom).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = genCode();
    const peerId = ID_PREFIX + code;
    try {
      const peer = await openPeer(peerId);
      const room = new HostRoom(code, peer, name, skinId);
      return { code, room };
    } catch (e: any) {
      if (e?.type !== 'unavailable-id' && attempt === 4) throw e;
      // sinon retry avec un nouveau code
    }
  }
  throw new Error('Impossible d\'allouer un code de salon — broker injoignable ?');
}

/**
 * Rejoint un salon existant via son code. Établit une connexion P2P avec
 * le host et renvoie la Room.
 */
export async function joinLobby(
  code: string,
  name: string,
  skinId: string,
): Promise<LobbyRoom> {
  const normalized = code.trim().toUpperCase();
  const peer = await openPeer(); // ID random
  const hostPeerId = ID_PREFIX + normalized;
  const conn = peer.connect(hostPeerId, { reliable: true });

  // Attend l'ouverture de la DataChannel (10 s timeout).
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Pas de réponse du salon — code invalide ou host hors ligne.')), 10_000);
    conn.on('open', () => { clearTimeout(timeout); resolve(); });
    conn.on('error', (err) => { clearTimeout(timeout); reject(err); });
    peer.on('error', (err) => {
      clearTimeout(timeout);
      if (err.type === 'peer-unavailable') {
        reject(new Error('Salon introuvable — vérifie le code.'));
      } else {
        reject(err);
      }
    });
  });

  return new GuestRoom(normalized, peer, conn, name, skinId);
}

/** Ouvre un Peer avec ID donné (ou random si omis). Promise résolue
 *  quand le peer est prêt côté broker. */
function openPeer(id?: string): Promise<Peer> {
  return new Promise((resolve, reject) => {
    const peer = id ? new Peer(id) : new Peer();
    const timeout = setTimeout(() => {
      try { peer.destroy(); } catch { /* noop */ }
      reject(new Error('Broker PeerJS injoignable — réseau ?'));
    }, 10_000);
    peer.on('open', () => { clearTimeout(timeout); resolve(peer); });
    peer.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}
