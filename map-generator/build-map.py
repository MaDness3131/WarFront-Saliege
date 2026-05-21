#!/usr/bin/env python3
"""
build-map.py — Construit l'atlas gameplay à partir d'une image pixel-art.
========================================================================
Pipeline emprunté à OpenFront / Territorial.io (cf. map-generator/map_generator.go) :

  1. Classification des pixels en biomes (océan, plaines, forêt, désert, neige)
     selon la palette de l'image.
  2. Filtrage des artefacts (îles < 30 px effacées, lacs < 200 px comblés).
  3. BFS distance-à-la-côte → magnitude (élévation / profondeur).
  4. Détection shoreline / océan profond.
  5. Bit-packing 1 octet par tuile.
  6. Génération de 3 niveaux de résolution (full / 4× / 16×) pour la minimap
     et le LOD à fort dézoom.
  7. Manifest JSON (dimensions + compteur de tuiles terre).

Format binaire (1 octet par tuile) :

  Bits 5-7 (3 bits) : Biome
       0 = Ocean (profond)
       1 = Ocean shore (eau peu profonde, < 2 tuiles de la côte)
       2 = Coast (terre touchant l'océan)
       3 = Plains
       4 = Forest
       5 = Desert
       6 = Snow
       7 = Mountain (réservé, absent de l'image actuelle)
  Bits 0-4 (5 bits) : Magnitude (0-31)
       - Land : distance à la côte (0 = côte, croissant vers l'intérieur)
       - Water : distance à la terre (0 = touche la côte, croissant vers l'abysse)

Helpers de décodage runtime (cf. client/src/local/binary-atlas.ts) :
       biome      = (b >>> 5) & 0x07
       magnitude  =  b & 0x1F
       isLand     = biome >= 2
       isWater    = biome <= 1
       isShore    = biome === 1 || biome === 2
       isOcean    = biome === 0

Usage :
    python3 build-map.py [chemin_image]
    # par défaut : client/public/maps/world-pixel.webp

Sortie :
    client/public/maps/world.bin           (full res)
    client/public/maps/world-4x.bin        (1/16 surface)
    client/public/maps/world-16x.bin       (1/256 surface)
    client/public/maps/world-manifest.json
"""

import os, sys, json, struct
from collections import deque, Counter
from PIL import Image

# ── Constantes biomes ───────────────────────────────────────────────────
B_OCEAN     = 0
B_OCEAN_SH  = 1
B_COAST     = 2
B_PLAINS    = 3
B_FOREST    = 4
B_DESERT    = 5
B_SNOW      = 6
B_MOUNTAIN  = 7

BIOME_NAMES = {
    0: 'Ocean', 1: 'OceanShore', 2: 'Coast',
    3: 'Plains', 4: 'Forest', 5: 'Desert', 6: 'Snow', 7: 'Mountain',
}

# Seuils filtrage (OpenFront : 30 px îles, 200 px lacs)
MIN_ISLAND_SIZE = 30
MIN_LAKE_SIZE   = 200

# ── Chemins ─────────────────────────────────────────────────────────────
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DEFAULT_INPUT = os.path.join(ROOT, 'client/public/maps/world-pixel.webp')
OUT_DIR = os.path.join(ROOT, 'client/public/maps')


# ── 1. Classification pixel → biome de terrain (Land vs Water + biome) ──

