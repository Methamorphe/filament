export {};

declare global {
  namespace JSX {
    type Element = import("./dom/types.js").Child;

    interface ElementChildrenAttribute {
      children: {};
    }

    interface IntrinsicElements {
      [elementName: string]: Record<string, unknown>;
    }
  }
}
