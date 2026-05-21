/**
 * InputManager — caméra RTS buttery-smooth.
 * ------------------------------------------
 * Modèle vélocité + inertie inspiré de FrontWars.io / Civ VI / Supreme Cmdr :
 *
 *  1) PAN CLAVIER (WASD / flèches)
 *     Les touches ajoutent une *accélération* à la vélocité (pas la position
 *     directement). La vélocité est bornée par un VMAX exprimé en pixels écran
 *     par seconde (constant quel que soit le zoom). Quand on relâche, la
 *     vélocité décroît exponentiellement → inertie naturelle ~250 ms.
 *
 *  2) DRAG SOURIS
 *     1:1 instantané pendant le drag — la tuile sous le pointeur reste fixée
 *     au pointeur, zéro lag. On échantillonne les coalesced events pour les
 *     souris haute fréquence (120/144 Hz). À la release, la moyenne des
 *     derniers ~80 ms est injectée dans la vélocité → fling/coast doux.
 *
 *  3) ZOOM MOLETTE
 *     On garde un `zoomTarget` séparé du `zoom` courant. À chaque frame, on
 *     lerp `zoom → zoomTarget` avec un taux exponentiel. Pendant l'animation,
 *     on re-ancre la position pour que le point monde sous le curseur reste
 *     fixe → aucun drift visible.
 *
 *  4) STABILITÉ FRAME-RATE INDEPENDENT
 *     - dt clamp à 33 ms (≈ 30 fps) pour absorber un tab-unfocus sans
 *       téléporter la caméra.
 *     - Tous les facteurs de lerp/friction utilisent `Math.exp(-rate * dt)` →
 *       comportement identique à 30/60/120/240 fps.
 *     - Snap epsilon sur vx/vy/zoom → pas de jitter résiduel.
 *     - Au clamp bord de map, on tue la vélocité de l'axe concerné → la
 *       caméra ne « tape » pas indéfiniment contre le mur.
 *
 * Toutes les API publiques précédentes sont conservées (attach, detach,
 * setBounds, setMapWidth, syncTarget, update, resolveClick), donc
 * GameEngine.ts n'a aucune modif à faire.
 */

import { CameraState, CellClick } from './GameEngine';
import { CELL_SIZE } from '@shared/constants';

// ─── Limites ────────────────────────────────────────────────────────────
const ZOOM_MIN = 0.15;
const ZOOM_MAX = 4;
const ZOOM_STEP = 1.12;                // par cran molette
const DRAG_THRESHOLD = 5;              // px : en-dessous, on traite comme un clic
const OVERSCROLL = 200;                // px monde de marge au-delà des bords

// ─── Pan clavier (modèle vélocité + inertie) ────────────────────────────
/** Pixels écran / seconde maximum quand on tient WASD à fond. */
const PAN_VMAX_PX_PER_SEC   = 1200;
/** Pixels écran / seconde² (combien de temps pour atteindre VMAX).
 *  À 2400 px/s², on met 0.5 s pour atteindre VMAX. Sensation "RTS pro". */
const PAN_ACCEL_PX_PER_SEC2 = 2400;
/** Taux de friction (1/s). Plus élevé = arrête vite. */
const FRICTION_PRESSED  = 1.5;         // friction modeste quand on tient
const FRICTION_RELEASED = 4.0;         // friction forte quand on lâche (~250 ms)

// ─── Fling drag ─────────────────────────────────────────────────────────
const FLING_GAIN = 0.85;               // 1.0 = vélocité = moyenne échantillonnée
const FLING_WINDOW_MS = 80;            // moyenne sur les derniers 80 ms
const FLING_MIN_SPEED_PX_PER_SEC = 30; // sous ce seuil, on ne fling pas

// ─── Zoom ───────────────────────────────────────────────────────────────
/** Taux exponentiel du lerp zoom (1/ms). 0.012 ≈ ~160 ms pour 80%. */
const ZOOM_RATE = 0.012;

