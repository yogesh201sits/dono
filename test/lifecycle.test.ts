
import { describe, expect, test } from "bun:test";
import { Dono, DonoClearedError, DonoClosedError } from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("Dono lifecycle controls", () => {
  test("pause prevents queued tasks from starting", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();
    const order: number[] = [];

    const first = queue.add(async () => {
      await gate.promise;
      order.push(1);
    });

    await Promise.resolve();
    await Promise.resolve();

    queue.pause();

    const second = queue.add(() => {
      order.push(2);
    });

    expect(queue.isPaused).toBe(true);

    gate.resolve();

    await first;
    await Promise.resolve();

    expect(order).toEqual([1]);
    expect(queue.pending).toBe(1);

    queue.start();
    await second;
    await queue.onIdle();

    expect(order).toEqual([1, 2]);
    expect(queue.isPaused).toBe(false);
  });

  test("clear rejects pending tasks but preserves running work", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();
    let secondStarted = false;

    const first = queue.add(async () => {
      await gate.promise;
      return "finished";
    });

    await Promise.resolve();
    await Promise.resolve();

    const second = queue.add(() => {
      secondStarted = true;
      return "second";
    });

    queue.clear();

    await expect(second).rejects.toBeInstanceOf(DonoClearedError);
    expect(secondStarted).toBe(false);

    gate.resolve();

    await expect(first).resolves.toBe("finished");
    await queue.onIdle();

    expect(queue.pending).toBe(0);
    expect(queue.running).toBe(0);
  });

  test("close drains accepted work and rejects future submissions", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();
    const first = queue.add(async () => {
      await gate.promise;
      return "finished";
    });

    await Promise.resolve();
    await Promise.resolve();

    const second = queue.add(() => "second");
    const closed = queue.close();

    expect(queue.isClosed).toBe(true);

    await expect(
      queue.add(() => "too late"),
    ).rejects.toBeInstanceOf(DonoClosedError);

    gate.resolve();

    await expect(first).resolves.toBe("finished");
    await expect(second).resolves.toBe("second");
    await closed;

    expect(queue.running).toBe(0);
    expect(queue.pending).toBe(0);
  });

  test("close resumes a paused queue and is idempotent", async () => {
    const queue = new Dono({ concurrency: 1 });

    queue.pause();

    const first = queue.add(() => "first");
    const second = queue.add(() => "second");

    const close1 = queue.close();
    const close2 = queue.close();

    expect(close1).toBe(close2);

    await expect(first).resolves.toBe("first");
    await expect(second).resolves.toBe("second");
    await close1;

    expect(queue.isClosed).toBe(true);
    expect(queue.isPaused).toBe(false);
  });

  test("clear on an empty queue is safe", async () => {
    const queue = new Dono();

    queue.clear();

    await queue.onEmpty();
    await queue.onIdle();

    expect(queue.pending).toBe(0);
    expect(queue.running).toBe(0);
  });

  test("start on an already running queue is safe", async () => {
    const queue = new Dono({ concurrency: 1 });

    queue.start();

    await expect(queue.add(() => 42)).resolves.toBe(42);
    await queue.onIdle();
  });
});
