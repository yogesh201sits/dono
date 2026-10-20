
import { Dono } from "../src/index.js";

async function main(): Promise<void> {
  const queue = new Dono({ concurrency: 2 });
  let attempts = 0;

  console.log("Starting retry example...\n");

  const result = await queue.add(
    async () => {
      attempts++;
      console.log(`Attempt ${attempts}`);

      // Simulate a task that fails twice before succeeding.
      if (attempts < 3) {
        throw new Error(`Temporary failure on attempt ${attempts}`);
      }

      return "Task completed successfully";
    },
    {
      retries: 3,
      retryDelay: 500,
      backoff: true,
    },
  );

  console.log("\nResult:", result);
  console.log("Total attempts:", attempts);

  await queue.onIdle();
}

main().catch((error: unknown) => {
  console.error("Retry example failed:", error);
  process.exitCode = 1;
});
