import { createSSRTemplate, renderSSRValue } from "./internal.js";

export { createSSRTemplate };

export function renderToString(input: unknown | (() => unknown)): string {
  const value = typeof input === "function" ? (input as () => unknown)() : input;
  return renderSSRValue(value);
}
