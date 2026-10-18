import { describe, expect, test } from "bun:test";
import { PriorityQueue } from "../src/queue/priority-queue.js";

describe("PriorityQueue", () => {
  test("pops items according to the comparator", () => {
    const queue = new PriorityQueue<number>((a, b) => b - a);

    queue.push(3);
    queue.push(10);
    queue.push(1);
    queue.push(7);

    expect(queue.pop()).toBe(10);
    expect(queue.pop()).toBe(7);
    expect(queue.pop()).toBe(3);
    expect(queue.pop()).toBe(1);
    expect(queue.pop()).toBeUndefined();
  });

  test("handles empty and single-item queues", () => {
    const queue = new PriorityQueue<number>((a, b) => a - b);

    expect(queue.isEmpty).toBe(true);
    expect(queue.peek()).toBeUndefined();
    expect(queue.pop()).toBeUndefined();

    queue.push(42);

    expect(queue.size).toBe(1);
    expect(queue.peek()).toBe(42);
    expect(queue.pop()).toBe(42);
    expect(queue.isEmpty).toBe(true);
  });

  test("maintains heap order after mixed insertions and removals", () => {
    const queue = new PriorityQueue<number>((a, b) => a - b);

    for (const value of [8, 3, 10, 1, 6, 14, 4, 7]) {
      queue.push(value);
    }

    const results: number[] = [];

    while (!queue.isEmpty) {
      const value = queue.pop();

      if (value !== undefined) {
        results.push(value);
      }
    }

    expect(results).toEqual([1, 3, 4, 6, 7, 8, 10, 14]);
  });
});
