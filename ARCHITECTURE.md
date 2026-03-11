# Filament Architecture

## Overview

Filament is a TSX framework with:

- a developer-facing API in TypeScript
- a compiler and tooling pipeline in Rust
- a fine-grained reactive runtime
- no Virtual DOM at runtime

The central architectural idea is simple:

**Compile TSX into static templates, reactive bindings, and direct DOM operations.**

## High-Level System

```text
TSX Source
  -> Parse
  -> Analyze reactivity
  -> Split static vs dynamic
  -> Build Reactive DOM IR
  -> Generate client DOM code
  -> Generate SSR code
  -> Bundle
```

## Major Layers

### 1. Authoring Layer

This is what application developers write:

- `.ts`
- `.tsx`
- components
- signals
- routing
- server utilities

This layer must feel natural to web developers.

### 2. Compiler Layer

This is the core internal intelligence of Filament:

- parse TSX
- inspect expressions
- classify bindings
- build IR
- optimize output
- emit runtime code

This layer is implemented in Rust over time, even if early bootstrapping steps use TypeScript tooling.

### 3. Runtime Layer

This is what executes in the browser:

- signals
- subscribers
- owner scopes
- direct DOM binding functions
- event listeners
- control-flow mounting and unmounting

This layer should stay small and understandable.

### 4. Server Layer

This is what renders HTML on the server:

- SSR rendering
- serialization of state when needed
- hydration metadata emission
- future streaming and resumability hooks

## Design Goals

### Goal 1: No Virtual DOM

Filament should not create a generic runtime tree for diffing.
No hidden reconciler should exist as a fallback.

### Goal 2: Fine-Grained Updates

A state change should trigger only the minimal work necessary to update the DOM.

### Goal 3: Static Extraction

Templates should be aggressively split into:

- static structure
- dynamic bindings
- event handlers

### Goal 4: Explicit Ownership

Each reactive computation and each mounted UI subtree should belong to an owner scope.

### Goal 5: Incremental Expandability

The initial design must support later upgrades:

- SSR improvements
- hydration
- streaming
- resumability
- devtools

## Public Runtime Model

### Signals

Signals are the primary reactive primitive.

Conceptual API:

```ts
const count = signal(0);

count();          // read
count.set(1);     // write
count.update((v) => v + 1);
```

Signal reads inside reactive contexts establish dependencies.

### Memos

Memos derive values from signals:

```ts
const doubled = memo(() => count() * 2);
```

A memo should recompute only when one of its tracked dependencies changes.

### Effects

Effects perform side effects in response to reactive changes:

```ts
effect(() => {
  console.log(count());
});
```

Effects should:

- track dependencies during execution
- rerun when those dependencies change
- clean up automatically when their owner scope is disposed

### Owner Scopes

Owner scopes are lifecycle boundaries for:

- effects
- cleanups
- subscriptions
- mounted reactive blocks
- list items
- conditional branches

This is critical because Filament does not use component rerender cycles as a cleanup mechanism.

## Compiler Model

### Parse Stage

Input:

- TypeScript and TSX source
- import graph metadata
- compile configuration

Output:

- syntax tree
- Filament-specific semantic hints

Responsibilities:

- identify components
- detect JSX and TSX nodes
- collect imported primitives
- preserve source map information

### Binding Analysis Stage

This stage identifies:

- static nodes
- dynamic text expressions
- dynamic attributes
- dynamic properties
- event handlers
- control-flow blocks
- list blocks

It should answer:

- which expressions are reactive
- which DOM nodes depend on which signals
- which values can be hoisted
- which bindings require runtime subscriptions

### Reactive Analysis Stage

This stage builds dependency information for:

- signals
- memos
- effects
- template bindings

Its goal is to convert reactive reads into explicit dependency edges.

### IR Stage

The compiler must produce a stable internal representation.

Recommended conceptual shape:

```ts
type ReactiveDomIR = {
  componentName: string;
  template: StaticNode[];
  bindings: Binding[];
  events: EventBinding[];
  controlFlow: ControlFlowNode[];
  metadata: Metadata;
};
```

#### Static Nodes

Describe template structure that can be hoisted or cloned.

#### Bindings

Represent dynamic parts such as:

- text
- attributes
- properties
- classes
- styles

#### Events

Represent event subscriptions and their target nodes.

#### Control Flow

Represent:

- conditionals
- lists
- keyed blocks
- lazy regions

#### Metadata

Carries:

- hydratable markers
- resumability eligibility
- source locations
- optimization hints

### Why the IR matters

The IR is the architectural heart of Filament.

It allows the compiler to target multiple outputs:

- browser DOM runtime
- server renderer
- hydration metadata
- future resumability metadata
- devtools introspection

Without a strong IR, the project risks becoming a loose collection of transforms instead of a coherent compiler pipeline.

### Current v0 Template Contract

Today the TypeScript transform lowers native JSX into a small shared contract consumed by both the DOM runtime and the SSR runtime.

Current shape:

```ts
type TemplateIR = {
  html: string;
  nodeRefs: string[];
  anchorRefs: string[];
};

type TemplateBinding =
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
```

Contract rules:

- `html` contains the static serialized DOM skeleton for one native JSX subtree
- `nodeRefs` identifies only elements that the runtime must address directly for bindings or hydration restore
- the template root is allowed to have no node ref when it is only claimed structurally
- `anchorRefs` identifies comment anchors used for dynamic child insertion
- `insert` bindings target an anchor and restore dynamic child content
- `attribute` bindings target an element ref and apply reactive attribute or property updates
- `event` bindings target an element ref and attach listeners on the client; SSR ignores them structurally

