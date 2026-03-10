import { effect, onCleanup } from "../reactivity/signal.js";
import { mountValueBeforeAnchor, setAttributeOrProperty } from "./render.js";
import type { DOMBinding, DOMTemplateIR } from "./types.js";

const templateCache = new Map<string, HTMLTemplateElement>();
const elementRefAttribute = "data-f-node";
const anchorPrefix = "filament-anchor:";

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

function resolveRefs(fragment: DocumentFragment, ir: DOMTemplateIR) {
  const nodes = new Map<string, Element>();
  const anchors = new Map<string, Comment>();
  const pendingNodeRefs = new Set(ir.nodeRefs);
  const pendingAnchorRefs = new Set(ir.anchorRefs);
  const walker = document.createTreeWalker(
    fragment,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT,
  );

  while (walker.nextNode() !== null) {
    const current = walker.currentNode;

    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      const ref = element.getAttribute(elementRefAttribute);

      if (ref !== null && pendingNodeRefs.has(ref)) {
        nodes.set(ref, element);
        element.removeAttribute(elementRefAttribute);
      }

      continue;
    }

    if (current.nodeType === Node.COMMENT_NODE) {
      const comment = current as Comment;

      if (comment.data.startsWith(anchorPrefix)) {
        const ref = comment.data.slice(anchorPrefix.length);

        if (pendingAnchorRefs.has(ref)) {
          anchors.set(ref, comment);
        }
      }
    }
  }

  return { nodes, anchors };
}

function mountInsertBinding(anchor: Comment, evaluate: () => unknown): void {
  let currentNodes: Node[] = [];

  effect(() => {
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
  const fragment = cloneTemplate(ir.html);
  const refs = resolveRefs(fragment, ir);

  for (const binding of bindings) {
    if (binding.kind === "insert") {
      const anchor = refs.anchors.get(binding.ref);

      if (anchor === undefined) {
        throw new Error(`Missing anchor ref "${binding.ref}" in template.`);
      }

      mountInsertBinding(anchor, binding.evaluate);
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

  return fragment.childNodes.length === 1 ? fragment.firstChild! : fragment;
}
