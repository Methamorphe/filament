const ELEMENT_REF_ATTRIBUTE = "data-f-node";
const ANCHOR_PREFIX = "filament-anchor:";
const HYDRATION_START_PREFIX = "filament-start:";
const SSR_CHUNK = Symbol.for("filament.ssr.chunk");
const TEMPLATE_MARKER_PATTERN = new RegExp(
  `<!--${ANCHOR_PREFIX}([A-Za-z0-9_:-]+)-->|\\s${ELEMENT_REF_ATTRIBUTE}="([A-Za-z0-9_:-]+)"`,
  "g",
);
const templatePlanCache = new Map<string, TemplatePlanPart[]>();

interface RenderContext {
  hydrate: boolean;
}

type TemplatePlanPart =
  | string
  | {
      kind: "insert" | "node";
      ref: string;
    };

export interface SSRChunk {
  [SSR_CHUNK]: true;
  html: string;
}

export interface SSRTemplateIR {
  html: string;
  nodeRefs: string[];
  anchorRefs: string[];
}

export type SSRBinding =
  | {
      kind: "insert";
      ref: string;
      evaluate: () => unknown;
    }
  | {
      kind: "attribute";
      ref: string;
      name: string;
      evaluate: () => unknown;
    }
  | {
      kind: "event";
      ref: string;
      name: string;
      handler: (event: unknown) => unknown;
    };

const defaultRenderContext: RenderContext = {
  hydrate: false,
};

let currentRenderContext = defaultRenderContext;

function createSSRChunk(html: string): SSRChunk {
  return {
    [SSR_CHUNK]: true,
    html,
  };
}

export function withServerRenderContext<T>(context: RenderContext, fn: () => T): T {
  const previous = currentRenderContext;
  currentRenderContext = context;

  try {
    return fn();
  } finally {
    currentRenderContext = previous;
  }
}

function isSSRChunk(value: unknown): value is SSRChunk {
  return typeof value === "object" && value !== null && SSR_CHUNK in value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderSSRValue(value: unknown): string {
  if (isSSRChunk(value)) {
    return value.html;
  }

  if (value === null || value === undefined || value === false || value === true) {
    return "";
  }

  if (Array.isArray(value)) {
    let html = "";

    for (const item of value) {
      html += renderSSRValue(item);
    }

    return html;
  }

  return escapeHtml(String(value));
}

function renderAttribute(name: string, value: unknown): string {
  const normalizedName = name === "className" ? "class" : name;

  if (value === null || value === undefined || value === false) {
    return "";
  }

  if (value === true) {
    return normalizedName;
  }

  return `${normalizedName}="${escapeHtml(String(value))}"`;
}

function getTemplatePlan(html: string): TemplatePlanPart[] {
  const cached = templatePlanCache.get(html);

  if (cached !== undefined) {
    return cached;
  }

  const parts: TemplatePlanPart[] = [];
  let lastIndex = 0;
  TEMPLATE_MARKER_PATTERN.lastIndex = 0;

  for (let match = TEMPLATE_MARKER_PATTERN.exec(html); match !== null; match = TEMPLATE_MARKER_PATTERN.exec(html)) {
    const markerIndex = match.index;

    if (markerIndex > lastIndex) {
      parts.push(html.slice(lastIndex, markerIndex));
    }

    const anchorRef = match[1];
    const nodeRef = match[2];

    if (anchorRef !== undefined) {
      parts.push({ kind: "insert", ref: anchorRef });
    } else if (nodeRef !== undefined) {
      parts.push({ kind: "node", ref: nodeRef });
    }

    lastIndex = markerIndex + match[0].length;
  }

  if (lastIndex < html.length) {
    parts.push(html.slice(lastIndex));
  }

  templatePlanCache.set(html, parts);
  return parts;
}

export function createSSRTemplate(ir: SSRTemplateIR, bindings: SSRBinding[]): SSRChunk {
  const inserts = new Map<string, string>();
  const dynamicAttributes = new Map<string, string[]>();
  const shouldHydrate = currentRenderContext.hydrate;

  for (const binding of bindings) {
    if (binding.kind === "insert") {
      inserts.set(binding.ref, renderSSRValue(binding.evaluate()));
      continue;
    }

    if (binding.kind === "attribute") {
      const current = dynamicAttributes.get(binding.ref) ?? [];
      const serialized = renderAttribute(binding.name, binding.evaluate());

      if (serialized !== "") {
        current.push(serialized);
      }

      dynamicAttributes.set(binding.ref, current);
      continue;
    }

    if (!dynamicAttributes.has(binding.ref)) {
      dynamicAttributes.set(binding.ref, []);
    }
  }

  const plan = getTemplatePlan(ir.html);
  let html = "";

  for (const part of plan) {
    if (typeof part === "string") {
      html += part;
      continue;
    }

    if (part.kind === "insert") {
      const rendered = inserts.get(part.ref) ?? "";

      if (shouldHydrate) {
        html += `<!--${HYDRATION_START_PREFIX}${part.ref}-->${rendered}<!--${ANCHOR_PREFIX}${part.ref}-->`;
      } else {
        html += rendered;
      }

      continue;
    }

    const attributes = dynamicAttributes.get(part.ref) ?? [];
    const hydrationMarker = shouldHydrate ? `${ELEMENT_REF_ATTRIBUTE}="${part.ref}"` : "";

    if (attributes.length > 0 || hydrationMarker !== "") {
      html += ` ${[hydrationMarker, ...attributes].filter(Boolean).join(" ")}`;
    }
  }

  return createSSRChunk(html);
}
