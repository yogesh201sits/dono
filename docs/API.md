# Dono API Reference

Dono is an asynchronous task scheduler that supports concurrency limits, priority scheduling, rate limiting, retries, cancellation, timeouts, backpressure, lifecycle controls, and typed events.

## 1. Importing Dono

```ts
import { Dono } from "../src/index.js";
import type {
  DonoOptions,
  DonoAddOptions,
  DonoTask,
  DonoEvents,
} from "../src/index.js";
```

Error classes are also exported from the package entry point, including `DonoCancelledError`, `DonoTimeoutError`, `DonoClearedError`, `DonoClosedError`, and `DonoQueueFullError`. Check `src/index.ts` for the exact exported names.

## 2. Constructor

```ts
const queue = new Dono(options);
```

### `DonoOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `concurrency` | `number` | `Infinity` | Maximum number of concurrently running tasks. |
| `intervalCap` | `number` | — | Maximum number of task starts allowed in a configured interval. |
| `interval` | `number` | — | Rate-limit interval in milliseconds. |
| `maxQueueSize` | `number` | — | Maximum number of pending tasks. |

`intervalCap` and `interval` must be provided together. See the implementation and tests for validation rules and accepted values.

Example:

```ts
const queue = new Dono({
  concurrency: 3,
  intervalCap: 10,
  interval: 1_000,
  maxQueueSize: 100,
});
```

## 3. Adding tasks

```ts
queue.add(task, options);
```

`add()` returns a promise that resolves with the task's result or rejects when the task fails, is cancelled, times out, or cannot be accepted.

### `DonoTask<T>`

```ts
type DonoTask<T> = (
  signal: AbortSignal,
) => T | PromiseLike<T>;
```

The scheduler supplies an `AbortSignal` so tasks can cooperate with cancellation and timeouts.

Example:

```ts
const result = await queue.add(async (signal) => {
  signal.throwIfAborted();

  await Bun.sleep(100);

  return { success: true };
});
```

### `DonoAddOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `priority` | `number` | `0` | Scheduling priority. Higher values run before lower values among queued tasks. |
| `signal` | `AbortSignal` | — | External signal used to cancel the task. |
| `timeout` | `number` | — | Maximum task-attempt duration in milliseconds. |
| `retries` | `number` | `0` | Maximum additional attempts after the initial failure. |
| `retryDelay` | `number` | `0` | Initial delay before retrying, in milliseconds. |
| `backoff` | `boolean` | `false` | Doubles the delay after each failed attempt when enabled. |

Example:

```ts
const result = await queue.add(
  async () => {
    return "completed";
  },
  {
    priority: 5,
    retries: 3,
    retryDelay: 250,
    backoff: true,
  },
);
```

Retries may execute a task more than once. Make side-effecting operations safe to repeat where possible.

## 4. Queue state

### Read-only getters

| Getter | Return type | Description |
|---|---|---|
| `pending` | `number` | Number of pending tasks. |
| `running` | `number` | Number of currently running tasks or attempts, as tracked by the scheduler. |
| `size` | `number` | Total queued and running work tracked by the scheduler. |
| `isPaused` | `boolean` | Whether the scheduler is paused. |
| `isClosed` | `boolean` | Whether the scheduler has been closed. |

These values describe the scheduler's current state and can change as tasks are added, started, retried, or settled.

## 5. Lifecycle methods

### `pause(): void`

Pauses scheduling of pending work. Tasks already running are not automatically stopped.

```ts
queue.pause();
```

### `start(): void`

Resumes scheduling after a pause.

```ts
queue.start();
```

### `clear(): void`

Clears pending work and rejects the promises associated with cleared tasks. Already-running tasks are preserved.

```ts
queue.clear();
```

### `close(): Promise<void>`

Closes the scheduler to new work and returns a promise that resolves when accepted work has drained, according to the scheduler's close semantics.

```ts
await queue.close();
```

### `onEmpty(): Promise<void>`

Resolves when there are no pending tasks. Running tasks may still exist.

```ts
await queue.onEmpty();
```

### `onIdle(): Promise<void>`

Resolves when there are no pending or running tasks.

```ts
await queue.onIdle();
```

## 6. Events

Dono provides typed event listeners through `on()`, `off()`, and `once()`.

```ts
queue.on(event, listener);
queue.off(event, listener);
queue.once(event, listener);
```

Each method returns the queue instance, allowing chaining.

### Available events

| Event | Payload | Meaning |
|---|---|---|
| `active` | `DonoTaskEvent` | A task attempt has started. |
| `completed` | `DonoCompletedEvent` | A task has completed successfully. |
| `error` | `DonoErrorEvent` | A task has reached a terminal error state. |
| `retry` | `DonoRetryEvent` | A failed attempt will be retried. |
| `empty` | `DonoQueueEvent` | No tasks remain pending. |
| `idle` | `DonoIdleEvent` | No tasks remain pending or running. |

### Event payloads

```ts
interface DonoTaskEvent {
  readonly taskId: number;
  readonly attempt: number;
}

interface DonoCompletedEvent extends DonoTaskEvent {
  readonly duration: number;
}

interface DonoErrorEvent extends DonoTaskEvent {
  readonly error: unknown;
}

interface DonoRetryEvent extends DonoTaskEvent {
  readonly error: unknown;
  readonly delay: number;
}

interface DonoQueueEvent {
  readonly pending: number;
}

interface DonoIdleEvent extends DonoQueueEvent {
  readonly running: number;
}
```

Example:

```ts
queue.on("active", ({ taskId, attempt }) => {
  console.log(`Task ${taskId}, attempt ${attempt}`);
});

queue.on("completed", ({ taskId, duration }) => {
  console.log(`Task ${taskId} completed in ${duration} ms`);
});

queue.on("error", ({ taskId, error }) => {
  console.error(`Task ${taskId} failed`, error);
});
```

Listener exceptions are isolated so that observer callbacks do not interrupt task execution.

## 7. Errors

Dono exposes specific errors to help distinguish failure conditions.

| Error | Meaning |
|---|---|
| `DonoCancelledError` | A task was cancelled. |
| `DonoTimeoutError` | A task attempt exceeded its configured timeout. |
| `DonoClearedError` | Pending work was cleared. |
| `DonoClosedError` | Work was submitted after closure. |
| `DonoQueueFullError` | The pending queue reached its configured capacity. |

Use `instanceof` when you need to handle a specific error:

```ts
import {
  Dono,
  DonoQueueFullError,
} from "../src/index.js";

const queue = new Dono({ maxQueueSize: 10 });

try {
  await queue.add(() => "work");
} catch (error) {
  if (error instanceof DonoQueueFullError) {
    console.error("Queue capacity reached.");
  } else {
    throw error;
  }
}
```

## 8. Design considerations

- Task functions should cooperate with cancellation by checking or forwarding their `AbortSignal`.
- Timeouts cannot forcibly terminate arbitrary JavaScript execution.
- Retried operations may execute more than once.
- Priority scheduling does not preempt tasks that have already started.
- `onEmpty()` and `onIdle()` represent different conditions.
- Event listeners should be removed when no longer needed in long-lived applications.

## 9. Related resources

- [README](../README.md)
- [Basic example](../examples/basic.ts)
- [Priority example](../examples/priority.ts)
- [Retry example](../examples/retry.ts)
- [Cancellation example](../examples/cancellation.ts)
- [Rate-limit example](../examples/rate-limit.ts)
- [Events example](../examples/events.ts)