// ─── Stabilité ──────────────────────────────────────────────────────────
const DT_CLAMP_MS = 33;                // ≈ 30 fps mini effectif
const EPSILON_V_PX_PER_SEC = 0.5;      // snap vx/vy → 0
const EPSILON_ZOOM = 1e-4;             // snap zoom → target

interface DragSample { t: number; vx: number; vy: number; }

export class InputManager {
  private keys = new Set<string>();
  private canvas: HTMLCanvasElement | null = null;
  private onCellClick: ((c: CellClick) => void) | null = null;

  private bounds = { w: 0, h: 0 };
  private viewport = { w: 0, h: 0 };
  private mapWidth = 0;

  // ─── Drag ─────────────────────────────────────────────────────────────
  private dragging = false;
  private dragMoved = 0;
  private lastPointer = { x: 0, y: 0, t: 0 };
  /** Échantillons de vélocité monde (px monde / ms) pour le fling release. */
  private dragSamples: DragSample[] = [];

  // ─── Vélocité caméra (px monde / ms) ──────────────────────────────────
  private vx = 0;
  private vy = 0;

  // ─── Zoom : la cible est la valeur "logique", `camera.zoom` est animé ─
  private zoomTarget = 1;
  /** Point monde fixe pendant qu'on anime le zoom (curseur). */
  private zoomAnchor: { wx: number; wy: number; sx: number; sy: number } | null = null;

  constructor(private camera: CameraState) {
    this.zoomTarget = camera.zoom;
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────
  attach(canvas: HTMLCanvasElement, onCellClick: (c: CellClick) => void) {
    this.canvas = canvas;
    this.onCellClick = onCellClick;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.preventCtx);
  }

