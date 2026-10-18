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
