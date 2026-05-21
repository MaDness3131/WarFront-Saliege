/**
 * MinHeap — file de priorité binaire générique.
 * ---------------------------------------------
 * O(log n) push / pop. Utilisée par le système d'attaque pour traiter
 * en priorité les tuiles avec le score le plus bas (enclaves, plaines).
 */

export class MinHeap<T> {
  private items: { value: T; prio: number }[] = [];

  get size(): number { return this.items.length; }

  push(value: T, prio: number) {
    this.items.push({ value, prio });
    this.bubbleUp(this.items.length - 1);
  }

  pop(): { value: T; prio: number } | null {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  peek(): { value: T; prio: number } | null {
    return this.items[0] ?? null;
  }

  /** Renvoie un échantillon des `n` premiers éléments triés (lecture seule, pour rendu). */
  peekTopN(n: number): { value: T; prio: number }[] {
    const slice = this.items.slice(0, Math.min(this.items.length, n * 3));
    slice.sort((a, b) => a.prio - b.prio);
    return slice.slice(0, n);
  }

  clear() { this.items.length = 0; }

  private bubbleUp(i: number) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].prio <= this.items[i].prio) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  private bubbleDown(i: number) {
    const n = this.items.length;
    while (true) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let smallest = i;
      if (l < n && this.items[l].prio < this.items[smallest].prio) smallest = l;
      if (r < n && this.items[r].prio < this.items[smallest].prio) smallest = r;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}
