export interface DonoTaskEvent {
  readonly taskId: number;
  readonly attempt: number;
}

export interface DonoCompletedEvent extends DonoTaskEvent {
  readonly duration: number;
}

export interface DonoErrorEvent extends DonoTaskEvent {
  readonly error: unknown;
}

export interface DonoRetryEvent extends DonoTaskEvent {
  readonly error: unknown;
  readonly delay: number;
}

export interface DonoQueueEvent {
  readonly pending: number;
}

export interface DonoIdleEvent extends DonoQueueEvent {
  readonly running: number;
}

export interface DonoEvents {
  active: DonoTaskEvent;
  completed: DonoCompletedEvent;
  error: DonoErrorEvent;
  retry: DonoRetryEvent;
  empty: DonoQueueEvent;
  idle: DonoIdleEvent;
}
