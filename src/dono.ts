import { Scheduler } from "./scheduler/scheduler.js";

export interface DonoOptions {
  /**
   * Maximum number of tasks executing simultaneously.
   * Defaults to Infinity (unlimited concurrency).
   */
  readonly concurrency?: number;
}

export interface DonoAddOptions {
  /**
   * Higher numeric priorities execute first.
   * Defaults to 0.
   */
  readonly priority?: number;
}

export type DonoTask<T> = () => T | PromiseLike<T>;

export class Dono {
  readonly #scheduler: Scheduler;

  constructor(options: DonoOptions = {}) {
    this.#scheduler = new Scheduler({
      concurrency: options.concurrency ?? Infinity,
    });
  }

  get pending(): number {
    return this.#scheduler.pending;
  }

  get running(): number {
    return this.#scheduler.running;
  }

  get size(): number {
    return this.#scheduler.size;
  }

  add<T>(
    task: DonoTask<T>,
    options: DonoAddOptions = {},
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.#scheduler.add(
        {
          run: task,
          resolve: (value) => resolve(value as T),
          reject,
        },
        options,
      );
    });
  }

  onEmpty(): Promise<void> {
    return this.#scheduler.onEmpty();
  }

  onIdle(): Promise<void> {
    return this.#scheduler.onIdle();
  }
}
