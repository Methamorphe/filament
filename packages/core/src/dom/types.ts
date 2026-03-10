export type Child =
  | Node
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | Child[];

export type Component<Props = Record<string, unknown>> = (props: Props) => Child;

export type MaybeAccessor<T> = T | (() => T);

export interface DOMTemplateIR {
  html: string;
  nodeRefs: string[];
  anchorRefs: string[];
}

export type DOMBinding =
  | {
      kind: "insert";
      ref: string;
      evaluate: () => Child;
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
      handler: (event: Event) => unknown;
    };

export interface ShowProps<T> {
  when: MaybeAccessor<T>;
  children: Child | ((value: NonNullable<T>) => Child);
  fallback?: Child;
}

export interface ForProps<T> {
  each: MaybeAccessor<readonly T[] | T[]>;
  children: (item: T, index: () => number) => Child;
  fallback?: Child;
}

