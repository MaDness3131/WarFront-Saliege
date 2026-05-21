/**
 * BottomDock — boutons d'action plats (sans catégorie).
 * ------------------------------------------------------
 * Au lieu de "Construction" / "Armes" qui ouvrent des sous-menus, chaque
 * bâtiment et chaque arme a son propre bouton inline directement dans la
 * dock. Clic = sélection (toggle off si déjà sélectionné). Tous les boutons
 * ont le même style visuel (.dock-tab) — la couleur d'accent les différencie.
 *
 * Le leaderboard et la diplomatie sont retirés du dock :
 *   - Classement → composant LeftLeaderboard (tiroir gauche)
 *   - Diplomatie → intégrée dans le radial menu (clic droit sur territoire)
 */

import { useRef } from 'react';
import { GameSnapshot } from '../useGameState';
import { socket } from '../../network/SocketClient';
import { BuildingType, WeaponKind } from '@shared/types';
import { scaledBuildingCost, WEAPONS, TICK_RATE } from '@shared/constants';
import {
  CityIcon,
  FactoryIcon,
  DefensePostIcon,
  PortIcon,
  SamLauncherIcon,
  CasinoIcon,
  NukeIcon,
  HydrogenIcon,
  TsarBombIcon,
} from './icons';
import { RatioBar } from './RatioBar';

interface Props {
  snap: GameSnapshot;
  selectedBuilding: BuildingType;
  onSelectBuilding: (b: BuildingType) => void;
  selectedWeapon: WeaponKind | null;
  onSelectWeapon: (k: WeaponKind | null) => void;
  landingShipId: string | null;
  onSelectLanding: (id: string | null) => void;
}

// scaledCost délégué à scaledBuildingCost partagé (formule OpenFront)
const scaledCost = scaledBuildingCost;

export function BottomDock(props: Props) {
  const { snap, selectedBuilding, onSelectBuilding, selectedWeapon, onSelectWeapon } = props;
  const me = snap.me;

  if (!me) return null;

  // ─── Liste des bâtiments inline ─────────────────────────────────────────
  const cityCost = scaledCost(BuildingType.City, me.cityCount);
  const factoryCost = scaledCost(BuildingType.Factory, me.factoryCount);
  const defCost = scaledCost(BuildingType.DefensePost, me.defenseCount);
  const portCost = scaledCost(BuildingType.Port, me.portCount);
  const samCost = scaledCost(BuildingType.SamLauncher, me.samCount);
  const casinoCost = scaledCost(BuildingType.Casino, me.casinoCount);

  const buildings: {
    type: Exclude<BuildingType, BuildingType.None>;
    label: string;
    icon: any;
    cost: number;
    color: string;
  }[] = [
    { type: BuildingType.City,        label: 'Ville',    icon: <CityIcon size={32} />,        cost: cityCost,    color: '#ffd247' },
    { type: BuildingType.Factory,     label: 'Usine',    icon: <FactoryIcon size={32} />,     cost: factoryCost, color: '#ffd966' },
    { type: BuildingType.DefensePost, label: 'Défense',  icon: <DefensePostIcon size={32} />, cost: defCost,     color: '#6ed9e8' },
    { type: BuildingType.Port,        label: 'Port',     icon: <PortIcon size={32} />,        cost: portCost,    color: '#3d8be0' },
    { type: BuildingType.Casino,      label: 'Casino',   icon: <CasinoIcon size={32} />,      cost: casinoCost,  color: '#f1c40f' },
  ];
  if (snap.enabled.weapons) {
    buildings.push({
      type: BuildingType.SamLauncher, label: 'SAM',     icon: <SamLauncherIcon size={32} />, cost: samCost,    color: '#9b59b6',
    });
  }

  // ─── Liste des armes inline ─────────────────────────────────────────────
  const weapons: {
    kind: WeaponKind;
    label: string;
    icon: any;
    color: string;
  }[] = [
    { kind: 'nuke',     label: 'Nuke',       icon: <NukeIcon size={32} />,      color: '#e0533d' },
    { kind: 'hydrogen', label: 'Hydrogène',  icon: <HydrogenIcon size={32} />,  color: '#e07b3d' },
    { kind: 'tsar',     label: 'Tsar Bomba', icon: <TsarBombIcon size={32} />,  color: '#f1c40f' },
  ];

  return (
    <div className="dock">
      <RatioBar
        value={me.attackRatio}
        army={me.army}
        onChange={(v) => socket.setAttackRatio(v)}
      />

      <div className="dock-tabs">
        {buildings.map((b) => {
          const isSel = selectedBuilding === b.type;
          const disabled = me.gold < b.cost;
          return (
            <DockBtn
              key={`b-${b.type}`}
              icon={b.icon}
              label={b.label}
              sublabel={`${b.cost} or`}
              color={b.color}
              selected={isSel}
              disabled={disabled}
              onClick={() => onSelectBuilding(isSel ? BuildingType.None : b.type)}
            />
          );
        })}

        {snap.enabled.weapons && <div className="dock-sep" aria-hidden />}

        {snap.enabled.weapons && weapons.map((w) => {
          const spec = WEAPONS[w.kind];
          const cd = me.cooldowns[w.kind];
          const ready = cd <= 0 && me.gold >= spec.cost;
          const cdSec = Math.ceil(cd / TICK_RATE);
          const isSel = selectedWeapon === w.kind;
          return (
            <DockBtn
              key={`w-${w.kind}`}
              icon={w.icon}
              label={w.label}
              sublabel={cd > 0 ? `${cdSec}s` : `${spec.cost} or`}
              color={w.color}
              selected={isSel}
              disabled={!ready}
              onClick={() => onSelectWeapon(isSel ? null : w.kind)}
            />
          );
        })}
      </div>
    </div>
  );
}

function DockBtn({
  icon, label, sublabel, color, selected, disabled, onClick,
}: {
  icon: any;
  label: string;
  sublabel?: string;
  color?: string;
  selected?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  return (
    <button
      ref={ref}
      className={`dock-tab dock-btn ${selected ? 'is-active' : ''} ${disabled ? 'is-disabled' : ''}`}
      onClick={onClick}
      disabled={disabled}
      title={label}
      style={selected && color ? { borderColor: color } : undefined}
    >
      {icon}
      <span className="dock-tab-label">{label}</span>
      {sublabel && <span className="dock-tab-cost">{sublabel}</span>}
    </button>
  );
}
