import { Dono } from "../src/index";

async function main(): Promise<void> {
  const queue = new Dono({ concurrency: 2 });

  console.log("Starting Dono example...\n");

  const tasks = Array.from({ length: 5 }, (_, index) =>
    queue.add(async () => {
      const taskId = index + 1;

      console.log(`Task ${taskId} started`);

      // Simulate asynchronous work.
      await Bun.sleep(500);

      console.log(`Task ${taskId} completed`);

      return `Result from task ${taskId}`;
    }),
  );

  // Promise.all preserves input order in the results array.
  const results = await Promise.all(tasks);

  console.log("\nResults:");
  results.forEach((result) => console.log(result));

  await queue.onIdle();

  console.log("\nAll tasks are finished.");
}

main().catch((error: unknown) => {
  console.error("Example failed:", error);
  process.exitCode = 1;
});
