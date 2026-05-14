/**
 * Schéma d'état synchronisé Colyseus.
 * -----------------------------------
 * Ces classes constituent l'état autoritaire répliqué vers les clients.
 * Colyseus n'envoie que les deltas (champs modifiés) à chaque broadcast,
 * ce qui couvre une grande partie de l'optimisation de bande passante.
 *
 * Règle absolue : seuls les systèmes serveur mutent ces objets.
 */

import { Schema, MapSchema, ArraySchema, type } from '@colyseus/schema';
import {
  BuildingType,
  MatchPhase,
  GameMode,
  TerrainType,
} from '../../../../shared/types';

export class TerritorySchema extends Schema {
  @type('int32') id = 0;
  @type('int16') x = 0;
  @type('int16') y = 0;
  @type('uint8') terrain: TerrainType = TerrainType.Land;
  @type('string') owner: string | null = null;
  @type('float32') troops = 0;
  @type('uint8') building: BuildingType = BuildingType.None;
  @type('uint8') buildingLevel = 0;
  @type('uint8') buildProgress = 0; // 0..100, construction en cours
  @type('number') capturedAt = 0;

  // Voisinage : non synchronisé (statique, le client le déduit de la grille).
  neighbors: number[] = [];
}

export class PlayerSchema extends Schema {
  @type('string') id = '';
  @type('string') name = '';
  @type('string') color = '#ffffff';
  @type('boolean') isBot = false;
  @type('boolean') connected = true;

  @type('float32') gold = 0;
  @type('float32') income = 0;

  @type('float32') population = 0;
  @type('float32') populationCap = 0;

  @type('float32') army = 0;
  @type('float32') attackRatio = 0.5;

  @type('uint16') territoryCount = 0;
  @type('string') allianceId: string | null = null;
  @type('float32') score = 0;
  @type('int32') elo = 1000;
  @type('boolean') alive = true;
}

export class ArmySchema extends Schema {
  @type('string') id = '';
  @type('string') owner = '';
  @type('int32') from = 0;
  @type('int32') to = 0;
  @type('float32') amount = 0;
  @type('float32') progress = 0;
  @type('boolean') reinforcement = false;
}

export class WorldState extends Schema {
  @type('uint8') phase: MatchPhase = MatchPhase.Lobby;
  @type('string') mode: GameMode = GameMode.Classic;
  @type('uint32') tick = 0;
  @type('number') startedAt = 0;
  @type('int16') mapWidth = 0;
  @type('int16') mapHeight = 0;
  @type('string') winner: string | null = null;

  @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
  @type({ array: TerritorySchema }) territories = new ArraySchema<TerritorySchema>();
  @type({ map: ArmySchema }) armies = new MapSchema<ArmySchema>();

  /** Index O(1) territoire par id — non synchronisé, reconstruit côté serveur. */
  territoryById: Map<number, TerritorySchema> = new Map();
}
