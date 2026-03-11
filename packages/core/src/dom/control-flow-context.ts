const CONTROL_FLOW_CONTEXT = Symbol.for("filament.control-flow.context");
const SSR_CHUNK = Symbol.for("filament.ssr.chunk");

type RenderMode = "ssr" | "hydrate";

interface ControlFlowContext {
  mode: RenderMode;
  nextId: number;
}

interface SSRLikeChunk {
  [SSR_CHUNK]: true;
  html: string;
}

function getGlobalScope(): Record<string | symbol, unknown> {
  return globalThis as Record<string | symbol, unknown>;
}

export function getControlFlowMode(): RenderMode | null {
  const context = getGlobalScope()[CONTROL_FLOW_CONTEXT];
  return typeof context === "object" && context !== null && "mode" in context
    ? (context as ControlFlowContext).mode
    : null;
}

export function beginControlFlowMode(mode: RenderMode): ControlFlowContext | null {
  const previous = getGlobalScope()[CONTROL_FLOW_CONTEXT];
  const next: ControlFlowContext = {
    mode,
    nextId: 0,
  };

  getGlobalScope()[CONTROL_FLOW_CONTEXT] = next;

  return typeof previous === "object" && previous !== null && "mode" in previous
    ? (previous as ControlFlowContext)
    : null;
}

export function endControlFlowMode(previous: ControlFlowContext | null): void {
  if (previous === null) {
    delete getGlobalScope()[CONTROL_FLOW_CONTEXT];
    return;
  }

  getGlobalScope()[CONTROL_FLOW_CONTEXT] = previous;
}

export function createControlFlowId(prefix: string): string {
  const context = getGlobalScope()[CONTROL_FLOW_CONTEXT];

  if (typeof context !== "object" || context === null || !("nextId" in context)) {
    throw new Error("Control-flow ids require an active render context.");
  }

  const value = `${prefix}${(context as ControlFlowContext).nextId}`;
  (context as ControlFlowContext).nextId += 1;
  return value;
}

export function createSSRMarker(html: string): unknown {
  const chunk: SSRLikeChunk = {
    [SSR_CHUNK]: true,
    html,
  };

  return chunk;
}
