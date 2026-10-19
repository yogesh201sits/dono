import { describe, expect, test } from "bun:test";
import { Dono } from "../src/index.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("Dono rate limiting", () => {
  test("limits task starts within a fixed interval", async () => {
    const queue = new Dono({
      concurrency: 5,
      intervalCap: 2,
      interval: 200,
    });

    const started: number[] = [];

    const tasks = Array.from({ length: 3 }, (_, index) =>
      queue.add(() => {
        started.push(index);
        return index;
      }),
    );

    // The first two tasks may start in the initial window.
    await sleep(30);

    expect(started).toEqual([0, 1]);
    expect(queue.pending).toBe(1);

    await expect(Promise.all(tasks)).resolves.toEqual([0, 1, 2]);
    await queue.onIdle();

    expect(started).toEqual([0, 1, 2]);
  });

  test("works without rate-limit options", async () => {
    const queue = new Dono({ concurrency: 2 });

    await expect(
      Promise.all([
        queue.add(() => 1),
        queue.add(() => 2),
        queue.add(() => 3),
      ]),
    ).resolves.toEqual([1, 2, 3]);
  });

  test("requires intervalCap and interval together", () => {
    expect(
      () => new Dono({ intervalCap: 2 }),
    ).toThrow(TypeError);

    expect(
      () => new Dono({ interval: 100 }),
    ).toThrow(TypeError);
  });

  test("rejects invalid rate-limit values", () => {
    for (const intervalCap of [0, -1, 1.5, Infinity, NaN]) {
      expect(
        () => new Dono({ intervalCap, interval: 100 }),
      ).toThrow(RangeError);
    }

    for (const interval of [0, -1, Infinity, NaN, 2_147_483_648]) {
      expect(
        () => new Dono({ intervalCap: 2, interval }),
      ).toThrow(RangeError);
    }
  });

  test("continues processing when a new interval begins", async () => {
    const queue = new Dono({
      concurrency: 1,
      intervalCap: 1,
      interval: 40,
    });

    const first = queue.add(() => "first");
    const second = queue.add(() => "second");

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await queue.onIdle();

    expect(queue.pending).toBe(0);
    expect(queue.running).toBe(0);
  });
});