Hydration metadata v0 reuses this same contract instead of introducing a second compiler shape:

- hydratable SSR keeps `data-f-node="<ref>"` attributes for `nodeRefs`
- static and anchor-only roots can omit a root node ref entirely from compiler output
- root refs that exist only to let the client claim the template root can also be omitted from SSR output; the client then claims that root structurally
- hydratable SSR emits `<!--filament-start:<ref>-->...<!--filament-anchor:<ref>-->` around dynamic inserts
- `hydrate()` walks those markers, claims the existing DOM, restores effects and events, and does not rerender the subtree
- if any `data-f-node` or `filament-start:` marker remains after hydration, the runtime fails clearly with boundary or container preview context because SSR and client structure diverged

This v0 contract is intentionally small.
It keeps the compiler/runtime boundary explicit while the project is still validating control flow, SSR parity, and future hydration requirements.

## Client Code Generation

The client codegen step should emit code that:

- clones or creates static DOM nodes
- registers subscriptions for dynamic bindings
- attaches event handlers
- creates owner scopes where necessary

Source:

```tsx
<p>{count()}</p>
```

Conceptual generated output:

```ts
const p = createElement("p");
const text = createText("");
append(p, text);

effect(() => {
  setText(text, String(count()));
});
```

A later optimized version may use a more direct binding API than a generic effect wrapper.

## DOM Runtime Responsibilities

The runtime should provide:

- signal bookkeeping
- dependency tracking
- effect scheduling
- owner scope creation and disposal
- DOM helper functions
- event registration
- minimal batching

The runtime should not:

- diff trees
- re-execute whole component subtrees as the standard update path
- keep a mirrored generic UI tree

## Control Flow Model

### `Show`

Conditionals should mount and unmount branches based on reactive predicates.

This requires:

- an owner scope per branch
- branch disposal
- DOM anchor management
- SSR range markers so the active branch can be claimed during hydration

### `For`

Keyed list rendering requires:

- stable identity tracking
- item scope ownership
- efficient insert, move, and remove behavior
- SSR item-range markers so existing list items can be restored without a full rerender

Filament should not implement list updates as a generic tree diff.
It should use a specialized keyed-list strategy.

## SSR Model

The MVP SSR path can begin with string-based rendering:

- call components
- resolve static structure
- serialize reactive values synchronously
- produce an HTML string

Later phases can add:

- streaming
- async resources
- suspense boundaries
- hydration metadata
- resumable serialization

A key architectural rule:

**SSR output must align with the same structural model as client code generation.**

The compiler should not invent one structure for the client and another for the server.

## Hydration Strategy

Hydration should not begin as "rerun everything."

Filament should gradually move toward:

- precise node mapping
- binding restoration
- selective activation
- event attachment without full rerender

This is one of the main reasons the IR must track structure precisely.

## Resumability Direction

Resumability should not be forced into the MVP.
However, the architecture should leave room for it.

That means:

- stable ownership metadata
- serializable reactive state
- explicit event binding records
- clear separation between structure and execution

Resumability later becomes easier if the compiler/runtime contract is explicit from the start.

## Vite Integration

The Vite plugin should handle:

- TSX transform entry point
- development compilation
- HMR bridge
- error overlay integration
- source maps
- compiler diagnostics forwarding

At first, some transforms may remain in TypeScript or JavaScript.
The architecture should still make it clear that these steps are transitional and replaceable by the Rust pipeline.

## Error Model

Compiler diagnostics are a product feature, not an afterthought.

Filament should eventually detect:

- unstable list keys
- reactive reads in unsupported contexts
- SSR-incompatible expressions
- non-optimizable dynamic spreads
- unnecessary effects
- authoring patterns that produce avoidable runtime work

## Devtools Direction

Filament devtools should visualize:

- signals
- memos
- effects
- owner scopes
- DOM bindings
- hydration boundaries

This can become a key differentiator because Filament's model is graph-oriented rather than rerender-oriented.

## Comparison with Other Architectural Families

### Virtual DOM Frameworks

These frameworks typically:

- rerender component functions
- build a virtual tree
- diff against previous output
- patch the DOM

Filament does not want a generic rerender-and-diff loop.

### Fine-Grained Reactive Systems

These systems use dependency tracking so that only consumers of changed state update.

Filament belongs much more to this family.

### Compiler-First Systems

These systems move work to build time:

- static extraction
- code generation
- less runtime abstraction

Filament also belongs to this family.

### Resumability-Oriented Systems

These systems aim to reduce hydration cost by preserving execution state across server and client.

Filament should support that direction later, but not at the cost of blocking v0 delivery.

## Recommended Internal Boundaries

### `packages/core`

Stable public runtime primitives.
This package should remain small and carefully designed.

### `crates/filament_parser`

Responsible only for source parsing and AST preparation.

### `crates/filament_ir`

Dependency-light and central.
All code generation stages should rely on it.

### `crates/filament_codegen_dom`

Transforms IR into client output.

### `crates/filament_codegen_ssr`

Transforms IR into SSR output.

### `crates/filament_optimizer`

Runs optimizations on IR, not on stringified output.

### `packages/vite-plugin`

Orchestrates the build pipeline rather than owning compiler logic.

## MVP Architectural Constraints

For v0:

- keep the public API small
- keep the runtime tiny
- keep the compiler pipeline understandable
- avoid broad abstractions too early
- choose architectural honesty over feature breadth

## Architectural Summary

Filament is built around one central bet:

**A TSX framework can stay ergonomic and fast if components are compiled into a reactive execution graph and direct DOM bindings instead of a generic rerender-and-diff runtime.**
