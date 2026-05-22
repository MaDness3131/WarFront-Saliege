/**
 * GameEngine — boucle de rendu et caméra (PixiJS).
 * ------------------------------------------------
 * Responsabilités strictement CLIENT :
 *  - initialiser PixiJS et la scène ;
 *  - boucle de rendu 60 FPS découplée du tick simulation (10 Hz) ;
 *  - caméra : déplacement WASD / drag, zoom Q/E, clamp aux bords ;
 *  - interpolation visuelle des vagues, navires et missiles ;
 *  - relais des clics vers InputManager (qui appelle un callback unique).
 *
 * Aucune logique de jeu : l'état fait autorité côté simulation (locale ici,
 * serveur plus tard), le moteur ne fait que l'afficher de façon fluide.
 */

import { Application, Container, Graphics, Text } from 'pixi.js';
import { computeRegions } from '../local/util/Components';
import { WorldMap } from './WorldMap';
import { TerritorySystem } from './TerritorySystem';
import { InputManager } from './InputManager';
import { ExplosionSystem } from '../vfx/ExplosionSystem';
import { particles } from './fx/ParticleSystem';
import { socket } from '../network/SocketClient';
import { ServerEvent, TerrainType, ShipType } from '@shared/types';
import { CELL_SIZE } from '@shared/constants';

export interface CameraState { x: number; y: number; zoom: number; }
export interface CellClick { territoryId: number; worldX: number; worldY: number; isOcean: boolean; }

export class GameEngine {
  readonly app: Application;
  private world = new Container();
  private map = new WorldMap();
  private territorySystem = new TerritorySystem(this.map);
  private explosions = new ExplosionSystem();
  private waveLayer = new Graphics();
  private flashLayer = new Graphics();
  private flashes: { tileId: number; startedAt: number }[] = [];
  private labelLayer = new Container();
  /** Marqueurs "main verte" sur le centroïde des alliés du joueur humain.
   *  Visibles uniquement par les membres de l'alliance (filtré côté worker —
   *  un joueur non allié ne reçoit jamais ces centroïdes). */
  private allyMarkerLayer = new Container();
  private allyMarkers = new Map<string, Graphics>();
  /** Labels par région (composante connexe), clé = `${owner}:${rootTileId}`. */
  private regionLabels = new Map<string, { nameText: Text; troopText: Text }>();
  /** Cache des régions calculées, rafraîchi périodiquement. */
  private cachedRegions: { owner: string; key: string; name: string; cx: number; cy: number; size: number; isPrimary: boolean }[] = [];
  private lastRegionsAt = 0;
  private shipLayer = new Container();
  private missileLayer = new Container();
  private weaponPreview = new Graphics();
  private weaponPreviewKind: 'nuke' | 'hydrogen' | 'tsar' | null = null;
  private hoverWorldX = 0;
  private hoverWorldY = 0;
  private trailLayer = new Graphics();
  private input: InputManager;

  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private initialized = false;
  /** Une fois la map peinte au bootstrap, on ne refait plus le full sync —
   *  les updates passent par syncIncremental(dirtyIds). */
  private tilesSyncedOnce = false;
  private latestState: any = null;
  private shipSprites = new Map<string, Graphics>();
  /** Marqueurs visuels sur les tuiles de débarquement (rendus uniquement
   *  pour les bateaux QUI M'APPARTIENNENT et qui ont un landTargetId actif). */
  private shipDestMarkers = new Map<string, Graphics>();
  /** Phase pulsée du marqueur de débarquement (pour le rendu animé). */
  private destMarkerPhase = 0;
  private missileSprites = new Map<string, Graphics>();
  /** Phase d'animation des vagues (0..1), avance chaque frame. */
  private wavePhase = 0;
  /** Compteur de frames pour rendre certaines couches à fréquence réduite. */
  private frameCount = 0;

  /** Callback de l'application sur clic résolu (territoire ou océan). */
  private onCellClick: ((c: CellClick) => void) | null = null;

  private unbindState?: () => void;
  private unbindEvents: Array<() => void> = [];

  constructor() {
    this.app = new Application();
    this.input = new InputManager(this.camera);
  }

