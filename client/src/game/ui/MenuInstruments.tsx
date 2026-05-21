/**
 * MenuInstruments — quartet jazz qui joue en rythme avec la musique.
 * ------------------------------------------------------------------
 * Lit les fréquences via sfx.getFrequencyData() (analyser FFT 256 bins)
 * et anime 4 SVG dans le rendu DOM :
 *  - Contrebasse : 4 cordes vibrent sur les graves (bins 1..4)
 *  - Piano       : 8 touches s'illuminent sur les médiums (bins 5..40)
 *  - Saxophone   : corps qui s'illumine + clés qui pulsent sur les mids/highs
 *  - Hi-hat      : 2 cymbales qui s'ouvrent/se ferment sur les aigus (bins 50+)
 *
 * Lissage exponentiel client-side pour mouvements naturels.
 */

import { useEffect, useRef } from 'react';
import { sfx } from '../../audio/Sfx';

export function MenuInstruments() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Refs aux éléments dynamiques de chaque instrument.
  const bassStringsRef = useRef<(SVGLineElement | null)[]>([null, null, null, null]);
  const bassBodyRef = useRef<SVGEllipseElement | null>(null);
  const pianoKeysRef = useRef<(SVGRectElement | null)[]>([null, null, null, null, null, null, null, null]);
  const saxBodyRef = useRef<SVGPathElement | null>(null);
  const saxKeysRef = useRef<(SVGCircleElement | null)[]>([null, null, null, null]);
  const hatTopRef = useRef<SVGEllipseElement | null>(null);
  const hatGlowRef = useRef<SVGCircleElement | null>(null);

  useEffect(() => {
    let raf = 0;
    // Buffers d'amortissement (smoothing exponentiel).
    let bassLow = 0;
    const pianoLevels = new Array(8).fill(0);
    let mid = 0;
    let high = 0;

    const sample = (data: Uint8Array, start: number, end: number) => {
      let sum = 0; const n = Math.max(1, end - start);
      for (let i = start; i < end && i < data.length; i++) sum += data[i];
      return sum / n / 255; // 0..1
    };

    const tick = () => {
      const data = sfx.getFrequencyData();
      if (data) {
        // Bandes : low (basses), mid-low (piano), mid (sax), high (hat).
        const low = sample(data, 1, 6);
        const lowMid = sample(data, 6, 14);
        const m = sample(data, 14, 40);
        const h = sample(data, 50, 110);

        bassLow = bassLow * 0.7 + low * 0.3;
        mid = mid * 0.6 + m * 0.4;
        high = high * 0.5 + h * 0.5;

        // Pianos : 8 bins distincts dans le mid-low pour différencier les touches.
        for (let i = 0; i < 8; i++) {
          const v = sample(data, 6 + i * 2, 8 + i * 2);
          pianoLevels[i] = pianoLevels[i] * 0.55 + v * 0.45;
        }
      }

      // — Contrebasse : strings oscillent en sinus, amplitude = bassLow.
      const t = performance.now() / 1000;
      for (let i = 0; i < 4; i++) {
        const el = bassStringsRef.current[i];
        if (!el) continue;
        const amp = bassLow * 4 * (1 + i * 0.1);
        const dx = Math.sin(t * (12 + i * 1.5) + i) * amp;
        el.setAttribute('transform', `translate(${dx.toFixed(2)} 0)`);
        el.style.opacity = String(0.55 + bassLow * 0.45);
      }
      if (bassBodyRef.current) {
        bassBodyRef.current.style.filter = `drop-shadow(0 0 ${(4 + bassLow * 14).toFixed(1)}px rgba(241,196,15,${0.3 + bassLow * 0.5}))`;
      }

      // — Piano : 8 touches, chacune avec son propre niveau.
      for (let i = 0; i < 8; i++) {
        const el = pianoKeysRef.current[i];
        if (!el) continue;
        const v = pianoLevels[i];
        el.style.fill = v > 0.05
          ? `rgba(241, 196, 15, ${0.18 + v * 0.6})`
          : 'rgba(255, 255, 255, 0.08)';
        el.style.filter = v > 0.2 ? `drop-shadow(0 0 ${(v * 8).toFixed(1)}px rgba(241,196,15,0.7))` : '';
      }

      // — Sax : corps brille selon mid, clés pulsent selon high.
      if (saxBodyRef.current) {
        saxBodyRef.current.style.filter = `drop-shadow(0 0 ${(6 + mid * 18).toFixed(1)}px rgba(255, 200, 60, ${0.4 + mid * 0.5}))`;
      }
      for (let i = 0; i < 4; i++) {
        const el = saxKeysRef.current[i];
        if (!el) continue;
        const v = Math.min(1, high * 1.2 + mid * 0.3);
        const scale = 1 + v * 0.35;
        el.setAttribute('transform', `translate(${30 + i * 12} ${24 + i * 14}) scale(${scale.toFixed(2)})`);
        el.style.fill = v > 0.15 ? `rgba(255, 215, 100, ${0.5 + v * 0.5})` : 'rgba(255, 215, 100, 0.5)';
      }

      // — Hi-hat : cymbale du haut tilte vers le haut sur les aigus.
      if (hatTopRef.current) {
        const lift = -high * 7;
        hatTopRef.current.setAttribute('transform', `translate(0 ${lift.toFixed(2)}) rotate(${(-high * 6).toFixed(2)})`);
      }
      if (hatGlowRef.current) {
        hatGlowRef.current.setAttribute('r', String(8 + high * 16));
        hatGlowRef.current.style.opacity = String(0.15 + high * 0.5);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="menu-instruments" ref={containerRef} aria-hidden>
      {/* ─── Contrebasse ─── */}
      <svg className="instr instr-bass" viewBox="0 0 120 200">
        <defs>
          <linearGradient id="bass-wood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#7a4a1a" />
            <stop offset="55%" stopColor="#a86a25" />
            <stop offset="100%" stopColor="#5d3712" />
          </linearGradient>
        </defs>
        {/* Manche */}
        <rect x="55" y="10" width="10" height="65" fill="#3d2410" />
        <rect x="52" y="6" width="16" height="9" fill="#2a180a" rx="2" />
        {/* Corps en ellipse */}
        <ellipse
          ref={bassBodyRef}
          cx="60" cy="130" rx="42" ry="58"
          fill="url(#bass-wood)" stroke="#3d2410" strokeWidth="1.5"
        />
        {/* Trous en F */}
        <path d="M 38 115 q -4 6 0 14 q 4 -2 4 -8 z" fill="#1a0d05" />
        <path d="M 82 115 q 4 6 0 14 q -4 -2 -4 -8 z" fill="#1a0d05" />
        {/* Chevalet */}
        <rect x="44" y="148" width="32" height="6" fill="#2a180a" />
        {/* 4 cordes — animées (transform translate-x) */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            ref={(el) => { bassStringsRef.current[i] = el; }}
            x1={48 + i * 5} y1="10"
            x2={48 + i * 5} y2="180"
            stroke={i % 2 === 0 ? '#f1c40f' : '#dccaa1'}
            strokeWidth="0.8"
            opacity="0.65"
          />
        ))}
      </svg>

      {/* ─── Piano ─── */}
      <svg className="instr instr-piano" viewBox="0 0 200 140">
        <defs>
          <linearGradient id="piano-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1206" />
            <stop offset="100%" stopColor="#0a0703" />
          </linearGradient>
        </defs>
        {/* Pied / châssis */}
        <rect x="6" y="20" width="188" height="100" rx="6" fill="url(#piano-top)" stroke="#3a2a10" strokeWidth="1.5" />
        <rect x="14" y="30" width="172" height="6" fill="rgba(241,196,15,0.4)" />
        {/* 8 touches blanches */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <rect
            key={i}
            ref={(el) => { pianoKeysRef.current[i] = el; }}
            x={16 + i * 21.5} y="42"
            width="20" height="74"
            fill="rgba(255,255,255,0.08)"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="0.6"
            rx="1"
          />
        ))}
        {/* Touches noires */}
        {[0, 1, 3, 4, 5].map((i) => (
          <rect key={`b${i}`} x={28 + i * 21.5} y="42" width="10" height="44" fill="#0a0703" />
        ))}
      </svg>

      {/* ─── Saxophone ─── */}
      <svg className="instr instr-sax" viewBox="0 0 160 200">
        <defs>
          <linearGradient id="sax-brass" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff7d6" />
            <stop offset="40%" stopColor="#f1c40f" />
            <stop offset="100%" stopColor="#8a6608" />
          </linearGradient>
        </defs>
        {/* Corps : courbe en S */}
        <path
          ref={saxBodyRef}
          d="M 80 10 L 80 70 Q 80 110 70 130 Q 60 150 60 165 Q 60 188 90 188 Q 130 188 130 150 Q 130 130 120 130"
          stroke="url(#sax-brass)" strokeWidth="14" fill="none" strokeLinecap="round"
        />
        {/* Pavillon (bell) */}
        <ellipse cx="115" cy="140" rx="22" ry="18" fill="url(#sax-brass)" stroke="#8a6608" strokeWidth="1.5" />
        <ellipse cx="115" cy="138" rx="14" ry="10" fill="#3a2a10" />
        {/* Bec */}
        <rect x="74" y="6" width="12" height="14" rx="3" fill="#1a1206" stroke="#8a6608" strokeWidth="1" />
        {/* Clés (boutons) animées */}
        {[0, 1, 2, 3].map((i) => (
          <circle
            key={i}
            ref={(el) => { saxKeysRef.current[i] = el; }}
            cx="0" cy="0" r="3.5"
            fill="rgba(255, 215, 100, 0.5)"
            stroke="#8a6608" strokeWidth="0.6"
            transform={`translate(${30 + i * 12} ${24 + i * 14})`}
          />
        ))}
      </svg>

      {/* ─── Hi-hat ─── */}
      <svg className="instr instr-hat" viewBox="0 0 120 200">
        {/* Stand */}
        <rect x="56" y="80" width="8" height="100" fill="#3a3a40" />
        <rect x="40" y="178" width="40" height="6" fill="#3a3a40" rx="2" />
        <line x1="50" y1="184" x2="35" y2="195" stroke="#3a3a40" strokeWidth="3" />
        <line x1="70" y1="184" x2="85" y2="195" stroke="#3a3a40" strokeWidth="3" />
        {/* Glow autour de la cymbale */}
        <circle
          ref={hatGlowRef}
          cx="60" cy="78" r="8"
          fill="rgba(241, 196, 15, 0.18)"
        />
        {/* Cymbale du bas */}
        <ellipse cx="60" cy="86" rx="38" ry="8" fill="#d4a829" stroke="#8a6608" strokeWidth="1" />
        <ellipse cx="60" cy="84" rx="36" ry="6" fill="rgba(255,235,150,0.4)" />
        {/* Cymbale du haut — animée */}
        <g ref={hatTopRef as any}>
          <ellipse cx="60" cy="78" rx="38" ry="8" fill="#f1c40f" stroke="#8a6608" strokeWidth="1" />
          <ellipse cx="60" cy="76" rx="36" ry="6" fill="rgba(255,255,200,0.5)" />
          <circle cx="60" cy="78" r="3.5" fill="#8a6608" />
        </g>
      </svg>
    </div>
  );
}
