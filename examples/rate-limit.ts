import { Dono } from "../src/index.js";

async function main(): Promise<void> {
  const queue = new Dono({
    concurrency: 2,
    intervalCap: 3,
    interval: 1_000,
  });

  const startTimes: number[] = [];
  const start = Date.now();

  console.log("Starting rate-limit example...\n");

  const tasks = Array.from({ length: 8 }, (_, index) =>
    queue.add(async () => {
      const elapsed = Date.now() - start;
      startTimes.push(elapsed);

      console.log(
        `Task ${index + 1} started at ${elapsed} ms`,
      );

      await Bun.sleep(200);

      return `Task ${index + 1} completed`;
    }),
  );

  const results = await Promise.all(tasks);

  console.log("\nResults:");
  results.forEach(console.log);

  console.log("\nTotal duration:", `${Date.now() - start} ms`);
  console.log("Recorded task starts:", startTimes.length);

  await queue.onIdle();
}

main().catch((error: unknown) => {
  console.error("Rate-limit example failed:", error);
  process.exitCode = 1;
});
