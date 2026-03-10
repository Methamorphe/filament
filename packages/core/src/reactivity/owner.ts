export type Cleanup = () => void;

export interface Owner {
  parent: Owner | null;
  children: Set<Owner>;
  cleanups: Cleanup[];
  disposed: boolean;
}

export interface SignalState<T> {
  value: T;
  observers: Set<Computation<any>>;
  equals: (previous: T, next: T) => boolean;
}

export interface Computation<T> extends Owner {
  fn: (previous: T | undefined) => T;
  value: T | undefined;
  sources: Set<SignalState<unknown>>;
  queued: boolean;
}

let currentOwner: Owner | null = null;
let currentComputation: Computation<any> | null = null;
let batchDepth = 0;
const pendingComputations = new Set<Computation<any>>();

export function getCurrentOwner(): Owner | null {
  return currentOwner;
}

export function getCurrentComputation(): Computation<any> | null {
  return currentComputation;
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const previousOwner = currentOwner;
  currentOwner = owner;

  try {
    return fn();
  } finally {
    currentOwner = previousOwner;
  }
}

export function createOwner(parent: Owner | null = currentOwner): Owner {
  const owner: Owner = {
    parent,
    children: new Set(),
    cleanups: [],
    disposed: false,
  };

  parent?.children.add(owner);
  return owner;
}

export function onCleanup(cleanup: Cleanup): void {
  if (currentOwner === null) {
    throw new Error("onCleanup() must run inside an owner scope.");
  }

  currentOwner.cleanups.push(cleanup);
}

function clearOwner(owner: Owner): void {
  for (const child of Array.from(owner.children)) {
    disposeOwner(child);
  }

  owner.children.clear();

  for (let index = owner.cleanups.length - 1; index >= 0; index -= 1) {
    owner.cleanups[index]?.();
  }

  owner.cleanups.length = 0;
}

export function disposeOwner(owner: Owner): void {
  if (owner.disposed) {
    return;
  }

  owner.disposed = true;

  if (isComputation(owner)) {
    for (const source of owner.sources) {
      source.observers.delete(owner);
    }

    owner.sources.clear();
    pendingComputations.delete(owner);
    owner.queued = false;
  }

  clearOwner(owner);
  owner.parent?.children.delete(owner);
}

function isComputation(owner: Owner): owner is Computation<any> {
  return "sources" in owner;
}

function resetComputation<T>(computation: Computation<T>): void {
  for (const source of computation.sources) {
    source.observers.delete(computation);
  }

  computation.sources.clear();
  clearOwner(computation);
}

export function createComputation<T>(fn: (previous: T | undefined) => T): Computation<T> {
  const computation: Computation<T> = {
    ...createOwner(currentOwner),
    fn,
    value: undefined,
    sources: new Set(),
    queued: false,
  };

  return computation;
}

export function runComputation<T>(computation: Computation<T>): void {
  if (computation.disposed) {
    return;
  }

  computation.queued = false;
  resetComputation(computation);

  const previousOwner = currentOwner;
  const previousComputation = currentComputation;
  currentOwner = computation;
  currentComputation = computation as Computation<unknown>;

  try {
    computation.value = computation.fn(computation.value);
  } finally {
    currentOwner = previousOwner;
    currentComputation = previousComputation;
  }
}

export function trackSignal<T>(signal: SignalState<T>): T {
  if (currentComputation !== null) {
    signal.observers.add(currentComputation);
    currentComputation.sources.add(signal as SignalState<unknown>);
  }

  return signal.value;
}

export function createRoot<T>(fn: (dispose: Cleanup) => T): T {
  const owner = createOwner(null);

  return runWithOwner(owner, () => fn(() => disposeOwner(owner)));
}

export function queueComputation(computation: Computation<any>): void {
  if (computation.disposed || computation.queued) {
    return;
  }

  computation.queued = true;
  pendingComputations.add(computation);

  if (batchDepth === 0) {
    flushPendingComputations();
  }
}

export function flushPendingComputations(): void {
  while (pendingComputations.size > 0) {
    const queued = Array.from(pendingComputations);
    pendingComputations.clear();

    for (const computation of queued) {
      runComputation(computation);
    }
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth += 1;

  try {
    return fn();
  } finally {
    batchDepth -= 1;

    if (batchDepth === 0) {
      flushPendingComputations();
    }
  }
}
