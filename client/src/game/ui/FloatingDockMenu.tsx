/**
 * FloatingDockMenu — boutons circulaires émergeant d'un tab du dock.
 * --------------------------------------------------------------------
 * Remplace les anciens panneaux bandes (.dock-panel). Au clic sur un tab du
 * BottomDock, une pile verticale de boutons ronds part DU CENTRE du tab,
 * remonte vers ses positions finales avec animation ease-in (lent au début,
 * rapide à la fin) + stagger (les boutons plus éloignés partent plus tard
 * mais filent plus vite → effet de "tir vers le haut").
 *
 * Chaque bouton est cliquable indépendamment (poser un bâtiment, sélectionner
 * une arme, etc.). Clic en dehors ou Escape → close.
 *
 * Le composant est rendu en `position: fixed` ancré sur la position écran
 * du tab passée en props (x, y). Backdrop transparent pour catcher les
 * clics extérieurs.
 */

import { useEffect } from 'react';
import { ReactNode } from 'react';

export interface DockMenuItem {
  id: string;
  /** Icône principale au centre du bouton (SVG ou texte). */
  icon: ReactNode;
  /** Label texte en dessous du bouton. */
  label: string;
  /** Sous-label discret (ex: "150 or"). */
  sublabel?: string;
  /** Couleur d'accent du bouton (border + glow). */
  color?: string;
  disabled?: boolean;
  /** Indique l'élément actuellement sélectionné (border highlight). */
  selected?: boolean;
  onSelect: () => void;
}

interface Props {
  /** Position écran du tab d'origine (centre du bouton). */
  x: number;
  y: number;
  items: DockMenuItem[];
  onClose: () => void;
}

/** Espacement vertical entre les centres des boutons (px). */
const ITEM_GAP = 78;
/** Diamètre d'un bouton (px). */
const BTN_SIZE = 60;

export function FloatingDockMenu({ x, y, items, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="fdm-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="fdm" style={{ left: x, top: y }}>
        {items.map((item, i) => {
          // Les items remontent depuis le centre du tab. i=0 le plus proche.
          const finalY = -(i + 1) * ITEM_GAP;
          // Stagger : items lointains partent plus tard MAIS avec une
          // animation plus courte → "speed-up" perçu.
          const delayMs = i * 35;
          const durationMs = Math.max(220, 360 - i * 30);
          return (
            <button
              key={item.id}
              className={`fdm-btn ${item.disabled ? 'is-disabled' : ''} ${item.selected ? 'is-selected' : ''}`}
              style={{
                width: BTN_SIZE, height: BTN_SIZE,
                marginLeft: -BTN_SIZE / 2, marginTop: -BTN_SIZE / 2,
                ['--fdm-final-y' as any]: `${finalY}px`,
                animationDelay: `${delayMs}ms`,
                animationDuration: `${durationMs}ms`,
                borderColor: item.color ?? undefined,
              }}
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (!item.disabled) { item.onSelect(); onClose(); }
              }}
              title={item.label}
            >
              <span className="fdm-btn-icon" style={{ color: item.color }}>{item.icon}</span>
              <span className="fdm-btn-label">{item.label}</span>
              {item.sublabel && <span className="fdm-btn-sublabel">{item.sublabel}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
