/**
 * App — composant racine.
 * -----------------------
 * Trois écrans : menu, chargement, jeu.
 * Le menu est géré par MainMenu (sections home/custom/profile/options).
 * En jeu : TopBar fixe + BottomDock + canvas PixiJS.
 */
import { LoadingScreen } from './game/ui/LoadingScreen';
import { useEffect, useMemo, useRef, useState } from 'react';
import { GameEngine } from './game/GameEngine';
import { socket } from './network/SocketClient';
import { audio } from './audio/AudioManager';
import { sfx } from './audio/Sfx';
import { useGameState } from './game/useGameState';
import { MainMenu } from './game/ui/MainMenu';
import { GroupScreen } from './game/ui/GroupScreen';
import { Countdown } from './game/ui/Countdown';
import { TopBar } from './game/ui/TopBar';
import { BottomDock } from './game/ui/BottomDock';
// import { Minimap } from './game/ui/Minimap'; — retiré (carte du monde supprimée)
import { LeftLeaderboard } from './game/ui/LeftLeaderboard';
import { HUD } from './game/ui/HUD';
import { RadialMenu, RadialAction } from './game/ui/RadialMenu';
import {
  CityIcon, FactoryIcon, DefensePostIcon, PortIcon, SamLauncherIcon,
  NukeIcon, HydrogenIcon, TsarBombIcon, CasinoIcon, BlackjackIcon, RouletteIcon, SlotsIcon,
} from './game/ui/icons';
import { TileTooltip } from './game/ui/TileTooltip';
import { Toasts } from './game/ui/Toasts';
import { KillBanner } from './game/ui/KillBanner';
import { BlackjackModal } from './game/ui/BlackjackModal';
import { RouletteModal } from './game/ui/RouletteModal';
import { SlotsModal } from './game/ui/SlotsModal';
import { DomExplosions } from './game/ui/DomExplosions';
import { hoveredTileStore } from './game/ui/hoveredTileStore';
import { BuildingType, CustomOptions, GameMode, ShipType, TerrainType, WeaponKind } from '@shared/types';
import { CELL_SIZE, scaledBuildingCost } from '@shared/constants';
import { loadProfile, recordMatch } from './local/profile';

type Screen = 'menu' | 'group' | 'connecting' | 'countdown' | 'game';

