/**
 * hoveredTileStore — mini-store réactif HORS React pour le tile hovered.
 * -----------------------------------------------------------------------
 * Avant : `useState(hoveredTile)` dans App.tsx → chaque traversée de tuile
 * pendant un drag déclenchait un commit React de TOUT l'arbre App
 * (TopBar, BottomDock, HUD, Minimap, KillBanner, DomExplosions…). 5-10
 * commits/sec pendant un drag = frames perdues.
 *
 * Après : un store externe avec listeners. Seul TileTooltip s'y abonne via
 * `useSyncExternalStore` → seule la tooltip re-render quand le hover change.
 * Le reste de l'App ne voit même pas la mise à jour.
 *
 * Bonus : dédup au niveau du store — pas de fire si la tuile est identique
 * (même id), ce qui évite encore plus de re-renders inutiles.
 */

export type HoveredTile = any | null;

let current: HoveredTile = null;
const listeners = new Set<() => void>();

export const hoveredTileStore = {
  /** Met à jour le tile courant et notifie les abonnés. Idempotent par id. */
  set(tile: HoveredTile) {
    // Dédup : si l'id est identique, on ignore (les autres champs peuvent
    // varier mais le composant ré-affiche déjà sur snap.tick).
    if (current === tile) return;
    if (current && tile && current.id === tile.id) {
      // Update la réf interne (snapshot plus récent) sans notifier — la tooltip
      // re-render sur snap.tick de toute façon.
      current = tile;
      return;
    }
    current = tile;
    for (const l of listeners) l();
  },
  /** Lecture synchrone (compatibilité avec useSyncExternalStore.getSnapshot). */
  get(): HoveredTile { return current; },
  /** Abonnement (compatibilité avec useSyncExternalStore.subscribe). */
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },
};
