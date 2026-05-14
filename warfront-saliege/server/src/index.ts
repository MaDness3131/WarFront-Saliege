/**
 * index.ts — point d'entrée du serveur Warfront Saliège.
 * ------------------------------------------------------
 * Démarre le transport WebSocket Colyseus, enregistre la salle de jeu et
 * expose le monitoring. C'est le serveur autoritaire : toute la simulation
 * vit ici, le client n'est qu'un terminal de rendu.
 */

import http from 'http';
import express from 'express';
import cors from 'cors';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { monitor } from '@colyseus/monitor';
import { GameRoom } from './rooms/GameRoom';
import { GameMode } from '../shared/types';

const PORT = Number(process.env.PORT ?? 2567);

const app = express();
app.use(cors());
app.use(express.json());

// Sonde de santé (utile derrière un load balancer).
app.get('/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Monitoring Colyseus (à protéger par auth en production).
app.use('/colyseus', monitor());

const httpServer = http.createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

// Une salle par mode de jeu. Le matchmaking enverra les joueurs vers la
// bonne définition via les filtres Colyseus.
gameServer.define('classic', GameRoom, { mode: GameMode.Classic, mapSize: 'medium', botCount: 8 });
gameServer.define('fast', GameRoom, { mode: GameMode.Fast, mapSize: 'small', botCount: 6 });
gameServer.define('custom', GameRoom).filterBy(['mode', 'mapSize']);

gameServer
  .listen(PORT)
  .then(() => console.log(`⚔️  Warfront Saliège — serveur autoritaire sur le port ${PORT}`))
  .catch((err) => {
    console.error('Échec du démarrage du serveur :', err);
    process.exit(1);
  });

// Arrêt propre : laisse Colyseus vider les salles avant de sortir.
process.on('SIGTERM', () => gameServer.gracefulShutdown().then(() => process.exit(0)));
process.on('SIGINT', () => gameServer.gracefulShutdown().then(() => process.exit(0)));
