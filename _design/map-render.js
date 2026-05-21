// map-render.js — rasterise l'atlas en raster pixel ombré avec transitions
//
// Pipeline :
//   1. classify(char) → terrain de base
//   2. applyBiome(sx,sy) → biome final
//   3. BFS distances (distToLand, distToMount) en grille atlas
//   4. par pixel cible : on WARP les coords d'échantillonnage avec un fbm
//      → frontières organiques au lieu de grille carrée.
//   5. les 4 cellules voisines (post-warp) sont mélangées par bilinéaire
//      → couleurs de biomes voisins se fondent l'une dans l'autre.
//   6. ombrage lambertien + grain + calotte neige par altitude.

(function () {
  const ATLAS = window.WORLD_ATLAS;
  const W = ATLAS[0].length;     // 144
  const H = ATLAS.length;        // 72
  const RATIO = W / H;

  const T = { OCEAN:0, PLAINS:1, FOREST:2, DESERT:3, SNOW:4, MOUNTAIN:5 };

  function classify(ch) {
    if (ch === '.' || ch === ' ') return T.OCEAN;
    if (ch === '#') return T.PLAINS;
    if (ch === 'F') return T.FOREST;
    if (ch === 'D') return T.DESERT;
    if (ch === '^') return T.MOUNTAIN;
    if (ch === 'P') return T.SNOW;
    return T.OCEAN;
  }
  // Les biomes sont maintenant encodés directement dans l'atlas — plus de
  // re-classification géographique nécessaire.
  function applyBiome(base /*, sx, sy */) { return base; }

  // grille atlas pré-calculée
  const biomeGrid = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    const row = ATLAS[y];
    for (let x = 0; x < W; x++) {
      biomeGrid[y * W + x] = applyBiome(classify(row.charAt(x)), x, y);
    }
  }
  // landMask en atlas
  const landMaskAtlas = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) landMaskAtlas[i] = biomeGrid[i] === T.OCEAN ? 0 : 1;

  // BFS multi-source
  function bfsField(predicate) {
    const dist = new Int16Array(W * H).fill(-1);
    const queue = [];
    for (let i = 0; i < W * H; i++) {
      if (predicate(biomeGrid[i])) { dist[i] = 0; queue.push(i); }
    }
    let head = 0;
    while (head < queue.length) {
      const i = queue[head++];
      const x = i % W, y = (i / W) | 0;
      const d = dist[i];
      const cand = [
        x > 0 ? i - 1 : -1,
        x < W - 1 ? i + 1 : -1,
        y > 0 ? i - W : -1,
        y < H - 1 ? i + W : -1,
      ];
      for (const ni of cand) {
        if (ni < 0) continue;
        if (dist[ni] === -1) { dist[ni] = d + 1; queue.push(ni); }
      }
    }
    return dist;
  }
  const distToLand  = bfsField(b => b !== T.OCEAN);
  const distToMount = bfsField(b => b === T.MOUNTAIN);

  // bruit de valeur
  function hash(x, y, s) {
    let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 982451653;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function valueNoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = smooth(xf), v = smooth(yf);
    const a = hash(xi, yi, s);
    const b = hash(xi + 1, yi, s);
    const c = hash(xi, yi + 1, s);
    const d = hash(xi + 1, yi + 1, s);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
  function fbm(x, y, s) {
    let v = 0, a = 0.5, f = 1;
    for (let i = 0; i < 4; i++) {
      v += a * valueNoise(x * f, y * f, s + i * 17);
      a *= 0.5; f *= 2;
    }
    return v;
  }

  function rgb(h) {
    const v = parseInt(h.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  const PALETTES = {
    verdant: {
      [T.PLAINS]:   ['#2f4a2c', '#3a5c34', '#476b3c', '#578047', '#6c9255'].map(rgb),
      [T.FOREST]:   ['#1b3220', '#234128', '#2c4f30', '#365f3a', '#447146'].map(rgb),
      [T.DESERT]:   ['#9d7e4d', '#b89564', '#cda874', '#dcb985', '#eccd9c'].map(rgb),
      [T.SNOW]:     ['#aebfc5', '#c2d0d6', '#d4dfe4', '#e3edf1', '#f1f6f8'].map(rgb),
      [T.MOUNTAIN]: ['#3c3833', '#4d4640', '#5e564d', '#70675c', '#857a6d'].map(rgb),
      OCEAN_DEEP:    rgb('#0e2a3e'),
      OCEAN_SHALLOW: rgb('#1f547a'),
      OCEAN_COAST:   rgb('#3b87b0'),
      SNOW_CAP:      rgb('#eef3f5'),
    },
    atlas: {
      [T.PLAINS]:   ['#7a7050', '#8a7d5a', '#988a64', '#a5966c', '#b1a378'].map(rgb),
      [T.FOREST]:   ['#5a6044', '#666b48', '#73774e', '#7f8254', '#8c8e5b'].map(rgb),
      [T.DESERT]:   ['#b8a070', '#c5b07c', '#d0bd88', '#dac893', '#e4d2a0'].map(rgb),
      [T.SNOW]:     ['#c8c9be', '#d5d6cb', '#dfe0d6', '#eaeae0', '#f4f4ea'].map(rgb),
      [T.MOUNTAIN]: ['#5d4a3a', '#6d5644', '#7c624f', '#8a6f5a', '#977d68'].map(rgb),
      OCEAN_DEEP:    rgb('#28384a'),
      OCEAN_SHALLOW: rgb('#506880'),
      OCEAN_COAST:   rgb('#7a93aa'),
      SNOW_CAP:      rgb('#f4f4ea'),
    },
    cold: {
      [T.PLAINS]:   ['#384a48', '#445856', '#506663', '#5d7570', '#6a847e'].map(rgb),
      [T.FOREST]:   ['#1f3434', '#27403f', '#304c4a', '#3a5856', '#446462'].map(rgb),
      [T.DESERT]:   ['#7a7e6c', '#8a8d77', '#979a83', '#a4a78f', '#b1b39a'].map(rgb),
      [T.SNOW]:     ['#bccdd4', '#cdd9de', '#dce4e8', '#e8ecf0', '#f4f6f8'].map(rgb),
      [T.MOUNTAIN]: ['#2f3a3f', '#3a464c', '#465259', '#525f66', '#5f6c74'].map(rgb),
      OCEAN_DEEP:    rgb('#0a1d2e'),
      OCEAN_SHALLOW: rgb('#1c425e'),
      OCEAN_COAST:   rgb('#386f8e'),
      SNOW_CAP:      rgb('#f6f9fb'),
    },
    warm: {
      [T.PLAINS]:   ['#5a4b2a', '#6c5a33', '#7d6a3d', '#8d7948', '#9d8854'].map(rgb),
      [T.FOREST]:   ['#3b3a1f', '#494727', '#56542f', '#646237', '#727040'].map(rgb),
      [T.DESERT]:   ['#a36340', '#b8744d', '#c6855a', '#d2966a', '#dca77b'].map(rgb),
      [T.SNOW]:     ['#cabf9e', '#d6ccac', '#e0d8ba', '#eae3c7', '#f3edd4'].map(rgb),
      [T.MOUNTAIN]: ['#4a2e26', '#5b3b30', '#6b483a', '#7a5644', '#88644f'].map(rgb),
      OCEAN_DEEP:    rgb('#2a1830'),
      OCEAN_SHALLOW: rgb('#5a2d4a'),
      OCEAN_COAST:   rgb('#9b5d65'),
      SNOW_CAP:      rgb('#f3edd4'),
    },
  };

  const State = {
    scale: 8,
    PW: 0, PH: 0,
    elev: null,         // bruit fbm pour relief
    mAmpW: null,        // halo de montagne échantillonné aux coords WARPÉES
    distLW: null,       // distance à la terre aux coords WARPÉES (océan)
    sxw: null,          // coord X warpée (en cellules atlas) par pixel
    syw: null,          // coord Y warpée
    biomeAt: null,      // biome dominant aux coords warpées (pour tooltip)
    palette: 'verdant',
    light: 'NW',
    relief: 0.7,
    oceanDepth: true,
    snowCaps: true,
    grain: 0.06,
  };

  function bilin(field, sx, sy) {
    const x0 = Math.max(0, Math.min(W - 1, Math.floor(sx)));
    const y0 = Math.max(0, Math.min(H - 1, Math.floor(sy)));
    const x1 = Math.max(0, Math.min(W - 1, x0 + 1));
    const y1 = Math.max(0, Math.min(H - 1, y0 + 1));
    const fx = sx - Math.floor(sx), fy = sy - Math.floor(sy);
    const a = field[y0 * W + x0];
    const b = field[y0 * W + x1];
    const c = field[y1 * W + x0];
    const d = field[y1 * W + x1];
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  }

  // amplitude du warp en cellules atlas — ridé léger pour conserver les
  // formes des continents reconnaissables.
  const WARP_AMP = 0.35;
  // densité du bruit (octaves par cellule atlas)
  const NS_ELEV = 0.55;
  const NS_WARP = 0.42;

  function rebuildFields(scale) {
    State.scale = scale;
    const PW = W * scale, PH = H * scale;
    State.PW = PW; State.PH = PH;
    const N = PW * PH;
    const elev = new Float32Array(N);
    const mAmpW = new Float32Array(N);
    const distLW = new Float32Array(N);
    const sxwA = new Float32Array(N);
    const sywA = new Float32Array(N);
    const biomeAt = new Uint8Array(N);

    for (let py = 0; py < PH; py++) {
      const sy = (py + 0.5) / scale;
      for (let px = 0; px < PW; px++) {
        const i = py * PW + px;
        const sx = (px + 0.5) / scale;

        // warp via fbm — deux composantes désynchronisées
        const wx = (fbm(sx * NS_WARP,         sy * NS_WARP,         11) - 0.5) * 2 * WARP_AMP;
        const wy = (fbm(sx * NS_WARP + 9.3,   sy * NS_WARP + 4.1,   31) - 0.5) * 2 * WARP_AMP;
        const sxw = Math.max(0, Math.min(W - 1, sx + wx));
        const syw = Math.max(0, Math.min(H - 1, sy + wy));
        sxwA[i] = sxw; sywA[i] = syw;

        // bruit d'altitude — pas warpé, pour ne pas déformer le relief
        elev[i] = fbm(sx * NS_ELEV, sy * NS_ELEV, 7);

        // halo de montagne échantillonné en post-warp → les contreforts
        // s'étalent dans la même forme organique que le biome.
        const dmF = bilin(distToMount, sxw, syw);
        mAmpW[i] = Math.max(0, 1 - dmF / 3.5);

        // profondeur d'océan : post-warp aussi (sinon coastline reste droite)
        distLW[i] = bilin(distToLand, sxw, syw);

        // biome dominant (pour tooltip) : nearest aux coords warpées
        const bx = Math.max(0, Math.min(W - 1, Math.round(sxw)));
        const by = Math.max(0, Math.min(H - 1, Math.round(syw)));
        biomeAt[i] = biomeGrid[by * W + bx];
      }
    }
    State.elev = elev;
    State.mAmpW = mAmpW;
    State.distLW = distLW;
    State.sxw = sxwA;
    State.syw = sywA;
    State.biomeAt = biomeAt;
  }

  function altitudeAt(elev, mAmp, biome) {
    let h = elev * 0.35;
    if (biome === T.MOUNTAIN || mAmp > 0.05) {
      h += mAmp * (0.25 + 0.85 * elev);
    } else if (biome === T.FOREST) {
      h += elev * 0.12;
    } else if (biome === T.SNOW) {
      h += elev * 0.2;
    }
    return h;
  }

  function lightVec(dirLabel) {
    switch (dirLabel) {
      case 'NW': return [-0.6, -0.6, 0.55];
      case 'NE': return [ 0.6, -0.6, 0.55];
      case 'SE': return [ 0.6,  0.6, 0.55];
      case 'SW': return [-0.6,  0.6, 0.55];
      case 'N':  return [ 0.0, -0.85,0.55];
    }
    return [-0.6, -0.6, 0.55];
  }

  // Couleur d'un biome de terre pour une altitude h (palette indexée + jitter).
  function landColor(pal, biome, h, px, py) {
    const palette = pal[biome] || pal[T.PLAINS];
    const L = palette.length;
    let normH;
    if (biome === T.MOUNTAIN) normH = Math.min(1, Math.max(0, (h - 0.05) / 1.05));
    else if (biome === T.SNOW) normH = Math.min(1, Math.max(0, h / 0.55));
    else normH = Math.min(1, Math.max(0, h / 0.45));
    // Jitter "chunky" : on hash en 2×2 → blocs visibles, look pixel-art.
    const jit = (hash(px >> 1, py >> 1, 5) - 0.5) * 0.9;
    const lvl = Math.min(L - 1, Math.max(0, Math.round(normH * (L - 1) + jit)));
    return palette[lvl];
  }

  function render(canvas) {
    const PW = State.PW, PH = State.PH;
    canvas.width = PW;
    canvas.height = PH;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(PW, PH);
    const data = img.data;

    const pal = PALETTES[State.palette];
    const [sx_, sy_, sz_] = lightVec(State.light);
    const reliefK = 6.0 * State.relief;
    const grain = State.grain;
    const oceanDepth = State.oceanDepth;
    const snowCaps = State.snowCaps;

    const elev = State.elev;
    const mAmpW = State.mAmpW;
    const distLW = State.distLW;
    const sxwA = State.sxw;
    const sywA = State.syw;
    const biomeAt = State.biomeAt;
    const N = PW * PH;

    // altitudes
    const heights = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      heights[i] = altitudeAt(elev[i], mAmpW[i], biomeAt[i]);
    }

    for (let py = 0; py < PH; py++) {
      for (let px = 0; px < PW; px++) {
        const i = py * PW + px;
        const off = i * 4;
        const h = heights[i];

        const sxw = sxwA[i], syw = sywA[i];
        const fx0 = Math.floor(sxw), fy0 = Math.floor(syw);
        const x0 = Math.max(0, Math.min(W - 1, fx0));
        const y0 = Math.max(0, Math.min(H - 1, fy0));
        const x1 = Math.max(0, Math.min(W - 1, x0 + 1));
        const y1 = Math.max(0, Math.min(H - 1, y0 + 1));
        const fx = sxw - fx0, fy = syw - fy0;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        const b00 = biomeGrid[y0 * W + x0];
        const b10 = biomeGrid[y0 * W + x1];
        const b01 = biomeGrid[y1 * W + x0];
        const b11 = biomeGrid[y1 * W + x1];

        // proportion de "terre" aux 4 coins → côte organique
        const landW =
          (b00 !== T.OCEAN ? w00 : 0) +
          (b10 !== T.OCEAN ? w10 : 0) +
          (b01 !== T.OCEAN ? w01 : 0) +
          (b11 !== T.OCEAN ? w11 : 0);

        let r, g, b;

        if (landW < 0.5) {
          // ── OCÉAN ──
          let depth;
          if (oceanDepth) {
            depth = Math.min(1, distLW[i] / 6);
          } else {
            depth = 0.6;
          }
          let R, G, B;
          if (depth < 0.16) {
            const t = depth / 0.16;
            R = pal.OCEAN_COAST[0] * (1 - t) + pal.OCEAN_SHALLOW[0] * t;
            G = pal.OCEAN_COAST[1] * (1 - t) + pal.OCEAN_SHALLOW[1] * t;
            B = pal.OCEAN_COAST[2] * (1 - t) + pal.OCEAN_SHALLOW[2] * t;
          } else {
            const t = Math.min(1, (depth - 0.16) / 0.84);
            R = pal.OCEAN_SHALLOW[0] * (1 - t) + pal.OCEAN_DEEP[0] * t;
            G = pal.OCEAN_SHALLOW[1] * (1 - t) + pal.OCEAN_DEEP[1] * t;
            B = pal.OCEAN_SHALLOW[2] * (1 - t) + pal.OCEAN_DEEP[2] * t;
          }
          const wave = (elev[i] - 0.5) * 14;
          r = R + wave * 0.5;
          g = G + wave * 0.7;
          b = B + wave * 0.9;
          const n = (hash(px, py, 31) - 0.5) * 255 * grain * 0.5;
          r += n; g += n; b += n;
        } else {
          // ── TERRE : blend bilinéaire des couleurs des 4 cellules ──
          let rr = 0, gg = 0, bb = 0, totW = 0;
          if (b00 !== T.OCEAN) {
            const c = landColor(pal, b00, h, px, py);
            rr += c[0] * w00; gg += c[1] * w00; bb += c[2] * w00; totW += w00;
          }
          if (b10 !== T.OCEAN) {
            const c = landColor(pal, b10, h, px, py);
            rr += c[0] * w10; gg += c[1] * w10; bb += c[2] * w10; totW += w10;
          }
          if (b01 !== T.OCEAN) {
            const c = landColor(pal, b01, h, px, py);
            rr += c[0] * w01; gg += c[1] * w01; bb += c[2] * w01; totW += w01;
          }
          if (b11 !== T.OCEAN) {
            const c = landColor(pal, b11, h, px, py);
            rr += c[0] * w11; gg += c[1] * w11; bb += c[2] * w11; totW += w11;
          }
          if (totW > 0) { rr /= totW; gg /= totW; bb /= totW; }

          // calotte de sommet — sur l'altitude, pas le biome (suit la
          // forme organique des montagnes warpées)
          if (snowCaps && h > 0.78) {
            const cap = pal.SNOW_CAP;
            const t = Math.min(1, (h - 0.78) / 0.25);
            rr = rr * (1 - t) + cap[0] * t;
            gg = gg * (1 - t) + cap[1] * t;
            bb = bb * (1 - t) + cap[2] * t;
          }

          // ombrage lambertien (calcule depuis le h-field)
          const iR = px < PW - 1 ? i + 1 : i;
          const iD = py < PH - 1 ? i + PW : i;
          const dhx = heights[iR] - h;
          const dhy = heights[iD] - h;
          const nx = -dhx * reliefK;
          const ny = -dhy * reliefK;
          const nlen = Math.sqrt(nx * nx + ny * ny + 1);
          let dot = (sx_ * nx + sy_ * ny + sz_) / nlen;
          dot = Math.max(-0.4, Math.min(1, dot));
          // contraste : montagnes très marquées, plaines douces
          const contrast = 0.25 + 0.35 * mAmpW[i];
          const shade = 1 + (dot - 0.5) * contrast * 2;
          rr *= shade; gg *= shade; bb *= shade;

          const n = (hash(px, py, 19) - 0.5) * 255 * grain;
          rr += n; gg += n; bb += n;

          r = rr; g = gg; b = bb;
        }

        data[off]     = r < 0 ? 0 : r > 255 ? 255 : r;
        data[off + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        data[off + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        data[off + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  window.WorldMapRender = {
    W, H, RATIO, T,
    State,
    PALETTES,
    rebuildFields,
    render,
  };
})();
