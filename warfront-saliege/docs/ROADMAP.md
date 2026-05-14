# Roadmap — Warfront Saliège

État au format : ✅ fait · 🟡 scaffold cohérent (interface figée, corps
partiel) · ⬜ à faire.

## Phase 1 — MVP ✅

L'ossature jouable est complète.

- ✅ Génération de carte procédurale (`WorldGenerator`)
- ✅ Schéma d'état synchronisé Colyseus (`schema.ts`)
- ✅ Boucle de simulation autoritaire 10 Hz (`GameRoom`)
- ✅ Conquête territoriale par vagues + résolution de combat (`TerritoryManager`)
- ✅ Économie avec anti-snowball (`EconomySystem`)
- ✅ Population logistique → armée (`PopulationSystem`)
- ✅ Validation des ordres militaires (`MilitarySystem`)
- ✅ Bots fonctionnels pour partie solo (`BotAI`)
- ✅ Multijoueur + reconnexion (`SocketClient` / Colyseus)
- ✅ Rendu monde optimisé (`WorldMap`, `GameEngine`, culling, repaint sélectif)
- ✅ Caméra WASD/zoom/drag + sélection (`InputManager`)
- ✅ HUD complet : or, armée, population, domination, ratio, notifications
- ✅ Minimap, classement, menu construction
- ✅ Construction de bâtiments (ville, usine, défense, port)
- ✅ Condition de victoire (domination / dernier survivant)

## Phase 2 — Marine, diplomatie, profondeur

- 🟡 **NavalSystem** — `commission()` opérationnel ; à compléter :
  pathfinding océan-only, déplacement, transport de troupes, blocus de port,
  combat naval. Interface figée, `GameRoom` peut déjà l'appeler.
- 🟡 **DiplomacySystem** — proposition / acceptation / trahison implémentées ;
  à brancher : `TerritoryManager` doit consulter `areAllied()` avant capture,
  et le state sync doit exposer la vision partagée.
- 🟡 **DiplomacyPanel** (client) — UI câblée, envoie les intentions ;
  dépend de la finalisation serveur.
- ⬜ Schéma `ShipSchema` / `AllianceSchema` à ajouter à `WorldState`.
- ⬜ Chat privé entre alliés.
- ⬜ IA des bots : posture défensive, alliances simulées, débarquements.

## Phase 3 — Armes, VFX, équilibrage

- 🟡 **WeaponSystem** — design complet documenté dans le fichier ; à
  implémenter : `launch()` (validation gold + cooldown), application du
  blast en rayon, terrain brûlé persistant, émission des événements VFX.
- 🟡 **ExplosionSystem** (client) — impacts / missiles / nukes fonctionnels ;
  à étoffer : champignon nucléaire multi-couches, terrain brûlé.
- 🟡 **AudioManager** (client) — couche complète ; manquent les fichiers
  audio réels dans `/assets/audio`.
- ⬜ Missiles avec temps de vol (actuellement impact instantané prévu).
- ⬜ Passe d'équilibrage complète sur `shared/constants.ts`.
- ⬜ Tests de charge (`server/scripts/loadtest.ts`).

## Phase 4 — Méta-jeu et production

- 🟡 **Postgres** — comptes, stats, Elo, enregistrement de partie
  implémentés ; à brancher : appel `recordMatch()` en fin de `GameRoom`,
  authentification réelle.
- ⬜ Matchmaking par Elo (filtres Colyseus + file d'attente).
- ⬜ Skins / cosmétiques (monétisation non intrusive).
- ⬜ Page de stats joueur et classement mondial persistant.
- ⬜ Redis presence pour scaling multi-process.
- ⬜ Replays (le `VfxBatcher` et le state delta posent déjà les bases).

## Dette technique connue

- `InputManager.cellToId` recalcule la largeur de grille — à terme, passer la
  largeur au constructeur.
- Le snapshot client (`useGameState`) ne porte pas le terrain ; la minimap ne
  distingue donc pas océan/terre finement. Ajouter un masque terrain statique
  envoyé une seule fois à la connexion.
- Pas encore de tests automatisés — priorité : tests unitaires sur
  `TerritoryManager.resolveArrival` et `EconomySystem.tick`.
