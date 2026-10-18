export interface QueuedTask {
  readonly run: () => unknown | PromiseLike<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}
