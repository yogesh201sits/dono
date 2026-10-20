export class DonoClearedError extends Error {
  constructor() {
    super("Task was removed because the queue was cleared");
    this.name = "DonoClearedError";
  }
}

export class DonoClosedError extends Error {
  constructor() {
    super("Cannot add tasks to a closed queue");
    this.name = "DonoClosedError";
  }
}
export class DonoCancelledError extends Error {
  constructor(message = "Task was cancelled") {
    super(message);
    this.name = "DonoCancelledError";
  }
}

export class DonoTimeoutError extends Error {
  constructor(timeout: number) {
    super(`Task timed out after ${timeout}ms`);
    this.name = "DonoTimeoutError";
  }
}

export class DonoQueueFullError extends Error {
  constructor(maxQueueSize: number) {
    super(`Queue is full: maximum pending tasks is ${maxQueueSize}`);
    this.name = "DonoQueueFullError";
  }
}