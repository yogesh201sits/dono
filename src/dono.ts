
import {
  Scheduler,
  validateRetryOptions,
} from "./scheduler/scheduler.js";

export interface DonoOptions {
  readonly concurrency?: number;
  readonly intervalCap?: number;
  readonly interval?: number;
  readonly maxQueueSize?: number;
}

export interface DonoAddOptions {
  readonly priority?: number;
  readonly signal?: AbortSignal;
  readonly timeout?: number;
  /** Maximum number of additional attempts after the first failure. */
  readonly retries?: number;
  /** Initial delay between failed attempts, in milliseconds. */
  readonly retryDelay?: number;
  /** Double the delay after each failed attempt. */
  readonly backoff?: boolean;
}

export type DonoTask<T> = (
  signal: AbortSignal,
) => T | PromiseLike<T>;

export class Dono {
  readonly #scheduler: Scheduler;

  constructor(options: DonoOptions = {}) {
    this.#scheduler = new Scheduler({
      concurrency: options.concurrency ?? Infinity,
      ...(options.intervalCap !== undefined
        ? { intervalCap: options.intervalCap }
        : {}),
      ...(options.interval !== undefined
        ? { interval: options.interval }
        : {}),
      ...(options.maxQueueSize !== undefined
        ? { maxQueueSize: options.maxQueueSize }
        : {}),
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

  get isPaused(): boolean {
    return this.#scheduler.isPaused;
  }

  get isClosed(): boolean {
    return this.#scheduler.isClosed;
  }

  add<T>(
    task: DonoTask<T>,
    options: DonoAddOptions = {},
  ): Promise<T> {
    validateRetryOptions(options);

    return new Promise<T>((resolve, reject) => {
      this.#scheduler.add(
        {
          run: (signal) => task(signal),
          resolve: (value) => resolve(value as T),
          reject,
        },
        options,
      );
    });
  }

  pause(): void {
    this.#scheduler.pause();
  }

  start(): void {
    this.#scheduler.start();
  }

  clear(): void {
    this.#scheduler.clear();
  }

  close(): Promise<void> {
    return this.#scheduler.close();
  }

  onEmpty(): Promise<void> {
    return this.#scheduler.onEmpty();
  }

  onIdle(): Promise<void> {
    return this.#scheduler.onIdle();
  }
}
