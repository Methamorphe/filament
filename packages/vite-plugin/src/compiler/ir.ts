export interface TemplateIR {
  html: string;
  nodeRefs: string[];
  anchorRefs: string[];
}

export type TemplateBindingIR =
  | {
      kind: "insert";
      ref: string;
    }
  | {
      kind: "attribute";
      ref: string;
      name: string;
    }
  | {
      kind: "event";
      ref: string;
      name: string;
    };

export interface TransformOptions {
  ssr: boolean;
}

