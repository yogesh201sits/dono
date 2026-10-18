import type { QueuedTask } from "../task/task.js";

export interface SchedulerOptions {
  readonly concurrency: number;
}

export class Scheduler {
  readonly #concurrency: number;
  readonly #queue: QueuedTask[] = [];

  #running = 0;

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
    return this.#queue.length;
  }

  get running(): number {
    return this.#running;
  }

  get size(): number {
    return this.#queue.length;
  }

  add(task: QueuedTask): void {
    this.#queue.push(task);
    this.#drain();
  }

  onEmpty(): Promise<void> {
    if (this.#queue.length === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.#emptyWaiters.push(resolve);
    });
  }

  onIdle(): Promise<void> {
    if (this.#queue.length === 0 && this.#running === 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.#idleWaiters.push(resolve);
    });
  }

  #drain(): void {
    while (
      this.#running < this.#concurrency &&
      this.#queue.length > 0
    ) {
      const task = this.#queue.shift();

      if (task === undefined) {
        break;
      }

      // Reserve the slot before invoking user code.
      this.#running += 1;
      this.#run(task);
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
          // Promise settlement callbacks should not throw.
          // Still release the slot if an unexpected error occurs.
          this.#finish();
        },
      );
  }

  #finish(): void {
    this.#running -= 1;
    this.#drain();
  }

  #notifyEmpty(): void {
    if (this.#queue.length !== 0) {
      return;
    }

    const waiters = this.#emptyWaiters.splice(0);

    for (const resolve of waiters) {
      resolve();
    }
  }

  #notifyIdle(): void {
    if (this.#queue.length !== 0 || this.#running !== 0) {
      return;
    }

    const waiters = this.#idleWaiters.splice(0);

    for (const resolve of waiters) {
      resolve();
    }
  }
}
