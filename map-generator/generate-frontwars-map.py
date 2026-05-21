#!/usr/bin/env python3
"""
generate-frontwars-map.py — Génère une carte du monde style FrontWars.
=======================================================================
Pipeline :
  1. Charge l'image existante comme MASQUE de continents (préserve les
     contours déjà validés).
  2. Upscale 2× → 1100×620 (matche la map gameplay medium → pas de
     stretch au rendu).
  3. BFS distance-à-la-côte (deux faces) pour les gradients.
  4. Re-classification BIOME par règles latitudinales façon FrontWars :
        Pôle      (lat < 0.08 ou > 0.92)  → Snow
        Subpolar  (0.08-0.15 ou 0.88-0.92) → Snow + Forest
        Taïga     (0.15-0.25 ou 0.80-0.88) → Forest dominant
        Tempéré   (0.25-0.35 ou 0.70-0.80) → Forest + Plains
        Désert    (0.35-0.43 ou 0.57-0.65) → Desert + Plains (modulé par
                                              distance-côte : plus côtier
                                              = moins désertique)
        Équatorial(0.43-0.57)              → Forest dense
  5. Océan en 4 paliers de profondeur (côte → talus → profond → abysse).
  6. Halo côtier light blue (1 cellule de cyan côté mer).
  7. Sauvegarde en WebP.
  8. Appelle build-map.py pour régénérer les binaires gameplay.

Le résultat conserve les frontières exactes de la map précédente mais
arrive en :
  - Plus haute résolution (1100×620 vs 550×336 = 2× chaque axe)
  - Palette plus diversifiée (4 nuances océan, 2 nuances forêt/désert)
  - Distribution biomes plus crédible (latitude-driven)
  - Aspect ratio matchant exactement la map gameplay medium (1.774)
"""

import os, sys, math, hashlib
from collections import deque
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SRC = os.path.join(ROOT, 'client/public/maps/world-pixel.webp')
DST = os.path.join(ROOT, 'client/public/maps/world-pixel.webp')

# Cible : 1100×620 = dimensions exactes de MAP_SIZES.medium.
TARGET_W, TARGET_H = 1100, 620

# ── Classification source : land vs ocean ───────────────────────────────

def is_land_pixel(r, g, b, a):
    if a < 128: return False
    if r + g + b < 80: return True
    if r >= 220 and g >= 220 and b >= 220: return True
    if (b > 90 and r < 60 and (b - r) > 50): return False
    if (b > 150 and g > 100 and r < 80): return False
    return True

# ── Palette FrontWars-like ──────────────────────────────────────────────
# Couleurs calibrées pour pop en pixel-art : haute saturation modérée, bonne
# lisibilité même à fort dézoom.

COLORS = {
    'ocean_deep':    (12,  56, 132),
    'ocean_med':     (28,  92, 175),
    'ocean_shallow': (52, 130, 200),
    'ocean_coast':   (95, 175, 225),

    'plains':        (118, 165,  85),
    'plains_alt':    (135, 178,  95),
    'forest':        ( 42,  98,  55),
    'forest_dark':   ( 28,  72,  40),
    'taiga':         ( 60, 105,  70),

    'desert_light':  (238, 218, 175),
    'desert_med':    (220, 188, 130),
    'desert_dark':   (200, 158, 100),

    'snow':          (242, 242, 242),
    'snow_dim':      (220, 224, 228),
}


def hash_rand(x, y, seed=0):
    """Random déterministe par (x, y, seed) — pour le jitter pixel-art."""
    h = hashlib.md5(f"{x}_{y}_{seed}".encode()).digest()
    return h[0] / 255.0


