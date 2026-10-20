
import { Dono } from "../src/index.js";

async function main(): Promise<void> {
  const queue = new Dono({ concurrency: 2 });

  // Example 1: Cancellation using AbortController.
  console.log("Example 1: Cancellation");

  const controller = new AbortController();

  const cancellableTask = queue.add(
    async (signal) => {
      console.log("Cancellable task started");

      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(signal.reason);
          return;
        }

        signal.addEventListener(
          "abort",
          () => reject(signal.reason),
          { once: true },
        );

        setTimeout(resolve, 5_000);
      });

      return "Cancellation task completed";
    },
    { signal: controller.signal },
  );

  // Allow the task to start before cancelling it.
  await Bun.sleep(50);
  controller.abort();

  try {
    await cancellableTask;
  } catch (error) {
    console.log("Cancellation result:", error);
  }

  // Example 2: Timeout.
  console.log("\nExample 2: Timeout");

  try {
    await queue.add(
      async (signal) => {
        console.log("Timed task started");

        await new Promise<void>((resolve, reject) => {
          if (signal.aborted) {
            reject(signal.reason);
            return;
          }

          signal.addEventListener(
            "abort",
            () => reject(signal.reason),
            { once: true },
          );

          setTimeout(resolve, 5_000);
        });

        return "Timed task completed";
      },
      { timeout: 200 },
    );
  } catch (error) {
    console.log("Timeout result:", error);
  }

  await queue.onIdle();
  console.log("\nCancellation examples finished.");
}

main().catch((error: unknown) => {
  console.error("Cancellation example failed:", error);
  process.exitCode = 1;
});
