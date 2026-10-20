
import { describe, expect, test } from "bun:test";
import { Dono, DonoQueueFullError } from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("Dono backpressure", () => {
  test("accepts tasks while pending capacity is available", async () => {
    const queue = new Dono({
      concurrency: 1,
      maxQueueSize: 2,
    });

    const gate = deferred<void>();

    const first = queue.add(async () => {
      await gate.promise;
      return 1;
    });

    const second = queue.add(() => 2);
    const third = queue.add(() => 3);

    expect(queue.pending).toBe(2);

    gate.resolve();

    await expect(
      Promise.all([first, second, third]),
    ).resolves.toEqual([1, 2, 3]);

    await queue.onIdle();
  });

  test("rejects submissions when pending capacity is full", async () => {
    const queue = new Dono({
      concurrency: 1,
      maxQueueSize: 1,
    });

    const gate = deferred<void>();

    const first = queue.add(async () => {
      await gate.promise;
      return "first";
    });

    const second = queue.add(() => "second");
    const third = queue.add(() => "third");

    await expect(third).rejects.toBeInstanceOf(DonoQueueFullError);
    expect(queue.pending).toBe(1);

    gate.resolve();

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await queue.onIdle();
  });

  test("rejects invalid maxQueueSize values", () => {
    for (const maxQueueSize of [
      -1,
      1.5,
      Infinity,
      NaN,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(
        () => new Dono({ maxQueueSize }),
      ).toThrow(RangeError);
    }
  });

  test("allows immediate tasks when the pending limit is zero", async () => {
    const queue = new Dono({
      concurrency: 1,
      maxQueueSize: 0,
    });
    const gate = deferred<void>();

    const first = queue.add(async () => {
      await gate.promise;
      return "first";
    });

    await expect(
      queue.add(() => "second"),
    ).rejects.toBeInstanceOf(DonoQueueFullError);
    expect(queue.pending).toBe(0);

    gate.resolve();

    await expect(first).resolves.toBe("first");
    await queue.onIdle();
  });

  test("allows unlimited pending tasks when the limit is omitted", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();

    const first = queue.add(async () => {
      await gate.promise;
      return 1;
    });

    const remaining = Array.from(
      { length: 10 },
      (_, index) => queue.add(() => index + 2),
    );

    expect(queue.pending).toBe(10);

    gate.resolve();

    await expect(
      Promise.all([first, ...remaining]),
    ).resolves.toHaveLength(11);

    await queue.onIdle();
  });
});
