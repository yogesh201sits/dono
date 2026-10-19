
import { describe, expect, test } from "bun:test";
import {
  Dono,
  DonoCancelledError,
  DonoClearedError,
} from "../src/index.js";

describe("Dono retries", () => {
  test("does not retry a successful task", async () => {
    const queue = new Dono();
    let attempts = 0;

    const result = await queue.add(
      () => {
        attempts += 1;
        return "success";
      },
      { retries: 3 },
    );

    expect(result).toBe("success");
    expect(attempts).toBe(1);
  });

  test("retries until the task succeeds", async () => {
    const queue = new Dono();
    let attempts = 0;

    const result = await queue.add(
      () => {
        attempts += 1;

        if (attempts < 3) {
          throw new Error("temporary failure");
        }

        return "recovered";
      },
      { retries: 3 },
    );

    expect(result).toBe("recovered");
    expect(attempts).toBe(3);
  });

  test("rejects with the last error when retries are exhausted", async () => {
    const queue = new Dono();
    let attempts = 0;
    const finalError = new Error("failure 3");

    const result = queue.add(
      () => {
        attempts += 1;
        throw attempts === 3
          ? finalError
          : new Error(`failure ${attempts}`);
      },
      { retries: 2 },
    );

    await expect(result).rejects.toBe(finalError);
    expect(attempts).toBe(3);
  });

  test("supports a retry delay", async () => {
    const queue = new Dono();
    const startTimes: number[] = [];
    let attempts = 0;

    const result = await queue.add(
      () => {
        startTimes.push(Date.now());
        attempts += 1;

        if (attempts === 1) {
          throw new Error("retry me");
        }

        return "done";
      },
      { retries: 1, retryDelay: 30 },
    );

    expect(result).toBe("done");
    expect(attempts).toBe(2);
    expect(startTimes[1]! - startTimes[0]!).toBeGreaterThanOrEqual(20);
  });

  test("cancels a retry while it is waiting to be requeued", async () => {
    const queue = new Dono();
    const controller = new AbortController();
    let attempts = 0;

    const result = queue.add(
      () => {
        attempts += 1;
        throw new Error("retry me");
      },
      {
        retries: 1,
        retryDelay: 100,
        signal: controller.signal,
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queue.pending).toBe(1);

    controller.abort();

    await expect(result).rejects.toBeInstanceOf(DonoCancelledError);
    await queue.onIdle();
    expect(attempts).toBe(1);
    expect(queue.pending).toBe(0);
  });

  test("clear rejects retries waiting to be requeued", async () => {
    const queue = new Dono();
    let attempts = 0;

    const result = queue.add(
      () => {
        attempts += 1;
        throw new Error("retry me");
      },
      { retries: 1, retryDelay: 100 },
    );

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(queue.pending).toBe(1);

    queue.clear();

    await expect(result).rejects.toBeInstanceOf(DonoClearedError);
    await queue.onIdle();
    expect(attempts).toBe(1);
    expect(queue.pending).toBe(0);
  });

  test("close waits for delayed retries to finish", async () => {
    const queue = new Dono();
    let attempts = 0;

    const result = queue.add(
      () => {
        attempts += 1;
        if (attempts === 1) throw new Error("retry me");
        return "done";
      },
      { retries: 1, retryDelay: 10 },
    );

    const closed = queue.close();

    await expect(result).resolves.toBe("done");
    await closed;
    expect(attempts).toBe(2);
    expect(queue.pending).toBe(0);
  });

  test("retries timed-out attempts with a fresh abort signal", async () => {
    const queue = new Dono();
    const signals: AbortSignal[] = [];
    let attempts = 0;

    const result = queue.add(
      (signal) => {
        attempts += 1;
        signals.push(signal);

        if (attempts === 1) {
          return new Promise<string>((resolve) => {
            signal.addEventListener(
              "abort",
              () => resolve("late result"),
              { once: true },
            );
          });
        }

        return "recovered";
      },
      { retries: 1, retryDelay: 1, timeout: 10 },
    );

    await expect(result).resolves.toBe("recovered");
    await queue.onIdle();
    expect(attempts).toBe(2);
    expect(signals[0]!.aborted).toBe(true);
    expect(signals[1]!.aborted).toBe(false);
  });

  test("rejects invalid retry settings", () => {
    const queue = new Dono();

    expect(() => queue.add(() => 1, { retries: -1 })).toThrow(
      RangeError,
    );
    expect(() => queue.add(() => 1, { retries: 1.5 })).toThrow(
      RangeError,
    );
    expect(() => queue.add(() => 1, { retryDelay: -1 })).toThrow(
      RangeError,
    );
    expect(() => queue.add(() => 1, { retryDelay: Infinity })).toThrow(
      RangeError,
    );
  });
});