  async start(mount: HTMLElement) {
    await this.app.init({
      resizeTo: mount,
      antialias: false,
      background: 0x070b12,
      preference: 'webgl',
    });
    mount.appendChild(this.app.canvas);

    this.world.addChild(this.map.container);
    this.world.addChild(this.flashLayer);
    this.world.addChild(this.waveLayer);
    this.world.addChild(this.trailLayer);
    this.world.addChild(this.shipLayer);
    this.world.addChild(this.missileLayer);
    this.world.addChild(this.explosions.container);
    // ParticleSystem au-dessus des explosions, sous le HUD/labels.
    particles.bake(this.app.renderer);
    this.world.addChild(particles.container);
    this.world.addChild(this.labelLayer);
    this.world.addChild(this.allyMarkerLayer);
    this.world.addChild(this.weaponPreview);
    this.app.stage.addChild(this.world);

    // (Particules de capture désactivées — la texture seule communique l'avancée.)

    // Suit la souris pour positionner le cercle de prévisualisation d'arme.
    this.app.canvas.addEventListener('pointermove', (e) => {
      const rect = this.app.canvas.getBoundingClientRect();
      this.hoverWorldX = (e.clientX - rect.left) / this.camera.zoom + this.camera.x;
      this.hoverWorldY = (e.clientY - rect.top) / this.camera.zoom + this.camera.y;
    });

    // Flash de capture désactivé — trop visuel à l'expansion.

    this.input.attach(this.app.canvas, (click) => this.onCellClick?.(click));

    this.unbindState = socket.onState((state) => {
      this.latestState = state;
      if (!this.initialized) this.bootstrapFromState(state);
      this.syncFromState(state);
    });

    // Channel rapide : juste les tuiles dirty depuis le worker. Permet à
    // WorldMap.syncIncremental d'éviter le scan 682k.
    this.unbindEvents.push(
      socket.onTilesDirty((ids, state) => {
        if (!this.initialized) return;
        this.map.syncIncremental(state.territories, ids, state.tick);
      }),
    );

    this.unbindEvents.push(
      socket.onEvent(ServerEvent.Explosion, (p) => {
        this.explosions.spawn(p.x * CELL_SIZE, p.y * CELL_SIZE, p.kind ?? 0);
      }),
      socket.onEvent(ServerEvent.TerritoryCaptured, (p) => {
        this.territorySystem.onCapture(p.id);
      }),
      socket.onEvent(ServerEvent.MissileImpact, (p) => {
        // Mapping kind → ExplosionKind : nuke/hydrogen=2, tsar=3.
        const explosionKind = p.kind === 'tsar' ? 3 : 2;
        this.explosions.spawn(p.x * CELL_SIZE, p.y * CELL_SIZE, explosionKind, {
          radiusCells: p.radius,
          scorch: true,
        });
      }),
      socket.onEvent(ServerEvent.ShipDestroyed, () => {
        // VFX déjà émis via Explosion.
      }),
    );

    // Cap à 60 fps : sur écran 120/144/240 Hz le rendu peut tourner 2-4×
    // plus vite que nécessaire (la simulation est à 10 Hz, l'œil ne distingue
    // pas > 60 fps pour ce type de jeu). Économise CPU/GPU et stabilise le
    // budget par frame quand la simulation lance un tick lourd.
    this.app.ticker.maxFPS = 60;
    this.app.ticker.minFPS = 30;
    this.app.ticker.add((ticker) => this.render(ticker.deltaMS));
  }

  /** L'App enregistre ici son handler de clic (avec son mode courant). */
  setCellClickHandler(handler: (c: CellClick) => void) {
    this.onCellClick = handler;
  }

  private bootstrapFromState(state: any) {
    const territories = [...state.territories];
    this.map.init(territories, state.mapWidth, state.mapHeight);

    const mine = territories.find((t: any) => t.owner === socket.sessionId);
    if (mine) {
      this.camera.x = mine.x * CELL_SIZE - this.app.screen.width / 2;
      this.camera.y = mine.y * CELL_SIZE - this.app.screen.height / 2;
    }
    this.input.setBounds(this.map.pixelBounds, {
      w: this.app.screen.width,
      h: this.app.screen.height,
    });
    this.input.setMapWidth(state.mapWidth);
    // Aligne la cible de lissage sur le spawn pour ne pas glisser depuis (0,0).
    this.input.syncTarget();
    this.initialized = true;
  }

