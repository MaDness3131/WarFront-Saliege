/**
 * AudioManager — musique, ambiance, alertes.
 * ------------------------------------------
 * Couche audio fine au-dessus de l'API Web Audio. Charge les samples,
 * gère les bus (musique / SFX / ambiance), et une spatialisation simple
 * (volume selon la distance à la caméra) pour les explosions et combats.
 *
 * Les fichiers réels vont dans /assets/audio ; tant qu'ils sont absents,
 * les méthodes échouent silencieusement (le jeu reste jouable sans son).
 */

type SoundId =
  | 'music_war'
  | 'ui_click'
  | 'capture'
  | 'explosion'
  | 'nuke_siren'
  | 'naval_fire'
  | 'alliance_alert';

const SOUND_FILES: Record<SoundId, string> = {
  music_war: '/assets/audio/music_war.ogg',
  ui_click: '/assets/audio/ui_click.ogg',
  capture: '/assets/audio/capture.ogg',
  explosion: '/assets/audio/explosion.ogg',
  nuke_siren: '/assets/audio/nuke_siren.ogg',
  naval_fire: '/assets/audio/naval_fire.ogg',
  alliance_alert: '/assets/audio/alliance_alert.ogg',
};

export class AudioManager {
  private ctx: AudioContext | null = null;
  private buffers = new Map<SoundId, AudioBuffer>();
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private musicSource: AudioBufferSourceNode | null = null;

  volumes = { master: 0.8, music: 0.4, sfx: 0.9 };

  /** À appeler après une interaction utilisateur (politique autoplay). */
  async init() {
    if (this.ctx) return;
    this.ctx = new AudioContext();
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    this.musicBus.gain.value = this.volumes.master * this.volumes.music;
    this.sfxBus.gain.value = this.volumes.master * this.volumes.sfx;
    this.musicBus.connect(this.ctx.destination);
    this.sfxBus.connect(this.ctx.destination);

    // Préchargement non bloquant : les sons manquants sont simplement ignorés.
    await Promise.allSettled(
      (Object.keys(SOUND_FILES) as SoundId[]).map((id) => this.load(id)),
    );
  }

  private async load(id: SoundId) {
    if (!this.ctx) return;
    try {
      const res = await fetch(SOUND_FILES[id]);
      if (!res.ok) return;
      const arr = await res.arrayBuffer();
      this.buffers.set(id, await this.ctx.decodeAudioData(arr));
    } catch {
      /* fichier absent en dev : on ignore */
    }
  }

  /** Joue un effet ponctuel, avec volume spatialisé optionnel (0..1). */
  play(id: SoundId, spatialGain = 1) {
    if (!this.ctx) return;
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.value = Math.min(1, Math.max(0, spatialGain));
    src.connect(gain).connect(this.sfxBus);
    src.start();
  }

  /**
   * Spatialisation simple : atténue le son selon la distance écran entre
   * l'événement et le centre de la caméra.
   */
  playSpatial(id: SoundId, distancePx: number, falloff = 900) {
    const gain = Math.max(0, 1 - distancePx / falloff);
    if (gain > 0.02) this.play(id, gain);
  }

  startMusic() {
    if (!this.ctx) return;
    const buffer = this.buffers.get('music_war');
    if (!buffer || this.musicSource) return;
    this.musicSource = this.ctx.createBufferSource();
    this.musicSource.buffer = buffer;
    this.musicSource.loop = true;
    this.musicSource.connect(this.musicBus);
    this.musicSource.start();
  }

  stopMusic() {
    this.musicSource?.stop();
    this.musicSource = null;
  }

  setVolume(bus: 'master' | 'music' | 'sfx', value: number) {
    this.volumes[bus] = Math.min(1, Math.max(0, value));
    if (this.musicBus) this.musicBus.gain.value = this.volumes.master * this.volumes.music;
    if (this.sfxBus) this.sfxBus.gain.value = this.volumes.master * this.volumes.sfx;
  }
}

export const audio = new AudioManager();
