import { describe, expect, it } from "vitest";
import { effect, onCleanup, signal } from "../reactivity/signal.js";
import { For, Show } from "./control-flow.js";
import { render } from "./render.js";

interface Item {
  id: string;
}

function querySpans(container: Element): HTMLSpanElement[] {
  return Array.from(container.querySelectorAll("span"));
}

describe("For", () => {
  it("preserves item DOM identity across reorders and updates reactive indexes", () => {
    const container = document.createElement("div");
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const items = signal<Item[]>([a, b, c]);
    const createdIds: string[] = [];
    const nodesById = new Map<string, HTMLSpanElement>();

    const dispose = render(
      () =>
        For({
          each: items,
          children: (item, index) => {
            createdIds.push(item.id);

            const node = document.createElement("span");
            node.dataset.id = item.id;
            nodesById.set(item.id, node);

            effect(() => {
              node.textContent = `${item.id}:${index()}`;
            });

            return node;
          },
        }),
      container,
    );

    expect(querySpans(container).map((node) => node.textContent)).toEqual(["a:0", "b:1", "c:2"]);
    expect(createdIds).toEqual(["a", "b", "c"]);

    items.set([c, a, b]);

    const reorderedNodes = querySpans(container);

    expect(reorderedNodes.map((node) => node.textContent)).toEqual(["c:0", "a:1", "b:2"]);
    expect(reorderedNodes[0]).toBe(nodesById.get("c"));
    expect(reorderedNodes[1]).toBe(nodesById.get("a"));
    expect(reorderedNodes[2]).toBe(nodesById.get("b"));
    expect(createdIds).toEqual(["a", "b", "c"]);

    dispose();
  });

  it("disposes removed item scopes and renders the fallback when the list becomes empty", () => {
    const container = document.createElement("div");
    const a = { id: "a" };
    const b = { id: "b" };
    const c = { id: "c" };
    const items = signal<Item[]>([a, b, c]);
    const disposedIds: string[] = [];

    const dispose = render(
      () =>
        For({
          each: items,
          fallback: "empty",
          children: (item) => {
            onCleanup(() => {
              disposedIds.push(item.id);
            });

            const node = document.createElement("span");
            node.textContent = item.id;
            return node;
          },
        }),
      container,
    );

    items.set([c, a]);

    expect(querySpans(container).map((node) => node.textContent)).toEqual(["c", "a"]);
    expect(disposedIds).toEqual(["b"]);

    items.set([]);

    expect(querySpans(container)).toHaveLength(0);
    expect(container.textContent).toBe("empty");
    expect(disposedIds).toEqual(["b", "c", "a"]);

    dispose();
  });
});

describe("Show", () => {
  it("switches branches and disposes the active branch scope", () => {
    const container = document.createElement("div");
    const when = signal<{ label: string } | null>({ label: "ready" });
    const disposedLabels: string[] = [];

    const dispose = render(
      () =>
        Show({
          when,
          fallback: "idle",
          children: (value) => {
            onCleanup(() => {
              disposedLabels.push(value.label);
            });

            const node = document.createElement("span");
            node.textContent = value.label;
            return node;
          },
        }),
      container,
    );

    expect(container.textContent).toBe("ready");

    when.set(null);

    expect(container.textContent).toBe("idle");
    expect(disposedLabels).toEqual(["ready"]);

    when.set({ label: "done" });

    expect(container.textContent).toBe("done");
    expect(disposedLabels).toEqual(["ready"]);

    dispose();

    expect(disposedLabels).toEqual(["ready", "done"]);
  });
});
