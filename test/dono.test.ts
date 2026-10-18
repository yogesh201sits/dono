
import { describe, expect, test } from "bun:test";
import { Dono } from "../src/index.js";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;

  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

describe("Dono", () => {
  test("returns task results", async () => {
    const queue = new Dono({ concurrency: 2 });

    const numberResult = queue.add(() => 42);
    const stringResult = queue.add(async () => "hello");

    expect(await numberResult).toBe(42);
    expect(await stringResult).toBe("hello");
  });

  test("never exceeds the concurrency limit", async () => {
    const queue = new Dono({ concurrency: 2 });
    const gates = [
      deferred<void>(),
      deferred<void>(),
      deferred<void>(),
    ];

    let active = 0;
    let maximumActive = 0;

    const tasks = gates.map((gate) =>
      queue.add(async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);

        await gate.promise;

        active -= 1;
      }),
    );

    // Allow the queue to start its initial tasks.
    await Promise.resolve();
    await Promise.resolve();

    expect(queue.running).toBe(2);
    expect(queue.pending).toBe(1);
    expect(maximumActive).toBe(2);

    gates[0]!.resolve();
    await tasks[0];

    await Promise.resolve();
    await Promise.resolve();

    expect(queue.running).toBe(2);
    expect(maximumActive).toBe(2);

    gates[1]!.resolve();
    gates[2]!.resolve();

    await Promise.all(tasks);
    await queue.onIdle();

    expect(queue.running).toBe(0);
    expect(queue.pending).toBe(0);
    expect(maximumActive).toBe(2);
  });

  test("propagates asynchronous failures without stopping the queue", async () => {
    const queue = new Dono({ concurrency: 1 });
    const error = new Error("task failed");

    const failed = queue.add(async () => {
      throw error;
    });

    const succeeded = queue.add(() => "still works");

    await expect(failed).rejects.toBe(error);
    await expect(succeeded).resolves.toBe("still works");
    await queue.onIdle();
  });

  test("propagates synchronous exceptions", async () => {
    const queue = new Dono({ concurrency: 1 });
    const error = new Error("synchronous failure");

    const result = queue.add(() => {
      throw error;
    });

    await expect(result).rejects.toBe(error);
    await queue.onIdle();
  });

  test("onEmpty resolves while a task is still running", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();

    const task = queue.add(async () => {
      await gate.promise;
      return "done";
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(queue.running).toBe(1);
    expect(queue.pending).toBe(0);

    await queue.onEmpty();

    // The task remains active until its gate is released.
    expect(queue.running).toBe(1);

    gate.resolve();

    await expect(task).resolves.toBe("done");
    await queue.onIdle();
  });

  test("onIdle waits for queued and running tasks", async () => {
    const queue = new Dono({ concurrency: 1 });
    const gate = deferred<void>();
    let finished = false;

    const first = queue.add(async () => {
      await gate.promise;
    });

    const second = queue.add(() => "second");

    const idle = queue.onIdle().then(() => {
      finished = true;
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(queue.pending).toBe(1);
    expect(finished).toBe(false);

    gate.resolve();

    await Promise.all([first, second, idle]);

    expect(finished).toBe(true);
    expect(queue.size).toBe(0);
    expect(queue.running).toBe(0);
  });

  test("rejects invalid concurrency settings", () => {
    for (const concurrency of [0, -1, 1.5, NaN]) {
      expect(
        () => new Dono({ concurrency }),
      ).toThrow(RangeError);
    }
  });

  test("allows unlimited concurrency by default", async () => {
    const queue = new Dono();

    const results = await Promise.all([
      queue.add(() => 1),
      queue.add(() => 2),
      queue.add(() => 3),
    ]);

    expect(results).toEqual([1, 2, 3]);
    await queue.onIdle();
  });

  test("executes higher-priority tasks first", async () => {
    const queue = new Dono({ concurrency: 1 });
    const executionOrder: string[] = [];
    const gate = deferred<void>();

    const blocker = queue.add(async () => {
      await gate.promise;
      executionOrder.push("blocker");
    });

    // Ensure the first task occupies the only slot.
    await Promise.resolve();
    await Promise.resolve();

    const low = queue.add(
      () => {
        executionOrder.push("low");
        return "low";
      },
      { priority: 1 },
    );

    const high = queue.add(
      () => {
        executionOrder.push("high");
        return "high";
      },
      { priority: 10 },
    );

    const normal = queue.add(
      () => {
        executionOrder.push("normal");
        return "normal";
      },
      { priority: 5 },
    );

    gate.resolve();

    await Promise.all([blocker, low, high, normal]);
    await queue.onIdle();

    expect(executionOrder).toEqual([
      "blocker",
      "high",
      "normal",
      "low",
    ]);
  });

  test("preserves FIFO order for equal priorities", async () => {
    const queue = new Dono({ concurrency: 1 });
    const executionOrder: number[] = [];
    const gate = deferred<void>();

    const blocker = queue.add(async () => {
      await gate.promise;
    });

    await Promise.resolve();
    await Promise.resolve();

    const tasks = [1, 2, 3, 4].map((value) =>
      queue.add(
        () => {
          executionOrder.push(value);
        },
        { priority: 5 },
      ),
    );

    gate.resolve();

    await Promise.all([blocker, ...tasks]);
    await queue.onIdle();

    expect(executionOrder).toEqual([1, 2, 3, 4]);
  });

  test("defaults task priority to zero", async () => {
    const queue = new Dono({ concurrency: 1 });
    const executionOrder: string[] = [];
    const gate = deferred<void>();

    const blocker = queue.add(async () => {
      await gate.promise;
    });

    await Promise.resolve();
    await Promise.resolve();

    const defaultPriority = queue.add(() => {
      executionOrder.push("default");
    });

    const higherPriority = queue.add(
      () => {
        executionOrder.push("higher");
      },
      { priority: 1 },
    );

    gate.resolve();

    await Promise.all([blocker, defaultPriority, higherPriority]);
    await queue.onIdle();

    expect(executionOrder).toEqual(["higher", "default"]);
  });

  test("rejects non-finite priorities", async () => {
    const queue = new Dono({ concurrency: 1 });

    for (const priority of [NaN, Infinity, -Infinity]) {
      await expect(
        queue.add(() => "invalid", { priority }),
      ).rejects.toThrow(RangeError);
    }

    await queue.onIdle();
  });
});
