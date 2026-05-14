/**
 * ConstructionMenu — panneau de construction.
 * -------------------------------------------
 * Liste les bâtiments constructibles avec coût, durée et bonus. Le joueur
 * choisit un bâtiment puis clique un de ses territoires sur la carte — le
 * clic suivant est interprété par App comme un ordre de construction.
 *
 * Le coût affiché est purement indicatif (calcul de confort) ; le serveur
 * reste seul juge de la validité et du débit réel.
 */

import { GameSnapshot } from '../useGameState';
import { BuildingType } from '@shared/types';
import { BUILDINGS } from '@shared/constants';

interface ConstructionMenuProps {
  snap: GameSnapshot;
  selected: BuildingType;
  onSelect: (b: BuildingType) => void;
}

const CATALOG: { type: Exclude<BuildingType, BuildingType.None>; name: string; bonus: string }[] = [
  { type: BuildingType.City, name: 'Ville', bonus: '+revenu, +capacité population' },
  { type: BuildingType.Factory, name: 'Usine', bonus: '+production militaire' },
  { type: BuildingType.DefensePost, name: 'Poste de défense', bonus: '+défense du territoire' },
  { type: BuildingType.Port, name: 'Port', bonus: 'embarquement naval (côte requise)' },
];

export function ConstructionMenu({ snap, selected, onSelect }: ConstructionMenuProps) {
  const gold = snap.me?.gold ?? 0;

  return (
    <div className="hud-panel construction">
      <div className="construction-title">CONSTRUCTION</div>
      <div className="construction-list">
        {CATALOG.map((item) => {
          const spec = BUILDINGS[item.type];
          const affordable = gold >= spec.baseCost;
          const isSelected = selected === item.type;
          return (
            <button
              key={item.type}
              className={`construction-item ${isSelected ? 'is-selected' : ''} ${
                affordable ? '' : 'is-locked'
              }`}
              onClick={() => onSelect(isSelected ? BuildingType.None : item.type)}
            >
              <div className="construction-item-head">
                <span className="construction-item-name">{item.name}</span>
                <span className="construction-item-cost">{spec.baseCost} or</span>
              </div>
              <div className="construction-item-bonus">{item.bonus}</div>
              <div className="construction-item-time">
                {(spec.buildTicks / 10).toFixed(0)} s · niv. max {spec.maxLevel}
              </div>
            </button>
          );
        })}
      </div>
      {selected !== BuildingType.None && (
        <div className="construction-hint">
          Clique un de tes territoires pour construire.
        </div>
      )}
    </div>
  );
}
