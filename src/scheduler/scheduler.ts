import { PriorityQueue } from "../queue/priority-queue.js";
import {
  DonoCancelledError,
  DonoClearedError,
  DonoClosedError,
  DonoTimeoutError,
} from "../errors/dono-errors.js";
import type { QueuedTask } from "../task/task.js";

export interface SchedulerOptions {
  readonly concurrency: number;
  readonly intervalCap?: number;
  readonly interval?: number;
}

export interface ScheduleOptions {
  readonly priority?: number;
  readonly signal?: AbortSignal;
  readonly timeout?: number;
}

type EntryState = "pending" | "running" | "settled";

interface QueueEntry {
  readonly task: QueuedTask;
  readonly priority: number;
  readonly sequence: number;
  readonly controller: AbortController;
  readonly externalSignal: AbortSignal | undefined;
  readonly abortListener: (() => void) | undefined;
  readonly timeout: number | undefined;

  state: EntryState;
  timeoutHandle: ReturnType<typeof setTimeout> | undefined;
}

type Outcome =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: unknown };

export class Scheduler {
  readonly #concurrency: number;
  readonly #intervalCap: number | undefined;
  readonly #interval: number | undefined;

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

  #windowStartedAt = Date.now();
  #startsInWindow = 0;
  #rateLimitTimer: ReturnType<typeof setTimeout> | undefined;

  readonly #emptyWaiters: Array<() => void> = [];
  readonly #idleWaiters: Array<() => void> = [];

  constructor(options: SchedulerOptions) {
    const { concurrency, intervalCap, interval } = options;

    if (
      concurrency !== Infinity &&
      (!Number.isInteger(concurrency) || concurrency < 1)
    ) {
      throw new RangeError(
        "concurrency must be a positive integer or Infinity",
      );
    }

    if ((intervalCap === undefined) !== (interval === undefined)) {
      throw new TypeError(
        "intervalCap and interval must be provided together",
      );
    }

    if (
      intervalCap !== undefined &&
      (!Number.isSafeInteger(intervalCap) || intervalCap < 1)
    ) {
      throw new RangeError(
        "intervalCap must be a positive safe integer",
      );
    }

    if (
      interval !== undefined &&
      (!Number.isFinite(interval) ||
        interval < 1 ||
        interval > 2_147_483_647)
    ) {
      throw new RangeError(
        "interval must be between 1 and 2147483647 milliseconds",
      );
    }

    this.#concurrency = concurrency;
    this.#intervalCap = intervalCap;
    this.#interval = interval;
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
    const { signal, timeout } = options;

    if (!Number.isFinite(priority)) {
      throw new RangeError("priority must be a finite number");
    }

    if (
      timeout !== undefined &&
      (!Number.isFinite(timeout) || timeout < 0)
    ) {
      throw new RangeError(
        "timeout must be a finite non-negative number",
      );
    }

    if (signal?.aborted) {
      task.reject(new DonoCancelledError());
      return;
    }

    const controller = new AbortController();

    let entry!: QueueEntry;

    const abortListener =
      signal === undefined
        ? undefined
        : () => {
            const error = new DonoCancelledError();

            controller.abort(error);
            this.#cancelEntry(entry, error);
          };

    entry = {
      task,
      priority,
      sequence: this.#nextSequence++,
      controller,
      externalSignal: signal,
      abortListener,
      timeout,
      state: "pending",
      timeoutHandle: undefined,
    };

    if (signal !== undefined && abortListener !== undefined) {
      signal.addEventListener("abort", abortListener, {
        once: true,
      });
    }

    this.#queue.push(entry);
    this.#drain();
  }

  pause(): void {
    if (this.#closed) return;
    this.#paused = true;
  }

  start(): void {
    if (this.#closed && this.#queue.isEmpty) return;

    this.#paused = false;
    this.#drain();
  }

  clear(): void {
    const removed: QueueEntry[] = [];

    while (!this.#queue.isEmpty) {
      const entry = this.#queue.pop();
      if (entry !== undefined) removed.push(entry);
    }

    for (const entry of removed) {
      this.#settle(entry, {
        ok: false,
        error: new DonoClearedError(),
      });
    }

    this.#notifyEmpty();
    this.#notifyIdle();
  }

