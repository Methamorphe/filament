import { createOwner, disposeOwner, runWithOwner, type Owner } from "../reactivity/owner.js";
import { batch, effect, onCleanup, signal, type Signal } from "../reactivity/signal.js";
import { mountValueBeforeAnchor } from "./render.js";
import type { Child, ForProps, MaybeAccessor, ShowProps } from "./types.js";

function readMaybe<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

interface Range {
  fragment: DocumentFragment;
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

function createRange(label: string): Range {
  const fragment = document.createDocumentFragment();
  const start = document.createComment(`${label}:start`);
  const end = document.createComment(`${label}:end`);
  fragment.append(start, end);
  return { fragment, start, end };
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

function createMountedRange(label: string, render: () => Child, parentOwner: Owner): MountedRange {
  const { fragment, start, end } = createRange(label);
  const owner = createOwner(parentOwner);

  runWithOwner(owner, () => {
    mountValueBeforeAnchor(end, [], render());
  });

  // Keep the range in a fragment until it is inserted into the live DOM.
  void fragment;

  return {
    start,
    end,
    dispose: () => disposeOwner(owner),
  };
}

function createForEntry<T>(
  item: T,
  index: number,
  render: (item: T, index: () => number) => Child,
  parentOwner: Owner,
): ForEntry<T> {
  const indexSignal = signal(index);
  const range = createMountedRange("filament-for:item", () => render(item, () => indexSignal()), parentOwner);

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

export function Show<T>(props: ShowProps<T>): Child {
  const range = createRange("filament-range");
  let currentNodes: Node[] = [];

  effect(() => {
    const value = readMaybe(props.when);
    const next =
      value
        ? typeof props.children === "function"
          ? (props.children as (resolved: NonNullable<T>) => Child)(value as NonNullable<T>)
          : props.children
        : props.fallback ?? null;

    currentNodes = mountValueBeforeAnchor(range.end, currentNodes, next);
  });

  return range.fragment;
}

export function For<T>(props: ForProps<T>): Child {
  const range = createRange("filament-range");
  const scopeOwner = createOwner();
  let currentEntries: ForEntry<T>[] = [];
  let fallbackRange: MountedRange | null = null;

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
          "filament-for:fallback",
          () => props.fallback ?? null,
          scopeOwner,
        );
        insertRangeBeforeAnchor(fallbackRange.start, fallbackRange.end, range.end);
      }

      return;
    }

    if (fallbackRange !== null) {
      destroyMountedRange(fallbackRange);
      fallbackRange = null;
    }

    const reusableEntries = reuseEntriesByItem(currentEntries);
    const nextEntries = items.map((item, index) => {
      const existing = takeReusableEntry(reusableEntries, item);
      return existing ?? createForEntry(item, index, props.children, scopeOwner);
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

  return range.fragment;
}
