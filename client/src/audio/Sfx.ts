/**
 * Sfx — synthèse audio procédurale "casino jazz".
 * -----------------------------------------------
 * Aucun fichier externe. Musique : walking bass + comping piano + brush
 * hat, séquencée précisément via AudioContext. Effets : clinks de jetons,
 * coin drops, cha-ching, jackpot — sons composés d'oscillateurs + bursts
 * de bruit filtrés.
 *
 * Réglages volume/mute lus depuis localStorage `warfront.options.v1`.
 */

type SfxName =
  | 'click' | 'tab' | 'capture' | 'attack' | 'build'
  | 'explosion' | 'nuke' | 'siren' | 'kill' | 'alliance'
  | 'betray' | 'invasion';

interface Volumes { master: number; sfx: number; music: number; }

const DEFAULT_VOLS: Volumes = { master: 1, sfx: 0.7, music: 0.35 };

class SfxEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private vols: Volumes = { ...DEFAULT_VOLS };
  private muted = false;
  private initialized = false;

  // Tracks musicaux : routés via Web Audio pour pouvoir les analyser
  // (visualizer rythmique sur le menu).
  private menuTrack: HTMLAudioElement | null = null;
  private gameTrack: HTMLAudioElement | null = null;
  private ambienceTrack: HTMLAudioElement | null = null;   // casino-ambiance superposée au menu
  private launchHoverTrack: HTMLAudioElement | null = null; // boucle "holy aura" sur hover launch
  private groupHoverTrack: HTMLAudioElement | null = null;  // même fichier, pitché grave pour bouton GROUPE
  private menuSource: MediaElementAudioSourceNode | null = null;
  private gameSource: MediaElementAudioSourceNode | null = null;
  private ambienceSource: MediaElementAudioSourceNode | null = null;
  private launchHoverSource: MediaElementAudioSourceNode | null = null;
  private groupHoverSource: MediaElementAudioSourceNode | null = null;
  private currentTrack: 'menu' | 'game' | null = null;
  private analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;

  init() {
    if (this.initialized) return;
    try {
      const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
      this.ctx = new Ctx();
      this.masterGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      // Compresseur léger pour éviter le clipping quand musique + SFX
      // jouent ensemble.
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      comp.knee.value = 18;
      comp.ratio.value = 3;
      comp.attack.value = 0.005;
      comp.release.value = 0.18;
      this.sfxGain.connect(this.masterGain);
      this.musicGain.connect(this.masterGain);
      this.masterGain.connect(comp);
      comp.connect(this.ctx.destination);
      // Analyser : prend le signal AVANT le gain musique pour rester réactif
      // même quand l'utilisateur baisse le volume / mute.
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.7;
      this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
      this.analyser.connect(this.musicGain);
      this.loadVolumesFromStorage();
      this.applyVolumes();
      this.initialized = true;
    } catch (e) { console.warn('Audio init failed', e); }
  }

  private loadVolumesFromStorage() {
    try {
      const raw = localStorage.getItem('warfront.options.v1');
      if (!raw) return;
      const opts = JSON.parse(raw);
      if (typeof opts.musicVol === 'number') this.vols.music = opts.musicVol / 100;
      if (typeof opts.sfxVol === 'number') this.vols.sfx = opts.sfxVol / 100;
      if (typeof opts.muteAll === 'boolean') this.muted = opts.muteAll;
    } catch {}
  }

  setVolumes(partial: Partial<Volumes>) {
    Object.assign(this.vols, partial);
    this.applyVolumes();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes() {
    if (this.masterGain) this.masterGain.gain.value = this.muted ? 0 : this.vols.master;
    if (this.sfxGain) this.sfxGain.gain.value = this.vols.sfx;
    if (this.musicGain) this.musicGain.gain.value = this.vols.music;
    // Les HTMLAudioElement (musique fichiers) sont aussi mis à jour.
    this.applyMusicVolumeToTracks();
  }

  // ─── SFX casino ──────────────────────────────────────────────────────

  play(name: SfxName) {
    if (!this.ctx || !this.sfxGain || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    switch (name) {
      case 'click':
        // Chip click : tick métallique court.
        this.tone(now, 2200, 0.025, 'square', 0.06);
        this.tone(now, 4400, 0.015, 'sine', 0.04);
        break;
      case 'tab':
        // Card flip.
        this.noiseBurst(now, 0.06, 3000, 0.08);
        this.tone(now + 0.02, 800, 0.04, 'triangle', 0.05);
        break;
      case 'capture':
        // Coin pickup : 2 tons ascendants brillants.
        this.tone(now, 988, 0.08, 'triangle', 0.07);    // B5
        this.tone(now + 0.06, 1318, 0.1, 'triangle', 0.07); // E6
        this.tone(now + 0.06, 2637, 0.1, 'sine', 0.03);     // harmonique
        break;
      case 'attack':
        // Card flick swoosh.
        this.noiseBurst(now, 0.18, 2000, 0.1);
        this.sweep(now, 600, 200, 0.16, 'sawtooth', 0.06);
        break;
      case 'build':
        // Cha-ching : caisse enregistreuse 2 tons + cloche.
        this.tone(now, 1320, 0.08, 'triangle', 0.09);
        this.tone(now + 0.06, 1760, 0.1, 'triangle', 0.09);
        this.tone(now + 0.1, 2640, 0.18, 'sine', 0.06);
        // "ding" cloche
        this.bell(now + 0.05, 2800, 0.4, 0.08);
        break;
      case 'explosion':
        this.noiseBurst(now, 0.35, 800, 0.18);
        this.sweep(now, 120, 40, 0.4, 'sawtooth', 0.18);
        break;
      case 'nuke':
        this.noiseBurst(now, 1.2, 400, 0.32);
        this.sweep(now, 80, 20, 1.4, 'sawtooth', 0.28);
        this.sweep(now + 0.1, 200, 30, 1.0, 'sine', 0.18);
        break;
      case 'siren':
        this.sweep(now, 880, 440, 0.4, 'sawtooth', 0.18);
        this.sweep(now + 0.45, 880, 440, 0.4, 'sawtooth', 0.18);
        this.sweep(now + 0.9, 880, 440, 0.4, 'sawtooth', 0.18);
        break;
      case 'kill':
        // Jackpot ! Arpège ascendant + cloches + chips qui tombent.
        // Triade majeure C-E-G + octave + cloche
        const notes = [523, 659, 784, 1047, 1319]; // C5 E5 G5 C6 E6
        notes.forEach((f, i) => {
          this.tone(now + i * 0.08, f, 0.18, 'triangle', 0.1);
          this.tone(now + i * 0.08, f * 2, 0.18, 'sine', 0.04);
        });
        // Bell tail
        this.bell(now + 0.5, 1760, 1.2, 0.12);
        // Chips qui tombent
        for (let i = 0; i < 6; i++) {
          this.tone(now + 0.5 + i * 0.05 + Math.random() * 0.02,
                    1600 + Math.random() * 800, 0.04, 'triangle', 0.04);
        }
        break;
      case 'alliance':
        // Pile de jetons : 3 clinks rapprochés montants.
        for (let i = 0; i < 3; i++) {
          this.tone(now + i * 0.05, 1400 + i * 250, 0.04, 'square', 0.06);
          this.tone(now + i * 0.05, 3000 + i * 400, 0.025, 'sine', 0.03);
        }
        this.bell(now + 0.18, 1320, 0.35, 0.05);
        break;
      case 'betray':
        // Carte qui se déchire + ton grave.
        this.noiseBurst(now, 0.3, 1500, 0.12);
        this.sweep(now, 220, 70, 0.5, 'sawtooth', 0.1);
        break;
      case 'invasion':
        // Bateau qui largue : ton grave + cloche éloignée.
        this.sweep(now, 180, 60, 0.5, 'triangle', 0.1);
        this.bell(now + 0.2, 880, 0.6, 0.05);
        break;
    }
  }

  private tone(t0: number, freq: number, dur: number, type: OscillatorType, peak: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private sweep(t0: number, f1: number, f2: number, dur: number, type: OscillatorType, peak: number) {
    if (!this.ctx || !this.sfxGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noiseBurst(t0: number, dur: number, cutoff: number, peak: number) {
    if (!this.ctx || !this.sfxGain) return;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(cutoff * 2.5, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, cutoff * 0.4), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(peak, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  /** Cloche via additive synthesis : fond + harmoniques inharmoniques. */
  private bell(t0: number, freq: number, dur: number, peak: number) {
    if (!this.ctx || !this.sfxGain) return;
    const partials = [
      { mult: 1.0,   gain: 1.0 },
      { mult: 2.01,  gain: 0.6 },
      { mult: 3.02,  gain: 0.35 },
      { mult: 4.18,  gain: 0.18 },
      { mult: 5.32,  gain: 0.08 },
    ];
    for (const p of partials) {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * p.mult;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(peak * p.gain, t0 + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * (1 - p.mult * 0.08));
      osc.connect(g);
      g.connect(this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    }
  }

  // ─── Music tracks (fichiers MP3 fournis par l'utilisateur) ─────────

  /** Joue la musique de menu (jazz) + ambiance casino superposée. */
  playMenuMusic() {
    this.playTrack('menu', '/audio/menu-jazz.mp3');
    this.playAmbience();
  }

  /** Joue la musique de jeu (vent ambiant calme). */
  playGameMusic() {
    this.playTrack('game', '/audio/game-wind.mp3');
    this.stopAmbience();
  }

  stopMusic() {
    if (this.menuTrack) { this.menuTrack.pause(); this.menuTrack.currentTime = 0; }
    if (this.gameTrack) { this.gameTrack.pause(); this.gameTrack.currentTime = 0; }
    this.stopAmbience();
    this.stopLaunchHover();
    this.currentTrack = null;
  }

  /** Couche d'ambiance casino (foule, jetons) jouée par-dessus la musique de menu. */
  private playAmbience() {
    if (!this.ambienceTrack) {
      const t = new Audio('/audio/casino-ambiance.mp3');
      t.loop = true;
      t.preload = 'auto';
      t.crossOrigin = 'anonymous';
      t.volume = 0;
      if (this.ctx && this.analyser) {
        try {
          this.ambienceSource = this.ctx.createMediaElementSource(t);
          this.ambienceSource.connect(this.analyser);
        } catch (e) { /* fallback : output direct */ }
      }
      this.ambienceTrack = t;
    }
    this.ambienceTrack.muted = this.muted;
    this.ambienceTrack.play().catch(() => {});
    // Ambiance casino à plein volume (100 %) — couche dense par-dessus le jazz.
    this.fadeTo(this.ambienceTrack, 1.0, 600);
  }

  private stopAmbience() {
    if (!this.ambienceTrack) return;
    this.fadeOutAndStop(this.ambienceTrack, 400);
  }

  /** Boucle "holy aura" déclenchée au survol du bouton ENGAGER. */
  playLaunchHover() {
    if (!this.ctx) this.init();
    if (!this.launchHoverTrack) {
      const t = new Audio('/audio/launch-hover.mp3');
      t.loop = true;
      t.preload = 'auto';
      t.crossOrigin = 'anonymous';
      t.volume = 0;
      if (this.ctx && this.analyser) {
        try {
          this.launchHoverSource = this.ctx.createMediaElementSource(t);
          // Route vers sfxGain (et non musicGain) pour qu'il suive le volume effets.
          if (this.sfxGain) this.launchHoverSource.connect(this.sfxGain);
        } catch (e) { /* fallback */ }
      }
      this.launchHoverTrack = t;
    }
    this.launchHoverTrack.muted = this.muted;
    this.launchHoverTrack.currentTime = 0;
    this.launchHoverTrack.play().catch(() => {});
    this.fadeTo(this.launchHoverTrack, 0.85, 180);
  }

  stopLaunchHover() {
    if (!this.launchHoverTrack) return;
    this.fadeOutAndStop(this.launchHoverTrack, 240);
  }

  /** Variante GRAVE du hover launch — même fichier, playbackRate 0.55 pour
   *  pitcher d'environ une octave en-dessous. Utilisé sur le bouton GROUPE
   *  pour le différencier sonorement du LANCER sans nouveau fichier audio. */
  playGroupHover() {
    if (!this.ctx) this.init();
    if (!this.groupHoverTrack) {
      const t = new Audio('/audio/launch-hover.mp3');
      t.loop = true;
      t.preload = 'auto';
      t.crossOrigin = 'anonymous';
      t.volume = 0;
      t.playbackRate = 0.55; // une octave plus grave
      // preservesPitch=false → on veut justement le shift de pitch.
      (t as any).preservesPitch = false;
      (t as any).mozPreservesPitch = false;
      (t as any).webkitPreservesPitch = false;
      if (this.ctx && this.sfxGain) {
        try {
          this.groupHoverSource = this.ctx.createMediaElementSource(t);
          this.groupHoverSource.connect(this.sfxGain);
        } catch (e) { /* fallback : sortie directe */ }
      }
      this.groupHoverTrack = t;
    }
    this.groupHoverTrack.muted = this.muted;
    this.groupHoverTrack.currentTime = 0;
    this.groupHoverTrack.play().catch(() => {});
    this.fadeTo(this.groupHoverTrack, 0.85, 180);
  }

  stopGroupHover() {
    if (!this.groupHoverTrack) return;
    this.fadeOutAndStop(this.groupHoverTrack, 240);
  }

  /** Clic GROUPE : one-shot "magical coin win" (Mixkit) — sonorité casino
   *  arpégée qui matche le thème jetons/salon. Coupe le hover en parallèle. */
  playGroupClick() {
    if (!this.ctx) this.init();
    this.stopGroupHover();
    this.playOneShot('/audio/group-click.wav', 0.95);
  }

  /** Fanfare "medieval orchestra" (Mixkit) jouée au démarrage du countdown
   *  3-2-1. Cuivres dramatiques pour annoncer l'engagement militaire. */
  playCountdownFanfare() {
    if (!this.ctx) this.init();
    this.playOneShot('/audio/countdown-fanfare.wav', 1.0);
  }

  /** Sur le clic ENGAGER : ka-ching immédiat, bip de détresse 1 s plus tard.
   *  Le jazz ET l'ambiance casino sortent en FONDU RAPIDE (250 ms) pour
   *  laisser respirer les SFX sans coupure brutale. */
  playLaunchClick() {
    if (!this.ctx) this.init();
    this.fadeOutMenuTracks(250);
    // Cash register : tout de suite, au clic.
    this.playOneShot('/audio/cash-register.mp3', 1.0);
    // Bip de détresse : différé d'une seconde.
    window.setTimeout(() => {
      this.playOneShot('/audio/distress.mp3', 0.9);
    }, 1000);
  }

  /** Fade-out rapide du jazz + ambiance casino. Les deux pistes glissent
   *  de leur volume courant à 0 sur `ms` millisecondes, puis sont mises en
   *  pause + currentTime réinitialisé (prêtes à être relancées). */
  private fadeOutMenuTracks(ms: number) {
    if (this.menuTrack && !this.menuTrack.paused) {
      this.fadeOutAndStop(this.menuTrack, ms);
    }
    if (this.ambienceTrack && !this.ambienceTrack.paused) {
      this.fadeOutAndStop(this.ambienceTrack, ms);
    }
    this.currentTrack = null;
  }

  /** One-shot via HTMLAudioElement clone — pas d'accumulation, jouable en superposition. */
  private playOneShot(src: string, volume: number) {
    if (this.muted) return;
    const t = new Audio(src);
    t.crossOrigin = 'anonymous';
    t.volume = Math.max(0, Math.min(1, volume * this.vols.sfx));
    t.play().catch(() => {});
    // Auto-cleanup quand fini.
    t.addEventListener('ended', () => { t.src = ''; }, { once: true });
  }

  private playTrack(which: 'menu' | 'game', src: string) {
    if (this.currentTrack === which) return;
    if (which === 'menu' && this.gameTrack) this.fadeOutAndStop(this.gameTrack, 250);
    else if (which === 'game' && this.menuTrack) this.fadeOutAndStop(this.menuTrack, 250);

    let track = which === 'menu' ? this.menuTrack : this.gameTrack;
    if (!track) {
      track = new Audio(src);
      track.loop = true;
      track.preload = 'auto';
      track.crossOrigin = 'anonymous';
      track.volume = 0;
      // Routage Web Audio : track → analyser → musicGain → master
      // pour que le visualizer puisse lire les fréquences en temps réel.
      if (this.ctx && this.analyser) {
        try {
          const source = this.ctx.createMediaElementSource(track);
          source.connect(this.analyser);
          if (which === 'menu') this.menuSource = source;
          else this.gameSource = source;
        } catch (e) {
          // Si createMediaElementSource échoue, on tombe en fallback :
          // le son passe direct du <audio> aux speakers (pas d'analyse).
          console.warn('MediaElementSource failed', e);
        }
      }
      if (which === 'menu') this.menuTrack = track;
      else this.gameTrack = track;
    }
    track.muted = this.muted;
    track.volume = 0;
    track.play().catch(() => {});
    this.currentTrack = which;
    // Fade-in via la volume du track lui-même (multiplié au musicGain en sortie).
    this.fadeTo(track, 1, 350);
  }

  /** Retourne le buffer de fréquences (0..255 par bin) pour visualisation. */
  getFrequencyData(): Uint8Array | null {
    if (!this.analyser || !this.freqData) return null;
    // Cast pour réconcilier le type strict TS Uint8Array<ArrayBuffer> vs Uint8Array<ArrayBufferLike>.
    this.analyser.getByteFrequencyData(this.freqData as Uint8Array<ArrayBuffer>);
    return this.freqData;
  }

  private fadeOutAndStop(track: HTMLAudioElement, ms: number) {
    const startVol = track.volume;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      track.volume = Math.max(0, startVol * (1 - k));
      if (k < 1) requestAnimationFrame(tick);
      else { track.pause(); track.currentTime = 0; }
    };
    requestAnimationFrame(tick);
  }

  private fadeTo(track: HTMLAudioElement, target: number, ms: number) {
    const startVol = track.volume;
    const t0 = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      track.volume = startVol + (target - startVol) * k;
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Volume utilisateur géré par musicGain ; on touche juste muted ici. */
  private applyMusicVolumeToTracks() {
    if (this.menuTrack) this.menuTrack.muted = this.muted;
    if (this.gameTrack) this.gameTrack.muted = this.muted;
  }

  // ─── API compat (anciens noms) ──────────────────────────────────────

  startMusic() { this.playMenuMusic(); }
}

export const sfx = new SfxEngine();
