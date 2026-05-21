/**
 * CustomOptions — éditeur d'options pour le mode personnalisé (Phase 4).
 * ---------------------------------------------------------------------
 * Replié dans l'écran de connexion quand le mode "custom" est choisi.
 * Tous les sliders/checks mutent un objet `CustomOptions` que le composant
 * parent passe au socket lors de connect().
 */

import { CustomOptions } from '@shared/types';

interface Props {
  value: CustomOptions;
  onChange: (next: CustomOptions) => void;
}

export function CustomOptionsEditor({ value, onChange }: Props) {
  const update = (patch: Partial<CustomOptions>) => onChange({ ...value, ...patch });

  return (
    <div className="custom-options">
      <Row label="Taille de carte">
        <select
          value={value.mapSize}
          onChange={(e) => update({ mapSize: e.target.value as CustomOptions['mapSize'] })}
        >
          <option value="small">Petite</option>
          <option value="medium">Moyenne</option>
          <option value="large">Grande</option>
        </select>
      </Row>

      <Row label={`Vitesse · ×${value.speed.toFixed(1)}`}>
        <input
          type="range" min={0.5} max={3} step={0.1}
          value={value.speed}
          onChange={(e) => update({ speed: Number(e.target.value) })}
        />
      </Row>

      <Row label={`Bots · ${value.botCount}`}>
        <input
          type="range" min={0} max={14} step={1}
          value={value.botCount}
          onChange={(e) => update({ botCount: Number(e.target.value) })}
        />
      </Row>

      <Row label="Difficulté des bots">
        <select
          value={value.botDifficulty}
          onChange={(e) => update({ botDifficulty: e.target.value as CustomOptions['botDifficulty'] })}
        >
          <option value="easy">Facile</option>
          <option value="normal">Normal</option>
          <option value="hard">Difficile</option>
        </select>
      </Row>

      <Row label="Armes nucléaires">
        <Toggle
          checked={value.weaponsEnabled}
          onChange={(v) => update({ weaponsEnabled: v })}
        />
      </Row>
      <Row label="Alliances">
        <Toggle
          checked={value.alliancesEnabled}
          onChange={(v) => update({ alliancesEnabled: v })}
        />
      </Row>
      <Row label="Marine">
        <Toggle
          checked={value.navalEnabled}
          onChange={(v) => update({ navalEnabled: v })}
        />
      </Row>
      <Row label="Mode Admin (or & troupes ∞)">
        <Toggle
          checked={value.adminMode}
          onChange={(v) => update({ adminMode: v })}
        />
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="custom-row">
      <span className="custom-row-label">{label}</span>
      <span className="custom-row-control">{children}</span>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`custom-toggle ${checked ? 'is-on' : ''}`}
      onClick={() => onChange(!checked)}
      type="button"
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  );
}
