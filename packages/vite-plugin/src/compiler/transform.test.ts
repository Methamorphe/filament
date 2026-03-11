import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import type { TransformOptions } from "./ir.js";
import { transformFilamentModule } from "./transform.js";

type HelperKind = "dom" | "ssr";

interface HelperCapture {
  helper: HelperKind;
  ir: {
    html: string;
    nodeRefs: string[];
    anchorRefs: string[];
  };
  bindings: Array<Record<string, unknown>>;
}

const tempDirs: string[] = [];
const captureKeys: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));

  for (const key of captureKeys.splice(0)) {
    delete (globalThis as Record<string, unknown>)[key];
  }
});

async function loadTransformedModule(source: string, options: TransformOptions) {
  const result = transformFilamentModule(source, "/virtual/View.tsx", options);
  const tempDir = await mkdtemp(join(tmpdir(), "filament-transform-"));
  const helperFileName = options.ssr ? "filament-server-internal.mjs" : "filament-core-internal.mjs";
  const helperExport = options.ssr ? "createSSRTemplate" : "createTemplateInstance";
  const helperKind: HelperKind = options.ssr ? "ssr" : "dom";
  const captureKey = `__filament_capture_${Math.random().toString(36).slice(2)}`;
  const captures: HelperCapture[] = [];

  tempDirs.push(tempDir);
  captureKeys.push(captureKey);
  (globalThis as Record<string, unknown>)[captureKey] = captures;

  await writeFile(
    join(tempDir, helperFileName),
    [
      `export function ${helperExport}(ir, bindings) {`,
      `  globalThis[${JSON.stringify(captureKey)}].push({ helper: ${JSON.stringify(helperKind)}, ir, bindings });`,
      `  return { helper: ${JSON.stringify(helperKind)}, ir, bindings };`,
      "}",
      "",
    ].join("\n"),
    "utf8",
  );

  const helperSource = options.ssr ? "@filament/server/internal" : "@filament/core/internal";
  const rewrittenCode = (result.code ?? "").replaceAll(
    JSON.stringify(helperSource),
    JSON.stringify(`./${helperFileName}`),
  );
  const modulePath = join(tempDir, "module.mjs");

  await writeFile(modulePath, rewrittenCode, "utf8");

  const exports = await import(
    `${pathToFileURL(modulePath).href}?t=${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  return {
    code: result.code ?? "",
    captures,
    exports,
  };
}

function summarizeBindings(bindings: Array<Record<string, unknown>>) {
  return bindings.map((binding) => {
    const summary: Record<string, unknown> = {
      kind: binding.kind,
      ref: binding.ref,
    };

    if ("name" in binding) {
      summary.name = binding.name;
    }

    if ("evaluate" in binding && typeof binding.evaluate === "function") {
      summary.value = binding.evaluate();
    }

    if ("handler" in binding && typeof binding.handler === "function") {
      summary.value = binding.handler(undefined);
    }

    return summary;
  });
}

describe("transformFilamentModule", () => {
  it("lowers native elements into template IR and runtime bindings", async () => {
    const source = `
      const label = "Hello";
      const tooltip = "<unsafe>";
      const active = true;
      const handle = () => "clicked";

      export function View() {
        return (
          <button className="primary" data-title={tooltip} disabled={active} onClick={handle}>
            <>
              <strong>Hot</strong>
              {label}
            </>
          </button>
        );
      }
    `;

    const module = await loadTransformedModule(source, { ssr: false });
    const value = module.exports.View();

    expect(module.code).toContain('@filament/core/internal');
    expect(module.captures).toHaveLength(1);
    expect(value.helper).toBe("dom");
    expect(module.captures[0]?.ir).toEqual({
      html: '<button data-f-node="t0-n0" class="primary"><strong>Hot</strong><!--filament-anchor:t0-a0--></button>',
      nodeRefs: ["t0-n0"],
      anchorRefs: ["t0-a0"],
    });
    expect(summarizeBindings(module.captures[0]?.bindings ?? [])).toEqual([
      { kind: "attribute", ref: "t0-n0", name: "data-title", value: "<unsafe>" },
      { kind: "attribute", ref: "t0-n0", name: "disabled", value: true },
      { kind: "event", ref: "t0-n0", name: "click", value: "clicked" },
      { kind: "insert", ref: "t0-a0", value: "Hello" },
    ]);
  });

  it("keeps the template contract aligned between DOM and SSR helpers", async () => {
    const source = `
      const count = 3;
      const hidden = false;
      const handle = () => "tap";

      export function View() {
        return (
          <section className="card" hidden={hidden} onClick={handle}>
            <span>{count}</span>
          </section>
        );
      }
    `;

    const domModule = await loadTransformedModule(source, { ssr: false });
    const ssrModule = await loadTransformedModule(source, { ssr: true });

    domModule.exports.View();
    ssrModule.exports.View();

    expect(domModule.code).toContain('@filament/core/internal');
    expect(ssrModule.code).toContain('@filament/server/internal');
    expect(domModule.captures[0]?.ir).toEqual(ssrModule.captures[0]?.ir);
    expect(summarizeBindings(domModule.captures[0]?.bindings ?? [])).toEqual(
      summarizeBindings(ssrModule.captures[0]?.bindings ?? []),
    );
  });

  it("lowers component props, spreads, member expressions, and fragment children", async () => {
    const source = `
      const extra = { role: "status" };
      const UI = { Item: (props) => props };

      export function View() {
        return (
          <UI.Item label="ready" {...extra}>
            <>
              <span>Hi</span>
              {"!"}
            </>
          </UI.Item>
        );
      }
    `;

    const module = await loadTransformedModule(source, { ssr: false });
    const value = module.exports.View();

    expect(value).toMatchObject({
      label: "ready",
      role: "status",
    });
    expect(module.captures).toHaveLength(1);
    expect(module.captures[0]?.ir).toEqual({
      html: '<span data-f-node="t0-n0">Hi</span>',
      nodeRefs: ["t0-n0"],
      anchorRefs: [],
    });
    expect(Array.isArray(value.children)).toBe(true);
    expect(value.children).toHaveLength(2);
    expect(value.children[0]).toMatchObject({
      helper: "dom",
      ir: {
        html: '<span data-f-node="t0-n0">Hi</span>',
        nodeRefs: ["t0-n0"],
        anchorRefs: [],
      },
    });
    expect(value.children[1]).toBe("!");
  });

  it("collapses empty fragments to null and single-child fragments to the child value", async () => {
    const source = `
      export function Empty() {
        return <></>;
      }

      export function Single() {
        return <>{42}</>;
      }
    `;

    const module = await loadTransformedModule(source, { ssr: false });

    expect(module.exports.Empty()).toBeNull();
    expect(module.exports.Single()).toBe(42);
  });

  it("rejects spread attributes on native elements", () => {
    const source = `
      const props = { id: "x" };

      export function View() {
        return <div {...props} />;
      }
    `;

    expect(() => transformFilamentModule(source, "/virtual/View.tsx", { ssr: false })).toThrow(
      "Filament v0 does not support spread attributes on native elements.",
    );
  });

  it("rejects JSX spread children", () => {
    const source = `
      const children = ["x"];

      export function View() {
        return <div>{...children}</div>;
      }
    `;

    expect(() => transformFilamentModule(source, "/virtual/View.tsx", { ssr: false })).toThrow(
      "Filament v0 does not support JSX spread children.",
    );
  });

  it("rejects namespaced component tags", () => {
    const source = `
      export function View() {
        return <ui:Button />;
      }
    `;

    expect(() => transformFilamentModule(source, "/virtual/View.tsx", { ssr: false })).toThrow(
      "Namespaced JSX component tags are not supported.",
    );
  });
});
