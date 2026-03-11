# Filament

Filament is an experimental TSX-first frontend framework built around a Rust compiler pipeline, fine-grained reactivity, and direct DOM updates.

The goal is to keep a familiar TypeScript authoring experience while moving as much work as possible from runtime to compile time.

## Vision

Filament aims to deliver:

- a TSX-first developer experience
- TypeScript-only authoring for application developers
- Rust for internal compiler and tooling
- no Virtual DOM runtime
- fine-grained reactivity based on signals
- direct DOM updates
- a minimal runtime footprint
- an SSR-first architecture
- a path toward hydration, partial activation, and resumability

## Goals

- Preserve an ergonomic TSX authoring model.
- Compile components into static templates plus explicit reactive bindings.
- Update only the DOM nodes affected by state changes.
- Keep the browser runtime small and understandable.
- Make SSR part of the architecture early.
- Keep the compiler/runtime contract explicit enough to evolve.

## Non-Goals for the MVP

- React compatibility
- full ecosystem parity with existing frameworks
- React Native or mobile targets
- complex resumability from day one
- a hidden Virtual DOM fallback

## Why Filament

Most modern frontend frameworks trade off between:

- developer ergonomics
- runtime performance
- bundle size
- SSR complexity
- hydration cost

Filament is built around a simple principle:

**Keep the DX developers like, but move more work from runtime to compile time.**

Instead of:

1. re-running component render functions
2. rebuilding a virtual tree
3. diffing
4. patching the DOM

Filament wants to:

1. statically analyze TSX
2. identify static structure and dynamic bindings
3. build a reactive dependency graph
4. update only the exact DOM nodes affected by state changes

## Developer Experience

Filament applications are written in TypeScript and TSX.

```tsx
import { memo, signal } from "@filament/core";

export function Counter() {
  const count = signal(0);
  const doubled = memo(() => count() * 2);

  return (
    <section class="counter">
      <h1>Counter</h1>
      <p>Count: {count()}</p>
      <p data-double={doubled()}>Doubled: {doubled()}</p>
      <button onClick={() => count.set(count() + 1)}>+1</button>
    </section>
  );
}
```

The application developer writes normal TSX.

Filament compiles that into:

- static template creation or cloning
- dynamic text bindings
- dynamic attribute and property bindings
- event subscriptions
- direct DOM update hooks

## Core Principles

### 1. Components are composition units, not rerender units

Components structure UI, state ownership, and cleanup boundaries.
They should not imply full subtree rerender or reconciliation.

### 2. Signals are the primitive

State changes should propagate only to the exact consumers that depend on them.

### 3. Templates should be mostly static

The compiler should aggressively extract static DOM structure and isolate only the dynamic parts.

### 4. No generic tree diff

Filament should not maintain a runtime Virtual DOM and should not fall back to a hidden reconciliation engine.

### 5. Runtime should be small

The browser should execute only what is necessary to wire state changes to actual DOM updates.

### 6. SSR should be first-class

Server rendering should be part of the architecture early, not bolted on later.

## Conceptual Compilation Model

Input TSX:

```tsx
export function Counter() {
  const count = signal(0);

  return (
    <div class="card">
      <span>{count()}</span>
      <button onClick={() => count.set(count() + 1)}>+</button>
    </div>
  );
}
```

Conceptual output:

```ts
const root = cloneTemplate(T_CARD);
const spanText = getTextNode(root, 0);
const button = getNode(root, 1);

subscribe(count, (value) => setText(spanText, String(value)));
addEvent(button, "click", () => count.set(count() + 1));

return root;
```

## Monorepo Layout

The repository is organized as a monorepo and already includes the main workspace boundaries needed for the POC:

