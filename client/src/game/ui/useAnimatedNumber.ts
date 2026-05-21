/**
 * useAnimatedNumber — interpolation ease-out cubic d'une valeur cible.
 * --------------------------------------------------------------------
 * À chaque changement de `target`, on lance un rAF qui rapproche la valeur
 * affichée de la cible en ~`durationMs`. Ease-out cubic pour le sentiment
 * casino "ka-ching" (départ rapide, freinage en fin de course).
 *
 * Usage :
 *   const gold = useAnimatedNumber(me.gold, 600);
 *   <span>{formatNumber(gold)}</span>
 *
 * Sécurise les sauts brusques (capture massive, kill reward) en lissant
 * la valeur sur 600 ms — l'œil voit "monter" au lieu de "sauter".
 */

import { useEffect, useRef, useState } from 'react';

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

export function useAnimatedNumber(target: number, durationMs = 600): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const startRef = useRef<number>(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    // Si delta négligeable, on snap directement.
    if (Math.abs(target - display) < 0.5) {
      setDisplay(target);
      return;
    }
    fromRef.current = display;
    startRef.current = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - startRef.current) / durationMs);
      const eased = easeOutCubic(k);
      setDisplay(fromRef.current + (target - fromRef.current) * eased);
      if (k < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, durationMs]);

  return display;
}
