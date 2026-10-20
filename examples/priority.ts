import { Dono } from "../src/index.js";

async function main(): Promise<void> {
  const queue = new Dono({ concurrency: 1 });
  const executionOrder: string[] = [];

  // Hold the first task so the remaining tasks accumulate in the queue.
  let releaseFirstTask!: () => void;

  const firstTaskGate = new Promise<void>((resolve) => {
    releaseFirstTask = resolve;
  });

  const firstTask = queue.add(async () => {
    console.log("Running blocker task...");
    await firstTaskGate;
    executionOrder.push("blocker");
    return "blocker";
  });

  // Ensure the blocker has started before submitting other tasks.
  await new Promise<void>((resolve) => {
    const check = (): void => {
      if (queue.running === 1) {
        resolve();
      } else {
        setTimeout(check, 0);
      }
    };

    check();
  });

  const lowPriority = queue.add(
    () => {
      executionOrder.push("low");
      return "low";
    },
    { priority: 1 },
  );

  const highPriority = queue.add(
    () => {
      executionOrder.push("high");
      return "high";
    },
    { priority: 10 },
  );

  const mediumPriority = queue.add(
    () => {
      executionOrder.push("medium");
      return "medium";
    },
    { priority: 5 },
  );

  releaseFirstTask();

  await Promise.all([
    firstTask,
    lowPriority,
    highPriority,
    mediumPriority,
  ]);

  console.log("Execution order:", executionOrder);
  // Expected: ["blocker", "high", "medium", "low"]

  await queue.onIdle();
}

main().catch((error: unknown) => {
  console.error("Priority example failed:", error);
  process.exitCode = 1;
});