  close(): Promise<void> {
    if (this.#closePromise !== undefined) {
      return this.#closePromise;
    }

    this.#closed = true;
    this.#paused = false;
    this.#drain();

    this.#closePromise = this.onIdle();
    return this.#closePromise;
  }

  onEmpty(): Promise<void> {
    if (this.#queue.isEmpty) return Promise.resolve();

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

  #canStartTask(): boolean {
    if (
      this.#intervalCap === undefined ||
      this.#interval === undefined
    ) {
      return true;
    }

    const now = Date.now();
    const elapsed = now - this.#windowStartedAt;

    if (elapsed >= this.#interval) {
      this.#clearRateLimitTimer();
      this.#windowStartedAt = now;
      this.#startsInWindow = 0;
    }

    if (this.#startsInWindow >= this.#intervalCap) {
      this.#scheduleRateLimitCheck();
      return false;
    }

    this.#startsInWindow += 1;
    return true;
  }

  #scheduleRateLimitCheck(): void {
    if (
      this.#rateLimitTimer !== undefined ||
      this.#interval === undefined
    ) {
      return;
    }

    const elapsed = Date.now() - this.#windowStartedAt;
    const delay = Math.max(1, this.#interval - elapsed);

    this.#rateLimitTimer = setTimeout(() => {
      this.#rateLimitTimer = undefined;
      this.#drain();
    }, delay);
  }

  #clearRateLimitTimer(): void {
    if (this.#rateLimitTimer === undefined) return;

    clearTimeout(this.#rateLimitTimer);
    this.#rateLimitTimer = undefined;
  }

  #drain(): void {
    while (
      !this.#paused &&
      this.#running < this.#concurrency &&
      !this.#queue.isEmpty
    ) {
      // Check the rate limit before removing a pending task.
      if (!this.#canStartTask()) break;

      const entry = this.#queue.pop();
      if (entry === undefined) break;
      if (entry.state !== "pending") continue;

      entry.state = "running";
      this.#running += 1;
      this.#run(entry);
    }

    if (this.#queue.isEmpty) {
      this.#clearRateLimitTimer();
    }

    this.#notifyEmpty();
    this.#notifyIdle();
  }

  #run(entry: QueueEntry): void {
    if (entry.timeout !== undefined) {
      entry.timeoutHandle = setTimeout(() => {
        if (entry.state !== "running") return;

        const error = new DonoTimeoutError(entry.timeout!);

        entry.controller.abort(error);
        this.#settle(entry, { ok: false, error });
      }, entry.timeout);
    }

    Promise.resolve()
      .then(() => {
        if (entry.state !== "running") return undefined;

        return entry.task.run(entry.controller.signal);
      })
      .then(
        (value) => this.#settle(entry, { ok: true, value }),
        (error: unknown) =>
          this.#settle(entry, { ok: false, error }),
      );
  }

  #cancelEntry(entry: QueueEntry, error: unknown): void {
    if (entry.state === "settled") return;

    if (entry.state === "pending") {
      this.#queue.remove((candidate) => candidate === entry);
    }

    this.#settle(entry, { ok: false, error });
  }

  #settle(entry: QueueEntry, outcome: Outcome): void {
    if (entry.state === "settled") return;

    const wasRunning = entry.state === "running";
    entry.state = "settled";

    if (entry.timeoutHandle !== undefined) {
      clearTimeout(entry.timeoutHandle);
      entry.timeoutHandle = undefined;
    }

    if (
      entry.externalSignal !== undefined &&
      entry.abortListener !== undefined
    ) {
      entry.externalSignal.removeEventListener(
        "abort",
        entry.abortListener,
      );
    }

    if (outcome.ok) {
      entry.task.resolve(outcome.value);
    } else {
      entry.task.reject(outcome.error);
    }

    if (wasRunning) {
      this.#running -= 1;
    }

    this.#drain();
  }

  #notifyEmpty(): void {
    if (!this.#queue.isEmpty) return;

    const waiters = this.#emptyWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }

  #notifyIdle(): void {
    if (!this.#queue.isEmpty || this.#running !== 0) return;

    const waiters = this.#idleWaiters.splice(0);
    for (const resolve of waiters) resolve();
  }
}
