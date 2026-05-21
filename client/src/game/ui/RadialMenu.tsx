/**
 * RadialMenu — roue d'actions contextuelles sur clic droit.
 * ---------------------------------------------------------
 * Affichée à la position du clic, présente entre 2 et 8 actions sous
 * forme de boutons disposés en cercle. Le contenu dépend de la tuile
 * cliquée (océan, sol ennemi, propre tuile côtière, etc.).
 *
 * Ferme au clic d'une action, au clic en dehors, ou via Escape.
 */

import { ReactNode, useEffect } from 'react';

export interface RadialAction {
  id: string;
  label: string;
  /** Glyph Unicode ou nœud React (ex: <CityIcon size={20} />). */
  icon: ReactNode;
  color?: string;
  /** Coût affiché en tooltip (ex: "120 or", "50% armée"). */
  cost?: string;
  disabled?: boolean;
  onSelect: () => void;
}

interface Props {
  x: number;       // position écran (px)
  y: number;
  actions: RadialAction[];
  onClose: () => void;
}

const RADIUS = 64;       // distance du centre au centre des boutons (px)
const BTN_SIZE = 52;

export function RadialMenu({ x, y, actions, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Volontairement pas de close au scroll : on veut pouvoir zoomer
    // pendant qu'on choisit, sans perdre la roue.
  }, [onClose]);

  if (actions.length === 0) return null;

  return (
    <>
      {/* Backdrop transparent — capture les clics extérieurs. */}
      <div className="radial-backdrop" onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div className="radial" style={{ left: x, top: y }}>
        {/* Petit point central */}
        <div className="radial-center" />
        {actions.map((a, i) => {
          // Distribue les boutons en cercle, partant du haut, sens horaire.
          const angle = -Math.PI / 2 + (i * 2 * Math.PI) / actions.length;
          const cx = Math.cos(angle) * RADIUS;
          const cy = Math.sin(angle) * RADIUS;
          return (
            <button
              key={a.id}
              className={`radial-btn ${a.disabled ? 'is-disabled' : ''}`}
              style={{
                transform: `translate(${cx}px, ${cy}px)`,
                width: BTN_SIZE, height: BTN_SIZE,
                marginLeft: -BTN_SIZE / 2, marginTop: -BTN_SIZE / 2,
                borderColor: a.color ?? undefined,
              }}
              disabled={a.disabled}
              onClick={() => { if (!a.disabled) { a.onSelect(); onClose(); } }}
              title={a.label}
            >
              <span className="radial-btn-icon" style={{ color: a.color }}>{a.icon}</span>
              <span className="radial-btn-label">{a.label}</span>
              {a.cost && <span className="radial-btn-cost">{a.cost}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}
