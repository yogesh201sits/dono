export type EventListener<T> = (payload: T) => void;

export class EventEmitter<Events extends object> {
  readonly #listeners = new Map<
    keyof Events,
    Set<EventListener<unknown>>
  >();

  on<K extends keyof Events>(
    event: K,
    listener: EventListener<Events[K]>,
  ): this {
    let listeners = this.#listeners.get(event);

    if (listeners === undefined) {
      listeners = new Set<EventListener<unknown>>();
      this.#listeners.set(event, listeners);
    }

    listeners.add(listener as EventListener<unknown>);
    return this;
  }

  off<K extends keyof Events>(
    event: K,
    listener: EventListener<Events[K]>,
  ): this {
    const listeners = this.#listeners.get(event);

    listeners?.delete(listener as EventListener<unknown>);

    if (listeners?.size === 0) {
      this.#listeners.delete(event);
    }

    return this;
  }

  once<K extends keyof Events>(
    event: K,
    listener: EventListener<Events[K]>,
  ): this {
    const wrapper: EventListener<Events[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };

    return this.on(event, wrapper);
  }

  emit<K extends keyof Events>(
    event: K,
    payload: Events[K],
  ): void {
    const listeners = this.#listeners.get(event);

    if (listeners === undefined) {
      return;
    }

    // Snapshot listeners so additions/removals during dispatch
    // don't change the current dispatch iteration.
    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch {
        // Observability callbacks must not interrupt task execution.
      }
    }
  }

  removeAllListeners<K extends keyof Events>(event?: K): this {
    if (event === undefined) {
      this.#listeners.clear();
    } else {
      this.#listeners.delete(event);
    }

    return this;
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.#listeners.get(event)?.size ?? 0;
  }
}
