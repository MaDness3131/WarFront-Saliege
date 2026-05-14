# Warfront Saliège

RTS .io géopolitique multijoueur temps réel — conquête territoriale sur une
carte du monde pixelisée. Serveur autoritaire, client de rendu pur.

> **État : MVP Phase 1 + bases Phase 2/3.** La boucle de jeu cœur est
> complète et jouable (carte, conquête, économie, population, armée, bots,
> multijoueur, victoire par domination). Les systèmes naval / armes / Elo
> sont des scaffolds cohérents, prêts à être étoffés — voir `docs/ROADMAP.md`.

## Aperçu rapide sans rien installer

`docs/preview.html` est une **démo jouable autonome** (un seul fichier, aucune
dépendance) qui simule la boucle de jeu côté navigateur pour donner le *feel*
et la direction artistique. Ouvre-le directement dans un navigateur.

⚠️ La démo n'est PAS le vrai jeu : elle simule tout en local. Le jeu réel
sépare client de rendu et serveur autoritaire (voir ci-dessous).

## Architecture

```
Client (rendu pur)
  └─ React (UI/HUD) + PixiJS (monde) + Colyseus.js (réseau)
        │  intentions ("j'attaque X")          ▲  état (deltas)
        ▼                                       │
Serveur autoritaire
  └─ Colyseus rooms — boucle de simulation 10 Hz
        ├─ TerritoryManager · EconomySystem · PopulationSystem
        ├─ MilitarySystem · BotAI
        └─ NavalSystem · WeaponSystem · DiplomacySystem (Phase 2/3)
        │
        ▼
PostgreSQL (comptes, stats, Elo)  +  Redis (cache, scaling multi-process)
```

**Règle d'or anti-cheat :** le client ne calcule jamais un dégât, ne valide
jamais une capture, ne décide jamais d'un résultat. Il envoie des intentions,
il affiche de l'état. Tout le reste est serveur.

## Structure du dépôt

```
/shared      Types et constantes partagés client ↔ serveur
/server      Serveur autoritaire (Node.js + Colyseus + TypeScript)
/client      Client de rendu (React + PixiJS + Vite + TypeScript)
/docs        Architecture, roadmap, démo jouable
/assets      Sprites, audio (à fournir)
```

## Installation

Prérequis : Node.js ≥ 20.

### Serveur

```bash
cd server
npm install
npm run dev            # serveur autoritaire sur ws://localhost:2567
```

PostgreSQL est optionnel en dev : sans `DATABASE_URL`, le serveur tourne sans
persistance. Pour l'activer :

```bash
export DATABASE_URL=postgres://user:pass@localhost:5432/warfront
# puis appeler migrate() une fois (voir server/src/database/Postgres.ts)
```

### Client

```bash
cd client
npm install
npm run dev            # client sur http://localhost:5173
```

Le client lit `VITE_SERVER_URL` (défaut `ws://localhost:2567`).

## Commandes en jeu

| Action            | Touche / souris        |
|-------------------|------------------------|
| Déplacer caméra   | WASD / flèches / drag  |
| Zoom              | Q / E / molette        |
| Conquérir         | Clic gauche sur case   |
| Construire        | Clic droit sur sa case |

## Boucle de jeu (résumé des règles)

- **Conquête** : clique une case adjacente à ton territoire. Une vague part
  de ta frontière. Capture si `force engagée > défense effective`.
- **Défense effective** = garnison × bonus terrain (montagne ×1.6) × bonus
  poste de défense.
- **Économie** : revenu par territoire + bâtiments, amorti par un facteur
  anti-snowball décroissant, moins l'entretien de l'armée.
- **Population** : croissance logistique plafonnée par les territoires et les
  villes ; une fraction de la croissance alimente l'armée.
- **Ratio d'attaque** : réglable (5–100 %), définit la part de l'armée
  engagée à chaque clic.
- **Victoire** : 70 % de la carte, ou dernier survivant.

Toutes les valeurs sont dans `shared/constants.ts` — équilibrage sans toucher
à la logique.

## Modes de jeu

- **Classique** — économie lente, longues parties.
- **Rapide** — économie ×2.5, population ×2, cooldowns d'armes ×0.4.
- **Personnalisé** — taille de carte, vitesse et options réglables.

## Licence

Projet privé — tous droits réservés.