  private syncFromState(state: any) {
    // Couleurs joueurs : setPlayerColors no-op si rien n'a changé (cas
    // courant — couleurs figées après bootstrap).
    const colors = new Map<string, number>();
    state.players.forEach((p: any) => {
      colors.set(p.id, parseInt(String(p.color).slice(1), 16));
    });
    this.map.setPlayerColors(colors);
    // Pas de map.sync(...) full scan ici — les mises à jour incrémentales
    // arrivent via socket.onTilesDirty (channel rapide). Seul cas où le
    // sync full tourne : changement de couleurs joueurs (déjà géré par
    // setPlayerColors qui mark tout dirty) ou bootstrap initial.
    if (!this.tilesSyncedOnce) {
      this.map.sync([...state.territories], state.tick);
      this.tilesSyncedOnce = true;
    }
    // Marqueurs "main verte" — Mis à jour à chaque broadcast (5 Hz), peu
    // d'allys donc cost négligeable.
    this.syncAllyMarkers(state.allyCentroids ?? []);
  }

  /** Crée / met à jour / supprime les marqueurs "main verte" pour chaque
   *  centroïde d'allié envoyé par le worker. */
  private syncAllyMarkers(centroids: Array<{ playerId: string; x: number; y: number; color: string }>) {
    const seen = new Set<string>();
    for (const c of centroids) {
      seen.add(c.playerId);
      let g = this.allyMarkers.get(c.playerId);
      if (!g) {
        g = new Graphics();
        this.drawHandIcon(g);
        this.allyMarkerLayer.addChild(g);
        this.allyMarkers.set(c.playerId, g);
      }
      g.x = c.x * CELL_SIZE + CELL_SIZE / 2;
      g.y = c.y * CELL_SIZE + CELL_SIZE / 2;
    }
    // Supprime les marqueurs d'alliés qui ne sont plus là (alliance brisée
    // ou joueur éliminé).
    for (const [id, g] of this.allyMarkers) {
      if (!seen.has(id)) {
        this.allyMarkerLayer.removeChild(g);
        g.destroy();
        this.allyMarkers.delete(id);
      }
    }
  }

  /** Dessine une stylisation simple de "main verte" (paume + 4 doigts) dans
   *  un Graphics — pixel-art friendly, lisible à zoom faible. */
  private drawHandIcon(g: Graphics) {
    g.clear();
    const scale = 1.2;
    const green = 0x4caf50;
    const darkGreen = 0x1f6b27;
    // Halo doux derrière la main
    g.circle(0, 0, 11 * scale).fill({ color: green, alpha: 0.18 });
    g.circle(0, 0, 8 * scale).fill({ color: green, alpha: 0.30 });
    // Paume (rectangle arrondi)
    g.roundRect(-3 * scale, -1 * scale, 6 * scale, 6 * scale, 1.4).fill({ color: green });
    // 4 doigts
    g.rect(-2.6 * scale, -4.5 * scale, 1.0 * scale, 3.8 * scale).fill({ color: green });
    g.rect(-1.2 * scale, -5.2 * scale, 1.0 * scale, 4.4 * scale).fill({ color: green });
    g.rect( 0.2 * scale, -5.0 * scale, 1.0 * scale, 4.2 * scale).fill({ color: green });
    g.rect( 1.6 * scale, -4.2 * scale, 1.0 * scale, 3.5 * scale).fill({ color: green });
    // Pouce (à gauche, légèrement plus court)
    g.rect(-3.6 * scale, -1.5 * scale, 1.2 * scale, 2.8 * scale).fill({ color: green });
    // Liseré sombre pour contraste sur fond clair
    g.roundRect(-3 * scale, -1 * scale, 6 * scale, 6 * scale, 1.4).stroke({ width: 0.5, color: darkGreen });
  }

