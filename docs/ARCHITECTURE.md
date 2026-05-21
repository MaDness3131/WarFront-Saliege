# Architecture — Warfront Saliège

Ce document décrit les choix structurants. Objectif : un produit scalable,
maintenable, et impossible à tricher côté client.

## 1. Principe fondateur : serveur autoritaire

Le client est un **terminal de rendu**. Il n'a aucune autorité sur l'état du
jeu. Concrètement :

| Le client PEUT                          | Le client ne PEUT JAMAIS              |
|-----------------------------------------|----------------------------------------|
| Afficher l'état reçu                    | Calculer un dégât                      |
| Envoyer une intention (`attack`, `build`) | Valider une capture                  |
| Interpoler visuellement entre 2 états   | Gérer l'économie ou les ressources     |
| Jouer des VFX/sons sur événement serveur | Décider d'un résultat militaire        |

Toute logique critique vit dans `/server/src/game/`. Le client ne peut pas
être patché pour tricher parce qu'il ne contient pas les règles.

## 2. Flux réseau

```
                 joinOrCreate / reconnect
   ┌──────────┐ ──────────────────────────► ┌──────────────┐
   │  Client  │                             │  GameRoom    │
   │ Colyseus │ ◄────── state (deltas) ───── │  (Colyseus)  │
   │   .js    │ ────── intentions ─────────► │              │
   └──────────┘ ◄────── events (VFX) ─────── └──────────────┘
```

- **State sync** : Colyseus + `@colyseus/schema` n'envoient que les champs
  modifiés du schéma (`WorldState`). C'est la base de l'optimisation bande
  passante — pas de full snapshot par tick.
- **Intentions** : messages typés (`ClientMessage`) validés serveur.
- **Événements** : messages ponctuels hors schéma (`ServerEvent`) pour les
  VFX/sons (captures, explosions). Agrégés par tick via `VfxBatcher`.

## 3. Boucle de simulation

`GameRoom` tourne à **10 Hz** (`TICK_RATE`). Ordre d'un tick :

1. Économie (`EconomySystem`) — revenus, entretien, anti-snowball.
2. Population (`PopulationSystem`) — croissance logistique → armée.
3. Constructions (`TerritoryManager.tickConstruction`).
4. Vagues d'armées — progression + résolution des arrivées.
5. IA des bots (`BotAI`) — mêmes points d'entrée que les humains.
6. Éliminations + scores.
7. Condition de victoire.

Le rendu client tourne à **60 FPS**, découplé : il interpole entre les
états reçus. Le `progress` (0..1) des vagues d'armées permet une
interpolation visuelle exacte sans logique cliente.

## 4. Modèle de données (`shared/`)

`shared/types.ts` est la source de vérité unique. Le schéma Colyseus
(`server/src/game/schema.ts`) en est la projection synchronisable, avec les
annotations `@type` qui pilotent la sérialisation binaire.

Distinction importante :
- **Synchronisé** : `WorldState`, `PlayerSchema`, `TerritorySchema`,
  `ArmySchema` — répliqués vers les clients.
- **Non synchronisé** : `territoryById` (index O(1)), `neighbors` (voisinage
  statique) — reconstruits côté serveur, jamais envoyés.

## 5. Carte et territoires

`WorldGenerator` produit une grille via bruit de valeur déterministe (seed).
Terrain : océan / terre / côte / montagne. Voisinage en 4-connexité.

Pourquoi une grille et pas une vraie carte du monde dès le MVP : une grille
procédurale est testable immédiatement. Le rendu « carte du monde pixelisée »
se branche en remplaçant `WorldGenerator` par un import de heightmap — le
reste du serveur (voisinage, capture, rendu) ne change pas.

## 6. Optimisations

| Technique            | Où                                                   |
|----------------------|------------------------------------------------------|
| Delta state sync     | Colyseus schema (natif)                              |
| Repaint sélectif     | `WorldMap.sync` ne repeint que les cellules modifiées |
| Culling              | `cellLayer.cullable` — cellules hors écran ignorées  |
| Interpolation        | `progress` des vagues, rendu 60 FPS / sim 10 Hz      |
| Index O(1)           | `territoryById` côté serveur                         |
| Échantillonnage borné | `pickSpawnTerritory` sur grande carte               |
| Encodage minimap     | `MinimapEncoder` — 1 octet/territoire + run-length   |
| Quantification       | `Quantize` — flottants → uint16 réseau               |

## 7. Scalabilité multi-process

Colyseus se met à l'échelle horizontalement via un *presence* Redis : les
rooms sont réparties sur N process Node, le matchmaking est partagé. Le
serveur est déjà découpé pour ça (transport / rooms / systèmes / db séparés).

Cible : 50–150 joueurs simultanés par room, plusieurs rooms par process.

## 8. Anti-cheat — récapitulatif

- Validation serveur systématique : adjacence, fonds, propriété, cooldowns.
- Le client n'a pas les constantes de résolution sous une forme exploitable
  (il les a pour l'affichage, mais ne les *applique* pas).
- Les bots passent par `MilitarySystem.requestAttack` comme les humains :
  aucun chemin de code privilégié à exploiter.
- `allowReconnection` borne la fenêtre de reprise (30 s) — pas de session
  fantôme exploitable.