def smooth_noise(x, y, freq=0.03, seed=0):
    """Value-noise lissé : bilinear sur une grille de hash. Sortie 0-1.
    `freq` = cycles par pixel (plus haut = grain plus fin)."""
    fx = x * freq
    fy = y * freq
    xi = int(fx); yi = int(fy)
    tx = fx - xi; ty = fy - yi
    # 4 coins
    a = hash_rand(xi,     yi,     seed)
    b = hash_rand(xi + 1, yi,     seed)
    c = hash_rand(xi,     yi + 1, seed)
    d = hash_rand(xi + 1, yi + 1, seed)
    # smoothstep
    sx = tx * tx * (3 - 2 * tx)
    sy = ty * ty * (3 - 2 * ty)
    return (a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy


def fbm(x, y, octaves=3, freq=0.02, seed=0):
    """Fractal Brownian Motion : somme d'octaves de smooth_noise."""
    v = 0.0; amp = 0.5; f = freq
    for i in range(octaves):
        v += amp * smooth_noise(x, y, f, seed + i * 13)
        amp *= 0.5
        f *= 2
    return v


def smoothstep(edge0, edge1, x):
    """Interpolation lisse 0→1 entre edge0 et edge1."""
    if edge1 == edge0: return 1.0 if x >= edge1 else 0.0
    t = (x - edge0) / (edge1 - edge0)
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


# ── 1. Mask de continents upscalé ──────────────────────────────────────

def build_land_mask():
    src = Image.open(SRC).convert('RGBA')
    SW, SH = src.size
    print(f"  Source : {SW}×{SH}")
    src_px = src.load()
    # Mask au format Python list[bool] pour rapidité d'accès uniforme.
    src_mask = bytearray(SW * SH)
    for y in range(SH):
        for x in range(SW):
            if is_land_pixel(*src_px[x, y]):
                src_mask[y * SW + x] = 1

    # Upscale nearest-neighbor vers TARGET_W × TARGET_H.
    mask = bytearray(TARGET_W * TARGET_H)
    for ty in range(TARGET_H):
        sy = min(SH - 1, int(ty * SH / TARGET_H))
        row_off = sy * SW
        for tx in range(TARGET_W):
            sx = min(SW - 1, int(tx * SW / TARGET_W))
            if src_mask[row_off + sx]:
                mask[ty * TARGET_W + tx] = 1
    return mask


# ── 2. BFS distance multi-source ───────────────────────────────────────

def bfs_distance(predicate_mask):
    """Distance Manhattan 4-connexe depuis toutes les cells où predicate_mask=1.
    Renvoie un array d'int (255 = non atteint, max practical)."""
    n = TARGET_W * TARGET_H
    dist = bytearray([255] * n)
    q = deque()
    for i in range(n):
        if predicate_mask[i]:
            dist[i] = 0
            q.append(i)
    while q:
        i = q.popleft()
        x, y = i % TARGET_W, i // TARGET_W
        d = dist[i]
        if d >= 254: continue
        nd = d + 1
        if x > 0:
            ni = i - 1
            if dist[ni] > nd: dist[ni] = nd; q.append(ni)
        if x < TARGET_W - 1:
            ni = i + 1
            if dist[ni] > nd: dist[ni] = nd; q.append(ni)
        if y > 0:
            ni = i - TARGET_W
            if dist[ni] > nd: dist[ni] = nd; q.append(ni)
        if y < TARGET_H - 1:
            ni = i + TARGET_W
            if dist[ni] > nd: dist[ni] = nd; q.append(ni)
    return dist


# ── 3. Biome selon latitude + distance côte ────────────────────────────

def biome_for_land(x, y, dist_to_ocean):
    """Renvoie un identifiant biome textuel pour une cellule terre.

    Architecture du climat — calibrée pour la projection visuelle de la
    map source (où Africa/équateur est dessiné PLUS BAS que la moitié de
    l'image, donc l'équateur visuel est à y/H ≈ 0.54 et non 0.50).

      - Polar caps      |lat - eq| > 0.34         → Snow
      - Subpolar        0.28 - 0.34              → Snow + Taïga
      - Taïga / boreal  0.20 - 0.28              → Taiga + Forest
      - Tempéré humide  0.10 - 0.20              → Forest + Plains
      - Désert subtrop. 0.05 - 0.18 + lon mask   → Desert ↗ vers intérieur
      - Équatorial      |lat - eq| < 0.05        → Rainforest dense
    """
    lat = y / TARGET_H   # 0 = nord, 1 = sud
    lon = x / TARGET_W
    r1 = hash_rand(x, y, 1)
    r2 = hash_rand(x, y, 2)

    # Équateur VISUEL de la map source (Africa centrée bas).
    IMG_EQ = 0.54
    abs_lat = abs(lat - IMG_EQ)

    # — Calottes polaires (smooth, pas de hard cutoff).
    snow_w = smoothstep(0.32, 0.42, abs_lat)
    if snow_w > 0.5:
        n = fbm(x, y, octaves=3, freq=0.025, seed=11)
        if snow_w > 0.90 or n < snow_w * 0.7:
            return 'snow'
        return 'taiga'

    # — Masque longitude pour déserts (calibré sur l'image actuelle) :
    desert_lon = 0.0
    if lat < IMG_EQ:
        # Hémisphère nord
        if 0.13 <= lon <= 0.22 and abs_lat > 0.16:    desert_lon = 0.6   # SW US
        elif 0.40 <= lon <= 0.62:                     desert_lon = 1.0   # Sahara / Arabie / NE Africa
        elif 0.62 < lon <= 0.82:                      desert_lon = 0.9   # Asie centrale / Gobi
    else:
        # Hémisphère sud
        if 0.27 <= lon <= 0.34 and abs_lat > 0.10:    desert_lon = 0.75  # Atacama
        elif 0.43 <= lon <= 0.55:                     desert_lon = 0.5   # Kalahari (modéré)
        elif 0.80 <= lon <= 0.95:                     desert_lon = 1.0   # Outback australien

    # — Bande désertique : abs_lat ∈ [0.05, 0.20] avec pic à 0.10.
    desert_band = 0.0
    if 0.04 <= abs_lat <= 0.22:
        desert_band = 1 - abs(abs_lat - 0.12) / 0.10
        desert_band = max(0, min(1, desert_band))

    # Combine : bande × longitude × bruit × modulation côte.
    n_desert = fbm(x, y, octaves=3, freq=0.014, seed=17)
    coast_factor = min(15, dist_to_ocean) / 15.0
    desert_prob = desert_band * desert_lon * (0.45 + 0.50 * coast_factor) * (0.55 + 0.55 * n_desert)
    if r1 < desert_prob:
        return 'desert'

    # — Équateur / rainforest (très étroit, |abs_lat| < 0.06).
    rainforest_w = smoothstep(0.10, 0.02, abs_lat)
    if r1 < rainforest_w * 0.90:
        return 'forest_dense' if r2 < 0.5 else 'forest'

    # — Taïga subarctique (|abs_lat| 0.24 - 0.34).
    taiga_w = smoothstep(0.20, 0.32, abs_lat)
    n_for = fbm(x, y, octaves=2, freq=0.025, seed=23)
    if r1 < taiga_w * 0.7:
        return 'taiga' if r2 < 0.7 else 'forest'

    # — Forêt tempérée / mixte (lat moyenne).
    forest_p = 0.50 + n_for * 0.30
    if r1 < forest_p:
        return 'forest'

    # — Default : plaines.
    return 'plains'


def color_for_biome(b, x, y):
    """Convertit biome textuel + jitter en couleur RGB finale."""
    r = hash_rand(x, y, 7)
    if b == 'snow':
        return COLORS['snow'] if r < 0.85 else COLORS['snow_dim']
    if b == 'taiga':
        return COLORS['taiga'] if r < 0.7 else COLORS['forest']
    if b == 'forest':
        return COLORS['forest'] if r < 0.75 else COLORS['forest_dark']
    if b == 'forest_dense':
        return COLORS['forest_dark'] if r < 0.7 else COLORS['forest']
    if b == 'plains':
        return COLORS['plains'] if r < 0.75 else COLORS['plains_alt']
    if b == 'desert':
        if r < 0.4:
            return COLORS['desert_light']
        elif r < 0.85:
            return COLORS['desert_med']
        else:
            return COLORS['desert_dark']
    return COLORS['plains']


def color_for_ocean(dist_to_land):
    """4 paliers de profondeur."""
    if dist_to_land <= 1: return COLORS['ocean_coast']
    if dist_to_land <= 4: return COLORS['ocean_shallow']
    if dist_to_land <= 10: return COLORS['ocean_med']
    return COLORS['ocean_deep']


# ── 4. Pipeline principal ──────────────────────────────────────────────

def main():
    print("[1/4] Chargement + mask continents...")
    land_mask = build_land_mask()
    n_land = sum(land_mask)
    print(f"  Land tiles : {n_land:,} / {TARGET_W * TARGET_H:,} ({100*n_land/(TARGET_W*TARGET_H):.1f}%)")

    print("[2/4] BFS distances...")
    # Distance depuis OCÉAN (pour les LAND cells : "à quelle distance de la côte ?")
    ocean_mask = bytearray([1 - b for b in land_mask])
    dist_to_ocean = bfs_distance(ocean_mask)
    # Distance depuis LAND (pour les OCEAN cells : "à quelle distance de la terre ?")
    dist_to_land = bfs_distance(land_mask)

    print("[3/4] Painting...")
    out = Image.new('RGB', (TARGET_W, TARGET_H))
    out_px = out.load()
    for y in range(TARGET_H):
        for x in range(TARGET_W):
            i = y * TARGET_W + x
            if land_mask[i]:
                d_oc = dist_to_ocean[i]
                biome = biome_for_land(x, y, d_oc)
                out_px[x, y] = color_for_biome(biome, x, y)
            else:
                out_px[x, y] = color_for_ocean(dist_to_land[i])

    print(f"[4/4] Sauvegarde WebP lossless → {DST}")
    # Lossless : pixel-art à couleurs discrètes, la compression lossy fusionne
    # les nuances de désert vers les verts et corrompt la classification.
    out.save(DST, 'WEBP', lossless=True, method=6)
    size = os.path.getsize(DST)
    print(f"  Taille : {size:,} octets ({size/1024:.1f} KB)")
    print(f"  Dimensions : {TARGET_W} × {TARGET_H}")
    print("\n→ Lance maintenant `python3 map-generator/build-map.py` pour")
    print("  régénérer les binaires gameplay.")


if __name__ == '__main__':
    main()
