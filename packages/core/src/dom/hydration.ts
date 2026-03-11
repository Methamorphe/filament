export interface HydrationBoundary {
  parent: ParentNode;
  cursor: ChildNode | null;
  end: ChildNode | null;
}

const hydrationBoundaries: HydrationBoundary[] = [];
const hydrationStartPrefix = "filament-start:";
const elementRefAttribute = "data-f-node";
const previewNodeLimit = 4;
const previewTextLimit = 48;

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

function truncatePreview(value: string, limit = previewTextLimit): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 3)}...`;
}

function normalizePreviewWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function formatElementPreview(element: Element): string {
  const attributes = Array.from(element.attributes)
    .slice(0, 3)
    .map((attribute) => `${attribute.name}="${truncatePreview(attribute.value, 24)}"`);

  return attributes.length === 0
    ? `<${element.tagName.toLowerCase()}>`
    : `<${element.tagName.toLowerCase()} ${attributes.join(" ")}>`;
}

export function formatHydrationNode(node: Node | null): string {
  if (node === null) {
    return "null";
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return formatElementPreview(node as Element);
  }

  if (node.nodeType === Node.COMMENT_NODE) {
    return `<!--${truncatePreview((node as Comment).data)}-->`;
  }

  if (node.nodeType === Node.TEXT_NODE) {
    const text = normalizePreviewWhitespace(node.textContent ?? "");
    return `#text("${truncatePreview(text)}")`;
  }

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return "#document-fragment";
  }

  return node.nodeName;
}

function formatParentPreview(parent: ParentNode): string {
  return parent instanceof Node ? formatHydrationNode(parent) : "#parent";
}

function collectHydrationPreview(cursor: ChildNode | null, end: ChildNode | null): string {
  const parts: string[] = [];

  for (
    let current = cursor;
    current !== null && current !== end && parts.length < previewNodeLimit;
    current = current.nextSibling
  ) {
    parts.push(formatHydrationNode(current));
  }

  if (end !== null && parts.length < previewNodeLimit) {
    parts.push(`[end:${formatHydrationNode(end)}]`);
  }

  return parts.length === 0 ? "<empty>" : parts.join(", ");
}

function describeHydrationBoundary(boundary: HydrationBoundary): string {
  return [
    `parent=${formatParentPreview(boundary.parent)}`,
    `cursor=${formatHydrationNode(boundary.cursor)}`,
    `end=${formatHydrationNode(boundary.end)}`,
    `remaining=${collectHydrationPreview(boundary.cursor, boundary.end)}`,
  ].join("; ");
}

function describeContainerPreview(container: ParentNode): string {
  const preview: string[] = [];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_TEXT,
  );

  while (walker.nextNode() !== null && preview.length < previewNodeLimit) {
    if (walker.currentNode.nodeType === Node.TEXT_NODE) {
      const text = normalizePreviewWhitespace(walker.currentNode.textContent ?? "");

      if (text === "") {
        continue;
      }
    }

    preview.push(formatHydrationNode(walker.currentNode));
  }

  return `parent=${formatParentPreview(container)}; remaining=${preview.length === 0 ? "<empty>" : preview.join(", ")}`;
}

export function createHydrationError(
  message: string,
  context: { boundary?: HydrationBoundary | null; container?: ParentNode | null } = {},
): Error {
  if (context.boundary !== undefined) {
    return new Error(
      context.boundary === null ? message : `${message} Hydration boundary: ${describeHydrationBoundary(context.boundary)}.`,
    );
  }

  if (context.container !== undefined && context.container !== null) {
    return new Error(`${message} Hydration container: ${describeContainerPreview(context.container)}.`);
  }

  return new Error(message);
}

export function assertHydrationComplete(container: ParentNode): void {
  if (container instanceof Element) {
    const rootRef = container.getAttribute(elementRefAttribute);

    if (rootRef !== null) {
      throw createHydrationError(
        `Hydration left the server node ref "${rootRef}" unclaimed. SSR and client structure are out of sync.`,
        { container },
      );
    }
  }

  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);

  while (walker.nextNode() !== null) {
    const current = walker.currentNode;

    if (current.nodeType === Node.ELEMENT_NODE) {
      const ref = (current as Element).getAttribute(elementRefAttribute);

      if (ref !== null) {
        throw createHydrationError(
          `Hydration left the server node ref "${ref}" unclaimed. SSR and client structure are out of sync.`,
          { container },
        );
      }

      continue;
    }

    const comment = current as Comment;

    if (comment.data.startsWith(hydrationStartPrefix)) {
      throw createHydrationError(
        `Hydration left the server insert marker "${comment.data.slice(hydrationStartPrefix.length)}" unclaimed. SSR and client structure are out of sync.`,
        { container },
      );
    }
  }
}
