import { createOwner, disposeOwner, runWithOwner, type Owner } from "../reactivity/owner.js";
import { batch, effect, onCleanup, signal, type Signal } from "../reactivity/signal.js";
import { createControlFlowId, createSSRMarker, getControlFlowMode } from "./control-flow-context.js";
import { getHydrationBoundary, withHydrationBoundary } from "./hydration.js";
import { mountValueBeforeAnchor } from "./render.js";
import type { Child, ForProps, LazyChild, MaybeAccessor, ShowProps } from "./types.js";

function readMaybe<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

interface Range {
  fragment: DocumentFragment | null;
  start: Comment;
  end: Comment;
}

interface MountedRange {
  start: Comment;
  end: Comment;
  dispose: () => void;
}

interface ForEntry<T> extends MountedRange {
  item: T;
  index: Signal<number>;
}

function createRange(startData: string, endData: string): Range {
  const fragment = document.createDocumentFragment();
  const start = document.createComment(startData);
  const end = document.createComment(endData);
  fragment.append(start, end);
  return { fragment, start, end };
}

function claimHydratedRange(startData: string, endData: string): Range {
  const boundary = getHydrationBoundary();

  if (boundary === null) {
    throw new Error("Hydrated control flow requires an active hydration boundary.");
  }

  let start: Comment | null = null;

  for (let current = boundary.cursor; current !== boundary.end && current !== null; current = current.nextSibling) {
    if (current.nodeType === Node.COMMENT_NODE && (current as Comment).data === startData) {
      start = current as Comment;
      break;
    }
  }

  if (start === null) {
    throw new Error(`Missing hydrated control-flow start marker "${startData}".`);
  }

  let end: Comment | null = null;

  for (let current = start.nextSibling; current !== boundary.end && current !== null; current = current.nextSibling) {
    if (current.nodeType === Node.COMMENT_NODE && (current as Comment).data === endData) {
      end = current as Comment;
      break;
    }
  }

  if (end === null) {
    throw new Error(`Missing hydrated control-flow end marker "${endData}".`);
  }

  boundary.cursor = end.nextSibling;

  return {
    fragment: null,
    start,
    end,
  };
}

function collectRangeNodes(start: Node, end: Node): Node[] {
  const nodes: Node[] = [];
  let current: Node | null = start;

  while (current !== null) {
    nodes.push(current);

    if (current === end) {
      break;
    }

    current = current.nextSibling;
  }

  return nodes;
}

function clearBetween(start: Node, end: Node): void {
  let current = start.nextSibling;

  while (current !== null && current !== end) {
    const next = current.nextSibling;
    current.parentNode?.removeChild(current);
    current = next;
  }
}

function insertRangeBeforeAnchor(start: Node, end: Node, anchor: Node): void {
  const parent = anchor.parentNode;

  if (parent === null) {
    return;
  }

  for (const node of collectRangeNodes(start, end)) {
    parent.insertBefore(node, anchor);
  }
}

function removeRange(start: Node, end: Node): void {
  for (const node of collectRangeNodes(start, end)) {
    node.parentNode?.removeChild(node);
  }
}

function destroyMountedRange(range: MountedRange): void {
  range.dispose();
  removeRange(range.start, range.end);
}

function mountRangeContent(start: Comment, end: Comment, render: () => Child, parentOwner: Owner): MountedRange {
  const owner = createOwner(parentOwner);

  runWithOwner(owner, () => {
    mountValueBeforeAnchor(end, [], render());
  });

  return {
    start,
    end,
    dispose: () => disposeOwner(owner),
  };
}

function hydrateRangeContent(
  start: Comment,
  end: Comment,
  render: () => Child,
  parentOwner: Owner,
): MountedRange {
  const parent = end.parentNode;

  if (parent === null) {
    throw new Error("Hydrated control-flow range is missing its parent node.");
  }

  const owner = createOwner(parentOwner);

  runWithOwner(owner, () => {
    withHydrationBoundary(parent, start.nextSibling, end, () => {
      void render();
    });
  });

  return {
    start,
    end,
    dispose: () => disposeOwner(owner),
  };
}

function createMountedRange(
  startData: string,
  endData: string,
  render: () => Child,
  parentOwner: Owner,
  hydrateExisting = false,
): MountedRange {
  const range = hydrateExisting ? claimHydratedRange(startData, endData) : createRange(startData, endData);

  return hydrateExisting
    ? hydrateRangeContent(range.start, range.end, render, parentOwner)
    : mountRangeContent(range.start, range.end, render, parentOwner);
}

