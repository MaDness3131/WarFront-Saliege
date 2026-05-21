/**
 * NavalPanel — flotte du joueur (Phase 2).
 * ----------------------------------------
 * Liste les navires possédés (état HP / cargo), permet de :
 *  - sélectionner un battleship pour ordonner un débarquement (le prochain
 *    clic carte sur une côte ennemie devient un ordre de débarquement) ;
 *  - construire un nouveau navire dans un port disponible.
 *
 * La sélection d'une commande de débarquement remonte au composant App qui
 * gère le mode de clic carte global.
 */

import { useMemo } from 'react';
import { GameSnapshot } from '../useGameState';
import { ShipType, BuildingType } from '@shared/types';
import { SHIPS } from '@shared/constants';
import { socket } from '../../network/SocketClient';

interface NavalPanelProps {
  snap: GameSnapshot;
  landingShipId: string | null;
  onSelectLanding: (shipId: string | null) => void;
}

export function NavalPanel({ snap, landingShipId, onSelectLanding }: NavalPanelProps) {
  const me = snap.me;
  if (!snap.enabled.naval || !me) return null;

  const myShips = snap.ships.filter((s) => s.owner === me.id);

  // Ports possédés (territoire avec building=Port et niveau>0).
  // On regarde le mask ownership + on demande à l'utilisateur de cliquer
  // directement. Pour simplifier, on propose la construction sur le 1er
  // port libre trouvé.
  const portIds = useMemo(() => {
    const out: number[] = [];
    for (const tid of snap.myTerritoryIds) {
      // On utilise terrain pour savoir si c'est une côte ; on ne sait pas
      // si un Port y est construit sans l'info building dans le snapshot.
      // Le serveur/sim refusera si pas un port — UX OK.
      if (snap.terrain[tid] === 3 /* Coast */) out.push(tid);
    }
    return out;
  }, [snap]);

  const buildShip = (type: ShipType) => {
    const portId = portIds[0];
    if (portId === undefined) return;
    socket.buildShip(portId, type);
  };

  return (
    <div className="hud-panel naval">
      <div className="naval-title">MARINE</div>

      <div className="naval-build">
        <button
          className="naval-build-btn"
          onClick={() => buildShip(ShipType.Destroyer)}
          disabled={me.gold < SHIPS.destroyer.cost || portIds.length === 0}
          title={portIds.length === 0 ? 'Construis d’abord un port' : ''}
        >
          + Destroyer <span className="naval-cost">{SHIPS.destroyer.cost}</span>
        </button>
        <button
          className="naval-build-btn"
          onClick={() => buildShip(ShipType.Battleship)}
          disabled={me.gold < SHIPS.battleship.cost || portIds.length === 0}
        >
          + Battleship <span className="naval-cost">{SHIPS.battleship.cost}</span>
        </button>
      </div>

      <div className="naval-list">
        {myShips.length === 0 && <div className="naval-empty">Aucun navire.</div>}
        {myShips.map((s) => {
          const isBattle = s.type === ShipType.Battleship;
          const isSel = landingShipId === s.id;
          return (
            <div key={s.id} className={`naval-row ${isSel ? 'is-selected' : ''}`}>
              <span className="naval-row-name">
                {isBattle ? '🚢' : '⛵'} {isBattle ? 'Battleship' : 'Destroyer'}
              </span>
              <span className="naval-row-hp">HP {Math.round(s.hp)}/{s.maxHp}</span>
              {isBattle && (
                <>
                  <span className="naval-row-cargo">{s.cargo} pax</span>
                  <button
                    className="naval-row-land"
                    disabled={s.cargo <= 0}
                    onClick={() => onSelectLanding(isSel ? null : s.id)}
                  >
                    {isSel ? 'Annuler' : 'Débarquer'}
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      {landingShipId && (
        <div className="naval-hint">Clique une côte ennemie pour débarquer.</div>
      )}
    </div>
  );
}

// référence pour éviter le tree-shaking de la valeur d'enum si TypeScript la
// considère inutilisée (utilisée dans l'attribut className conditionnel).
export const _ports = BuildingType.Port;