  private render(deltaMS: number) {
    this.input.update(deltaMS);

    this.world.scale.set(this.camera.zoom);
    this.world.x = -this.camera.x * this.camera.zoom;
    this.world.y = -this.camera.y * this.camera.zoom;

    this.explosions.update(deltaMS);
    this.territorySystem.update(deltaMS);
    particles.update(deltaMS);
    this.map.tickBuildings();

    this.wavePhase = (this.wavePhase + deltaMS * 0.003) % 1;

    if (this.latestState) {
      this.frameCount++;
      // Couches lourdes : on RÉPARTIT les 3 jobs sur 3 frames distinctes
      // (round-robin) au lieu de les bundler. Chaque job tourne à 20 fps,
      // mais aucune frame ne paie le coût des 3 → suppression du
      // micro-freeze périodique qui rendait la caméra "saccadée".
      const slot = this.frameCount % 3;
      if (slot === 0)      this.renderWaves(this.latestState);
      else if (slot === 1) this.renderShipTrails(this.latestState);
      else                 this.renderSpawnProtection(this.latestState);
      // Mises à jour rapides (positions critiques, par frame).
      this.renderFlashes(this.latestState);
      this.renderPlayerLabels(this.latestState);
      this.renderShips(this.latestState);
      this.renderMissiles(this.latestState);
      this.renderWeaponPreview();
    }
  }

  /** Trail coloré derrière chaque navire — fade avec l'âge. */
  private renderShipTrails(state: any) {
    const g = this.trailLayer;
    g.clear();
    if (!state.ships) return;
    const now = state.tick;
    state.ships.forEach((ship: any) => {
      if (!ship.trail || ship.trail.length < 2) return;
      const owner = state.players.get(ship.owner);
      const color = owner ? parseInt(String(owner.color).slice(1), 16) : 0xffffff;
      for (let i = 1; i < ship.trail.length; i++) {
        const a = ship.trail[i - 1];
        const b = ship.trail[i];
        const age = now - b.tick;
        if (age > 80) continue; // ~8 sec de visibilité
        const alpha = Math.max(0, 1 - age / 80) * 0.6;
        g.moveTo(a.x * CELL_SIZE, a.y * CELL_SIZE)
          .lineTo(b.x * CELL_SIZE, b.y * CELL_SIZE)
          .stroke({ width: 2.5, color, alpha });
      }
    });
  }

  /** Indique au moteur quelle arme est sélectionnée (null pour aucune). */
  setWeaponPreview(kind: 'nuke' | 'hydrogen' | 'tsar' | null) {
    this.weaponPreviewKind = kind;
    if (!kind) this.weaponPreview.clear();
  }

  /** Dessine un cercle au curseur égal au rayon d'explosion de l'arme. */
  private renderWeaponPreview() {
    const g = this.weaponPreview;
    g.clear();
    if (!this.weaponPreviewKind) return;
    // Rayons sync avec WEAPONS de shared/constants.ts.
    const radii: Record<string, number> = { nuke: 9, hydrogen: 23, tsar: 60 };
    const r = (radii[this.weaponPreviewKind] ?? 1) * CELL_SIZE;
    const colors: Record<string, number> = {
      nuke: 0xe0533d, hydrogen: 0xe07b3d, tsar: 0xf1c40f,
    };
    const color = colors[this.weaponPreviewKind] ?? 0xffffff;
    // Disque transparent rouge/jaune + 2 cercles concentriques pour la lecture.
    g.circle(this.hoverWorldX, this.hoverWorldY, r).fill({ color, alpha: 0.12 });
    g.circle(this.hoverWorldX, this.hoverWorldY, r).stroke({ width: 2, color, alpha: 0.85 });
    g.circle(this.hoverWorldX, this.hoverWorldY, r * 0.5).stroke({ width: 1, color, alpha: 0.4 });
    g.circle(this.hoverWorldX, this.hoverWorldY, 2).fill({ color, alpha: 0.95 });
  }

