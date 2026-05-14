/**
 * InputManager — saisie clavier / souris.
 * ---------------------------------------
 * Traduit les entrées en mouvements caméra et en INTENTIONS de jeu :
 *  - WASD / flèches : déplacement caméra ;
 *  - Q / E ou molette : zoom ;
 *  - clic gauche maintenu + glisser : drag caméra ;
 *  - clic gauche simple sur un territoire : ordre d'attaque (intention).
 *
 * Ne produit jamais d'effet de jeu directement : il appelle le callback
 * `onAttack` qui envoie l'intention au serveur via SocketClient.
 */

import { CameraState } from './GameEngine';
import { CELL_SIZE } from '../../../shared/constants';

const PAN_SPEED = 0.6; // pixels monde / ms à zoom 1
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.12;
const DRAG_THRESHOLD = 5; // px : en-dessous, c'est un clic, pas un drag

export class InputManager {
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement | null = null;
  private onAttack: ((territoryId: number) => void) | null = null;

  private bounds = { w: 0, h: 0 };
  private viewport = { w: 0, h: 0 };

  // État du drag.
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0 };

  constructor(private camera: CameraState) {}

  attach(canvas: HTMLCanvasElement, onAttack: (territoryId: number) => void) {
    this.canvas = canvas;
    this.onAttack = onAttack;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas?.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.canvas?.removeEventListener('wheel', this.onWheel);
  }

  setBounds(bounds: { w: number; h: number }, viewport: { w: number; h: number }) {
    this.bounds = bounds;
    this.viewport = viewport;
  }

  /** Appelé chaque frame par GameEngine : applique le pan clavier. */
  update(deltaMS: number) {
    let dx = 0;
    let dy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) dy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) dy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) dx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) dx += 1;

    if (dx !== 0 || dy !== 0) {
      // Normalisation diagonale + vitesse compensée par le zoom.
      const len = Math.hypot(dx, dy) || 1;
      const speed = (PAN_SPEED * deltaMS) / this.camera.zoom;
      this.camera.x += (dx / len) * speed;
      this.camera.y += (dy / len) * speed;
      this.clampCamera();
    }

    if (this.keys.has('q')) this.zoomBy(1 / ZOOM_STEP, this.viewport.w / 2, this.viewport.h / 2);
    if (this.keys.has('e')) this.zoomBy(ZOOM_STEP, this.viewport.w / 2, this.viewport.h / 2);
  }

  // ─── Handlers clavier ─────────────────────────────────────────────────

  private onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  // ─── Handlers pointeur ────────────────────────────────────────────────

  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.dragMoved = 0;
    this.lastPointer = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const dx = e.clientX - this.lastPointer.x;
    const dy = e.clientY - this.lastPointer.y;
    this.dragMoved += Math.abs(dx) + Math.abs(dy);
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y -= dy / this.camera.zoom;
    this.lastPointer = { x: e.clientX, y: e.clientY };
    this.clampCamera();
  };

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;
    // Mouvement faible ⇒ c'était un clic : on résout le territoire visé.
    if (this.dragMoved < DRAG_THRESHOLD && this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const worldX = screenX / this.camera.zoom + this.camera.x;
      const worldY = screenY / this.camera.zoom + this.camera.y;
      const col = Math.floor(worldX / CELL_SIZE);
      const row = Math.floor(worldY / CELL_SIZE);
      const territoryId = this.cellToId(col, row);
      if (territoryId !== null) this.onAttack?.(territoryId);
    }
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas!.getBoundingClientRect();
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    this.zoomBy(factor, e.clientX - rect.left, e.clientY - rect.top);
  };

  // ─── Caméra ───────────────────────────────────────────────────────────

  /** Zoom centré sur un point écran (le point reste sous le curseur). */
  private zoomBy(factor: number, screenX: number, screenY: number) {
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.camera.zoom * factor));
    if (newZoom === this.camera.zoom) return;
    const worldX = screenX / this.camera.zoom + this.camera.x;
    const worldY = screenY / this.camera.zoom + this.camera.y;
    this.camera.zoom = newZoom;
    this.camera.x = worldX - screenX / newZoom;
    this.camera.y = worldY - screenY / newZoom;
    this.clampCamera();
  }

  /** Empêche la caméra de sortir des limites de la carte. */
  private clampCamera() {
    const visW = this.viewport.w / this.camera.zoom;
    const visH = this.viewport.h / this.camera.zoom;
    const maxX = Math.max(0, this.bounds.w - visW);
    const maxY = Math.max(0, this.bounds.h - visH);
    this.camera.x = Math.min(maxX, Math.max(0, this.camera.x));
    this.camera.y = Math.min(maxY, Math.max(0, this.camera.y));
  }

  private cellToId(col: number, row: number): number | null {
    const cols = Math.round(this.bounds.w / CELL_SIZE);
    const rows = Math.round(this.bounds.h / CELL_SIZE);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    return row * cols + col;
  }
}
