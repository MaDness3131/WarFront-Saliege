/**
 * GameEngine — boucle de rendu et caméra (PixiJS).
 * ------------------------------------------------
 * Responsabilités strictement CLIENT :
 *  - initialiser PixiJS et la scène ;
 *  - boucle de rendu 60 FPS découplée du tick serveur (10 Hz) ;
 *  - caméra : déplacement WASD / drag, zoom Q/E, clamp aux bords ;
 *  - interpolation visuelle des vagues d'armées entre deux états serveur ;
 *  - relais des clics vers InputManager.
 *
 * Aucune logique de jeu : l'état fait autorité côté serveur, le moteur ne
 * fait que l'afficher de façon fluide.
 */

import { Application, Container, Graphics } from 'pixi.js';
import { WorldMap } from './WorldMap';
import { TerritorySystem } from './TerritorySystem';
import { InputManager } from './InputManager';
import { ExplosionSystem } from '../vfx/ExplosionSystem';
import { socket } from '../network/SocketClient';
import { ServerEvent } from '../../../shared/types';
import { CELL_SIZE } from '../../../shared/constants';

export interface CameraState {
  x: number;
  y: number;
  zoom: number;
}

export class GameEngine {
  readonly app: Application;
  private world = new Container();
  private map = new WorldMap();
  private territorySystem = new TerritorySystem(this.map);
  private explosions = new ExplosionSystem();
  private armyLayer = new Graphics();
  private input: InputManager;

  private camera: CameraState = { x: 0, y: 0, zoom: 1 };
  private initialized = false;
  private latestState: any = null;
  /** Vagues interpolées : id → { x, y } en coordonnées monde. */
  private armySprites = new Map<string, Graphics>();

  private unbindState?: () => void;

  constructor() {
    this.app = new Application();
    this.input = new InputManager(this.camera);
  }

  /** Bootstrap : crée le canvas, attache les couches, démarre la boucle. */
  async start(mount: HTMLElement) {
    await this.app.init({
      resizeTo: mount,
      antialias: false, // pixel art : on veut des bords nets
      background: 0x070b12,
      preference: 'webgl',
    });
    mount.appendChild(this.app.canvas);

    this.world.addChild(this.map.container);
    this.world.addChild(this.armyLayer);
    this.world.addChild(this.explosions.container);
    this.app.stage.addChild(this.world);

    this.input.attach(this.app.canvas, (territoryId) => socket.attack(territoryId));

    // Synchronisation : on stocke le dernier état, le rendu le consomme.
    this.unbindState = socket.onState((state) => {
      this.latestState = state;
      if (!this.initialized) this.bootstrapFromState(state);
      this.syncFromState(state);
    });

    // VFX déclenchés par le serveur.
    socket.onEvent(ServerEvent.Explosion, (p) => {
      this.explosions.spawn(p.x * CELL_SIZE, p.y * CELL_SIZE, p.kind ?? 0);
    });
    socket.onEvent(ServerEvent.TerritoryCaptured, (p) => {
      this.territorySystem.onCapture(p.id);
    });

    this.app.ticker.add((ticker) => this.render(ticker.deltaMS));
  }

  /** Première réception d'état : construit la grille et centre la caméra. */
  private bootstrapFromState(state: any) {
    const territories = [...state.territories];
    this.map.init(territories, state.mapWidth, state.mapHeight);

    // Centre la caméra sur le territoire de spawn du joueur.
    const mine = territories.find((t: any) => t.owner === socket.sessionId);
    if (mine) {
      this.camera.x = mine.x * CELL_SIZE - this.app.screen.width / 2;
      this.camera.y = mine.y * CELL_SIZE - this.app.screen.height / 2;
    }
    this.input.setBounds(this.map.pixelBounds, {
      w: this.app.screen.width,
      h: this.app.screen.height,
    });
    this.initialized = true;
  }

  /** Applique l'état serveur aux systèmes de rendu. */
  private syncFromState(state: any) {
    // Couleurs joueurs (hex string → nombre Pixi).
    const colors = new Map<string, number>();
    state.players.forEach((p: any) => {
      colors.set(p.id, parseInt(String(p.color).slice(1), 16));
    });
    this.map.setPlayerColors(colors);
    this.map.sync([...state.territories]);
  }

  /** Boucle de rendu — interpolation + caméra, à 60 FPS. */
  private render(deltaMS: number) {
    this.input.update(deltaMS);

    // Applique la caméra au conteneur monde.
    this.world.scale.set(this.camera.zoom);
    this.world.x = -this.camera.x * this.camera.zoom;
    this.world.y = -this.camera.y * this.camera.zoom;

    this.explosions.update(deltaMS);
    this.territorySystem.update(deltaMS);

    if (this.latestState) this.renderArmies(this.latestState);
  }

  /**
   * Interpolation des vagues d'armées : le serveur envoie `progress` (0..1)
   * le long du segment from→to ; on dessine un point qui glisse.
   */
  private renderArmies(state: any) {
    const seen = new Set<string>();
    const territories = state.territories;

    state.armies.forEach((army: any, id: string) => {
      seen.add(id);
      const from = territories[army.from];
      const to = territories[army.to];
      if (!from || !to) return;

      const fx = (from.x + 0.5) * CELL_SIZE;
      const fy = (from.y + 0.5) * CELL_SIZE;
      const tx = (to.x + 0.5) * CELL_SIZE;
      const ty = (to.y + 0.5) * CELL_SIZE;
      const x = fx + (tx - fx) * army.progress;
      const y = fy + (ty - fy) * army.progress;

      let g = this.armySprites.get(id);
      if (!g) {
        g = new Graphics();
        this.armySprites.set(id, g);
        this.armyLayer.addChild(g);
      }
      const owner = state.players.get(army.owner);
      const color = owner ? parseInt(String(owner.color).slice(1), 16) : 0xffffff;
      g.clear();
      g.circle(0, 0, Math.min(6, 2 + Math.log2(army.amount + 1))).fill({ color });
      g.circle(0, 0, Math.min(6, 2 + Math.log2(army.amount + 1))).stroke({
        width: 1,
        color: 0x000000,
        alpha: 0.6,
      });
      g.x = x;
      g.y = y;
    });

    // Nettoyage des vagues disparues (arrivées / résolues serveur).
    for (const [id, g] of this.armySprites) {
      if (!seen.has(id)) {
        g.destroy();
        this.armySprites.delete(id);
      }
    }
  }

  getCamera(): CameraState {
    return this.camera;
  }

  destroy() {
    this.unbindState?.();
    this.input.detach();
    this.app.destroy(true, { children: true });
  }
}