```text
filament/
├─ apps/
│  ├─ playground/
│  └─ docs/
├─ packages/
│  ├─ core/
│  ├─ vite-plugin/
│  ├─ server/
│  └─ create-filament/
├─ crates/
│  ├─ filament_parser/
│  ├─ filament_ir/
│  ├─ filament_codegen_dom/
│  ├─ filament_codegen_ssr/
│  ├─ filament_optimizer/
│  └─ filament_cli/
├─ Cargo.toml
├─ pnpm-workspace.yaml
└─ turbo.json
```

Some packages are already wired, while others are scaffolded as target boundaries for the POC and later phases.

## Public Package Responsibilities

### `@filament/core`

Client runtime primitives:

- `signal`
- `memo`
- `effect`
- `batch`
- `onCleanup`
- `render`
- `hydrate`
- `Show`
- `For`

### `@filament/vite-plugin`

Compiler integration for Vite:

- TSX transform entry point
- development diagnostics
- HMR hooks
- source map support

### `@filament/server`

SSR helpers:

- component rendering
- HTML serialization
- optional hydration metadata emission via `renderToString(..., { hydrate: true })`
- future streaming support

### `create-filament`

Starter CLI for bootstrapping new Filament projects.

## Internal Rust Crates

### `filament_parser`

Parses TSX or source inputs into an intermediate representation.

### `filament_ir`

Defines the shared internal IR used across compiler stages.

### `filament_codegen_dom`

Generates client-side DOM instructions.

### `filament_codegen_ssr`

Generates SSR rendering output and metadata.

### `filament_optimizer`

Runs compiler optimizations such as:

- static hoisting
- binding coalescing
- dead binding elimination
- hydration metadata minimization

### `filament_cli`

Internal CLI entry point and future build orchestration layer.

## MVP Scope

The MVP should support:

- functional components
- signals
- memos
- effects
- text bindings
- attribute bindings
- event bindings
- conditional rendering
- keyed list rendering
- basic SSR string rendering
- minimal Vite integration

## Current Repository Status

This repository should be treated as experimental, POC-grade software.

What already exists in the repo:

- a pnpm workspace
- a Turbo monorepo setup
- a Rust workspace
- initial package and crate boundaries
- an early core runtime surface
- a browser-side benchmark lab in `apps/playground` for direct DOM versus React VDOM update paths

What still needs to be completed to validate the architecture:

- the end-to-end TSX compiler pipeline
- a working playground app
- SSR parity and hydration groundwork
- broader automated benchmarks and stronger test coverage

## Getting Started

Install dependencies and validate the existing workspace:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm check:rust
```

`pnpm dev` runs the playground through Turbo and Vite.

The playground now includes an in-browser benchmark lab that compares Filament against a React
Virtual DOM baseline across multiple suites:

- fine-grained grid updates
- a nested multi-component dashboard
- staged async API refreshes
- graph-heavy animation and stream updates

For production benchmark runs:

```bash
pnpm --filter playground build
pnpm --filter playground preview
```

## Future Direction

After the MVP, Filament should expand toward:

- stronger SSR
- hydration
- streaming
- partial activation
- resumability-inspired execution
- devtools
- compiler diagnostics
- performance benchmarks

## Philosophy

Filament is not trying to become "React, but faster."

It is exploring a different contract:

**TSX as authoring format, signals as state primitive, compiler as optimizer, DOM as the source of truth.**

## Additional Reading

- [Architecture](./ARCHITECTURE.md)
- [Roadmap](./ROADMAP.md)
- [Licensing](./LICENSING.md)
- [Contributing](./CONTRIBUTING.md)
- [Security](./SECURITY.md)

## License

Source code in this repository is licensed under the Mozilla Public License 2.0.

See:

- [LICENSE](./LICENSE)
- [LICENSING.md](./LICENSING.md)
- [TRADEMARKS.md](./TRADEMARKS.md)

## Contributions

Issues, feedback, and design discussion are welcome.

To keep the IP chain clean while the project structure is still being finalized, code contributions are currently limited to maintainers.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the current policy.