  detach() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas?.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas?.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    this.canvas?.removeEventListener('wheel', this.onWheel);
    this.canvas?.removeEventListener('contextmenu', this.preventCtx);
  }

  setBounds(bounds: { w: number; h: number }, viewport: { w: number; h: number }) {
    this.bounds = bounds;
    this.viewport = viewport;
  }

  setMapWidth(w: number) { this.mapWidth = w; }

  /** Synchronise la cible sur la caméra actuelle — appelé après bootstrap
   *  ou téléportation programmatique (clic minimap) pour ne pas glisser
   *  depuis l'ancienne position. Tue aussi l'inertie résiduelle. */
  syncTarget() {
    this.zoomTarget = this.camera.zoom;
    this.zoomAnchor = null;
    this.vx = 0;
    this.vy = 0;
    this.dragSamples.length = 0;
  }

  // ─── Boucle frame ─────────────────────────────────────────────────────
  update(deltaMS: number) {
    // Clamp dt pour absorber les spikes (tab inactif, GC) sans téléporter.
    const dt = Math.min(deltaMS, DT_CLAMP_MS);
    if (dt <= 0) return;

    // 1) PAN CLAVIER → accélération
    let ax = 0, ay = 0;
    if (this.keys.has('w') || this.keys.has('arrowup'))    ay -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown'))  ay += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft'))  ax -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) ax += 1;
    const isPressing = ax !== 0 || ay !== 0;
    if (isPressing) {
      // Normalisation diagonale → vitesse identique en biais (8 directions).
      const len = Math.hypot(ax, ay);
      ax /= len; ay /= len;
      // Conversion s² → ms² et compensation zoom : on veut une vitesse écran
      // constante, donc en monde on divise par zoom.
      const accel = (PAN_ACCEL_PX_PER_SEC2 / 1e6) / this.camera.zoom;
      this.vx += ax * accel * dt;
      this.vy += ay * accel * dt;

      // Cap à VMAX (en monde, vmax = VMAX_écran / zoom).
      const vmag = Math.hypot(this.vx, this.vy);
      const vmax = (PAN_VMAX_PX_PER_SEC / 1000) / this.camera.zoom;
      if (vmag > vmax) {
        const k = vmax / vmag;
        this.vx *= k; this.vy *= k;
      }
    }

    // 2) FRICTION exponentielle (toujours active — modeste quand on tient,
    //    forte quand on lâche → inertie qui s'éteint en ~250 ms).
    const fricRate = isPressing ? FRICTION_PRESSED : FRICTION_RELEASED;
    const decay = Math.exp(-fricRate * dt / 1000);
    this.vx *= decay;
    this.vy *= decay;

    // Snap epsilon (px écran / sec).
    const epsWorld = (EPSILON_V_PX_PER_SEC / 1000) / this.camera.zoom;
    if (Math.abs(this.vx) < epsWorld) this.vx = 0;
    if (Math.abs(this.vy) < epsWorld) this.vy = 0;

    // 3) Intègre vélocité → position (pas pendant le drag, où on est en 1:1).
    if (!this.dragging) {
      this.camera.x += this.vx * dt;
      this.camera.y += this.vy * dt;
    }

    // 4) ZOOM lerp + re-ancrage curseur.
    if (Math.abs(this.zoomTarget - this.camera.zoom) > EPSILON_ZOOM) {
      const t = 1 - Math.exp(-ZOOM_RATE * dt);
      this.camera.zoom += (this.zoomTarget - this.camera.zoom) * t;
      if (this.zoomAnchor) {
        // Maintient le point monde `wx,wy` sous le curseur `sx,sy` quel que
        // soit le zoom courant. Pas de drift pendant l'animation.
        this.camera.x = this.zoomAnchor.wx - this.zoomAnchor.sx / this.camera.zoom;
        this.camera.y = this.zoomAnchor.wy - this.zoomAnchor.sy / this.camera.zoom;
      }
    } else if (this.camera.zoom !== this.zoomTarget) {
      this.camera.zoom = this.zoomTarget;
      this.zoomAnchor = null;
    }

    // 5) Clamp final aux bords + amortissement de la vélocité contre le mur.
    this.clampCamera();
  }

  // ─── Pointer / wheel / keys ───────────────────────────────────────────
  private onKeyDown = (e: KeyboardEvent) => {
    // Ignore les répétitions OS (la touche reste dans `keys` de toute façon).
    if (e.repeat) return;
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); };
  /** Si la fenêtre perd le focus pendant un appui : pas de touche fantôme. */
  private onBlur = () => { this.keys.clear(); };
  private preventCtx = (e: Event) => e.preventDefault();

  private onPointerDown = (e: PointerEvent) => {
    if (e.button === 2) return; // clic droit géré par App (radial)
    this.dragging = true;
    this.dragMoved = 0;
    this.lastPointer = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    this.dragSamples.length = 0;
    // Annule l'inertie courante — l'utilisateur prend la main directement.
    this.vx = 0; this.vy = 0;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    // Sur les souris haute fréquence (120/144 Hz), getCoalescedEvents() rend
    // chaque sous-frame de mouvement → drag perceptuellement parfait.
    const evs: PointerEvent[] = typeof e.getCoalescedEvents === 'function'
      ? e.getCoalescedEvents() as PointerEvent[]
      : [];
    if (evs.length === 0) {
      this.applyDragStep(e.clientX, e.clientY, e.timeStamp);
    } else {
      for (const sub of evs) this.applyDragStep(sub.clientX, sub.clientY, sub.timeStamp);
    }
  };

  private applyDragStep(clientX: number, clientY: number, ts: number) {
    const dx = clientX - this.lastPointer.x;
    const dy = clientY - this.lastPointer.y;
    const dtSub = Math.max(1, ts - this.lastPointer.t);
    this.dragMoved += Math.abs(dx) + Math.abs(dy);

    // Drag 1:1 : la tuile sous le pointeur reste pile sous le pointeur.
    const wdx = dx / this.camera.zoom;
    const wdy = dy / this.camera.zoom;
    this.camera.x -= wdx;
    this.camera.y -= wdy;
    this.clampCamera();

    // Échantillon de vélocité (px monde / ms) pour le fling à la release.
    this.dragSamples.push({ t: ts, vx: -wdx / dtSub, vy: -wdy / dtSub });
    // On garde uniquement la fenêtre récente.
    while (this.dragSamples.length > 0 && ts - this.dragSamples[0].t > FLING_WINDOW_MS) {
      this.dragSamples.shift();
    }

    this.lastPointer = { x: clientX, y: clientY, t: ts };
  }

  private onPointerUp = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.dragging = false;

    // Click vs drag : sous le seuil, c'est un clic — on relaie à l'app.
    if (this.dragMoved < DRAG_THRESHOLD && this.canvas) {
      const click = this.resolveClick(e.clientX, e.clientY);
      if (click) this.onCellClick?.(click);
      return;
    }

    // Fling : moyenne des vélocités des derniers FLING_WINDOW_MS.
    if (this.dragSamples.length >= 2) {
      let sumVx = 0, sumVy = 0;
      for (const s of this.dragSamples) { sumVx += s.vx; sumVy += s.vy; }
      const n = this.dragSamples.length;
      const avgVx = (sumVx / n) * FLING_GAIN;
      const avgVy = (sumVy / n) * FLING_GAIN;
      // Seuil : ne pas fling si trop lent (probablement un drag de précision).
      const screenSpeed = Math.hypot(avgVx, avgVy) * this.camera.zoom * 1000;
      if (screenSpeed >= FLING_MIN_SPEED_PX_PER_SEC) {
        this.vx = avgVx;
        this.vy = avgVy;
      }
    }
    this.dragSamples.length = 0;
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    // Multiplier en fonction de la direction et du momentum (deltaY peut être
    // grand sur trackpads/Shift+wheel — on prend le signe + un step constant).
    const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    const newTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoomTarget * factor));
    if (newTarget === this.zoomTarget) return;
    // Point monde sous le curseur AU MOMENT du wheel (référentiel CAMÉRA
    // courante, pas target — sinon on dérive si on roule pendant l'anim).
    const wx = sx / this.camera.zoom + this.camera.x;
    const wy = sy / this.camera.zoom + this.camera.y;
    this.zoomAnchor = { wx, wy, sx, sy };
    this.zoomTarget = newTarget;
  };

  // ─── Helpers ──────────────────────────────────────────────────────────
  /** Convertit (clientX,clientY) en CellClick monde — utilisé par l'App.tsx
   *  pour des resolutions de clic ad-hoc. */
  resolveClick(clientX: number, clientY: number): CellClick | null {
    if (!this.canvas) return null;
    const rect = this.canvas.getBoundingClientRect();
    const worldX = (clientX - rect.left) / this.camera.zoom + this.camera.x;
    const worldY = (clientY - rect.top) / this.camera.zoom + this.camera.y;
    const col = Math.floor(worldX / CELL_SIZE);
    const row = Math.floor(worldY / CELL_SIZE);
    const id = this.cellToId(col, row);
    if (id === null) return null;
    return { territoryId: id, worldX: worldX / CELL_SIZE, worldY: worldY / CELL_SIZE, isOcean: false };
  }

  private clampCamera() {
    const visW = this.viewport.w / this.camera.zoom;
    const visH = this.viewport.h / this.camera.zoom;
    const margin = OVERSCROLL / this.camera.zoom;
    const minX = -margin;
    const minY = -margin;
    const maxX = Math.max(minX, this.bounds.w - visW + margin);
    const maxY = Math.max(minY, this.bounds.h - visH + margin);

    if (this.camera.x < minX) {
      this.camera.x = minX;
      if (this.vx < 0) this.vx = 0; // ne tape pas contre le mur
    } else if (this.camera.x > maxX) {
      this.camera.x = maxX;
      if (this.vx > 0) this.vx = 0;
    }
    if (this.camera.y < minY) {
      this.camera.y = minY;
      if (this.vy < 0) this.vy = 0;
    } else if (this.camera.y > maxY) {
      this.camera.y = maxY;
      if (this.vy > 0) this.vy = 0;
    }
  }

  private cellToId(col: number, row: number): number | null {
    const cols = this.mapWidth || Math.round(this.bounds.w / CELL_SIZE);
    const rows = Math.round(this.bounds.h / CELL_SIZE);
    if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
    return row * cols + col;
  }
}