export function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [error, setError] = useState<string | null>(null);
  /** Pendant la phase `connecting`, indique si on est en train de jouer
   *  l'animation de sortie du LoadingScreen (flash radial + fade noir). */
  const [loadingExiting, setLoadingExiting] = useState(false);

  const [selectedBuilding, setSelectedBuilding] = useState<BuildingType>(BuildingType.None);
  const [selectedWeapon, setSelectedWeapon] = useState<WeaponKind | null>(null);
  const [landingShipId, setLandingShipId] = useState<string | null>(null);

  // Menu radial (clic droit) — apparaît à la position cliquée.
  const [radial, setRadial] = useState<{ x: number; y: number; actions: RadialAction[] } | null>(null);
  // Modal casino solo (roulette / slots). null = fermé.
  const [casinoModal, setCasinoModal] = useState<'roulette' | 'slots' | null>(null);
  // NOTE : hoveredTile vit dans hoveredTileStore (hors React) pour éviter
  // un re-render App à chaque traversée de tuile pendant un drag. Seul le
  // composant TileTooltip s'y abonne via useSyncExternalStore.

  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  /** Tick à chaque (re)montage du moteur — sert à reforer les composants
   *  HTML qui ont besoin d'une réf au moteur (ex: DomExplosions). */
  const [engineTick, setEngineTick] = useState(0);
  const snap = useGameState();
  /** Réf miroir du snap — utilisée par les event handlers DOM pour ne pas
   *  re-bind (addEventListener/removeEventListener) tous les 200 ms.
   *  L'effect ci-dessous garde la réf à jour à chaque rendu. */
  const snapRef = useRef(snap);
  useEffect(() => { snapRef.current = snap; }, [snap]);

  // ─── Musique du menu : démarrée à la première interaction utilisateur
  //   (autoplay policy navigateur). Stoppée à l'entrée en jeu.
  useEffect(() => {
    if (screen !== 'menu') return;
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      sfx.init();
      sfx.playMenuMusic();
    };
    // N'importe quel geste utilisateur déclenche l'init audio.
    document.addEventListener('pointerdown', start, { once: true });
    document.addEventListener('keydown', start, { once: true });
    return () => {
      document.removeEventListener('pointerdown', start);
      document.removeEventListener('keydown', start);
    };
  }, [screen]);

  // ─── Lancement depuis le menu ─────────────────────────────────────────
    const handleStart = async (mode: GameMode, name: string, customOpts?: CustomOptions, skinId?: string) => {
      setError(null);
      setScreen('connecting');

      // ⏱ Garantit l'affichage du loading screen pendant au moins 8s (durée d'un cycle complet)
      const minDelay = new Promise(r => setTimeout(r, 8000));

      try {
        await audio.init();
        sfx.init();
        const profile = loadProfile();
        const modeStr = mode === GameMode.Classic ? 'classic' : mode === GameMode.Fast ? 'fast' : 'custom';

        // Attend que LES DEUX soient terminés : la connexion ET le délai minimum.
        // La sim démarre en PAUSE — elle reprendra une fois le countdown 3-2-1
        // terminé, pour que la partie ne tourne pas pendant le loading.
        await Promise.all([
          socket.connect(modeStr as any, name, {
            custom: customOpts,
            skinId: skinId ?? profile.skinId,
            playerElo: profile.elo,
            startPaused: true,
          }),
          minDelay,
        ]);

        // Loading terminé : déclenche la SORTIE animée du LoadingScreen
        // (flash radial doré + fade vers noir, 0.8 s). À la fin, swap vers
        // 'countdown' qui prend le relais avec son overlay opaque noir →
        // transition seamless, pas de cut visible.
        setLoadingExiting(true);
        window.setTimeout(() => {
          setLoadingExiting(false);
          setScreen('countdown');
        }, 800);
      } catch (e) {
        console.error(e);
        setError('Impossible de démarrer la partie.');
        setScreen('menu');
      }
    };

  // ─── Sélection mutuellement exclusive des modes de clic ──────────────
  const selectBuilding = (b: BuildingType) => {
    setSelectedBuilding(b);
    if (b !== BuildingType.None) { setSelectedWeapon(null); setLandingShipId(null); }
  };
  const selectWeapon = (k: WeaponKind | null) => {
    setSelectedWeapon(k);
    if (k) { setSelectedBuilding(BuildingType.None); setLandingShipId(null); }
  };
  const selectLanding = (id: string | null) => {
    setLandingShipId(id);
    if (id) { setSelectedBuilding(BuildingType.None); setSelectedWeapon(null); }
  };

  // ─── Montage du moteur ────────────────────────────────────────────────
  // On monte le moteur DÈS l'entrée en 'countdown' et on le garde jusqu'à
  // la sortie. On utilise un BOOLEAN dérivé comme dep — la transition
  // countdown→game ne re-déclenche PAS le cleanup (sinon on disconnect le
  // socket, l'engine, etc., et le jeu ne s'affiche plus).
  const inGameArea = screen === 'game' || screen === 'countdown';
  useEffect(() => {
    if (!inGameArea || !mountRef.current) return;
    const engine = new GameEngine();
    engineRef.current = engine;
    setEngineTick((n) => n + 1);
    engine.start(mountRef.current).then(() => {
      audio.startMusic();
      sfx.playGameMusic();
    });
    // Hooks SFX sur les événements clés.
    const unsubs: Array<() => void> = [];
    unsubs.push(socket.onEvent('KillReward', (p) => {
      if (!p) return;
      if (p.killer === socket.sessionId) sfx.play('kill');
    }));
    unsubs.push(socket.onEvent('AllianceFormed', () => sfx.play('alliance')));
    unsubs.push(socket.onEvent('AllianceBroken', () => sfx.play('betray')));
    unsubs.push(socket.onEvent('NukeSirenWarning', () => sfx.play('siren')));
    unsubs.push(socket.onEvent('Explosion', (p) => {
      // kind 2=nuke/hydrogen, 3=tsar bomba → SFX nuke amplifié.
      if (p?.kind === 2 || p?.kind === 3) sfx.play('nuke');
      else sfx.play('explosion');
    }));
    unsubs.push(socket.onEvent('ShipBuilt', () => sfx.play('invasion')));
    return () => {
      unsubs.forEach((u) => u());
      sfx.stopMusic();
      engine.destroy();
      engineRef.current = null;
      setEngineTick((n) => n + 1);
      socket.disconnect();
    };
  }, [inGameArea]);

  // ─── Handler de clic carte ────────────────────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || screen !== 'game') return;
    engine.setCellClickHandler((click) => {
      if (landingShipId) {
        socket.landShip(landingShipId, click.territoryId);
        setLandingShipId(null);
        return;
      }
      if (selectedWeapon) {
        socket.launchWeapon(selectedWeapon, click.territoryId);
        setSelectedWeapon(null); // sort du mode preview après tir
        return;
      }
      // Clic gauche avec bâtiment sélectionné = poser le bâtiment.
      if (selectedBuilding !== BuildingType.None) {
        socket.build(click.territoryId, selectedBuilding);
        // Pas de SFX clic dans le gameplay — désactivé sur demande.
        return;
      }
      // Contre-attaque automatique : si la tuile cliquée appartient à un
      // joueur qui A des vagues actives sur moi, on déclenche la contre EN
      // PLUS de l'attaque normale. Une seule manipulation pour le joueur.
      const tile = engine.getTile(click.territoryId);
      const me = snap?.me;
      if (tile && me && tile.owner && tile.owner !== me.id) {
        const hasIncoming = snap!.waves.some(
          (w) => w.owner === tile.owner && w.targetOwner === me.id,
        );
        if (hasIncoming) socket.counterWave(tile.owner);
      }
      socket.attack(click.territoryId);
      // Pas de SFX clic dans le gameplay — désactivé sur demande.
    });
  }, [screen, selectedWeapon, landingShipId, selectedBuilding, snap]);

  // ─── Clic droit = roue d'actions contextuelles ───────────────────────
  // Bind UNE fois pour toute la durée de la screen 'game' : on lit snap via
  // snapRef.current pour éviter le cycle remove/add tous les 200 ms (qui
  // créait des allocs closures et chargeait le GC).
  useEffect(() => {
    if (screen !== 'game') return;
    const onContextClick = (e: MouseEvent) => {
      const engine = engineRef.current;
      const snap = snapRef.current;
      if (!engine || !snap) return;
      e.preventDefault();

      const cam = engine.getCamera();
      const canvas = engine.app.canvas;
      const rect = canvas.getBoundingClientRect();
      const worldX = (e.clientX - rect.left) / cam.zoom + cam.x;
      const worldY = (e.clientY - rect.top) / cam.zoom + cam.y;
      const col = Math.floor(worldX / CELL_SIZE);
      const row = Math.floor(worldY / CELL_SIZE);
      if (col < 0 || row < 0 || col >= snap.mapWidth || row >= snap.mapHeight) return;
      const tileId = row * snap.mapWidth + col;
      const tile = engine.getTile(tileId);
      if (!tile) return;

      const me = snap.me;
      if (!me) return;
      const actions: RadialAction[] = [];

      const isOwn = tile.owner === me.id;
      const isOcean = tile.terrain === TerrainType.Ocean;
      const isCoast = tile.terrain === TerrainType.Coast;
      const isEnemy = !!tile.owner && tile.owner !== me.id;
      const myShips = snap.ships.filter((s) => s.owner === me.id);
      const myBattleship = myShips.find((s) => s.type === ShipType.Battleship && s.cargo > 0);

      // — Allié : envoyer des troupes / or / trahir.
      const tileOwner = tile.owner ? snap.players.find((p) => p.id === tile.owner) : null;
      const isAlly = !!(tileOwner && me.allianceId && tileOwner.allianceId === me.allianceId && tileOwner.id !== me.id);
      if (isAlly && tileOwner) {
        const troopGift = Math.floor(me.army * 0.25);
        const goldGift = Math.floor(me.gold * 0.25);
        actions.push({
          id: 'send-troops', label: 'Renforts', icon: '⚑',
          color: '#4caf50', cost: `${troopGift} troupes`,
          disabled: troopGift < 1,
          onSelect: () => socket.sendTroopsToAlly(tileOwner.id, troopGift),
        });
        actions.push({
          id: 'send-gold', label: 'Aide or', icon: '◉',
          color: '#e0c93d', cost: `${goldGift} or`,
          disabled: goldGift < 1,
          onSelect: () => socket.sendGoldToAlly(tileOwner.id, goldGift),
        });
        const allianceId = me.allianceId;
        if (allianceId) {
          actions.push({
            id: 'betray', label: 'Trahir', icon: '✗',
            color: '#e0533d',
            onSelect: () => { if (confirm('Trahir cet allié ? Malus + cooldown diplomatique.')) socket.breakAlliance(allianceId); },
          });
        }
      }
      // — Attaque sur tuile ennemie ou neutre (terrestre, non brûlée, non alliée).
      else if (!isOcean && !isOwn) {
        actions.push({
          id: 'attack', label: 'Attaquer', icon: '⚔',
          color: '#e0533d',
          cost: `${Math.round(me.attackRatio * 100)}% armée`,
          onSelect: () => socket.attack(tileId),
        });

        // ─── Diplomatie sur tuile d'un autre joueur ───────────────────
        // Plus de bouton "Diplomatie" dans le dock : on intègre proposer /
        // Duel blackjack : tuile ennemie + adjacente à une des miennes +
        // les deux ont un casino + ni occupés ni en cooldown.
        if (
          tileOwner && tileOwner.id !== me.id &&
          me.casinoCount > 0 && tileOwner.casinoCount > 0 &&
          me.blackjackBusyUntil <= snap.tick &&
          tileOwner.blackjackBusyUntil <= snap.tick &&
          me.blackjackCooldownUntil <= snap.tick &&
          tileOwner.blackjackCooldownUntil <= snap.tick
        ) {
          // Contact requis : au moins UNE de mes tuiles doit avoir un
          // voisin appartenant à cet ennemi (pas seulement la tuile cliquée).
          // Identique à `playersInContact` côté simulation.
          let inContact = false;
          for (const myTileId of snap.myTerritoryIds) {
            const t = snap.territories[myTileId];
            if (!t || !t.neighbors) continue;
            for (const nid of t.neighbors) {
              const n = snap.territories[nid];
              if (n && n.owner === tileOwner.id) { inContact = true; break; }
            }
            if (inContact) break;
          }
          if (inContact) {
            actions.push({
              id: 'blackjack',
              label: 'Blackjack',
              icon: <BlackjackIcon size={28} />,
              color: '#f1c40f',
              cost: '50 % or · 30 % troupes',
              onSelect: () => socket.proposeBlackjack(tileId),
            });
          }
        }

        // accepter alliance directement dans la roue contextuelle.
        if (tileOwner && tileOwner.id !== me.id && snap.enabled.alliances) {
          const incoming = snap.incomingProposals.find((pr) => pr.from === tileOwner.id);
          const outgoing = snap.outgoingProposals.find((pr) => pr.to === tileOwner.id);
          if (incoming) {
            actions.push({
              id: 'accept-alliance', label: 'Accepter', icon: '🤝',
              color: '#4caf50',
              cost: `de ${tileOwner.name.length > 8 ? tileOwner.name.slice(0, 7) + '…' : tileOwner.name}`,
              onSelect: () => socket.acceptAlliance(incoming.id),
            });
          } else if (outgoing) {
            actions.push({
              id: 'pending-alliance', label: 'En attente', icon: '⏳',
              color: '#888',
              cost: 'proposition envoyée',
              disabled: true,
              onSelect: () => { /* no-op */ },
            });
          } else if (!me.allianceId) {
            actions.push({
              id: 'propose-alliance', label: 'Allier', icon: '🤝',
              color: '#4caf50',
              cost: 'proposer pacte',
              onSelect: () => socket.requestAlliance(tileOwner.id),
            });
          }
        }
      }

      // — Tuile propre AVEC casino fini → minijeux solo prioritaires
      //   (Roulette, Machine à sous). On les met EN TÊTE pour que le clic
      //   droit sur "mon casino" propose directement les jeux.
      if (isOwn && tile.building === BuildingType.Casino && tile.buildingLevel > 0) {
        actions.push({
          id: 'roulette', label: 'Roulette', icon: <RouletteIcon size={28} />,
          color: '#c0392b', cost: 'mise libre',
          onSelect: () => setCasinoModal('roulette'),
        });
        actions.push({
          id: 'slots', label: 'Machine à sous', icon: <SlotsIcon size={28} />,
          color: '#f1c40f', cost: '100 or / pull',
          disabled: me.gold < 100,
          onSelect: () => setCasinoModal('slots'),
        });
      }

      // — Construction sur tuile propre terrestre.
      if (isOwn && !isOcean) {
        // Coût effectif OpenFront-style (cf. shared/constants.scaledBuildingCost).
        const scaledCost = (type: BuildingType, count: number) =>
          scaledBuildingCost(type as Exclude<BuildingType, BuildingType.None>, count);

        const cityCost = scaledCost(BuildingType.City, me.cityCount);
        const factoryCost = scaledCost(BuildingType.Factory, me.factoryCount);
        const defCost = scaledCost(BuildingType.DefensePost, me.defenseCount);

        actions.push({
          id: 'build-city', label: 'Ville', icon: <CityIcon size={28} />,
          color: '#ffffff', cost: `${cityCost} or`,
          disabled: me.gold < cityCost,
          onSelect: () => socket.build(tileId, BuildingType.City),
        });
        actions.push({
          id: 'build-factory', label: 'Usine', icon: <FactoryIcon size={28} />,
          color: '#ffd966', cost: `${factoryCost} or`,
          disabled: me.gold < factoryCost,
          onSelect: () => socket.build(tileId, BuildingType.Factory),
        });
        actions.push({
          id: 'build-defense', label: 'Défense', icon: <DefensePostIcon size={28} />,
          color: '#6ed9e8', cost: `${defCost} or`,
          disabled: me.gold < defCost,
          onSelect: () => socket.build(tileId, BuildingType.DefensePost),
        });
        const casinoCost = scaledCost(BuildingType.Casino, me.casinoCount);
        actions.push({
          id: 'build-casino', label: 'Casino', icon: <CasinoIcon size={28} />,
          color: '#f1c40f', cost: `${casinoCost} or`,
          disabled: me.gold < casinoCost,
          onSelect: () => socket.build(tileId, BuildingType.Casino),
        });
        if (snap.enabled.weapons) {
          const samCost = scaledCost(BuildingType.SamLauncher, me.samCount);
          actions.push({
            id: 'build-sam', label: 'SAM', icon: <SamLauncherIcon size={28} />,
            color: '#9b59b6', cost: `${samCost} or`,
            disabled: me.gold < samCost,
            onSelect: () => socket.build(tileId, BuildingType.SamLauncher),
          });
        }
      }

      // — Invasion navale en un clic : sans port, depuis ta côte la plus
      //   proche, A* automatique, débarquement déclenche une vague d'attaque.
      if (snap.enabled.naval && !isOcean && !isOwn) {
        actions.push({
          id: 'invade', label: 'Bateau', icon: '⛵',
          color: '#3dcee0', cost: '35% armée',
          disabled: me.army < 50,
          onSelect: () => socket.launchInvasion(tileId),
        });
      }

      // — Armes : la roue ne tire PAS directement. Elle sélectionne l'arme
      //   et active le cercle de prévisualisation. Clic gauche pour confirmer
      //   le point d'impact (Échap pour annuler).
      if (snap.enabled.weapons && !isOcean) {
        // NB : les seuils d'or affichés correspondent au cost réel défini
        // dans WEAPONS (shared/constants.ts) — garder synchronisé.
        // Le missile tactique a été retiré, le premier palier est la nuke.
        if (me.gold >= 6000 && me.cooldowns.nuke <= 0) {
          actions.push({
            id: 'nuke', label: 'Nuke', icon: <NukeIcon size={28} />,
            color: '#e0533d', cost: '6 000 or',
            onSelect: () => selectWeapon('nuke'),
          });
        }
        if (me.gold >= 40000 && me.cooldowns.hydrogen <= 0) {
          actions.push({
            id: 'hydrogen', label: 'Hydrogène', icon: <HydrogenIcon size={28} />,
            color: '#e07b3d', cost: '40 000 or',
            onSelect: () => selectWeapon('hydrogen'),
          });
        }
        if (me.gold >= 200000 && me.cooldowns.tsar <= 0) {
          actions.push({
            id: 'tsar', label: 'Tsar Bomba', icon: <TsarBombIcon size={28} />,
            color: '#f1c40f', cost: '200 000 or',
            onSelect: () => selectWeapon('tsar'),
          });
        }
      }

      if (actions.length === 0) return;
      setRadial({ x: e.clientX, y: e.clientY, actions });
    };
    window.addEventListener('contextmenu', onContextClick);
    return () => window.removeEventListener('contextmenu', onContextClick);
  }, [screen]);

  // ─── Cercle de prévisualisation d'arme ───────────────────────────────
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setWeaponPreview(selectedWeapon);
  }, [selectedWeapon, screen]);

  // ─── Hover tooltip : suit la souris sur la carte ─────────────────────
  // Idem ci-dessus : lecture du snap via snapRef.current, dep stable [screen].
  useEffect(() => {
    if (screen !== 'game') return;
    let raf = 0;
    let lastId = -1;
    const onMove = (e: MouseEvent) => {
      const engine = engineRef.current;
      const snap = snapRef.current;
      if (!engine || !snap) return;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const cam = engine.getCamera();
        const canvas = engine.app.canvas;
        const rect = canvas.getBoundingClientRect();
        const wx = (e.clientX - rect.left) / cam.zoom + cam.x;
        const wy = (e.clientY - rect.top) / cam.zoom + cam.y;
        const col = Math.floor(wx / CELL_SIZE);
        const row = Math.floor(wy / CELL_SIZE);
        if (col < 0 || row < 0 || col >= snap.mapWidth || row >= snap.mapHeight) {
          if (lastId !== -1) { hoveredTileStore.set(null); lastId = -1; }
          return;
        }
        const id = row * snap.mapWidth + col;
        if (id === lastId) return;
        lastId = id;
        hoveredTileStore.set(engine.getTile(id));
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [screen]);

  // ─── Échap annule tout mode actif ─────────────────────────────────────
  useEffect(() => {
    if (screen !== 'game') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedBuilding(BuildingType.None);
        setSelectedWeapon(null);
        setLandingShipId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  const jumpTo = (col: number, row: number) => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.jumpTo(col, row);
  };

  const cursorClass = useMemo(() => {
    if (landingShipId) return 'cursor-target';
    if (selectedWeapon) return 'cursor-weapon';
    if (selectedBuilding !== BuildingType.None) return 'cursor-build';
    return '';
  }, [selectedBuilding, selectedWeapon, landingShipId]);

  // ─── Menu ─────────────────────────────────────────────────────────────
  if (screen === 'menu') {
    return (
      <>
        <MainMenu onStart={handleStart} onGroup={() => setScreen('group')} />
        {error && (
          <div className="app-error-toast">{error}</div>
        )}
      </>
    );
  }
  // ─── Groupe ───────────────────────────────────────────────────────────
  if (screen === 'group') {
    return (
      <GroupScreen
        onBack={() => setScreen('menu')}
        onStartMultiplayer={async (payload, _mySessionId) => {
          // Le host a cliqué "Lancer" → on lance une partie locale avec
          // la config négociée dans le lobby. Le gameplay réseau (sync
          // d'état entre joueurs) sera ajouté dans une phase suivante ;
          // pour l'instant chaque joueur lance sa propre instance avec
          // la même configuration.
          setScreen('connecting');
          try {
            const profile = loadProfile();
            await socket.connect('custom', profile.name || 'Commandant', {
              custom: {
                mapSize: payload.mapSize,
                botCount: payload.botCount,
                speed: 1.0,
                botDifficulty: 'normal',
                weaponsEnabled: true,
                alliancesEnabled: true,
                navalEnabled: true,
                adminMode: false,
              },
              skinId: profile.skinId,
              playerElo: profile.elo,
              startPaused: true,
            });
            setScreen('countdown');
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Échec de lancement de la partie multi:', e);
            setScreen('menu');
          }
        }}
      />
    );
  }
    // ─── Chargement ───────────────────────────────────────────────────────
  if (screen === 'connecting') {
    return <LoadingScreen exiting={loadingExiting} />;
  }
    

  // ─── Jeu ──────────────────────────────────────────────────────────────
  const gameOverWinnerName = snap?.winner
    ? snap.players.find((p) => p.id === snap.winner)?.name ?? '—'
    : '—';

  return (
    <div className={`game-screen ${cursorClass}`}>
      <div ref={mountRef} className="game-canvas-mount" />

      {snap && (
        <>
          {/* HUD legacy — notifications, bannières, sirène */}
          <div className="hud-overlay hud-overlay-legacy">
            <HUD snap={snap} />
          </div>

          {/* Barre haute */}
          <TopBar snap={snap} onOpenSettings={() => setScreen('menu')} />

          {/* Dock bas */}
          <BottomDock
            snap={snap}
            selectedBuilding={selectedBuilding}
            onSelectBuilding={selectBuilding}
            selectedWeapon={selectedWeapon}
            onSelectWeapon={selectWeapon}
            landingShipId={landingShipId}
            onSelectLanding={selectLanding}
          />

          <TileTooltip snap={snap} />
          <Toasts snap={snap} />
          <KillBanner snap={snap} />
          <DomExplosions engine={engineRef.current} />
          <LeftLeaderboard snap={snap} />
          <BlackjackModal snap={snap} />
          {casinoModal === 'roulette' && <RouletteModal snap={snap} onClose={() => setCasinoModal(null)} />}
          {casinoModal === 'slots'    && <SlotsModal    snap={snap} onClose={() => setCasinoModal(null)} />}

          {/* Countdown 3-2-1 entre LoadingScreen et début de simulation.
              La sim est figée (startPaused=true) tant que screen='countdown'.
              À la fin du countdown : unpause + screen='game'. */}
          {screen === 'countdown' && (
            <Countdown
              onDone={() => {
                socket.setPaused(false);
                setScreen('game');
              }}
            />
          )}

          {radial && (
            <RadialMenu x={radial.x} y={radial.y} actions={radial.actions} onClose={() => setRadial(null)} />
          )}

          {snap.phase === 2 && (
            <div className="game-over">
              <div className="game-over-card">
                <h2>{snap.winner === socket.sessionId ? 'VICTOIRE' : 'PARTIE TERMINÉE'}</h2>
                <p>
                  {snap.winner === socket.sessionId
                    ? 'Tu domines le monde.'
                    : `Vainqueur : ${gameOverWinnerName}`}
                </p>
                <p className="game-over-sub">
                  Pic de domination : {snap.me ? Math.round((snap.me.territoryCount / Math.max(1, snap.totalLand)) * 100) : 0}% ·
                  Elo : {snap.me?.elo ?? 0}
                </p>
                <div className="game-over-actions">
                  <button onClick={() => window.location.reload()}>Nouvelle partie</button>
                  <button className="ghost" onClick={() => setScreen('menu')}>Menu</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
