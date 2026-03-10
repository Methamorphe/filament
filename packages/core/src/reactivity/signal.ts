import {
  batch,
  createComputation,
  createRoot,
  disposeOwner,
  onCleanup,
  queueComputation,
  runComputation,
  trackSignal,
  type Cleanup,
  type SignalState,
} from "./owner.js";

export type Accessor<T> = () => T;

export interface Signal<T> extends Accessor<T> {
  set(next: T | ((previous: T) => T)): T;
  update(updater: (previous: T) => T): T;
  peek(): T;
}

export type Disposer = Cleanup;

function createSignalState<T>(value: T): SignalState<T> {
  return {
    value,
    observers: new Set(),
    equals: Object.is,
  };
}

export function signal<T>(initial: T): Signal<T> {
  const state = createSignalState(initial);

  const read = (() => trackSignal(state)) as Signal<T>;

  read.set = (next) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(state.value) : next;

    if (state.equals(state.value, resolved)) {
      return state.value;
    }

    state.value = resolved;

    for (const observer of Array.from(state.observers)) {
      queueComputation(observer);
    }

    return state.value;
  };

  read.update = (updater) => read.set(updater);
  read.peek = () => state.value;

  return read;
}

export function effect(fn: () => void): Disposer {
  const computation = createComputation<void>(() => {
    fn();
  });

  runComputation(computation);
  return () => disposeOwner(computation);
}

export function memo<T>(fn: () => T): Accessor<T> {
  const derived = signal<T>(undefined as T);

  effect(() => {
    derived.set(fn());
  });

  return () => derived();
}

export { batch, createRoot, onCleanup };
