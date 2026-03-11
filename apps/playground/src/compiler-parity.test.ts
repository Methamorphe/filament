// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from "vitest";
import { createTemplateInstance } from "@filament/core/internal";
import { hydrate, render, signal, type Signal } from "@filament/core";
import { createSSRTemplate, renderToString } from "@filament/server";
import { transformFilamentModule } from "../../../packages/vite-plugin/src/compiler/transform";
import type { TransformOptions } from "../../../packages/vite-plugin/src/compiler/ir";

function instantiateTransformedModule(
  source: string,
  options: TransformOptions,
  exportNames: string[],
  helper: unknown,
  scope: Record<string, unknown> = {},
): Record<string, unknown> {
  const result = transformFilamentModule(source, "/virtual/View.tsx", options);
  const code = result.code ?? "";
  const importMatch = code.match(/import\s+\{\s*\w+\s+as\s+(\w+)\s*\}\s+from\s+"[^"]+";/);

  if (importMatch === null) {
    throw new Error("Expected transformed module to import a Filament helper.");
  }

  const localHelper = importMatch[1]!;
  const executable = code
    .replace(importMatch[0], `const ${localHelper} = __helper;`)
    .replaceAll("export function", "function")
    .replaceAll("export const", "const");

  const scopeKeys = Object.keys(scope);

  return new Function(
    "__helper",
    ...scopeKeys,
    `${executable}\nreturn { ${exportNames.join(", ")} };`,
  )(
    helper,
    ...scopeKeys.map((key) => scope[key]),
  ) as Record<string, unknown>;
}

function cloneWithoutFilamentComments(node: Node): Node | null {
  if (node.nodeType === Node.COMMENT_NODE) {
    const comment = node as Comment;
    return comment.data.startsWith("filament-anchor:") ? null : comment.cloneNode();
  }

  const clone = node.cloneNode(false);

  for (const child of Array.from(node.childNodes)) {
    const nextChild = cloneWithoutFilamentComments(child);

    if (nextChild !== null) {
      clone.appendChild(nextChild);
    }
  }

  return clone;
}

function toComparableFragment(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  const fragment = document.createDocumentFragment();

  for (const child of Array.from(template.content.childNodes)) {
    const clone = cloneWithoutFilamentComments(child);

    if (clone !== null) {
      fragment.appendChild(clone);
    }
  }

  return fragment;
}

