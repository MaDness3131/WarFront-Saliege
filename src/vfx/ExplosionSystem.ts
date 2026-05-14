/**
 * ExplosionSystem — effets visuels d'explosion (PixiJS).
 * ------------------------------------------------------
 * Pool de particules pour impacts, missiles et frappes nucléaires. Les
 * explosions sont déclenchées par des ÉVÉNEMENTS SERVEUR uniquement — le
 * client ne décide jamais qu'une explosion a lieu, il la joue.
 *
 * Phase 3 : champignon nucléaire multi-couches + terrain brûlé persistant.
 */

import { Container, Graphics } from 'pixi.js';

export enum ExplosionKind {
  Impact = 0,
  Missile = 1,
  Nuke = 2,
}

interface Particle {
  gfx: Graphics;
  age: number;
  ttl: number;
  vx: number;
  vy: number;
  baseRadius: number;
  color: number;
}

const PRESETS = {
  [ExplosionKind.Impact]: { count: 8, ttl: 350, spread: 1.5, radius: 4, color: 0xffb24a },
  [ExplosionKind.Missile]: { count: 16, ttl: 550, spread: 2.5, radius: 6, color: 0xff7a3a },
  [ExplosionKind.Nuke]: { count: 48, ttl: 1600, spread: 5, radius: 14, color: 0xfff1a8 },
};

export class ExplosionSystem {
  readonly container = new Container();
  private particles: Particle[] = [];

  /** Crée une explosion en coordonnées monde. */
  spawn(x: number, y: number, kind: ExplosionKind = ExplosionKind.Impact) {
    const preset = PRESETS[kind] ?? PRESETS[ExplosionKind.Impact];

    for (let i = 0; i < preset.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.05 + Math.random() * 0.15) * preset.spread;
      const g = new Graphics();
      g.x = x;
      g.y = y;
      this.container.addChild(g);
      this.particles.push({
        gfx: g,
        age: 0,
        ttl: preset.ttl * (0.7 + Math.random() * 0.6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        baseRadius: preset.radius * (0.6 + Math.random() * 0.8),
        color: preset.color,
      });
    }

    // Onde de choc centrale pour les nukes.
    if (kind === ExplosionKind.Nuke) {
      const shock = new Graphics();
      shock.x = x;
      shock.y = y;
      this.container.addChild(shock);
      this.particles.push({
        gfx: shock,
        age: 0,
        ttl: 1200,
        vx: 0,
        vy: 0,
        baseRadius: 8,
        color: 0xffffff,
      });
    }
  }

  /** Anime et recycle les particules. À appeler chaque frame. */
  update(deltaMS: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.age += deltaMS;
      const t = p.age / p.ttl;
      if (t >= 1) {
        p.gfx.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.gfx.x += p.vx * deltaMS;
      p.gfx.y += p.vy * deltaMS;
      // Décélération + estompage.
      p.vx *= 0.97;
      p.vy *= 0.97;
      const radius = p.baseRadius * (1 - t * 0.5) + (p.vx === 0 ? t * 60 : 0);
      const alpha = (1 - t) * 0.9;
      p.gfx.clear();
      p.gfx.circle(0, 0, radius).fill({ color: p.color, alpha });
    }
  }

  /** Vide tout (changement de partie). */
  clear() {
    for (const p of this.particles) p.gfx.destroy();
    this.particles = [];
  }
}