function createForEntry<T>(
  item: T,
  index: number,
  render: (item: T, index: () => number) => Child,
  parentOwner: Owner,
  rangeId: string | null,
): ForEntry<T> {
  const indexSignal = signal(index);
  const range = createMountedRange(
    rangeId === null ? `filament-for:item:${index}:start` : forItemStart(rangeId, index),
    rangeId === null ? `filament-for:item:${index}:end` : forItemEnd(rangeId, index),
    () => render(item, () => indexSignal()),
    parentOwner,
  );

  return {
    ...range,
    item,
    index: indexSignal,
  };
}

function createHydratedForEntry<T>(
  rangeId: string,
  item: T,
  index: number,
  render: (item: T, index: () => number) => Child,
  parentOwner: Owner,
): ForEntry<T> {
  const indexSignal = signal(index);
  const range = createMountedRange(
    forItemStart(rangeId, index),
    forItemEnd(rangeId, index),
    () => render(item, () => indexSignal()),
    parentOwner,
    true,
  );

  return {
    ...range,
    item,
    index: indexSignal,
  };
}

function reuseEntriesByItem<T>(entries: readonly ForEntry<T>[]): Map<T, ForEntry<T>[]> {
  const grouped = new Map<T, ForEntry<T>[]>();

  for (const entry of entries) {
    const queue = grouped.get(entry.item);

    if (queue === undefined) {
      grouped.set(entry.item, [entry]);
      continue;
    }

    queue.push(entry);
  }

  return grouped;
}

function takeReusableEntry<T>(grouped: Map<T, ForEntry<T>[]>, item: T): ForEntry<T> | null {
  const queue = grouped.get(item);

  if (queue === undefined || queue.length === 0) {
    return null;
  }

  const entry = queue.shift() ?? null;

  if (queue.length === 0) {
    grouped.delete(item);
  }

  return entry;
}

function disposeRemainingEntries<T>(grouped: Map<T, ForEntry<T>[]>): void {
  for (const queue of grouped.values()) {
    for (const entry of queue) {
      destroyMountedRange(entry);
    }
  }
}

function showStart(id: string): string {
  return `filament-show:${id}:start`;
}

function showEnd(id: string): string {
  return `filament-show:${id}:end`;
}

function forStart(id: string): string {
  return `filament-for:${id}:start`;
}

function forEnd(id: string): string {
  return `filament-for:${id}:end`;
}

function forItemStart(id: string, index: number): string {
  return `filament-for:${id}:item:${index}:start`;
}

function forItemEnd(id: string, index: number): string {
  return `filament-for:${id}:item:${index}:end`;
}

function forFallbackStart(id: string): string {
  return `filament-for:${id}:fallback:start`;
}

function forFallbackEnd(id: string): string {
  return `filament-for:${id}:fallback:end`;
}

function createSSRComment(data: string): unknown {
  return createSSRMarker(`<!--${data}-->`);
}

function resolveLazyChild(value: LazyChild | null | undefined): Child {
  return typeof value === "function" ? (value as () => Child)() : value ?? null;
}

function resolveShowChild<T>(props: ShowProps<T>): Child {
  const value = readMaybe(props.when);

  return value
    ? typeof props.children === "function"
      ? props.children.length === 0
        ? (props.children as () => Child)()
        : (props.children as (resolved: NonNullable<T>) => Child)(value as NonNullable<T>)
      : props.children
    : resolveLazyChild(props.fallback);
}

