import { effect, onCleanup } from "../reactivity/signal.js";
import {
  createHydrationError,
  getHydrationBoundary,
  withHydrationBoundary,
} from "./hydration.js";
import { mountValueBeforeAnchor, setAttributeOrProperty } from "./render.js";
import type { DOMBinding, DOMTemplateIR } from "./types.js";

const templateCache = new Map<string, HTMLTemplateElement>();
const elementRefAttribute = "data-f-node";
const anchorPrefix = "filament-anchor:";
const hydrationStartPrefix = "filament-start:";

interface ResolvedRefs {
  nodes: Map<string, Element>;
  anchors: Map<string, Comment>;
  starts: Map<string, Comment>;
}

function createEmptyResolvedRefs(): ResolvedRefs {
  return {
    nodes: new Map(),
    anchors: new Map(),
    starts: new Map(),
  };
}

function getTemplate(html: string): HTMLTemplateElement {
  let template = templateCache.get(html);

  if (template !== undefined) {
    return template;
  }

  template = document.createElement("template");
  template.innerHTML = html;
  templateCache.set(html, template);
  return template;
}

function cloneTemplate(html: string): DocumentFragment {
  return getTemplate(html).content.cloneNode(true) as DocumentFragment;
}

function collectBoundNodeRefs(bindings: readonly DOMBinding[]): Set<string> {
  const refs = new Set<string>();

  for (const binding of bindings) {
    if (binding.kind === "insert") {
      continue;
    }

    refs.add(binding.ref);
  }

  return refs;
}

function getExpectedRootElement(html: string): Element | null {
  return getTemplate(html).content.firstElementChild;
}

