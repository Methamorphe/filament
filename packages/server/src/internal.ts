const ELEMENT_REF_ATTRIBUTE = "data-f-node";
const ANCHOR_PREFIX = "filament-anchor:";
const SSR_CHUNK = Symbol.for("filament.ssr.chunk");

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

function createSSRChunk(html: string): SSRChunk {
  return {
    [SSR_CHUNK]: true,
    html,
  };
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
    return value.map((item) => renderSSRValue(item)).join("");
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function createSSRTemplate(ir: SSRTemplateIR, bindings: SSRBinding[]): SSRChunk {
  let html = ir.html;
  const dynamicAttributes = new Map<string, string[]>();

  for (const binding of bindings) {
    if (binding.kind === "insert") {
      html = html.replace(`<!--${ANCHOR_PREFIX}${binding.ref}-->`, renderSSRValue(binding.evaluate()));
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

  for (const ref of ir.nodeRefs) {
    const attributes = dynamicAttributes.get(ref) ?? [];
    const replacement = attributes.length > 0 ? ` ${attributes.join(" ")}` : "";
    const marker = new RegExp(`\\s${ELEMENT_REF_ATTRIBUTE}="${escapeRegExp(ref)}"`, "g");
    html = html.replace(marker, replacement);
  }

  return createSSRChunk(html);
}
