import { Scheduler } from "./scheduler/scheduler.js";

export interface DonoOptions {
  readonly concurrency?: number;
}

export interface DonoAddOptions {
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
