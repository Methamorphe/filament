import { createSSRTemplate, renderSSRValue, withServerRenderContext } from "./internal.js";

export { createSSRTemplate };

export interface RenderToStringOptions {
  hydrate?: boolean;
}

export function renderToString(
  input: unknown | (() => unknown),
  options: RenderToStringOptions = {},
): string {
  return withServerRenderContext({ hydrate: options.hydrate === true }, () => {
    const value = typeof input === "function" ? (input as () => unknown)() : input;
    return renderSSRValue(value);
  });
}
