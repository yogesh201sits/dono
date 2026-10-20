
import { describe, expect, test } from "bun:test";
import { EventEmitter } from "../src/events/event-emitter.js";

interface TestEvents {
  message: { readonly value: string };
  count: number;
}

describe("EventEmitter", () => {
  test("notifies registered listeners", () => {
    const emitter = new EventEmitter<TestEvents>();
    const received: string[] = [];

    emitter.on("message", ({ value }) => received.push(value));
    emitter.emit("message", { value: "hello" });

    expect(received).toEqual(["hello"]);
  });

  test("supports removing listeners", () => {
    const emitter = new EventEmitter<TestEvents>();
    const listener = () => {};

    emitter.on("count", listener);
    expect(emitter.listenerCount("count")).toBe(1);

    emitter.off("count", listener);
    expect(emitter.listenerCount("count")).toBe(0);
  });

  test("invokes once listeners only once", () => {
    const emitter = new EventEmitter<TestEvents>();
    let calls = 0;

    emitter.once("count", () => calls++);
    emitter.emit("count", 1);
    emitter.emit("count", 2);

    expect(calls).toBe(1);
  });

  test("isolates listener exceptions", () => {
    const emitter = new EventEmitter<TestEvents>();
    const received: number[] = [];

    emitter.on("count", () => {
      throw new Error("listener failed");
    });
    emitter.on("count", (value) => received.push(value));

    expect(() => emitter.emit("count", 42)).not.toThrow();
    expect(received).toEqual([42]);
  });

  test("removes all listeners", () => {
    const emitter = new EventEmitter<TestEvents>();

    emitter.on("count", () => {});
    emitter.on("message", () => {});

    emitter.removeAllListeners();

    expect(emitter.listenerCount("count")).toBe(0);
    expect(emitter.listenerCount("message")).toBe(0);
  });

  test("removes listeners for only the selected event", () => {
    const emitter = new EventEmitter<TestEvents>();

    emitter.on("count", () => {});
    emitter.on("message", () => {});

    emitter.removeAllListeners("count");

    expect(emitter.listenerCount("count")).toBe(0);
    expect(emitter.listenerCount("message")).toBe(1);
  });
});