function matchesStructuralRoot(expected: Element, candidate: Element): boolean {
  if (expected.tagName !== candidate.tagName) {
    return false;
  }

  const expectedAttributes = Array.from(expected.attributes)
    .filter((attribute) => attribute.name !== elementRefAttribute)
    .map((attribute) => [attribute.name, attribute.value] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  const candidateAttributes = Array.from(candidate.attributes)
    .filter((attribute) => attribute.name !== elementRefAttribute)
    .map((attribute) => [attribute.name, attribute.value] as const)
    .sort(([left], [right]) => left.localeCompare(right));

  if (expectedAttributes.length !== candidateAttributes.length) {
    return false;
  }

  for (let index = 0; index < expectedAttributes.length; index += 1) {
    const expectedAttribute = expectedAttributes[index]!;
    const candidateAttribute = candidateAttributes[index]!;

    if (
      expectedAttribute[0] !== candidateAttribute[0] ||
      expectedAttribute[1] !== candidateAttribute[1]
    ) {
      return false;
    }
  }

  return true;
}

function formatExpectedRootPreview(expected: Element): string {
  const attributes = Array.from(expected.attributes)
    .filter((attribute) => attribute.name !== elementRefAttribute)
    .slice(0, 3)
    .map((attribute) => `${attribute.name}="${attribute.value}"`);

  return attributes.length === 0
    ? `<${expected.tagName.toLowerCase()}>`
    : `<${expected.tagName.toLowerCase()} ${attributes.join(" ")}>`;
}

function inspectRefNode(
  current: Node,
  pendingNodeRefs: Set<string>,
  pendingAnchorRefs: Set<string>,
  pendingStartRefs: Set<string>,
  nodes: Map<string, Element>,
  anchors: Map<string, Comment>,
  starts: Map<string, Comment>,
): void {
  if (current.nodeType === Node.ELEMENT_NODE) {
    const element = current as Element;
    const ref = element.getAttribute(elementRefAttribute);

    if (ref !== null && pendingNodeRefs.has(ref) && !nodes.has(ref)) {
      nodes.set(ref, element);
      pendingNodeRefs.delete(ref);
      element.removeAttribute(elementRefAttribute);
    }

    return;
  }

  if (current.nodeType !== Node.COMMENT_NODE) {
    return;
  }

  const comment = current as Comment;

  if (comment.data.startsWith(anchorPrefix)) {
    const ref = comment.data.slice(anchorPrefix.length);

    if (pendingAnchorRefs.has(ref) && !anchors.has(ref)) {
      anchors.set(ref, comment);
      pendingAnchorRefs.delete(ref);
    }

    return;
  }

  if (comment.data.startsWith(hydrationStartPrefix)) {
    const ref = comment.data.slice(hydrationStartPrefix.length);

    if (pendingStartRefs.has(ref) && !starts.has(ref)) {
      starts.set(ref, comment);
      pendingStartRefs.delete(ref);
    }
  }
}

function resolveRefs(root: DocumentFragment | Element, ir: DOMTemplateIR): ResolvedRefs {
  const rootElement =
    root instanceof Element
      ? root
      : root.childNodes.length === 1 && root.firstChild?.nodeType === Node.ELEMENT_NODE
        ? (root.firstChild as Element)
        : null;

  if (rootElement !== null && ir.anchorRefs.length === 0 && ir.nodeRefs.length === 1) {
    const ref = ir.nodeRefs[0]!;
    rootElement.removeAttribute(elementRefAttribute);

    return {
      nodes: new Map([[ref, rootElement]]),
      anchors: new Map(),
      starts: new Map(),
    };
  }

  if (ir.nodeRefs.length === 0 && ir.anchorRefs.length === 0) {
    return createEmptyResolvedRefs();
  }

  const nodes = new Map<string, Element>();
  const anchors = new Map<string, Comment>();
  const starts = new Map<string, Comment>();
  const pendingNodeRefs = new Set(ir.nodeRefs);
  const pendingAnchorRefs = new Set(ir.anchorRefs);
  const pendingStartRefs = new Set(ir.anchorRefs);

  if (rootElement !== null && pendingNodeRefs.has(ir.nodeRefs[0] ?? "")) {
    const rootRef = ir.nodeRefs[0]!;
    nodes.set(rootRef, rootElement);
    pendingNodeRefs.delete(rootRef);
    rootElement.removeAttribute(elementRefAttribute);
  }

  if (pendingNodeRefs.size === 0 && pendingAnchorRefs.size === 0 && pendingStartRefs.size === 0) {
    return { nodes, anchors, starts };
  }

  const whatToShow =
    (pendingNodeRefs.size > 0 ? NodeFilter.SHOW_ELEMENT : 0) |
    (pendingAnchorRefs.size > 0 || pendingStartRefs.size > 0 ? NodeFilter.SHOW_COMMENT : 0);
  const walker = document.createTreeWalker(root, whatToShow);

  inspectRefNode(root, pendingNodeRefs, pendingAnchorRefs, pendingStartRefs, nodes, anchors, starts);

  while (walker.nextNode() !== null && (pendingNodeRefs.size > 0 || pendingAnchorRefs.size > 0 || pendingStartRefs.size > 0)) {
    inspectRefNode(
      walker.currentNode,
      pendingNodeRefs,
      pendingAnchorRefs,
      pendingStartRefs,
      nodes,
      anchors,
      starts,
    );
  }

  return { nodes, anchors, starts };
}

function claimHydrationRoot(ir: DOMTemplateIR, boundNodeRefs: ReadonlySet<string>): Element {
  const boundary = getHydrationBoundary();

  if (boundary === null) {
    throw createHydrationError("Hydration requested without an active boundary.", { boundary });
  }

  const rootRef = ir.nodeRefs[0];

  if (rootRef === undefined) {
    throw new Error("Hydration requires a stable root node ref on every template.");
  }

  const expectedRoot = getExpectedRootElement(ir.html);
  const rootNeedsMarker = boundNodeRefs.has(rootRef);

  for (
    let current = boundary.cursor;
    current !== boundary.end && current !== null;
    current = current.nextSibling
  ) {
    if (current.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = current as Element;

    if (rootNeedsMarker) {
      if (element.getAttribute(elementRefAttribute) !== rootRef) {
        continue;
      }
    } else if (expectedRoot !== null && !matchesStructuralRoot(expectedRoot, element)) {
      continue;
    }

    boundary.cursor = element.nextSibling;
    return element;
  }

  if (rootNeedsMarker) {
    throw createHydrationError(`Missing hydrated root ref "${rootRef}" in DOM.`, { boundary });
  }

  throw createHydrationError(
    `Missing hydrated root element ${expectedRoot === null ? `"${rootRef}"` : formatExpectedRootPreview(expectedRoot)} in DOM.`,
    { boundary },
  );
}

function collectHydratedInsertNodes(start: Comment, anchor: Comment): Node[] {
  if (start.parentNode !== anchor.parentNode || start.parentNode === null) {
    throw createHydrationError("Hydration markers must share the same parent node.", {
      container: anchor.parentNode ?? start.parentNode,
    });
  }

  const nodes: Node[] = [];

  for (let current = start.nextSibling; current !== null && current !== anchor; current = current.nextSibling) {
    nodes.push(current);
  }

  return nodes;
}

function mountInsertBinding(anchor: Comment, evaluate: () => unknown, start?: Comment): void {
  let currentNodes: Node[] = start === undefined ? [] : collectHydratedInsertNodes(start, anchor);
  let hydrating = start !== undefined;

  effect(() => {
    if (hydrating) {
      const parent = anchor.parentNode;

      if (parent === null) {
        throw createHydrationError("Hydrated insert anchor is missing its parent node.", {
          boundary: getHydrationBoundary(),
        });
      }

      withHydrationBoundary(parent, start?.nextSibling ?? anchor, anchor, () => {
        return evaluate();
      });

      start?.parentNode?.removeChild(start);
      hydrating = false;
      return;
    }

    currentNodes = mountValueBeforeAnchor(anchor, currentNodes, evaluate() as never);
  });
}

function mountAttributeBinding(element: Element, name: string, evaluate: () => unknown): void {
  effect(() => {
    setAttributeOrProperty(element, name, evaluate());
  });
}

function mountEventBinding(
  element: Element,
  name: string,
  handler: (event: Event) => unknown,
): void {
  const eventName = name.toLowerCase();
  const listener = (event: Event) => {
    handler(event);
  };

  element.addEventListener(eventName, listener);
  onCleanup(() => element.removeEventListener(eventName, listener));
}

export function createTemplateInstance(ir: DOMTemplateIR, bindings: DOMBinding[]): Node {
  const boundary = getHydrationBoundary();
  const boundNodeRefs = collectBoundNodeRefs(bindings);
  const root = boundary === null ? cloneTemplate(ir.html) : claimHydrationRoot(ir, boundNodeRefs);
  const refs = resolveRefs(root, ir);

  for (const binding of bindings) {
    if (binding.kind === "insert") {
      const anchor = refs.anchors.get(binding.ref);

      if (anchor === undefined) {
        throw new Error(`Missing anchor ref "${binding.ref}" in template.`);
      }

      mountInsertBinding(anchor, binding.evaluate, refs.starts.get(binding.ref));
      continue;
    }

    const element = refs.nodes.get(binding.ref);

    if (element === undefined) {
      throw new Error(`Missing node ref "${binding.ref}" in template.`);
    }

    if (binding.kind === "attribute") {
      mountAttributeBinding(element, binding.name, binding.evaluate);
      continue;
    }

    mountEventBinding(element, binding.name, binding.handler);
  }

  if (root instanceof DocumentFragment) {
    return root.childNodes.length === 1 ? root.firstChild! : root;
  }

  return root;
}