  /** Affiche nom de territoire + nb de troupes par RÉGION connexe.
   *  Recalcul des régions throttlé à 6 sec — l'affichage reste fluide entre. */
  private renderPlayerLabels(state: any) {
    if (!state.playerTiles) return;
    const now = performance.now();
    if (now - this.lastRegionsAt > 6000 || this.cachedRegions.length === 0) {
      this.lastRegionsAt = now;
      const regions = computeRegions(state);
      // Détecte la PLUS GROSSE région par nation (label "primaire").
      const largestPerOwner = new Map<string, typeof regions[0]>();
      for (const r of regions) {
        const cur = largestPerOwner.get(r.owner);
        if (!cur || r.size > cur.size) largestPerOwner.set(r.owner, r);
      }
      // On garde TOUTES les régions ≥ 6 tuiles. Les "primaires" affichent
      // nation+armée totale ; les autres apparaissent quand on zoome
      // (cf. filter is-zoomed dans render) avec nom local + armée prorata.
      this.cachedRegions = [];
      for (const r of regions) {
        if (r.size < 6) continue;
        const primary = largestPerOwner.get(r.owner) === r;
        this.cachedRegions.push({
          owner: r.owner,
          key: `${r.owner}:${r.rootTileId}`,
          name: r.name,
          cx: (r.cx + 0.5) * CELL_SIZE,
          cy: (r.cy + 0.5) * CELL_SIZE,
          size: r.size,
          isPrimary: primary,
        });
      }
    }

    const seen = new Set<string>();
    const myId = socket.sessionId;
    const ME_GREEN = 0x4caf50;
    // Bounds caméra en coords monde — labels hors champ : visible=false.
    const cam = this.camera;
    const vis = this.app.screen;
    const camLeft = cam.x;
    const camTop = cam.y;
    const camRight = camLeft + vis.width / cam.zoom;
    const camBottom = camTop + vis.height / cam.zoom;
    const margin = 80; // tolérance avant culling

    // Niveau de zoom : on n'affiche les régions secondaires (autres que la
    // plus grosse par joueur) que lorsque l'utilisateur a zoomé suffisamment
    // pour les lire confortablement. Sinon on garde l'écran épuré.
    const zoom = this.camera.zoom;
    // Seuil de taille minimum pour afficher une région secondaire : décroît
    // avec le zoom (plus on zoom, plus on voit de petites régions).
    const secondaryMinSize =
      zoom < 1.0  ? Infinity :   // jamais
      zoom < 1.6  ? 60 :         // grosses régions secondaires seulement
      zoom < 2.4  ? 20 :         // régions moyennes
                    8;           // toutes (sauf vraiment minuscules)

    for (const reg of this.cachedRegions) {
      const p = state.players.get(reg.owner);
      if (!p || !p.alive) continue;
      // Filtre zoom : régions secondaires (pas primary) seulement si zoom
      // suffisant ET région assez grosse pour mériter un label.
      if (!reg.isPrimary && reg.size < secondaryMinSize) continue;
      seen.add(reg.key);
      // Culling : si le centroïde est hors viewport (avec marge), on cache.
      const inView = reg.cx >= camLeft - margin && reg.cx <= camRight + margin
                  && reg.cy >= camTop - margin && reg.cy <= camBottom + margin;

      // Primary (plus grosse région) = nation name + total armée.
      // Secondaire = nom local de la région + armée prorata.
      const displayName = reg.isPrimary
        ? (p.name as string)
        : reg.name;
      const garrison = reg.isPrimary
        ? Math.floor(p.army)
        : Math.floor((reg.size / Math.max(1, p.territoryCount)) * p.army);

      const isMe = p.id === myId;
      // Élite (puissance majeure) : tier=strong → label doré, plus grand,
      // letter-spacing renforcé, uppercase. Visuellement reconnaissable
      // de loin pour que le joueur identifie les vraies menaces.
      const isElite = !isMe && p.isBot && p.tier === 'strong';
      const nameColor = isMe ? ME_GREEN : isElite ? 0xffd247 : 0xffffff;
      const troopColor = isMe ? ME_GREEN : parseInt(String(p.color).slice(1), 16);

      let pair = this.regionLabels.get(reg.key);
      if (!pair) {
        const nameText = new Text({
          text: isElite ? displayName.toUpperCase() : displayName,
          style: {
            fontFamily: 'Rajdhani, Oswald, Segoe UI, sans-serif',
            fontSize: isElite ? 16 : 12,
            fontWeight: isElite ? '800' : '700',
            fill: nameColor,
            stroke: { color: isElite ? 0x3a2400 : 0x000000, width: isElite ? 4 : 3, alpha: 0.9 },
            letterSpacing: isElite ? 2 : 1,
          },
        });
        nameText.anchor.set(0.5);
        const troopText = new Text({
          text: formatTroops(garrison),
          style: {
            fontFamily: 'JetBrains Mono, Consolas, monospace',
            fontSize: 14,
            fontWeight: '700',
            fill: troopColor,
            stroke: { color: 0x000000, width: 3, alpha: 0.85 },
          },
        });
        troopText.anchor.set(0.5);
        this.labelLayer.addChild(nameText);
        this.labelLayer.addChild(troopText);
        pair = { nameText, troopText };
        this.regionLabels.set(reg.key, pair);
      }

      // Visibilité selon le viewport — Pixi skip totalement les invisibles.
      pair.nameText.visible = inView;
      pair.troopText.visible = inView;
      if (!inView) continue;

      pair.nameText.x = reg.cx;
      pair.nameText.y = reg.cy - 9;
      pair.troopText.x = reg.cx;
      pair.troopText.y = reg.cy + 5;

      const finalName = isElite ? displayName.toUpperCase() : displayName;
      if (pair.nameText.text !== finalName) pair.nameText.text = finalName;
      const tt = formatTroops(garrison);
      if (pair.troopText.text !== tt) pair.troopText.text = tt;
      pair.nameText.style.fill = nameColor;
      pair.troopText.style.fill = troopColor;
    }

    // Nettoie les régions qui n'existent plus.
    for (const [key, pair] of this.regionLabels) {
      if (!seen.has(key)) {
        this.labelLayer.removeChild(pair.nameText);
        this.labelLayer.removeChild(pair.troopText);
        pair.nameText.destroy();
        pair.troopText.destroy();
        this.regionLabels.delete(key);
      }
    }
  }

