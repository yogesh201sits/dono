
import { PriorityQueue } from "../queue/priority-queue";
import { DonoClearedError, DonoClosedError } from "../errors/duno-errors";
import type { QueuedTask } from "../task/task";

export interface SchedulerOptions {
  readonly concurrency: number;
}

export interface ScheduleOptions {
  readonly priority?: number;
}

interface QueueEntry {
  readonly task: QueuedTask;
  readonly priority: number;
  readonly sequence: number;
}

export class Scheduler {
  readonly #concurrency: number;

  readonly #queue = new PriorityQueue<QueueEntry>((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }

    return a.sequence - b.sequence;
  });

  #running = 0;
  #nextSequence = 0;
  #paused = false;
  #closed = false;
  #closePromise: Promise<void> | undefined;

  readonly #emptyWaiters: Array<() => void> = [];
  readonly #idleWaiters: Array<() => void> = [];

  constructor(options: SchedulerOptions) {
    const { concurrency } = options;

    if (
      concurrency !== Infinity &&
      (!Number.isInteger(concurrency) || concurrency < 1)
    ) {
      throw new RangeError(
        "concurrency must be a positive integer or Infinity",
      );
    }

    this.#concurrency = concurrency;
  }

  get pending(): number {
    return this.#queue.size;
  }

  get running(): number {
    return this.#running;
  }

  get size(): number {
    return this.#queue.size;
  }

  get isPaused(): boolean {
    return this.#paused;
  }

  get isClosed(): boolean {
    return this.#closed;
  }

  add(task: QueuedTask, options: ScheduleOptions = {}): void {
    if (this.#closed) {
      throw new DonoClosedError();
    }

    const priority = options.priority ?? 0;

    if (!Number.isFinite(priority)) {
      throw new RangeError("priority must be a finite number");
    }

    this.#queue.push({
      task,
      priority,
      sequence: this.#nextSequence++,
    });

    this.#drain();
  }

  pause(): void {
  if (this.#closed) {
    return;
  }

  this.#paused = true;
}

  start(): void {
    if (this.#closed && this.#queue.isEmpty) {
      return;
    }

    this.#paused = false;
    this.#drain();
  }

  clear(): void {
    while (!this.#queue.isEmpty) {
      const entry = this.#queue.pop();

      entry?.task.reject(new DonoClearedError());
    }

    this.#notifyEmpty();
    this.#notifyIdle();
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      return this.#closePromise;
    }

    this.#closed = true;

    // Graceful close must not hang indefinitely because the queue
    // was paused. Running work continues and pending work is drained.
    this.#paused = false;
    this.#drain();

    this.#closePromise = this.onIdle();

    return this.#closePromise;
  }

  onEmpty(): Promise<void> {
    if (this.#queue.isEmpty) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.#emptyWaiters.push(resolve);
    });
  }

  onIdle(): Promise<void> {
    if (this.#queue.isEmpty && this.#running === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }

  #drain(): void {
    while (
      !this.#paused &&
      this.#running < this.#concurrency &&
      !this.#queue.isEmpty
    ) {
      const entry = this.#queue.pop();

      if (entry === undefined) {
        break;
      }

      this.#running += 1;
      this.#run(entry.task);
    }

    this.#notifyEmpty();
    this.#notifyIdle();
  }

  #run(task: QueuedTask): void {
    Promise.resolve()
      .then(() => task.run())
      .then(
        (result) => {
          task.resolve(result);
        },
        (error: unknown) => {
          task.reject(error);
        },
      )
      .then(
        () => {
          this.#finish();
        },
        () => {
          this.#finish();
        },
      );
  }

  #finish(): void {
    this.#running -= 1;
    this.#drain();
  }

  #notifyEmpty(): void {
    if (!this.#queue.isEmpty) {
      return;
    }

    const waiters = this.#emptyWaiters.splice(0);

    for (const resolve of waiters) {
      resolve();
    }
  }

  #notifyIdle(): void {
    if (!this.#queue.isEmpty || this.#running !== 0) {
      return;
    }

    const waiters = this.#idleWaiters.splice(0);

    for (const resolve of waiters) {
      resolve();
    }
  }
}
