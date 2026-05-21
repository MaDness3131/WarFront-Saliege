/**
 * TileTooltip — panneau d'info contextuelle en haut-gauche.
 * ----------------------------------------------------------
 * Affiché en permanence quand la souris est au-dessus d'une tuile :
 *  - nom du territoire (généré, déterministe)
 *  - statut diplomatique (toi / allié / neutre / ennemi)
 *  - propriétaire (nom + couleur)
 *  - troupes du propriétaire (pool)
 *  - or (seulement pour soi)
 *  - villes / usines / ports / défenses
 */

import { memo, useSyncExternalStore } from 'react';
import { GameSnapshot, PlayerView } from '../useGameState';
import { socket } from '../../network/SocketClient';
import { TerrainType } from '@shared/types';
import { territoryName } from '../../local/util/TerritoryName';
import { CityIcon, FactoryIcon, PortIcon, DefensePostIcon } from './icons';
import { hoveredTileStore } from './hoveredTileStore';

interface Props {
  snap: GameSnapshot;
}

/** Hook : s'abonne au store hoveredTile (hors React). Re-render le tooltip
 *  UNIQUEMENT quand la tuile sous le curseur change — sans toucher au reste
 *  de l'arbre App. */
function useHoveredTile() {
  return useSyncExternalStore(
    hoveredTileStore.subscribe,
    hoveredTileStore.get,
    () => null, // serveur SSR fallback (jamais appelé ici)
  );
}

function TileTooltipInner({ snap }: Props) {
  const tile = useHoveredTile();
  if (!tile) return null;
  if (tile.terrain === TerrainType.Ocean) {
    return (
      <div className="tile-tooltip">
        <div className="tile-tooltip-title">Océan</div>
        <div className="tile-tooltip-row tile-tooltip-dim">Eaux internationales</div>
      </div>
    );
  }

  const name = territoryName(tile.id);
  const owner: PlayerView | null = tile.owner
    ? snap.players.find((p) => p.id === tile.owner) ?? null
    : null;

  const me = snap.me;
  const isMe = owner?.id === me?.id;
  const isAlly = !!(owner && me && owner.allianceId && owner.allianceId === me.allianceId);
  const diplo = !owner ? 'NEUTRE'
    : isMe ? 'TOI'
    : isAlly ? 'ALLIÉ'
    : 'ENNEMI';
  const diploClass = !owner ? 'is-neutral'
    : isMe ? 'is-self'
    : isAlly ? 'is-ally'
    : 'is-enemy';

  return (
    <div className="tile-tooltip">
      <div className="tile-tooltip-title">{name}</div>
      <div className="tile-tooltip-row">
        <span className="tile-tooltip-label">Statut</span>
        <span className={`tile-tooltip-value ${diploClass}`}>{diplo}</span>
      </div>
      {owner && (
        <>
          <div className="tile-tooltip-row">
            <span className="tile-tooltip-label">Nation</span>
            <span className="tile-tooltip-value">
              <span className="tile-tooltip-dot" style={{ background: owner.color }} />
              {isMe ? owner.name : owner.name}
            </span>
          </div>
          <div className="tile-tooltip-row">
            <span className="tile-tooltip-label">Troupes</span>
            <span className="tile-tooltip-value tile-tooltip-num">
              {Math.floor(owner.army).toLocaleString('fr-FR')}
            </span>
          </div>
          {isMe && (
            <div className="tile-tooltip-row">
              <span className="tile-tooltip-label">Or</span>
              <span className="tile-tooltip-value tile-tooltip-num">
                {Math.floor(owner.gold).toLocaleString('fr-FR')}
              </span>
            </div>
          )}
          <div className="tile-tooltip-row tile-tooltip-row-grid">
            <span title="Villes" className="tile-tooltip-bldg"><CityIcon size={16} /> {owner.cityCount ?? 0}</span>
            <span title="Usines" className="tile-tooltip-bldg"><FactoryIcon size={16} /> {owner.factoryCount ?? 0}</span>
            <span title="Ports" className="tile-tooltip-bldg"><PortIcon size={16} /> {owner.portCount ?? 0}</span>
            <span title="Défenses" className="tile-tooltip-bldg"><DefensePostIcon size={16} /> {owner.defenseCount ?? 0}</span>
          </div>
        </>
      )}
      <div className="tile-tooltip-row tile-tooltip-dim">
        {tile.terrain === TerrainType.Mountain ? 'Montagne' :
         tile.terrain === TerrainType.Coast ? 'Côte' : 'Terre'}
        {tile.building > 0 && tile.buildingLevel > 0 ? ` · bâtiment niv. ${tile.buildingLevel}` : ''}
      </div>
    </div>
  );
}

/** Utilitaire pour cacher l'avertissement "PlayerView non utilisé" en TS. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = socket;

// React.memo : on ne re-render que si snap.tick avance. La tuile vient du
// store externe (useSyncExternalStore déclenche le re-render seul quand le
// store change), donc on ignore la prop tile au niveau de l'equality check.
export const TileTooltip = memo(TileTooltipInner, (prev, next) => {
  return prev.snap?.tick === next.snap?.tick;
});
