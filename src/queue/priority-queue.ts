export class PriorityQueue<T> {
  readonly #items: T[] = [];
  readonly #compare: (a: T, b: T) => number;

  constructor(compare: (a: T, b: T) => number) {
    this.#compare = compare;
  }

  get size(): number {
    return this.#items.length;
  }

  get isEmpty(): boolean {
    return this.#items.length === 0;
  }

  peek(): T | undefined {
    return this.#items[0];
  }

  push(item: T): void {
    this.#items.push(item);
    this.#siftUp(this.#items.length - 1);
  }

  pop(): T | undefined {
    if (this.#items.length === 0) {
      return undefined;
    }

    const root = this.#items[0]!;
    const last = this.#items.pop()!;

    if (this.#items.length > 0) {
      this.#items[0] = last;
      this.#siftDown(0);
    }

    return root;
  }

  remove(predicate: (item: T) => boolean): T[] {
    const removed: T[] = [];
    const retained: T[] = [];

    for (const item of this.#items) {
      if (predicate(item)) {
        removed.push(item);
      } else {
        retained.push(item);
      }
    }

    this.#items.length = 0;
    this.#items.push(...retained);

    for (let i = Math.floor(this.#items.length / 2) - 1; i >= 0; i--) {
      this.#siftDown(i);
    }

    return removed;
  }

  #siftUp(startIndex: number): void {
    let index = startIndex;

    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (
        this.#compare(
          this.#items[index]!,
          this.#items[parentIndex]!,
        ) >= 0
      ) {
        break;
      }

      this.#swap(index, parentIndex);
      index = parentIndex;
    }
  }

  #siftDown(startIndex: number): void {
    let index = startIndex;

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = index * 2 + 2;
      let bestIndex = index;

      if (
        leftIndex < this.#items.length &&
        this.#compare(
          this.#items[leftIndex]!,
          this.#items[bestIndex]!,
        ) < 0
      ) {
        bestIndex = leftIndex;
      }

      if (
        rightIndex < this.#items.length &&
        this.#compare(
          this.#items[rightIndex]!,
          this.#items[bestIndex]!,
        ) < 0
      ) {
        bestIndex = rightIndex;
      }

      if (bestIndex === index) {
        break;
      }

      this.#swap(index, bestIndex);
      index = bestIndex;
    }
  }

  #swap(a: number, b: number): void {
    const temp = this.#items[a]!;
    this.#items[a] = this.#items[b]!;
    this.#items[b] = temp;
  }
}
