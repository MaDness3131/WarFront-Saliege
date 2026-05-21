/**
 * TerritoryName — génère un nom déterministe pour une tuile.
 * ----------------------------------------------------------
 * Concatène un préfixe et un suffixe à partir de l'ID — toujours le même
 * nom pour le même ID, sans avoir à stocker quoi que ce soit dans l'état.
 */

const PREFIXES = [
  'Nord', 'Sud', 'Est', 'Ouest', 'Haut', 'Bas', 'Vieux', 'Neuf',
  'Saint', 'Mont', 'Val', 'Bois', 'Pré', 'Roc', 'Cap', 'Fort',
  'Grand', 'Petit', 'Beau', 'Pont', 'Plan', 'Lac', 'Riv', 'Bel',
];

const ROOTS = [
  'val', 'fort', 'bourg', 'ville', 'mont', 'champ', 'bois', 'lac',
  'pré', 'roc', 'cape', 'port', 'plage', 'pont', 'val', 'sec',
  'glace', 'pierre', 'sable', 'foret', 'fleuve', 'col', 'ile', 'gué',
];

const SUFFIXES = [
  '-sur-Mer', '-en-Haut', '-le-Roi', '-le-Sec', '-le-Vieux',
  '-sur-Marne', '-le-Grand', '-en-Bois', '-le-Comte', '',
  '', '', '', '', '', '', '', '', '', '',
];

/** Hash entier 32-bit non-cryptographique mais déterministe. */
function hash32(n: number): number {
  let h = (n | 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

export function territoryName(tileId: number): string {
  const h1 = hash32(tileId);
  const h2 = hash32(tileId * 2654435761);
  const h3 = hash32(tileId ^ 0xdeadbeef);
  const prefix = PREFIXES[h1 % PREFIXES.length];
  const root = ROOTS[h2 % ROOTS.length];
  const suffix = SUFFIXES[h3 % SUFFIXES.length];
  return `${prefix}${root}${suffix}`;
}
