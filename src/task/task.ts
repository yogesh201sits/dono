export interface QueuedTask {
  readonly run: (signal: AbortSignal) => unknown | PromiseLike<unknown>;
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}