  /** Halo de protection — UNIQUEMENT pour le joueur humain, pour éviter
   *  d'itérer les tuiles de 150 bots × 60 fps. */
  private renderSpawnProtection(state: any) {
    if (!state.players) return;
    const me = state.players.get(socket.sessionId);
    if (!me || !me.spawnProtectedUntil || me.spawnProtectedUntil <= state.tick) return;
    const tiles: Set<number> | undefined = state.playerTiles?.get(me.id);
    if (!tiles) return;
    const g = this.waveLayer;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
    let i = 0;
    for (const tid of tiles) {
      if (i++ > 200) break; // cap defensif si le joueur a déjà capturé beaucoup
      const cell = state.territories[tid];
      if (!cell) continue;
      g.rect(cell.x * CELL_SIZE, cell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        .stroke({ width: 1, color: 0xffffff, alpha: 0.4 + 0.4 * pulse });
    }
  }

  private renderFlashes(state: any) {
    const g = this.flashLayer;
    g.clear();
    if (this.flashes.length === 0) return;
    const now = performance.now();
    const kept: typeof this.flashes = [];
    for (const f of this.flashes) {
      const age = now - f.startedAt;
      if (age > 250) continue;
      const t = state.territories[f.tileId];
      if (!t) continue;
      const alpha = 1 - age / 250;
      g.rect(t.x * CELL_SIZE, t.y * CELL_SIZE, CELL_SIZE, CELL_SIZE)
        .fill({ color: 0xffffff, alpha: alpha * 0.6 });
      kept.push(f);
    }
    this.flashes = kept;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Vagues d'expansion — glow pulsant sur le front + ligne vers la cible
  // ──────────────────────────────────────────────────────────────────────

  private renderWaves(state: any) {
    // Visuels de "tuiles qui avancent" désactivés à la demande : on garde
    // juste le clear pour ne pas laisser de traces fantômes.
    this.waveLayer.clear();
    void state;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Navires
  // ──────────────────────────────────────────────────────────────────────

  private renderShips(state: any) {
    if (!state.ships) return;
    const seen = new Set<string>();
    state.ships.forEach((ship: any, id: string) => {
      seen.add(id);
      let g = this.shipSprites.get(id);
      if (!g) {
        g = new Graphics();
        this.shipSprites.set(id, g);
        this.shipLayer.addChild(g);
      }
      const owner = state.players.get(ship.owner);
      const color = owner ? parseInt(String(owner.color).slice(1), 16) : 0xffffff;
      const isBattleship = ship.type === ShipType.Battleship;
      g.clear();
      // Coque
      const len = isBattleship ? 11 : 8;
      const wid = isBattleship ? 5 : 4;
      g.rect(-len / 2, -wid / 2, len, wid).fill({ color });
      g.rect(-len / 2, -wid / 2, len, wid).stroke({ width: 1, color: 0x000000, alpha: 0.7 });
      // Mât / passerelle
      g.rect(-1, -wid / 2 - 2, 2, 2).fill({ color: 0xffffff, alpha: 0.85 });
      // Indicateur HP
      const hpPct = ship.maxHp > 0 ? ship.hp / ship.maxHp : 1;
      g.rect(-len / 2, wid / 2 + 1, len * hpPct, 1).fill({
        color: hpPct > 0.5 ? 0x4caf50 : hpPct > 0.25 ? 0xe0c93d : 0xe0533d,
      });
      // Cargo (point lumineux si troupes embarquées)
      if (ship.cargo > 0) {
        g.circle(0, 0, 1.5).fill({ color: 0xffffff, alpha: 0.9 });
      }
      g.x = (ship.x) * CELL_SIZE;
      g.y = (ship.y) * CELL_SIZE;

      // Orientation simple : pointe vers destination.
      if (ship.destX !== null && ship.destY !== null) {
        g.rotation = Math.atan2(ship.destY - ship.y, ship.destX - ship.x);
      }
    });
    for (const [id, g] of this.shipSprites) {
      if (!seen.has(id)) { g.destroy(); this.shipSprites.delete(id); }
    }

    // ─── Marqueurs de débarquement ──────────────────────────────────────
    // Pour chaque ship m'appartenant et ayant un landTargetId, on dessine
    // un repère animé sur la tuile cible (cratère doré pulsé + ancre).
    this.destMarkerPhase += 0.06; // ~6 cycles / sec à 60 fps
    const seenMarkers = new Set<string>();
    const myId = socket.sessionId;
    state.ships.forEach((ship: any, id: string) => {
      if (ship.owner !== myId) return;
      if (ship.landTargetId === null || ship.landTargetId === undefined) return;
      const tile = state.territoryById?.get(ship.landTargetId);
      if (!tile) return;
      seenMarkers.add(id);

      let m = this.shipDestMarkers.get(id);
      if (!m) {
        m = new Graphics();
        this.shipDestMarkers.set(id, m);
        this.shipLayer.addChild(m);
      }
      const cx = (tile.x + 0.5) * CELL_SIZE;
      const cy = (tile.y + 0.5) * CELL_SIZE;
      m.clear();

      // Anneau pulsé doré.
      const pulse = 0.5 + 0.5 * Math.sin(this.destMarkerPhase);
      const baseR = CELL_SIZE * 1.3;
      m.circle(0, 0, baseR + pulse * 4).stroke({ width: 1.4, color: 0xf1c40f, alpha: 0.5 + pulse * 0.4 });
      m.circle(0, 0, baseR - 2).stroke({ width: 2.2, color: 0xffd247, alpha: 0.85 });
      // Croix de visée intérieure
      const h = baseR * 0.7;
      m.moveTo(-h, 0).lineTo(h, 0).stroke({ width: 1, color: 0xffd247, alpha: 0.75 });
      m.moveTo(0, -h).lineTo(0, h).stroke({ width: 1, color: 0xffd247, alpha: 0.75 });
      // Petite ancre au centre
      m.circle(0, 0, 1.5).fill({ color: 0xffd247 });

      m.x = cx;
      m.y = cy;
    });
    // Cleanup des marqueurs périmés (bateau parti, débarqué, ou détruit).
    for (const [id, g] of this.shipDestMarkers) {
      if (!seenMarkers.has(id)) { g.destroy(); this.shipDestMarkers.delete(id); }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Missiles en vol — arc parabolique
  // ──────────────────────────────────────────────────────────────────────

  private renderMissiles(state: any) {
    if (!state.missiles) return;
    const seen = new Set<string>();
    state.missiles.forEach((m: any, id: string) => {
      seen.add(id);
      const elapsed = state.tick - m.startTick;
      const progress = Math.min(1, elapsed / m.durationTicks);
      let g = this.missileSprites.get(id);
      if (!g) {
        g = new Graphics();
        this.missileSprites.set(id, g);
        this.missileLayer.addChild(g);
      }
      const owner = state.players.get(m.owner);
      const color = owner ? parseInt(String(owner.color).slice(1), 16) : 0xffffff;

      // Position interpolée le long d'un segment + offset parabolique.
      const sx = m.fromX * CELL_SIZE;
      const sy = m.fromY * CELL_SIZE;
      const ex = m.toX * CELL_SIZE;
      const ey = m.toY * CELL_SIZE;
      const x = sx + (ex - sx) * progress;
      const y = sy + (ey - sy) * progress;
      const dist = Math.hypot(ex - sx, ey - sy);
      const arc = -Math.sin(progress * Math.PI) * (40 + dist * 0.18);

      g.clear();
      const size = m.kind === 'nuke' ? 5 : m.kind === 'hydrogen' ? 6 : 8; // tsar = 8
      g.circle(0, 0, size).fill({ color });
      g.circle(0, 0, size).stroke({ width: 1, color: 0xffffff, alpha: 0.8 });
      // Traînée
      g.moveTo(-size * 2, 0).lineTo(0, 0).stroke({ width: 1, color, alpha: 0.55 });
      g.x = x;
      g.y = y + arc;
      g.rotation = Math.atan2((ey - sy), (ex - sx));
    });
    for (const [id, g] of this.missileSprites) {
      if (!seen.has(id)) { g.destroy(); this.missileSprites.delete(id); }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // Helpers d'accès
  // ──────────────────────────────────────────────────────────────────────

  getCamera(): CameraState { return this.camera; }

  /** Canvas Pixi (utilisé par les calques HTML qui doivent s'aligner dessus). */
  getCanvas(): HTMLCanvasElement { return this.app.canvas; }

  /** Téléportation directe (clic minimap) — snap immédiat sans lerp. */
  jumpTo(col: number, row: number) {
    this.camera.x = col * CELL_SIZE - this.app.screen.width / 2 / this.camera.zoom;
    this.camera.y = row * CELL_SIZE - this.app.screen.height / 2 / this.camera.zoom;
    this.input.syncTarget();
  }

  /** Convertit des coordonnées monde → coordonnées écran (px, viewport). */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const rect = this.app.canvas.getBoundingClientRect();
    return {
      x: rect.left + (wx - this.camera.x) * this.camera.zoom,
      y: rect.top + (wy - this.camera.y) * this.camera.zoom,
    };
  }

  /** Renvoie le terrain d'une cellule pour aider App à décider d'une action. */
  getTerrain(territoryId: number): TerrainType | null {
    if (!this.latestState) return null;
    const t = this.latestState.territories[territoryId];
    return t ? (t.terrain as TerrainType) : null;
  }

  /** Renvoie une tuile complète (owner, terrain, building…) ou null. */
  getTile(territoryId: number): any | null {
    if (!this.latestState) return null;
    return this.latestState.territories[territoryId] ?? null;
  }

  destroy() {
    this.unbindState?.();
    for (const u of this.unbindEvents) u();
    this.unbindEvents = [];
    this.input.detach();
    this.app.destroy(true, { children: true });
  }
}

/** Format compact d'un nombre de troupes : 1234 → "1.2k", 12345 → "12k". */
function formatTroops(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  if (v < 10000) return (v / 1000).toFixed(1) + 'k';
  if (v < 1000000) return Math.floor(v / 1000) + 'k';
  return (v / 1000000).toFixed(1) + 'M';
}
