# Filament Roadmap

## Vision

Filament aims to become a modern TSX framework with:

- a familiar developer experience
- fine-grained reactivity
- no Virtual DOM runtime
- strong SSR support
- future-ready hydration and resumability hooks

The roadmap is intentionally incremental.
The first goal is not feature breadth.
The first goal is architectural proof.

## Phase 0: Foundation

### Objectives

- define project scope
- establish the monorepo
- define the public API surface
- define compiler and runtime boundaries
- create a minimal playground

### Deliverables

- pnpm workspace
- Turbo setup
- Rust workspace
- `packages/core`
- `packages/vite-plugin`
- `packages/server`
- `packages/create-filament`
- `apps/playground`
- `README.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`

### Success Criteria

- the repo boots cleanly
- packages install and link correctly
- the playground runs
- the architecture is documented and coherent

## Phase 1: Reactive Runtime MVP

### Objectives

Build a minimal fine-grained client runtime.

### Features

- `signal`
- `memo`
- `effect`
- `batch`
- `onCleanup`
- owner scopes
- cleanup disposal
- DOM helper utilities

### Deliverables

- basic runtime implementation
- dependency tracking
- effect scheduler
- cleanup support
- unit tests for reactivity primitives

### Success Criteria

- a signal update touches only the affected DOM binding
- effects rerun correctly
- nested owner scopes dispose correctly

## Phase 2: TSX Rendering MVP

### Objectives

Support a minimal TSX component authoring model.

### Features

- functional components
- text nodes
- attributes
- properties
- events
- fragments
- nested elements

### Deliverables

- initial TSX transform pipeline
- static template cloning
- dynamic text binding
- dynamic attribute binding
- event binding

### Success Criteria

- simple TSX components render correctly
- updates happen without component rerender loops
- generated output is understandable and debuggable

## Phase 3: Control Flow

### Objectives

Support common UI control-flow patterns.

### Features

- `Show`
- `For`
- keyed list rendering
- branch disposal
- scope ownership per list item

### Deliverables

- branch mounting and unmounting
- keyed list algorithm
- tests for insert, move, and remove
- ownership-aware cleanup

### Success Criteria

- conditionals clean up effects correctly
- keyed lists preserve item identity
- list updates avoid broad subtree churn

## Phase 4: SSR MVP

### Objectives

Add basic server-side rendering.

### Features

- synchronous component rendering to string
- structural parity with the client renderer
- minimal HTML serialization

### Deliverables

- `@filament/server`
- SSR examples
- SSR rendering tests

### Success Criteria

- simple components render on the server
- generated HTML matches client structure expectations
- SSR works in an example app

## Phase 5: Hydration Basics

### Objectives

Restore interactivity onto SSR output without full rerender semantics.

### Features

- DOM node matching
- event reattachment
- binding restoration
- initial owner-scope reconstruction

### Deliverables

- hydration metadata format v0
- hydration runtime path
- SSR plus client demo

### Success Criteria

- an SSR app becomes interactive on the client
- there is no hidden Virtual DOM hydration pass
- only required bindings are restored

## Phase 6: Developer Tooling

### Objectives

Improve DX and compiler ergonomics.

### Features

- compiler diagnostics
- source maps
- HMR improvements
- dev overlay integration
- starter templates

### Deliverables

- stronger Vite plugin
- CLI improvements
- diagnostics formatting
- quickstart templates

### Success Criteria

- common authoring mistakes produce useful errors
- the local development loop feels modern and fast

## Phase 7: Async and Data

### Objectives

Support more realistic applications.

### Features

- async resources
- suspense-like primitives
- server data helpers
- SSR-friendly loading semantics

### Deliverables

- `resource()`
- async rendering coordination
- examples with remote data

### Success Criteria

- async state integrates cleanly with reactivity
- SSR stories remain coherent
- loading boundaries are explicit and predictable

## Phase 8: Compiler Maturity

### Objectives

Move from research prototype to a serious compiler pipeline.

### Features

- stronger IR
- better static extraction
- binding optimization
- dead work elimination
- class and style specialization
- event delegation strategies

### Deliverables

- optimized IR passes
- codegen benchmarks
- compiler snapshots
- architecture hardening

### Success Criteria

- generated output improves measurably
- runtime size shrinks
- complex templates remain understandable

## Phase 9: Partial Activation and Resumability Research

### Objectives

Explore reducing hydration cost beyond basic restoration.

### Features

- partial activation
- lazy event attachment
- serialized owner-graph metadata
- resumability experiments

### Deliverables

- design docs
- prototype serializer
- research benchmarks

### Success Criteria

- clear data on startup-cost improvements
- explicit tradeoff analysis
- no architectural contradiction with the existing runtime model

## Phase 10: Devtools

### Objectives

Make Filament's execution model visible.

### Features

- signal inspector
- owner-scope tree
- effect graph
- DOM binding inspector
- hydration boundary view

### Deliverables

- browser devtools extension or embedded panel
- debug metadata hooks
- runtime instrumentation mode

### Success Criteria

- developers can understand why an update happened
- debugging fine-grained behavior becomes easy
- devtools reinforce Filament's differentiator

## MVP Definition

Filament MVP is complete when all of the following are true:

- application developers can write TSX components
- signals, memos, and effects work
- direct DOM updates work
- `Show` and `For` exist
- a Vite playground runs
- simple SSR rendering works
- the system does not rely on a Virtual DOM

That is enough to validate the architecture.

## What We Intentionally Delay

To avoid derailing the project, these stay out of the MVP:

- React compatibility layers
- advanced router features
- transitions
- animation systems
- resumability as a headline feature
- broad ecosystem adapters
- cross-platform native renderers

## Benchmark Plan

Once the MVP stabilizes, benchmark against:

- mount cost
- update cost
- memory usage
- hydration cost
- list operations
- SSR throughput

Recommended scenarios:

- counter
- nested dashboard widgets
- large keyed lists
- form-heavy backoffice screens
- SSR-first page with interactive islands

## Risks

### Risk 1: Compiler complexity too early

Mitigation:

- start with a tiny, explicit transform
- stabilize the IR before aggressive optimization

### Risk 2: Runtime becomes too magical

Mitigation:

- keep public primitives explicit
- keep update mechanics observable

### Risk 3: Hidden rerender patterns sneak in

Mitigation:

- document architectural invariants
- test generated output
- reject temporary Virtual DOM shortcuts

### Risk 4: SSR and client models drift apart

Mitigation:

- use the shared IR as the source of truth
- enforce structural parity tests

## Suggested 90-Day Execution

### Month 1

- monorepo
- runtime primitives
- simple playground
- TSX transform scaffold
- first working counter

### Month 2

- text, attribute, and event bindings
- `Show`
- `For`
- keyed lists
- cleanup scopes
- tests

### Month 3

- SSR string renderer
- hydration metadata draft
- docs
- benchmarks
- first public demo

## Long-Term Success Metric

Filament is successful if it proves all of the following:

- TSX DX can remain excellent without a Virtual DOM
- compiler-driven DOM codegen is maintainable
- fine-grained runtime plus owner scopes scale to real applications
- SSR and future hydration or resumability can sit on the same architecture
