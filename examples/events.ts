import { Dono } from "../src/index.js";

async function main(): Promise<void> {
  const queue = new Dono({ concurrency: 2 });

  console.log("Starting Dono event example...\n");

  // Fired when a task attempt starts.
  queue.on("active", ({ taskId, attempt }) => {
    console.log(`[active] Task ${taskId}, attempt ${attempt}`);
  });

  // Fired when a task completes successfully.
  queue.on("completed", ({ taskId, duration }) => {
    console.log(
      `[completed] Task ${taskId} finished in ${duration} ms`,
    );
  });

  // Fired when a task fails permanently.
  queue.on("error", ({ taskId, error }) => {
    console.log(
      `[error] Task ${taskId}:`,
      error instanceof Error ? error.message : error,
    );
  });

  // Fired when a failed attempt will be retried.
  queue.on("retry", ({ taskId, attempt, delay }) => {
    console.log(
      `[retry] Task ${taskId}, attempt ${attempt}; retrying after ${delay} ms`,
    );
  });

  // Fired when no tasks are pending.
  queue.on("empty", ({ pending }) => {
    console.log(`[empty] Pending tasks: ${pending}`);
  });

  // Fired when no tasks are pending or running.
  queue.on("idle", ({ pending, running }) => {
    console.log(
      `[idle] Pending: ${pending}, running: ${running}`,
    );
  });

  let attempts = 0;

  const tasks = [
    queue.add(async () => {
      await Bun.sleep(150);
      return "Successful task";
    }),

    queue.add(
      async () => {
        attempts++;

        if (attempts < 2) {
          throw new Error("Temporary failure");
        }

        return "Task succeeded after retry";
      },
      {
        retries: 2,
        retryDelay: 100,
      },
    ),

    queue.add(async () => {
      await Bun.sleep(50);
      throw new Error("Intentional task failure");
    }),
  ];

  const results = await Promise.allSettled(tasks);

  console.log("\nTask results:");

  for (const result of results) {
    if (result.status === "fulfilled") {
      console.log("Success:", result.value);
    } else {
      console.log(
        "Rejected:",
        result.reason instanceof Error
          ? result.reason.message
          : result.reason,
      );
    }
  }

  await queue.onIdle();
  console.log("\nEvent example finished.");
}

main().catch((error: unknown) => {
  console.error("Event example failed:", error);
  process.exitCode = 1;
});
