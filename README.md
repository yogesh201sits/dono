# Dono

**A lightweight, priority-aware asynchronous task scheduler built with TypeScript and Bun.**

Dono provides controlled execution of asynchronous tasks with concurrency limits, priority scheduling, rate limiting, retries, cancellation, timeouts, backpressure, and lifecycle events.

## Features

- **Concurrency control** — limit how many tasks run simultaneously.
- **Priority scheduling** — execute higher-priority tasks first while preserving FIFO order for equal priorities.
- **Rate limiting** — cap the number of task starts within a configured interval.
- **Retries** — retry failed tasks with optional delays and exponential backoff.
- **Cancellation** — cancel pending work and pass `AbortSignal` to running tasks.
- **Timeouts** — reject tasks whose execution exceeds the configured timeout.
- **Backpressure** — limit pending queue capacity.
- **Lifecycle controls** — pause, resume, clear, and close the scheduler.
- **Typed events** — observe task execution, failures, retries, and queue state.
- **TypeScript-first** — typed task results and public APIs.
- **Zero runtime dependencies** — built using native JavaScript and TypeScript capabilities.

## Requirements

- [Bun](https://bun.sh/)
- TypeScript support through the project's existing build configuration

## Getting started

Clone the repository and install development dependencies:

```bash
git clone https://github.com/yogesh201sits/dono
cd Dono
bun install
```

Run the test suite:

```bash
bun test
```

Run TypeScript typechecking and the build using the scripts configured in `package.json`:

```bash
bun run typecheck
bun run build
```

## Quick start

```ts
import { Dono } from "./src/index.js";

const queue = new Dono({ concurrency: 2 });

const tasks = [
  queue.add(async () => {
    await Bun.sleep(100);
    return "Task A completed";
  }),
  queue.add(async () => {
    await Bun.sleep(50);
    return "Task B completed";
  }),
  queue.add(async () => "Task C completed"),
];

const results = await Promise.all(tasks);

console.log(results);

await queue.onIdle();
```

Dono schedules the tasks according to its concurrency limit and resolves each `add()` promise with that task's result.

## Basic usage

### Concurrency

```ts
const queue = new Dono({ concurrency: 3 });
```

At most three tasks execute concurrently.

### Priority scheduling

```ts
const queue = new Dono({ concurrency: 1 });

const low = queue.add(() => "low", { priority: 1 });
const high = queue.add(() => "high", { priority: 10 });

console.log(await Promise.all([low, high]));
```

Higher-priority queued tasks are selected before lower-priority queued tasks. Tasks already running are not preempted.

### Retries

```ts
const queue = new Dono();

const result = await queue.add(
  async () => {
    // Perform an operation that may fail.
    return "success";
  },
  {
    retries: 3,
    retryDelay: 200,
    backoff: true,
  },
);

console.log(result);
```

`retries` specifies the maximum number of additional attempts after the initial attempt. With backoff enabled, the retry delay doubles after each failed attempt.

### Cancellation

```ts
const queue = new Dono();
const controller = new AbortController();

const result = queue.add(
  async (signal) => {
    signal.throwIfAborted();

    // Pass signal to APIs that support cancellation.
    return "completed";
  },
  { signal: controller.signal },
);

controller.abort();

try {
  console.log(await result);
} catch (error) {
  console.error("Task did not complete:", error);
}
```

Tasks should cooperate with cancellation by checking the signal or passing it to supported APIs. Aborting a signal does not forcibly terminate arbitrary JavaScript code.

### Timeouts

```ts
const queue = new Dono();

try {
  await queue.add(
    async (signal) => {
      signal.throwIfAborted();
      return "completed";
    },
    { timeout: 5_000 },
  );
} catch (error) {
  console.error("Task failed or timed out:", error);
}
```

The timeout is specified in milliseconds.

### Rate limiting

```ts
const queue = new Dono({
  intervalCap: 5,
  interval: 1_000,
});

const results = await Promise.all(
  Array.from({ length: 10 }, (_, index) =>
    queue.add(() => index),
  ),
);

console.log(results);
```

This configures a maximum of five task starts per one-second interval.

### Backpressure

```ts
import { Dono, DonoQueueFullError } from "./src/index.js";

const queue = new Dono({
  concurrency: 2,
  maxQueueSize: 10,
});

try {
  await queue.add(() => "completed");
} catch (error) {
  if (error instanceof DonoQueueFullError) {
    console.error("The pending queue is full.");
  } else {
    throw error;
  }
}
```

`maxQueueSize` limits pending tasks. Tasks that cannot be accepted because the pending queue is full are rejected.

### Events

```ts
const queue = new Dono();

queue.on("active", ({ taskId, attempt }) => {
  console.log(`Task ${taskId} started, attempt ${attempt}`);
});

queue.on("completed", ({ taskId, duration }) => {
  console.log(`Task ${taskId} completed in ${duration} ms`);
});

queue.on("error", ({ taskId, error }) => {
  console.error(`Task ${taskId} failed:`, error);
});

await queue.add(() => "hello");
await queue.onIdle();
```

Dono also supports `once()` and `off()` for managing event listeners. Listener exceptions are isolated from task execution.

## Queue lifecycle

```ts
queue.pause();           // Stop starting queued tasks.
queue.start();           // Resume scheduling.
queue.clear();           // Reject pending tasks.
await queue.onEmpty();   // Wait until no tasks are pending.
await queue.onIdle();    // Wait until no tasks are pending or running.
await queue.close();     // Stop accepting work and drain accepted work.
```

The `pending`, `running`, `size`, `isPaused`, and `isClosed` getters expose the queue's current state.

## API reference

See [docs/API.md](docs/API.md) for constructor options, task options, events, methods, and error behavior.

## Examples

Runnable examples are available in the `examples/` directory:

- `basic.ts` — concurrency and results
- `priority.ts` — task prioritization
- `retry.ts` — retries and backoff
- `cancellation.ts` — cancellation and timeouts
- `rate-limit.ts` — interval-based rate limiting
- `events.ts` — event subscriptions and observability

Run an example from the repository root:

```bash
bun run examples/basic.ts
```

## Testing

```bash
bun test
bun run typecheck
bun run build
```

## Project structure

```text
Dono/
├── src/
│   ├── errors/
│   ├── events/
│   ├── queue/
│   ├── scheduler/
│   ├── task/
│   └── index.ts
├── test/
├── examples/
├── docs/
├── package.json
└── README.md
```

## Design goals

- Small, focused API
- Predictable asynchronous scheduling
- Explicit task lifecycle management
- Strong TypeScript types
- No runtime dependencies
- Testable, modular implementation

## Project status

Dono is an actively developed project. See the test suite and API documentation for the currently implemented behavior.

## License

See [LICENSE](LICENSE) for license information.