export function Show<T>(props: ShowProps<T>): Child {
  const mode = getControlFlowMode();

  if (mode === "ssr") {
    const id = createControlFlowId("s");
    return [
      createSSRComment(showStart(id)),
      resolveShowChild(props),
      createSSRComment(showEnd(id)),
    ] as unknown as Child;
  }

  const rangeId = mode === "hydrate" ? createControlFlowId("s") : null;
  const range =
    mode === "hydrate"
      ? claimHydratedRange(showStart(rangeId!), showEnd(rangeId!))
      : createRange("filament-show:start", "filament-show:end");
  const scopeOwner = createOwner();
  let currentBranch: MountedRange | null = null;
  let hydrating = mode === "hydrate";

  onCleanup(() => {
    currentBranch?.dispose();
    disposeOwner(scopeOwner);
  });

  effect(() => {
    const value = readMaybe(props.when);
    const renderBranch = () =>
      value
        ? typeof props.children === "function"
          ? props.children.length === 0
            ? (props.children as () => Child)()
            : (props.children as (resolved: NonNullable<T>) => Child)(value as NonNullable<T>)
          : props.children
        : resolveLazyChild(props.fallback);

    if (currentBranch !== null) {
      currentBranch.dispose();
      clearBetween(range.start, range.end);
      currentBranch = null;
    }

    currentBranch = hydrating
      ? hydrateRangeContent(range.start, range.end, renderBranch, scopeOwner)
      : mountRangeContent(range.start, range.end, renderBranch, scopeOwner);

    hydrating = false;
  });

  return (range.fragment ?? document.createDocumentFragment()) as Child;
}

export function For<T>(props: ForProps<T>): Child {
  const mode = getControlFlowMode();

  if (mode === "ssr") {
    const id = createControlFlowId("f");
    const items = readMaybe(props.each);
    const output: unknown[] = [createSSRComment(forStart(id))];

    if (items.length === 0) {
      if (props.fallback !== undefined) {
        output.push(createSSRComment(forFallbackStart(id)), props.fallback, createSSRComment(forFallbackEnd(id)));
      }
    } else {
      for (let index = 0; index < items.length; index += 1) {
        const item = items[index]!;
        output.push(
          createSSRComment(forItemStart(id, index)),
          props.children(item, () => index),
          createSSRComment(forItemEnd(id, index)),
        );
      }
    }

    output.push(createSSRComment(forEnd(id)));
    return output as unknown as Child;
  }

  const rangeId = mode === "hydrate" ? createControlFlowId("f") : null;
  const range =
    mode === "hydrate"
      ? claimHydratedRange(forStart(rangeId!), forEnd(rangeId!))
      : createRange("filament-for:start", "filament-for:end");
  const scopeOwner = createOwner();
  let currentEntries: ForEntry<T>[] = [];
  let fallbackRange: MountedRange | null = null;
  let hydrating = mode === "hydrate";

  onCleanup(() => {
    disposeOwner(scopeOwner);
  });

  effect(() => {
    const items = readMaybe(props.each);

    if (items.length === 0) {
      for (const entry of currentEntries) {
        destroyMountedRange(entry);
      }

      currentEntries = [];

      if (fallbackRange === null && props.fallback !== undefined) {
        fallbackRange = createMountedRange(
          rangeId === null ? "filament-for:fallback:start" : forFallbackStart(rangeId),
          rangeId === null ? "filament-for:fallback:end" : forFallbackEnd(rangeId),
          () => resolveLazyChild(props.fallback),
          scopeOwner,
          hydrating,
        );

        if (!hydrating) {
          insertRangeBeforeAnchor(fallbackRange.start, fallbackRange.end, range.end);
        }
      }

      hydrating = false;
      return;
    }

    if (fallbackRange !== null) {
      destroyMountedRange(fallbackRange);
      fallbackRange = null;
    }

    if (hydrating) {
      const parent = range.end.parentNode;

      if (parent === null) {
        throw new Error("Hydrated For range is missing its parent node.");
      }

      currentEntries = withHydrationBoundary(parent, range.start.nextSibling, range.end, () =>
        items.map((item, index) => createHydratedForEntry(rangeId!, item, index, props.children, scopeOwner)),
      );

      hydrating = false;
      return;
    }

    const reusableEntries = reuseEntriesByItem(currentEntries);
    const nextEntries = items.map((item, index) => {
      const existing = takeReusableEntry(reusableEntries, item);
      return existing ?? createForEntry(item, index, props.children, scopeOwner, rangeId);
    });

    disposeRemainingEntries(reusableEntries);

    batch(() => {
      for (let index = 0; index < nextEntries.length; index += 1) {
        const entry = nextEntries[index]!;

        if (entry.index.peek() !== index) {
          entry.index.set(index);
        }
      }
    });

    let cursor: Node = range.end;

    for (let index = nextEntries.length - 1; index >= 0; index -= 1) {
      const entry = nextEntries[index]!;
      insertRangeBeforeAnchor(entry.start, entry.end, cursor);
      cursor = entry.start;
    }

    currentEntries = nextEntries;
  });

  return (range.fragment ?? document.createDocumentFragment()) as Child;
}
