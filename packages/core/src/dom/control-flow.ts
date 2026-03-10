import { effect } from "../reactivity/signal.js";
import { mountValueBeforeAnchor } from "./render.js";
import type { Child, ForProps, MaybeAccessor, ShowProps } from "./types.js";

function readMaybe<T>(value: MaybeAccessor<T>): T {
  return typeof value === "function" ? (value as () => T)() : value;
}

function createRange(): { fragment: DocumentFragment; end: Comment } {
  const fragment = document.createDocumentFragment();
  const start = document.createComment("filament-range:start");
  const end = document.createComment("filament-range:end");
  fragment.append(start, end);
  return { fragment, end };
}

export function Show<T>(props: ShowProps<T>): Child {
  const range = createRange();
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
  const range = createRange();
  let currentNodes: Node[] = [];

  effect(() => {
    const items = readMaybe(props.each);

    // TODO: replace this full list remount with keyed reconciliation.
    const next =
      items.length > 0
        ? items.map((item, index) => props.children(item, () => index))
        : props.fallback ?? null;

    currentNodes = mountValueBeforeAnchor(range.end, currentNodes, next);
  });

  return range.fragment;
}
