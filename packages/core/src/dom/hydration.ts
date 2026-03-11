export interface HydrationBoundary {
  parent: ParentNode;
  cursor: ChildNode | null;
  end: ChildNode | null;
}

const hydrationBoundaries: HydrationBoundary[] = [];
const hydrationStartPrefix = "filament-start:";
const elementRefAttribute = "data-f-node";

export function getHydrationBoundary(): HydrationBoundary | null {
  return hydrationBoundaries.at(-1) ?? null;
}

export function beginHydration(container: ParentNode): void {
  hydrationBoundaries.push({
    parent: container,
    cursor: container.firstChild,
    end: null,
  });
}

export function endHydration(): void {
  hydrationBoundaries.pop();
}

export function withHydrationBoundary<T>(
  parent: ParentNode,
  cursor: ChildNode | null,
  end: ChildNode | null,
  fn: () => T,
): T {
  hydrationBoundaries.push({ parent, cursor, end });

  try {
    return fn();
  } finally {
    hydrationBoundaries.pop();
  }
}

export function assertHydrationComplete(container: ParentNode): void {
  if (container instanceof Element) {
    const rootRef = container.getAttribute(elementRefAttribute);

    if (rootRef !== null) {
      throw new Error(
        `Hydration left the server node ref "${rootRef}" unclaimed. SSR and client structure are out of sync.`,
      );
    }
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);

  while (walker.nextNode() !== null) {
    const current = walker.currentNode;

    if (current.nodeType === Node.ELEMENT_NODE) {
      const ref = (current as Element).getAttribute(elementRefAttribute);

      if (ref !== null) {
        throw new Error(
          `Hydration left the server node ref "${ref}" unclaimed. SSR and client structure are out of sync.`,
        );
      }

      continue;
    }

    const comment = current as Comment;

    if (comment.data.startsWith(hydrationStartPrefix)) {
      throw new Error(
        `Hydration left the server insert marker "${comment.data.slice(hydrationStartPrefix.length)}" unclaimed. SSR and client structure are out of sync.`,
      );
    }
  }
}
