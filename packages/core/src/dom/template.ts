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

function inspectRefNode(
  current: Node,
  pendingNodeRefs: Set<string>,
  pendingAnchorRefs: Set<string>,
  nodes: Map<string, Element>,
  anchors: Map<string, Comment>,
  starts: Map<string, Comment>,
): void {
  if (current.nodeType === Node.ELEMENT_NODE) {
    const element = current as Element;
    const ref = element.getAttribute(elementRefAttribute);

    if (ref !== null && pendingNodeRefs.has(ref) && !nodes.has(ref)) {
      nodes.set(ref, element);
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
      }

    return;
  }

  if (comment.data.startsWith(hydrationStartPrefix)) {
    const ref = comment.data.slice(hydrationStartPrefix.length);

    if (pendingAnchorRefs.has(ref) && !starts.has(ref)) {
      starts.set(ref, comment);
    }
  }
}

function resolveRefs(root: DocumentFragment | Element, ir: DOMTemplateIR): ResolvedRefs {
  const nodes = new Map<string, Element>();
  const anchors = new Map<string, Comment>();
  const starts = new Map<string, Comment>();
  const pendingNodeRefs = new Set(ir.nodeRefs);
  const pendingAnchorRefs = new Set(ir.anchorRefs);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);

  inspectRefNode(root, pendingNodeRefs, pendingAnchorRefs, nodes, anchors, starts);

  while (walker.nextNode() !== null) {
    inspectRefNode(walker.currentNode, pendingNodeRefs, pendingAnchorRefs, nodes, anchors, starts);
  }

  return { nodes, anchors, starts };
}

function claimHydrationRoot(ir: DOMTemplateIR): Element {
  const boundary = getHydrationBoundary();

  if (boundary === null) {
    throw createHydrationError("Hydration requested without an active boundary.", { boundary });
  }

  const rootRef = ir.nodeRefs[0];

  if (rootRef === undefined) {
    throw new Error("Hydration requires a stable root node ref on every template.");
  }

  for (
    let current = boundary.cursor;
    current !== boundary.end && current !== null;
    current = current.nextSibling
  ) {
    if (current.nodeType !== Node.ELEMENT_NODE) {
      continue;
    }

    const element = current as Element;

    if (element.getAttribute(elementRefAttribute) !== rootRef) {
      continue;
    }

    boundary.cursor = element.nextSibling;
    return element;
  }

  throw createHydrationError(`Missing hydrated root ref "${rootRef}" in DOM.`, { boundary });
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
        void evaluate();
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
  const root = boundary === null ? cloneTemplate(ir.html) : claimHydrationRoot(ir);
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