function decodeHtmlEntities(value: string): string {
  if (!value.includes("&")) {
    return value;
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function serializeAttributes(element: Element): Array<[string, string]> {
  return Array.from(element.attributes)
    .map((attribute) => [attribute.name, decodeHtmlEntities(attribute.value)] as [string, string])
    .sort(([left], [right]) => left.localeCompare(right));
}

function expectNodesToMatch(left: Node, right: Node): void {
  expect(left.nodeType).toBe(right.nodeType);

  if (left.nodeType === Node.TEXT_NODE) {
    expect(decodeHtmlEntities(left.textContent ?? "")).toBe(decodeHtmlEntities(right.textContent ?? ""));
    return;
  }

  if (left.nodeType === Node.ELEMENT_NODE && right.nodeType === Node.ELEMENT_NODE) {
    const leftElement = left as Element;
    const rightElement = right as Element;

    expect(leftElement.tagName).toBe(rightElement.tagName);
    expect(serializeAttributes(leftElement)).toEqual(serializeAttributes(rightElement));
  }

  const leftChildren = Array.from(left.childNodes);
  const rightChildren = Array.from(right.childNodes);

  expect(leftChildren).toHaveLength(rightChildren.length);

  for (let index = 0; index < leftChildren.length; index += 1) {
    expectNodesToMatch(leftChildren[index]!, rightChildren[index]!);
  }
}

function expectHtmlToMatch(domHtml: string, ssrHtml: string): void {
  const domFragment = toComparableFragment(domHtml);
  const ssrFragment = toComparableFragment(ssrHtml);
  const domChildren = Array.from(domFragment.childNodes);
  const ssrChildren = Array.from(ssrFragment.childNodes);

  expect(domChildren).toHaveLength(ssrChildren.length);

  for (let index = 0; index < domChildren.length; index += 1) {
    expectNodesToMatch(domChildren[index]!, ssrChildren[index]!);
  }
}

function renderParityCase(source: string, exportName = "View"): { domHtml: string; ssrHtml: string } {
  const domModule = instantiateTransformedModule(source, { ssr: false }, [exportName], createTemplateInstance);
  const ssrModule = instantiateTransformedModule(source, { ssr: true }, [exportName], createSSRTemplate);
  const domView = domModule[exportName] as () => unknown;
  const ssrView = ssrModule[exportName] as () => unknown;
  const container = document.createElement("div");
  const dispose = render(() => domView() as never, container);

  try {
    return {
      domHtml: container.innerHTML,
      ssrHtml: renderToString(() => ssrView()),
    };
  } finally {
    dispose();
  }
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("compiler DOM/SSR parity", () => {
  it("matches visible output for dynamic attributes and text inserts", () => {
    const { domHtml, ssrHtml } = renderParityCase(`
      const label = "Hello";
      const tooltip = "<unsafe>";
      const active = true;

      export function View() {
        return (
          <button className="primary" disabled={active} data-title={tooltip}>
            <span>Hot</span>
            {label}
          </button>
        );
      }
    `);

    expectHtmlToMatch(domHtml, ssrHtml);
  });

  it("matches visible output for array inserts of nested JSX elements", () => {
    const { domHtml, ssrHtml } = renderParityCase(`
      const rows = ["alpha", "beta", "gamma"];

      export function View() {
        return (
          <section aria-label="report">
            {rows.map((row, index) => (
              <article className="row" data-order={index}>
                <span>{row}</span>
              </article>
            ))}
          </section>
        );
      }
    `);

    expect(domHtml).toContain('data-order="2"');
    expectHtmlToMatch(domHtml, ssrHtml);
  });

  it("matches visible output for fragment roots", () => {
    const { domHtml, ssrHtml } = renderParityCase(`
      export function View() {
        return (
          <>
            <span>Lead</span>
            {"tail"}
          </>
        );
      }
    `);

    expect(domHtml).toBe("<span>Lead</span>tail");
    expectHtmlToMatch(domHtml, ssrHtml);
  });

  it("hydrates SSR output and restores events plus reactive bindings without remounting", () => {
    const source = `
      const count = signal(0);

      export function View() {
        return (
          <button
            className={count() > 0 ? "hot" : "cold"}
            onClick={() => count.set(count() + 1)}
          >
            Count {count()}
          </button>
        );
      }
    `;
    const scope = { signal };
    const domModule = instantiateTransformedModule(
      source,
      { ssr: false },
      ["View"],
      createTemplateInstance,
      scope,
    );
    const ssrModule = instantiateTransformedModule(
      source,
      { ssr: true },
      ["View"],
      createSSRTemplate,
      scope,
    );
    const domView = domModule.View as () => unknown;
    const ssrView = ssrModule.View as () => unknown;
    const container = document.createElement("div");

    container.innerHTML = renderToString(() => ssrView(), { hydrate: true });

    expect(container.innerHTML).toContain('data-f-node="t0-n0"');
    expect(container.innerHTML).toContain("filament-start:t0-a0");

    const button = container.firstElementChild as HTMLButtonElement | null;

    expect(button?.textContent).toBe("Count0");
    expect(button?.className).toBe("cold");

    const dispose = hydrate(() => domView() as never, container);

    try {
      const hydratedButton = container.firstElementChild as HTMLButtonElement | null;

      expect(hydratedButton?.getAttribute("data-f-node")).toBe(null);
      expect(container.innerHTML).not.toContain("filament-start:t0-a0");
      expect(container.innerHTML).toContain("filament-anchor:t0-a0");

      hydratedButton?.dispatchEvent(new Event("click"));

      expect(hydratedButton?.textContent).toBe("Count1");
      expect(hydratedButton?.className).toBe("hot");
    } finally {
      dispose();
    }

    expect(container.innerHTML).toBe("");
  });

  it("hydrates nested mapped inserts and keeps subsequent updates live", () => {
    const source = `
      export const emphasis = signal("cool");
      export const rows = signal([
        { id: "alpha", label: "Alpha", active: false },
        { id: "beta", label: "Beta", active: true }
      ]);

      export function View() {
        return (
          <section className={emphasis()}>
            {rows().map((row) => (
              <article data-row={row.id}>
                <strong>{row.label}</strong>
                {row.active ? (
                  <>
                    <span>ready</span>
                    <em>now</em>
                  </>
                ) : (
                  <span>queued</span>
                )}
              </article>
            ))}
          </section>
        );
      }
    `;
    const scope = { signal };
    const domModule = instantiateTransformedModule(
      source,
      { ssr: false },
      ["View", "rows", "emphasis"],
      createTemplateInstance,
      scope,
    );
    const ssrModule = instantiateTransformedModule(
      source,
      { ssr: true },
      ["View", "rows", "emphasis"],
      createSSRTemplate,
      scope,
    );
    const container = document.createElement("div");
    const domView = domModule.View as () => unknown;
    const ssrView = ssrModule.View as () => unknown;
    const rows = domModule.rows as Signal<
      Array<{ id: string; label: string; active: boolean }>
    >;
    const emphasis = domModule.emphasis as Signal<string>;

    container.innerHTML = renderToString(() => ssrView(), { hydrate: true });

    const dispose = hydrate(() => domView() as never, container);

    try {
      expect(container.querySelectorAll("article")).toHaveLength(2);
      expect(container.firstElementChild?.className).toBe("cool");
      expect(container.textContent).toContain("Betareadynow");

      rows.set([
        { id: "alpha", label: "Alpha", active: true },
        { id: "beta", label: "Beta", active: false },
        { id: "gamma", label: "Gamma", active: true },
      ]);
      emphasis.set("warm");

      expect(container.querySelectorAll("article")).toHaveLength(3);
      expect(container.firstElementChild?.className).toBe("warm");
      expect(container.textContent).toContain("Alphareadynow");
      expect(container.textContent).toContain("Betaqueued");
      expect(container.textContent).toContain("Gammareadynow");
    } finally {
      dispose();
    }
  });

  it("hydrates multi-node fragment roots when each child has a stable template root", () => {
    const source = `
      export const lead = signal("Lead");
      export const status = signal("Ready");

      export function View() {
        return (
          <>
            <section data-kind="lead">{lead()}</section>
            <aside data-kind="status">{status()}</aside>
          </>
        );
      }
    `;
    const scope = { signal };
    const domModule = instantiateTransformedModule(
      source,
      { ssr: false },
      ["View", "lead", "status"],
      createTemplateInstance,
      scope,
    );
    const ssrModule = instantiateTransformedModule(
      source,
      { ssr: true },
      ["View", "lead", "status"],
      createSSRTemplate,
      scope,
    );
    const domView = domModule.View as () => unknown;
    const ssrView = ssrModule.View as () => unknown;
    const lead = domModule.lead as Signal<string>;
    const status = domModule.status as Signal<string>;
    const container = document.createElement("div");

    container.innerHTML = renderToString(() => ssrView(), { hydrate: true });

    const dispose = hydrate(() => domView() as never, container);

    try {
      expect(container.children).toHaveLength(2);
      expect(container.querySelector('[data-kind="lead"]')?.textContent).toBe("Lead");
      expect(container.querySelector('[data-kind="status"]')?.textContent).toBe("Ready");

      lead.set("Core");
      status.set("Live");

      expect(container.querySelector('[data-kind="lead"]')?.textContent).toBe("Core");
      expect(container.querySelector('[data-kind="status"]')?.textContent).toBe("Live");
    } finally {
      dispose();
    }
  });
});
