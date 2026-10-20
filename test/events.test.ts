
import { describe, expect, test } from "bun:test";
import { Dono } from "../src/index.js";

describe("Dono events", () => {
  test("emits active and completed for a successful task", async () => {
    const queue = new Dono();
    const events: string[] = [];

    queue.on("active", ({ taskId, attempt }) => {
      events.push(`active:${taskId}:${attempt}`);
    });

    queue.on("completed", ({ taskId }) => {
      events.push(`completed:${taskId}`);
    });

    await expect(queue.add(() => 42)).resolves.toBe(42);
    await queue.onIdle();

    expect(events).toEqual([
      "active:0:1",
      "completed:0",
    ]);
  });

  test("does not let a throwing listener break task execution", async () => {
    const queue = new Dono();

    queue.on("active", () => {
      throw new Error("observer failure");
    });

    await expect(queue.add(() => "success")).resolves.toBe("success");
  });

  test("supports removing listeners", async () => {
    const queue = new Dono();
    let calls = 0;
    const listener = () => {
      calls += 1;
    };

    queue.on("active", listener);
    queue.off("active", listener);

    await queue.add(() => "success");

    expect(calls).toBe(0);
  });
});