def classify_color(r, g, b):
    """Classifie un pixel RGB en biome (avant détection coast/shore).
    Renvoie le biome de base : un parmi (OCEAN, PLAINS, FOREST, DESERT, SNOW)."""
    # Outline noir → land (typiquement les côtes dessinées au trait noir)
    if r + g + b < 80:
        return B_PLAINS
    # Blanc → snow (calottes polaires)
    if r >= 220 and g >= 220 and b >= 220:
        return B_SNOW
    # Bleu dominant → océan (B haut, R bas)
    if b > 90 and r < 60 and (b - r) > 50:
        return B_OCEAN
    # Cyan littoral
    if b > 150 and g > 100 and r < 80:
        return B_OCEAN
    # Beige / tan / sable → désert
    if r > 180 and r > g and (r - b) > 30:
        return B_DESERT
    if r > 200 and g > 130 and b < 220 and r >= g:
        return B_DESERT
    # Vert
    if g > r and g >= b:
        return B_PLAINS if g >= 130 else B_FOREST
    # Vert/teal sombre où G ≈ B (forêt)
    if 40 < g <= 100 and abs(g - b) < 30 and r < g:
        return B_FOREST
    # Défaut → plaines
    return B_PLAINS


# ── 2. Filtrage îles / lacs trop petits (élimine les artefacts pixel) ───

def flood_fill_size(grid, w, h, x, y, predicate, visited):
    """Renvoie la taille d'une composante 4-connexe + liste des cells."""
    if visited[y * w + x]:
        return 0, []
    if not predicate(grid[y * w + x]):
        return 0, []
    q = deque([(x, y)])
    visited[y * w + x] = True
    cells = []
    while q:
        cx, cy = q.popleft()
        cells.append((cx, cy))
        for nx, ny in ((cx-1, cy), (cx+1, cy), (cx, cy-1), (cx, cy+1)):
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx] and predicate(grid[idx]):
                    visited[idx] = True
                    q.append((nx, ny))
    return len(cells), cells


def filter_small_components(biome_grid, w, h):
    """Supprime les îles < MIN_ISLAND_SIZE (en mer) et comble les lacs
    < MIN_LAKE_SIZE (en terre). Renvoie un compteur (islands_killed,
    lakes_filled)."""
    is_water = lambda b: b == B_OCEAN
    is_land  = lambda b: b != B_OCEAN

    # Îles → remplace par OCEAN
    visited = bytearray(w * h)
    islands_killed = 0
    for y in range(h):
        for x in range(w):
            size, cells = flood_fill_size(biome_grid, w, h, x, y, is_land, visited)
            if 0 < size < MIN_ISLAND_SIZE:
                for cx, cy in cells:
                    biome_grid[cy * w + cx] = B_OCEAN
                islands_killed += 1

    # Lacs → remplace par PLAINS (on garde le biome dominant alentour ?
    # pour rester simple, on remplit en plaines).
    visited = bytearray(w * h)
    lakes_filled = 0
    for y in range(h):
        for x in range(w):
            size, cells = flood_fill_size(biome_grid, w, h, x, y, is_water, visited)
            if 0 < size < MIN_LAKE_SIZE:
                # On vérifie quand même que la composante ne touche pas le bord
                # (sinon c'est l'océan principal d'un autre côté qu'on couperait).
                touches_edge = any(cx == 0 or cy == 0 or cx == w-1 or cy == h-1 for cx, cy in cells)
                if not touches_edge:
                    for cx, cy in cells:
                        biome_grid[cy * w + cx] = B_PLAINS
                    lakes_filled += 1

    return islands_killed, lakes_filled


# ── 3. BFS distance-à-la-côte (donne la magnitude d'élévation / profondeur)

def bfs_distance(biome_grid, w, h, predicate_source):
    """Renvoie un tableau de distances Manhattan (4-connexe) depuis toutes les
    cellules satisfaisant `predicate_source`. -1 = non atteignable."""
    n = w * h
    dist = [-1] * n
    q = deque()
    for i in range(n):
        if predicate_source(biome_grid[i]):
            dist[i] = 0
            q.append(i)
    while q:
        i = q.popleft()
        x, y = i % w, i // w
        d = dist[i]
        for ni in (i-1 if x > 0 else -1,
                   i+1 if x < w-1 else -1,
                   i-w if y > 0 else -1,
                   i+w if y < h-1 else -1):
            if ni >= 0 and dist[ni] == -1:
                dist[ni] = d + 1
                q.append(ni)
    return dist


