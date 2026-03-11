import { afterEach, describe, expect, it, vi } from "vitest";
import { createTemplateInstance } from "../internal.js";
import { hydrate, setAttributeOrProperty } from "./render";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("setAttributeOrProperty", () => {
  it("writes SVG points as an attribute instead of a read-only property", () => {
    const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");

    expect(() => {
      setAttributeOrProperty(polyline, "points", "0,10 10,0 20,10");
    }).not.toThrow();

    expect(polyline.getAttribute("points")).toBe("0,10 10,0 20,10");
  });

  it("still uses DOM properties for HTML elements when appropriate", () => {
    const input = document.createElement("input");

    setAttributeOrProperty(input, "value", "hello");

    expect(input.value).toBe("hello");
    expect(input.getAttribute("value")).toBe(null);
  });
});

describe("hydrate diagnostics", () => {
  it("claims static single-root templates with no node refs", () => {
    const container = document.createElement("div");

    container.innerHTML = "<button>ready</button>";

    const dispose = hydrate(
      () =>
        createTemplateInstance(
          {
            html: "<button>ready</button>",
            nodeRefs: [],
            anchorRefs: [],
          },
          [],
        ),
      container,
    );

    try {
      expect(container.innerHTML).toBe("<button>ready</button>");
    } finally {
      dispose();
    }
  });

  it("claims unbound single-root templates without server node markers", () => {
    const container = document.createElement("div");

    container.innerHTML = "<button>ready</button>";

    const dispose = hydrate(
      () =>
        createTemplateInstance(
          {
            html: '<button data-f-node="t0-n0">ready</button>',
            nodeRefs: ["t0-n0"],
            anchorRefs: [],
          },
          [],
        ),
      container,
    );

    try {
      expect(container.innerHTML).toBe("<button>ready</button>");
    } finally {
      dispose();
    }
  });

  it("includes boundary context when the expected hydrated root is missing", () => {
    const container = document.createElement("div");

    container.innerHTML = '<span data-f-node="other">idle</span>';

    let message = "";

    try {
      hydrate(
        () =>
          createTemplateInstance(
            {
              html: '<button data-f-node="t0-n0">ready</button>',
              nodeRefs: ["t0-n0"],
              anchorRefs: [],
            },
            [
              {
                kind: "attribute",
                ref: "t0-n0",
                name: "className",
                evaluate: () => "hot",
              },
            ],
          ),
        container,
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Missing hydrated root ref "t0-n0" in DOM.');
    expect(message).toContain("Hydration boundary:");
    expect(message).toContain("parent=<div>");
    expect(message).toContain('cursor=<span data-f-node="other">');
    expect(message).toContain('remaining=<span data-f-node="other">');
  });

  it("includes the expected root preview when an unbound root cannot be claimed structurally", () => {
    const container = document.createElement("div");

    container.innerHTML = "<span>ready</span>";

    let message = "";

    try {
      hydrate(
        () =>
          createTemplateInstance(
            {
              html: '<button data-f-node="t0-n0">ready</button>',
              nodeRefs: ["t0-n0"],
              anchorRefs: [],
            },
            [],
          ),
        container,
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toContain('Missing hydrated root element <button> in DOM.');
    expect(message).toContain("Hydration boundary:");
    expect(message).toContain('remaining=<span>');
  });
});

describe("template fast paths", () => {
  it("skips tree walking for static single-root templates", () => {
    const walkerSpy = vi.spyOn(document, "createTreeWalker");
    const node = createTemplateInstance(
      {
        html: "<button>ready</button>",
        nodeRefs: [],
        anchorRefs: [],
      },
      [],
    ) as HTMLButtonElement;

    expect(node.outerHTML).toBe("<button>ready</button>");
    expect(walkerSpy).not.toHaveBeenCalled();
  });

  it("skips tree walking for single-root templates with only root bindings", () => {
    const walkerSpy = vi.spyOn(document, "createTreeWalker");
    const node = createTemplateInstance(
      {
        html: '<button data-f-node="t0-n0">ready</button>',
        nodeRefs: ["t0-n0"],
        anchorRefs: [],
      },
      [
        {
          kind: "attribute",
          ref: "t0-n0",
          name: "className",
          evaluate: () => "hot",
        },
      ],
    ) as HTMLButtonElement;

    expect(node.outerHTML).toBe('<button class="hot">ready</button>');
    expect(walkerSpy).not.toHaveBeenCalled();
  });

  it("walks only comments when the root is already resolved and only anchors remain", () => {
    const walkerSpy = vi.spyOn(document, "createTreeWalker");

    const node = createTemplateInstance(
      {
        html: '<section data-f-node="t0-n0"><!--filament-anchor:t0-a0--></section>',
        nodeRefs: ["t0-n0"],
        anchorRefs: ["t0-a0"],
      },
      [
        {
          kind: "insert",
          ref: "t0-a0",
          evaluate: () => "ready",
        },
      ],
    ) as HTMLElement;

    expect(node.outerHTML).toContain("ready");
    expect(node.outerHTML).toContain("filament-anchor:t0-a0");
    expect(walkerSpy).toHaveBeenCalled();
    expect(walkerSpy.mock.calls.at(-1)?.[1]).toBe(NodeFilter.SHOW_COMMENT);
  });

  it("hydrates anchor-only roots without requiring a root node ref", () => {
    const container = document.createElement("div");

    container.innerHTML =
      "<section><!--filament-start:t0-a0-->ready<!--filament-anchor:t0-a0--></section>";

    const dispose = hydrate(
      () =>
        createTemplateInstance(
          {
            html: "<section><!--filament-anchor:t0-a0--></section>",
            nodeRefs: [],
            anchorRefs: ["t0-a0"],
          },
          [
            {
              kind: "insert",
              ref: "t0-a0",
              evaluate: () => "ready",
            },
          ],
        ),
      container,
    );

    try {
      expect(container.innerHTML).toBe("<section>ready<!--filament-anchor:t0-a0--></section>");
    } finally {
      dispose();
    }
  });
});
