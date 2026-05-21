/**
 * ParticleSystem — pool de Sprite Pixi pour effets one-shot.
 * ----------------------------------------------------------
 * Génère 4 textures réutilisables (jeton or, jeton rouge, confetti, étoile)
 * à l'init, puis les "spawn" via un pool de Sprite. Chaque particule a sa
 * propre physique (vx, vy, gravity, spin) mais partage la texture → coût
 * GPU négligeable même à 400 particules.
 *
 * Architecture :
 *   - container PIXI.Container ajouté au monde du GameEngine
 *   - update(deltaMS) tické par le moteur dans son boucle
 *   - spawn(...) appelé depuis n'importe où (capture, kill, build)
 *
 * Cap dur : 400 particules actives, anciennes recyclées.
 */

import { Container, Graphics, RenderTexture, Sprite, Texture, Renderer } from 'pixi.js';

export type ParticleKind = 'chip-gold' | 'chip-red' | 'confetti-gold' | 'confetti-red' | 'star';

interface ParticleSlot {
  sprite: Sprite;
  active: boolean;
  vx: number;
  vy: number;
  ax: number;   // accélération (gravité)
  ay: number;
  spin: number;
  life: number;     // ms restant
  maxLife: number;
  fadeStart: number; // ms à partir desquels on fade
  scale0: number;
  scaleEnd: number;
}

const POOL_CAP = 400;

export class ParticleSystem {
  readonly container = new Container();
  private textures = new Map<ParticleKind, Texture>();
  private pool: ParticleSlot[] = [];
  private cursor = 0;

  /** À appeler après que Pixi soit init (besoin du renderer pour generateTexture). */
  bake(renderer: Renderer) {
    this.textures.set('chip-gold',     this.bakeChip(renderer, 0xffd247, 0xb6791a, 0xfff5d4));
    this.textures.set('chip-red',      this.bakeChip(renderer, 0xff5070, 0x6e0a17, 0xffd4dc));
    this.textures.set('confetti-gold', this.bakeConfetti(renderer, 0xffd247));
    this.textures.set('confetti-red',  this.bakeConfetti(renderer, 0xff5070));
    this.textures.set('star',          this.bakeStar(renderer, 0xfff5d4));
  }

  private bakeChip(renderer: Renderer, fill: number, edge: number, rim: number): Texture {
    const g = new Graphics();
    const R = 12;
    // Anneau extérieur
    g.circle(R, R, R).fill({ color: edge });
    g.circle(R, R, R - 1.5).fill({ color: fill });
    // Marques de jeton (4 petits "creux")
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const cx = R + Math.cos(a) * (R - 2.4);
      const cy = R + Math.sin(a) * (R - 2.4);
      g.rect(cx - 1.6, cy - 0.6, 3.2, 1.2).fill({ color: edge });
    }
    g.circle(R, R, R - 5).fill({ color: rim, alpha: 0.92 });
    g.circle(R, R, R - 5).stroke({ width: 0.8, color: edge });
    const tex = renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  private bakeConfetti(renderer: Renderer, color: number): Texture {
    const g = new Graphics();
    g.rect(0, 0, 6, 2).fill({ color });
    g.rect(0, 0, 6, 2).stroke({ width: 0.4, color: 0x000000, alpha: 0.5 });
    const tex = renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  private bakeStar(renderer: Renderer, color: number): Texture {
    const g = new Graphics();
    const pts: number[] = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? 5 : 2;
      pts.push(5 + Math.cos(a) * r, 5 + Math.sin(a) * r);
    }
    g.poly(pts).fill({ color });
    const tex = renderer.generateTexture(g);
    g.destroy();
    return tex;
  }

