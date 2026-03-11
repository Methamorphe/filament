import { createSSRTemplate, renderSSRValue, withServerRenderContext } from "./internal.js";

export { createSSRTemplate };

const CONTROL_FLOW_CONTEXT = Symbol.for("filament.control-flow.context");

export interface RenderToStringOptions {
  hydrate?: boolean;
}

interface ControlFlowContext {
  mode: "ssr" | "hydrate";
  nextId: number;
}

function beginControlFlowRender(): ControlFlowContext | null {
  const scope = globalThis as Record<string | symbol, unknown>;
  const previous = scope[CONTROL_FLOW_CONTEXT];
  scope[CONTROL_FLOW_CONTEXT] = {
    mode: "ssr",
    nextId: 0,
  } satisfies ControlFlowContext;

  return typeof previous === "object" && previous !== null && "mode" in previous
    ? (previous as ControlFlowContext)
    : null;
}

function endControlFlowRender(previous: ControlFlowContext | null): void {
  const scope = globalThis as Record<string | symbol, unknown>;

  if (previous === null) {
    delete scope[CONTROL_FLOW_CONTEXT];
    return;
  }

  scope[CONTROL_FLOW_CONTEXT] = previous;
}

export function renderToString(
  input: unknown | (() => unknown),
  options: RenderToStringOptions = {},
): string {
  return withServerRenderContext({ hydrate: options.hydrate === true }, () => {
    const previousControlFlow = beginControlFlowRender();

    try {
      const value = typeof input === "function" ? (input as () => unknown)() : input;
      return renderSSRValue(value);
    } finally {
      endControlFlowRender(previousControlFlow);
    }
  });
}
