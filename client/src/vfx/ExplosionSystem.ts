/**
 * ExplosionSystem — effets visuels d'explosion (PixiJS).
 * ------------------------------------------------------
 * Pool de particules pour impacts, missiles et frappes nucléaires.
 *  - Impact : éclats orangés courts ;
 *  - Missile : flamme + onde de choc moyenne ;
 *  - Nuke / Hydrogen : flash blanc → boule de feu → champignon multi-couches
 *    qui s'élève, + onde de choc large et marque de scorch au sol.
 *
 * Les explosions sont déclenchées par des événements de la simulation —
 * jamais par le client tout seul.
 */

import { Container, Graphics } from 'pixi.js';
import { CELL_SIZE } from '@shared/constants';

export enum ExplosionKind {
  Impact = 0,
  Missile = 1,
  Nuke = 2,
  /** Tsar Bomba — raseur de continent. Animation grandiose :
   *  flash blanc géant, triple onde de choc, champignon à 5 couches
   *  qui s'élève haut, marque scorch massive, secondaire après délai. */
  Tsar = 3,
}

export interface ExplosionOptions {
  /** Rayon en cellules (utilisé par l'onde de choc et la marque au sol). */
  radiusCells?: number;
  /** Si true, dépose une trace de terrain brûlé persistante. */
  scorch?: boolean;
}

interface Particle {
  gfx: Graphics;
  age: number;
  ttl: number;
  /** Délai avant que la particule devienne active (ms). Pendant ce délai
   *  elle reste invisible — utilisé pour les ondes de choc en cascade
   *  (tsar) et le double-flash. */
  delay?: number;
  vx: number;
  vy: number;
  baseRadius: number;
  color: number;
  /** Type d'animation. */
  kind: 'shard' | 'flash' | 'ring' | 'mushroom' | 'scorch' | 'screen-flash';
  /** Coordonnées d'attache (pour les particules statiques). */
  ax: number;
  ay: number;
}

const PRESETS = {
  [ExplosionKind.Impact]:  { count: 8,  ttl: 350,  spread: 1.5, radius: 4,  color: 0xffb24a },
  [ExplosionKind.Missile]: { count: 16, ttl: 550,  spread: 2.5, radius: 6,  color: 0xff7a3a },
  [ExplosionKind.Nuke]:    { count: 36, ttl: 1800, spread: 5,   radius: 14, color: 0xfff1a8 },
  [ExplosionKind.Tsar]:    { count: 120, ttl: 3500, spread: 9,  radius: 28, color: 0xffffff },
};

export class ExplosionSystem {
  readonly container = new Container();
  private particles: Particle[] = [];

  spawn(x: number, y: number, kind: ExplosionKind = ExplosionKind.Impact, opts: ExplosionOptions = {}) {
    const preset = PRESETS[kind] ?? PRESETS[ExplosionKind.Impact];
    const radiusPx = (opts.radiusCells ?? 1) * CELL_SIZE;

    // Éclats omnidirectionnels.
    for (let i = 0; i < preset.count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.05 + Math.random() * 0.15) * preset.spread;
      const g = new Graphics();
      g.x = x; g.y = y;
      this.container.addChild(g);
      this.particles.push({
        gfx: g, age: 0, ttl: preset.ttl * (0.7 + Math.random() * 0.6),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        baseRadius: preset.radius * (0.6 + Math.random() * 0.8),
        color: preset.color, kind: 'shard', ax: x, ay: y,
      });
    }

    // Onde de choc (toutes explosions sauf impact basique).
    if (kind !== ExplosionKind.Impact) {
      const ring = new Graphics();
      ring.x = x; ring.y = y;
      this.container.addChild(ring);
      this.particles.push({
        gfx: ring, age: 0,
        ttl: kind === ExplosionKind.Tsar ? 2400 : kind === ExplosionKind.Nuke ? 1500 : 800,
        vx: 0, vy: 0, baseRadius: radiusPx * 1.6, color: 0xffffff,
        kind: 'ring', ax: x, ay: y,
      });
    }

