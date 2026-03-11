export interface HydrationBoundary {
  parent: ParentNode;
  cursor: ChildNode | null;
  end: ChildNode | null;
}

const hydrationBoundaries: HydrationBoundary[] = [];

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
