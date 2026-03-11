import { describe, expect, it } from "vitest";
import { createSSRTemplate, renderToString } from "./index.js";

describe("renderToString", () => {
  it("escapes raw values and flattens arrays", () => {
    expect(renderToString(["<unsafe>", '"quoted"', 5, null, false, true])).toBe(
      "&lt;unsafe&gt;&quot;quoted&quot;5",
    );
  });
});

describe("createSSRTemplate", () => {
  it("serializes dynamic attributes, strips markers, and ignores event bindings", () => {
    const result = renderToString(
      createSSRTemplate(
        {
          html: '<button data-f-node="n0"><!--filament-anchor:a0--></button>',
          nodeRefs: ["n0"],
          anchorRefs: ["a0"],
        },
        [
          {
            kind: "attribute",
            ref: "n0",
            name: "className",
            evaluate: () => "primary",
          },
          {
            kind: "attribute",
            ref: "n0",
            name: "disabled",
            evaluate: () => true,
          },
          {
            kind: "event",
            ref: "n0",
            name: "click",
            handler: () => undefined,
          },
          {
            kind: "insert",
            ref: "a0",
            evaluate: () => "<unsafe>",
          },
        ],
      ),
    );

    expect(result).toBe('<button class="primary" disabled>&lt;unsafe&gt;</button>');
  });

  it("renders nested SSR chunks and omits false attributes", () => {
    const badge = createSSRTemplate(
      {
        html: "<strong><!--filament-anchor:a0--></strong>",
        nodeRefs: [],
        anchorRefs: ["a0"],
      },
      [
        {
          kind: "insert",
          ref: "a0",
          evaluate: () => "Hi",
        },
      ],
    );

    const card = createSSRTemplate(
      {
        html: '<div data-f-node="n0"><!--filament-anchor:a0--></div>',
        nodeRefs: ["n0"],
        anchorRefs: ["a0"],
      },
      [
        {
          kind: "attribute",
          ref: "n0",
          name: "hidden",
          evaluate: () => false,
        },
        {
          kind: "insert",
          ref: "a0",
          evaluate: () => [badge, " <ok>"],
        },
      ],
    );

    expect(renderToString(() => card)).toBe("<div><strong>Hi</strong> &lt;ok&gt;</div>");
  });

  it("keeps root and insert metadata when hydration markers are requested", () => {
    const result = renderToString(
      () =>
        createSSRTemplate(
        {
          html: '<button data-f-node="n0"><!--filament-anchor:a0--></button>',
          nodeRefs: ["n0"],
          anchorRefs: ["a0"],
        },
        [
          {
            kind: "event",
            ref: "n0",
            name: "click",
            handler: () => undefined,
          },
          {
            kind: "insert",
            ref: "a0",
            evaluate: () => "Count 1",
          },
        ],
        ),
      { hydrate: true },
    );

    expect(result).toBe(
      '<button data-f-node="n0"><!--filament-start:a0-->Count 1<!--filament-anchor:a0--></button>',
    );
  });

  it("omits root markers when the root ref is only used for hydration claim", () => {
    const result = renderToString(
      () =>
        createSSRTemplate(
          {
            html: '<section data-f-node="n0"><!--filament-anchor:a0--></section>',
            nodeRefs: ["n0"],
            anchorRefs: ["a0"],
          },
          [
            {
              kind: "insert",
              ref: "a0",
              evaluate: () => "Count 1",
            },
          ],
        ),
      { hydrate: true },
    );

    expect(result).toBe('<section><!--filament-start:a0-->Count 1<!--filament-anchor:a0--></section>');
  });
});