    // Nuke / Hydrogen / Tsar : flash blanc + champignon multi-couches + scorch.
    if (kind === ExplosionKind.Nuke || kind === ExplosionKind.Tsar) {
      const isTsar = kind === ExplosionKind.Tsar;
      // Flash central : Tsar = beaucoup plus gros et plus long.
      const flash = new Graphics();
      flash.x = x; flash.y = y;
      this.container.addChild(flash);
      this.particles.push({
        gfx: flash, age: 0,
        ttl: isTsar ? 700 : 280,
        vx: 0, vy: 0,
        baseRadius: radiusPx * (isTsar ? 3.2 : 2.5),
        color: 0xffffff, kind: 'flash', ax: x, ay: y,
      });

      // Champignon : 3 couches (nuke) ou 5 couches (tsar) qui s'élèvent.
      const layerCount = isTsar ? 5 : 3;
      const mushroomColors = [0xffffff, 0xfff1a8, 0xffb24a, 0xff7a3a, 0xa83a1a];
      for (let layer = 0; layer < layerCount; layer++) {
        const m = new Graphics();
        m.x = x; m.y = y;
        this.container.addChild(m);
        this.particles.push({
          gfx: m, age: 0,
          ttl: (isTsar ? 2800 : 1600) + layer * (isTsar ? 320 : 200),
          vx: 0,
          vy: -((isTsar ? 0.10 : 0.05) + layer * (isTsar ? 0.04 : 0.02)),
          baseRadius: radiusPx * ((isTsar ? 0.45 : 0.55) + layer * (isTsar ? 0.22 : 0.18)),
          color: mushroomColors[Math.min(layer, mushroomColors.length - 1)],
          kind: 'mushroom', ax: x, ay: y,
        });
      }

      // Marque de scorch au sol (persiste un peu plus longtemps).
      if (opts.scorch) {
        const s = new Graphics();
        s.x = x; s.y = y;
        this.container.addChild(s);
        this.particles.push({
          gfx: s, age: 0,
          ttl: isTsar ? 6000 : 2500,
          vx: 0, vy: 0,
          baseRadius: radiusPx * (isTsar ? 1.6 : 1.4),
          color: 0x1a0d08, kind: 'scorch', ax: x, ay: y,
        });
      }

      // ─── EFFETS EXCLUSIFS TSAR — grandiose et spectaculaire ──────────
      if (isTsar) {
        // Flash plein écran (overlay blanc qui couvre tout brièvement).
        const screenFlash = new Graphics();
        screenFlash.x = x; screenFlash.y = y;
        this.container.addChild(screenFlash);
        this.particles.push({
          gfx: screenFlash, age: 0, ttl: 900,
          vx: 0, vy: 0, baseRadius: 0, // taille calculée dans update
          color: 0xffffff, kind: 'screen-flash', ax: x, ay: y,
        });

        // Triple onde de choc en cascade — chacune part avec un délai.
        // Effet visuel : trois cercles concentriques qui se propagent.
        for (let i = 0; i < 3; i++) {
          const ring2 = new Graphics();
          ring2.x = x; ring2.y = y;
          this.container.addChild(ring2);
          this.particles.push({
            gfx: ring2, age: 0, ttl: 2200,
            delay: i * 400,
            vx: 0, vy: 0,
            baseRadius: radiusPx * (1.4 + i * 0.5),
            color: i === 0 ? 0xffffff : i === 1 ? 0xfff1a8 : 0xffb24a,
            kind: 'ring', ax: x, ay: y,
          });
        }

        // Pluie d'éclats secondaires — particules supplémentaires lancées
        // en couronne autour de l'épicentre.
        const extraShards = 60;
        for (let i = 0; i < extraShards; i++) {
          const angle = (i / extraShards) * Math.PI * 2 + Math.random() * 0.1;
          const speed = (0.08 + Math.random() * 0.22) * 12;
          const g = new Graphics();
          g.x = x; g.y = y;
          this.container.addChild(g);
          this.particles.push({
            gfx: g, age: 0,
            ttl: 1200 + Math.random() * 1500,
            delay: 80 + Math.random() * 250,
            vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
            baseRadius: 5 + Math.random() * 7,
            color: 0xff7a3a, kind: 'shard', ax: x, ay: y,
          });
        }

        // Flash secondaire (rebond thermique) après 1.2s.
        const flash2 = new Graphics();
        flash2.x = x; flash2.y = y;
        this.container.addChild(flash2);
        this.particles.push({
          gfx: flash2, age: 0, ttl: 600, delay: 1200,
          vx: 0, vy: 0,
          baseRadius: radiusPx * 1.8,
          color: 0xfff1a8, kind: 'flash', ax: x, ay: y,
        });
      }
    }
  }

  update(deltaMS: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      // Particules à délai : on les garde invisibles tant que l'age n'a
      // pas dépassé le délai. Sert aux ondes de choc en cascade du Tsar.
      if (p.delay && p.delay > 0) {
        p.delay -= deltaMS;
        p.gfx.clear();
        continue;
      }
      p.age += deltaMS;
      const t = p.age / p.ttl;
      if (t >= 1) {
        p.gfx.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      const g = p.gfx;
      g.clear();

      switch (p.kind) {
        case 'shard': {
          g.x += p.vx * deltaMS;
          g.y += p.vy * deltaMS;
          p.vx *= 0.97; p.vy *= 0.97;
          const radius = p.baseRadius * (1 - t * 0.5);
          g.circle(0, 0, radius).fill({ color: p.color, alpha: (1 - t) * 0.9 });
          break;
        }
        case 'flash': {
          // Flash très bref qui démarre énorme puis disparaît.
          const radius = p.baseRadius * (1 + t * 0.5);
          g.circle(0, 0, radius).fill({ color: p.color, alpha: (1 - t) * 0.85 });
          break;
        }
        case 'ring': {
          // Onde de choc : anneau qui s'étend.
          const radius = p.baseRadius * (0.2 + t * 1.6);
          g.circle(0, 0, radius).stroke({ width: 2, color: p.color, alpha: (1 - t) * 0.85 });
          break;
        }
        case 'mushroom': {
          g.y += p.vy * deltaMS;
          // Le chapeau s'épanouit en se dilatant légèrement.
          const r = p.baseRadius * (0.6 + t * 0.7);
          const stem = p.baseRadius * 0.3 * (1 - t * 0.4);
          // Tête nuageuse : trois cercles en triangle.
          g.circle(0, 0, r).fill({ color: p.color, alpha: (1 - t) * 0.75 });
          g.circle(-r * 0.6, r * 0.2, r * 0.7).fill({ color: p.color, alpha: (1 - t) * 0.55 });
          g.circle(r * 0.6, r * 0.2, r * 0.7).fill({ color: p.color, alpha: (1 - t) * 0.55 });
          // Tige (vers le bas, vers le point d'attache).
          g.rect(-stem / 2, r * 0.3, stem, Math.max(0, p.ay - g.y - r * 0.2))
            .fill({ color: p.color, alpha: (1 - t) * 0.4 });
          break;
        }
        case 'scorch': {
          // Marque au sol persistante : disque sombre qui s'évanouit lentement.
          g.circle(0, 0, p.baseRadius).fill({ color: p.color, alpha: (1 - t) * 0.55 });
          break;
        }
        case 'screen-flash': {
          // Voile blanc plein écran — couvre une zone énorme autour du
          // point d'impact pour simuler l'aveuglement thermique du Tsar.
          // L'alpha part haut, s'estompe en cosinus inverse pour un effet
          // "boum-pulse" plus organique qu'un simple fade linéaire.
          const fade = Math.pow(1 - t, 1.4);
          // Rayon assez grand pour couvrir le viewport typique (>2000 px).
          g.circle(0, 0, 3000).fill({ color: 0xffffff, alpha: fade * 0.75 });
          break;
        }
      }
    }
  }

  clear() {
    for (const p of this.particles) p.gfx.destroy();
    this.particles = [];
  }
}