# ── 4. Encodage final : 1 octet par tuile ───────────────────────────────

def encode_byte(biome, magnitude):
    """biome : 0-7 (3 bits) · magnitude : 0-31 (5 bits)."""
    return ((biome & 0x07) << 5) | (magnitude & 0x1F)


def build_full_res(img):
    """Pipeline complet : image → byte array (1 byte / pixel)."""
    w, h = img.size
    pixels = img.load()
    n = w * h

    # Phase 1 : classification couleur (Ocean ou biome terrestre).
    biome_grid = [0] * n
    for y in range(h):
        for x in range(w):
            r, g, b = pixels[x, y][:3]
            biome_grid[y * w + x] = classify_color(r, g, b)

    # Phase 2 : filtrage îles / lacs.
    islands_killed, lakes_filled = filter_small_components(biome_grid, w, h)
    print(f"  Filtrage : {islands_killed} îles effacées (< {MIN_ISLAND_SIZE} px), {lakes_filled} lacs comblés (< {MIN_LAKE_SIZE} px)")

    # Phase 3 : BFS distance-à-la-terre (pour magnitude des océans).
    dist_to_land  = bfs_distance(biome_grid, w, h, lambda b: b != B_OCEAN)
    # BFS distance-à-l'eau (pour magnitude des terres + détection Coast).
    dist_to_water = bfs_distance(biome_grid, w, h, lambda b: b == B_OCEAN)

    # Phase 4 : encodage final avec promotion Coast / OceanShore.
    out = bytearray(n)
    land_tiles = 0
    coast_tiles = 0
    shore_tiles = 0
    for i in range(n):
        biome = biome_grid[i]
        if biome == B_OCEAN:
            dl = dist_to_land[i]
            if dl == -1: dl = 31
            # OceanShore : distance-terre ≤ 1 → eau peu profonde.
            if dl <= 1:
                biome_out = B_OCEAN_SH
                shore_tiles += 1
            else:
                biome_out = B_OCEAN
            magnitude = min(31, dl // 2)  # halved pour tenir dans 5 bits
        else:
            dw = dist_to_water[i]
            if dw == -1: dw = 31
            # Coast : terre adjacente à l'eau.
            if dw <= 1:
                biome_out = B_COAST
                coast_tiles += 1
            else:
                # On conserve le biome d'origine pour distinguer Plains/Forest/etc.
                # Mais on doit re-mapper : Plains=3, Forest=4, Desert=5, Snow=6.
                biome_out = biome  # déjà dans 3..6
            magnitude = min(31, dw)
            land_tiles += 1
        out[i] = encode_byte(biome_out, magnitude)

    return bytes(out), {
        'land_tiles': land_tiles,
        'coast_tiles': coast_tiles,
        'shore_tiles': shore_tiles,
        'total_tiles': n,
    }


# ── 5. Downsample (LOD 4× et 16×) ───────────────────────────────────────

def downsample(data, w, h, factor):
    """Sous-échantillonne en prenant le mode (biome majoritaire) sur chaque
    bloc factor × factor. La magnitude devient la moyenne (cap 31).
    Renvoie (bytes, new_w, new_h)."""
    new_w = (w + factor - 1) // factor
    new_h = (h + factor - 1) // factor
    out = bytearray(new_w * new_h)
    for ny in range(new_h):
        for nx in range(new_w):
            biome_counter = Counter()
            mag_sum = 0
            mag_n = 0
            for dy in range(factor):
                for dx in range(factor):
                    y = ny * factor + dy
                    x = nx * factor + dx
                    if x >= w or y >= h: continue
                    b = data[y * w + x]
                    biome_counter[(b >> 5) & 0x07] += 1
                    mag_sum += b & 0x1F
                    mag_n += 1
            if mag_n == 0:
                continue
            biome = biome_counter.most_common(1)[0][0]
            mag = min(31, mag_sum // mag_n)
            out[ny * new_w + nx] = encode_byte(biome, mag)
    return bytes(out), new_w, new_h


# ── 6. Main ─────────────────────────────────────────────────────────────

def main(input_path):
    print(f"Source : {input_path}")
    img = Image.open(input_path).convert('RGBA')
    w, h = img.size
    print(f"Image  : {w} × {h} = {w*h:,} pixels")

    # Génération full res.
    print("\n[1/3] Génération full res...")
    data, stats = build_full_res(img)
    print(f"  Land tiles  : {stats['land_tiles']:,} ({100*stats['land_tiles']/stats['total_tiles']:.1f}%)")
    print(f"  Coast tiles : {stats['coast_tiles']:,}")
    print(f"  Shore tiles : {stats['shore_tiles']:,}")

    # Histogramme des biomes finaux.
    counter = Counter()
    for b in data:
        counter[(b >> 5) & 0x07] += 1
    print("  Biomes finaux :")
    for biome_id in range(8):
        n = counter.get(biome_id, 0)
        if n == 0: continue
        print(f"    {BIOME_NAMES[biome_id]:>11} : {n:>7,} ({100*n/len(data):.1f}%)")

    # LOD 4× et 16×.
    print("\n[2/3] Génération LOD 4× et 16×...")
    data_4x, w_4x, h_4x = downsample(data, w, h, 4)
    data_16x, w_16x, h_16x = downsample(data, w, h, 16)
    print(f"  4×  : {w_4x} × {h_4x} = {len(data_4x):,} octets")
    print(f"  16× : {w_16x} × {h_16x} = {len(data_16x):,} octets")

    # Écriture des fichiers.
    print(f"\n[3/3] Écriture vers {OUT_DIR}/")
    os.makedirs(OUT_DIR, exist_ok=True)
    paths = {
        'full': os.path.join(OUT_DIR, 'world.bin'),
        '4x':   os.path.join(OUT_DIR, 'world-4x.bin'),
        '16x':  os.path.join(OUT_DIR, 'world-16x.bin'),
    }
    with open(paths['full'], 'wb') as f: f.write(data)
    with open(paths['4x'], 'wb') as f: f.write(data_4x)
    with open(paths['16x'], 'wb') as f: f.write(data_16x)

    manifest = {
        'version': 1,
        'source': os.path.relpath(input_path, ROOT),
        'width': w,
        'height': h,
        'land_tiles': stats['land_tiles'],
        'coast_tiles': stats['coast_tiles'],
        'shore_tiles': stats['shore_tiles'],
        'biome_legend': {
            '0': 'Ocean',
            '1': 'OceanShore',
            '2': 'Coast',
            '3': 'Plains',
            '4': 'Forest',
            '5': 'Desert',
            '6': 'Snow',
            '7': 'Mountain',
        },
        'byte_format': '3 bits biome (5-7) + 5 bits magnitude (0-4)',
        'lod': {
            'full': {'file': 'world.bin', 'width': w, 'height': h, 'bytes': len(data)},
            '4x':   {'file': 'world-4x.bin', 'width': w_4x, 'height': h_4x, 'bytes': len(data_4x)},
            '16x':  {'file': 'world-16x.bin', 'width': w_16x, 'height': h_16x, 'bytes': len(data_16x)},
        },
    }
    manifest_path = os.path.join(OUT_DIR, 'world-manifest.json')
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)

    print(f"  ✓ {paths['full']:<50} {len(data):>7,} octets")
    print(f"  ✓ {paths['4x']:<50} {len(data_4x):>7,} octets")
    print(f"  ✓ {paths['16x']:<50} {len(data_16x):>7,} octets")
    print(f"  ✓ {manifest_path}")
    print("\nDone.")


if __name__ == '__main__':
    input_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT
    main(input_path)
