import { Scheduler } from "./scheduler/scheduler.js";

export interface DonoOptions {
  /**
   * Maximum number of tasks executing simultaneously.
   * Defaults to Infinity (unlimited concurrency).
   */
  readonly concurrency?: number;
}

export type DonoTask<T> = () => T | PromiseLike<T>;

export class Dono {
  readonly #scheduler: Scheduler;

  constructor(options: DonoOptions = {}) {
    this.#scheduler = new Scheduler({
      concurrency: options.concurrency ?? Infinity,
    });
  }

  /** Number of tasks waiting to start. */
  get pending(): number {
    return this.#scheduler.pending;
  }

  /** Number of tasks currently executing. */
  get running(): number {
    return this.#scheduler.running;
  }

  /** Total number of tasks waiting to start. */
  get size(): number {
    return this.#scheduler.size;
  }

  /**
   * Add a task to the queue.
   * The returned promise resolves with the task result or rejects
   * with the task's original error.
   */
  add<T>(task: DonoTask<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#scheduler.add({
        run: task,
        resolve: (value) => resolve(value as T),
        reject,
      });
    });
  }

  /**
   * Resolve when no tasks are waiting to start.
   * Running tasks do not prevent resolution.
   */
  onEmpty(): Promise<void> {
    return this.#scheduler.onEmpty();
  }

  /**
   * Resolve when no tasks are waiting or executing.
   */
  onIdle(): Promise<void> {
    return this.#scheduler.onIdle();
  }
}
