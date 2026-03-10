import { createRoot, onCleanup } from "../reactivity/signal.js";
import type { Child } from "./types.js";

function isNode(value: unknown): value is Node {
  return value instanceof Node;
}

function normalizeText(value: string | number | bigint): string {
  return String(value);
}

function flattenChildren(value: Child, nodes: Node[]): void {
  if (value === null || value === undefined || value === false || value === true) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      flattenChildren(item, nodes);
    }

    return;
  }

  if (isNode(value)) {
    if (value.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
      nodes.push(...Array.from(value.childNodes));
      return;
    }

    nodes.push(value);
    return;
  }

  nodes.push(document.createTextNode(normalizeText(value)));
}

export function createNodes(value: Child): Node[] {
  const nodes: Node[] = [];
  flattenChildren(value, nodes);
  return nodes;
}

function removeNodes(nodes: Node[]): void {
  for (const node of nodes) {
    node.parentNode?.removeChild(node);
  }
}

export function mountValueBeforeAnchor(anchor: Node, current: Node[], value: Child): Node[] {
  if (
    current.length === 1 &&
    current[0]?.nodeType === Node.TEXT_NODE &&
    (typeof value === "string" || typeof value === "number" || typeof value === "bigint")
  ) {
    current[0].textContent = normalizeText(value);
    return current;
  }

  const nextNodes = createNodes(value);

  removeNodes(current);

  const parent = anchor.parentNode;

  if (parent === null) {
    return nextNodes;
  }

  for (const node of nextNodes) {
    parent.insertBefore(node, anchor);
  }

  return nextNodes;
}

export function setAttributeOrProperty(element: Element, name: string, value: unknown): void {
  const normalizedName = name === "className" ? "class" : name;
  const shouldUseProperty =
    !(element instanceof SVGElement) &&
    normalizedName in element &&
    !normalizedName.includes("-") &&
    !normalizedName.startsWith("aria-") &&
    !normalizedName.startsWith("data-") &&
    normalizedName !== "class" &&
    normalizedName !== "style";

  if (shouldUseProperty) {
    (element as unknown as Record<string, unknown>)[normalizedName] = value ?? "";
    return;
  }

  if (value === null || value === undefined || value === false) {
    element.removeAttribute(normalizedName);
    return;
  }

  if (value === true) {
    element.setAttribute(normalizedName, "");
    return;
  }

  element.setAttribute(normalizedName, String(value));
}

export function render(factory: () => Child, container: Element): () => void {
  return createRoot((dispose) => {
    container.replaceChildren(...createNodes(factory()));
    onCleanup(() => {
      container.replaceChildren();
    });
    return dispose;
  });
}