  /** Spawne `count` particules au point (x, y) en pixels monde. */
  spawn(opts: {
    x: number; y: number;
    count: number;
    kind: ParticleKind;
    /** Vitesse initiale "cible" — chaque particule a un random ±50%. */
    speed?: number;
    /** Direction prédominante en radians (0 = →). undefined = explosion radiale. */
    angle?: number;
    /** Demi-ouverture du cône autour de `angle` (rad). */
    spread?: number;
    /** Gravité verticale (px/ms²) — 0 pour pas de gravité. */
    gravity?: number;
    /** Durée de vie en ms. */
    life?: number;
    /** Échelle initiale. */
    scale?: number;
    /** Échelle finale (interpolée). */
    scaleEnd?: number;
  }) {
    const tex = this.textures.get(opts.kind);
    if (!tex) return;
    const speed = opts.speed ?? 0.35;
    const life = opts.life ?? 900;
    const gravity = opts.gravity ?? 0.0009;
    const spread = opts.spread ?? Math.PI;
    const baseAngle = opts.angle ?? -Math.PI / 2; // par défaut : vers le haut
    const scale = opts.scale ?? 1;
    const scaleEnd = opts.scaleEnd ?? scale;

    for (let i = 0; i < opts.count; i++) {
      const slot = this.allocateSlot(tex);
      const dirAngle = baseAngle + (Math.random() - 0.5) * 2 * spread;
      const v = speed * (0.6 + Math.random() * 0.8);
      slot.sprite.x = opts.x;
      slot.sprite.y = opts.y;
      slot.sprite.alpha = 1;
      slot.sprite.scale.set(scale);
      slot.sprite.rotation = Math.random() * Math.PI * 2;
      slot.vx = Math.cos(dirAngle) * v;
      slot.vy = Math.sin(dirAngle) * v;
      slot.ax = 0;
      slot.ay = gravity;
      slot.spin = (Math.random() - 0.5) * 0.012;
      slot.life = life;
      slot.maxLife = life;
      slot.fadeStart = life * 0.55;
      slot.scale0 = scale;
      slot.scaleEnd = scaleEnd;
      slot.active = true;
      slot.sprite.visible = true;
    }
  }

  private allocateSlot(tex: Texture): ParticleSlot {
    // Trouve un slot inactif, sinon recycle le plus vieux (cursor round-robin).
    for (let tries = 0; tries < this.pool.length; tries++) {
      const idx = (this.cursor + tries) % this.pool.length;
      const s = this.pool[idx];
      if (!s.active) {
        this.cursor = idx + 1;
        s.sprite.texture = tex;
        return s;
      }
    }
    if (this.pool.length < POOL_CAP) {
      const sp = new Sprite(tex);
      sp.anchor.set(0.5);
      sp.visible = false;
      this.container.addChild(sp);
      const slot: ParticleSlot = {
        sprite: sp, active: false,
        vx: 0, vy: 0, ax: 0, ay: 0, spin: 0,
        life: 0, maxLife: 1, fadeStart: 0,
        scale0: 1, scaleEnd: 1,
      };
      this.pool.push(slot);
      this.cursor = this.pool.length;
      slot.sprite.texture = tex;
      return slot;
    }
    // Pool plein : recycle le slot à cursor.
    const s = this.pool[this.cursor % this.pool.length];
    this.cursor++;
    s.sprite.texture = tex;
    return s;
  }

  /** À appeler chaque frame depuis le ticker Pixi. */
  update(deltaMS: number) {
    for (const s of this.pool) {
      if (!s.active) continue;
      s.life -= deltaMS;
      if (s.life <= 0) {
        s.active = false;
        s.sprite.visible = false;
        continue;
      }
      // Physique.
      s.vx += s.ax * deltaMS;
      s.vy += s.ay * deltaMS;
      s.sprite.x += s.vx * deltaMS;
      s.sprite.y += s.vy * deltaMS;
      s.sprite.rotation += s.spin * deltaMS;
      // Fade + scale interp en fin de vie.
      const k = 1 - s.life / s.maxLife;
      const sc = s.scale0 + (s.scaleEnd - s.scale0) * k;
      s.sprite.scale.set(sc);
      if (s.life < s.fadeStart) {
        s.sprite.alpha = Math.max(0, s.life / s.fadeStart);
      }
    }
  }

  destroy() {
    for (const s of this.pool) s.sprite.destroy();
    this.pool = [];
    for (const tex of this.textures.values()) tex.destroy(true);
    this.textures.clear();
    this.container.destroy();
  }
}

export const particles = new ParticleSystem();
