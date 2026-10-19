import { describe, expect, test } from "bun:test";
import {
  Dono,
  DonoCancelledError,
  DonoTimeoutError,
} from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("Dono cancellation and timeouts", () => {
  test("cancels a pending task without executing it", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();
    const controller = new AbortController();
    let secondStarted = false;

    const first = queue.add(async () => {
      await gate.promise;
    });

    // Let the first task start before enqueueing the second.
    await Promise.resolve();
    await Promise.resolve();

    const second = queue.add(() => {
      secondStarted = true;
      return "second";
    }, { signal: controller.signal });

    controller.abort();

    await expect(second).rejects.toBeInstanceOf(DonoCancelledError);
    expect(secondStarted).toBe(false);
    expect(queue.pending).toBe(0);

    gate.resolve();
    await first;
    await queue.onIdle();
  });

  test("passes an abort signal to a running task", async () => {
    const queue = new Dono({ concurrency: 1 });
    const controller = new AbortController();
    const started = deferred<void>();

    const task = queue.add(
      async (signal) => {
        started.resolve();

        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }

          signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });

        if (signal.aborted) {
          throw new Error("Task observed cancellation");
        }
      },
      { signal: controller.signal },
    );

    await started.promise;
    controller.abort();

    await expect(task).rejects.toBeInstanceOf(DonoCancelledError);
    await queue.onIdle();
    expect(queue.running).toBe(0);
  });

  test("rejects a task when its timeout expires", async () => {
    const queue = new Dono({ concurrency: 1 });

    const task = queue.add(
      async (signal) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) {
            resolve();
            return;
          }

          signal.addEventListener("abort", () => resolve(), {
            once: true,
          });
        });

        // Simulate work noticing the timeout signal.
        if (signal.aborted) return "stopped";
        return "finished";
      },
      { timeout: 20 },
    );

    await expect(task).rejects.toBeInstanceOf(DonoTimeoutError);
    await queue.onIdle();

    expect(queue.running).toBe(0);
    expect(queue.pending).toBe(0);
  });

  test("a timed-out task does not settle twice", async () => {
    const queue = new Dono({ concurrency: 1 });

    const task = queue.add(
      () => new Promise<string>(() => {
        // Deliberately never settles, even when its signal aborts.
      }),
      { timeout: 10 },
    );

    await expect(task).rejects.toBeInstanceOf(DonoTimeoutError);
    await queue.onIdle();

    expect(queue.running).toBe(0);
  });

  test("rejects immediately if the signal was already aborted", async () => {
    const queue = new Dono();
    const controller = new AbortController();
    let started = false;

    controller.abort();

    const task = queue.add(() => {
      started = true;
      return 1;
    }, { signal: controller.signal });

    await expect(task).rejects.toBeInstanceOf(DonoCancelledError);

    expect(started).toBe(false);
    expect(queue.pending).toBe(0);
    expect(queue.running).toBe(0);
  });

  test("rejects invalid timeout values", async () => {
    const queue = new Dono();

    for (const timeout of [-1, Infinity, NaN]) {
      await expect(
        queue.add(() => 1, { timeout }),
      ).rejects.toBeInstanceOf(RangeError);
    }
  });

  test("continues processing after a task times out", async () => {
    const queue = new Dono({ concurrency: 1 });

    const first = queue.add(
      () => new Promise<string>(() => {}),
      { timeout: 10 },
    );

    const second = queue.add(() => "next");

    await expect(first).rejects.toBeInstanceOf(DonoTimeoutError);
    await expect(second).resolves.toBe("next");
    await queue.onIdle();

    expect(queue.running).toBe(0);
    expect(queue.pending).toBe(0);
  });
});