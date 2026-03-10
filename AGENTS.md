# AGENTS.md

## Mission

Filament is an experimental TSX-first frontend framework built around:

- TypeScript authoring for application developers
- a Rust compiler and tooling pipeline
- fine-grained reactivity
- direct DOM updates
- an SSR-first architecture

These constraints are non-negotiable:

- no Virtual DOM runtime
- no hidden reconciliation fallback
- no component rerender loop as the primary update model
- keep the compiler/runtime contract explicit
- keep the browser runtime small and understandable

## Current Project State

This repository is still in the foundation plus MVP stage.

- `packages/core` contains the runtime primitives and DOM helpers
- `packages/vite-plugin` contains the TSX transform and Vite integration
- `packages/server` is the SSR boundary
- `packages/create-filament` is the future project bootstrapper
- `apps/playground` is the end-to-end smoke environment
- `crates/*` define the long-term Rust compiler pipeline boundaries

Before making architectural changes, read:

- `README.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`

Those documents are the current source of truth for scope, terminology, and system boundaries.

## Repository Map

- `apps/playground`: live integration surface for runtime plus compiler behavior
- `apps/docs`: placeholder for future public documentation
- `packages/core/src/reactivity`: signals, memos, effects, owner scopes, cleanup
- `packages/core/src/dom`: render helpers, template cloning, control flow
- `packages/vite-plugin/src/compiler`: compiler IR and TSX transform work
- `packages/server/src`: SSR-facing APIs
- `crates/filament_parser`: parsing boundary
- `crates/filament_ir`: shared compiler IR
- `crates/filament_codegen_dom`: client DOM codegen
- `crates/filament_codegen_ssr`: SSR codegen
- `crates/filament_optimizer`: optimization passes
- `crates/filament_cli`: internal CLI and orchestration

## Commands That Exist Today

Run these from the repository root:

- `pnpm build`
- `pnpm test`
- `pnpm typecheck`
- `pnpm dev`
- `pnpm check:rust`

Package-level commands currently follow the same pattern:

- TypeScript packages expose `build` and `typecheck`
- packages may also expose `test` once they add real coverage
- the playground exposes `dev`, `build`, `preview`, `test`, and `typecheck`
- Rust validation currently goes through `cargo check --workspace`

If you introduce a new persistent workflow such as `test`, `lint`, or `bench`, wire it consistently:

1. add a package-local script where the work actually lives
2. expose a root script if it matters repo-wide
3. add the corresponding Turbo task when it should participate in workspace orchestration

## Working Rules

- Prefer the smallest correct layer for a change. Do not patch the playground to hide a runtime or compiler bug.
- Preserve package and crate boundaries. Shared behavior belongs in the correct reusable package or crate, not in an app.
- Public API changes must be deliberate. If an export, runtime semantic, or compiler behavior changes, update docs in the same change.
- Keep dependencies tight. Do not add a new dependency unless it materially reduces complexity or unlocks required capability.
- Favor explicit data structures over magical behavior, especially in compiler and reactivity code.
- Error messages and diagnostics are part of the product. Make them actionable and written in English.
- Public-facing docs, examples, comments tied to OSS usage, and contributor-facing messages should stay in English for consistency with the repository.
- Do not hand-edit generated or disposable outputs unless the task explicitly requires it. This includes `dist/`, `.turbo/`, `target/`, and `*.tsbuildinfo`.
- Keep examples copy-pastable. If a public API changes, update the README or playground example immediately.

## Testing Policy

Tests are required for any non-trivial logic change. Do not skip test coverage just because the repository is still early.

- Bug fixes require a regression test.
- New public runtime behavior requires unit tests.
- Compiler changes require transform or IR coverage.
- DOM behavior changes require DOM-oriented assertions, not only typechecks.
- SSR behavior changes require server-rendering assertions.

Preferred testing strategy:

- TypeScript packages: use Vitest when adding or extending test infrastructure
- DOM-oriented TypeScript tests: use `jsdom` or `happy-dom`, whichever keeps the test minimal and deterministic
- Rust crates: use `cargo test`, with unit tests in the crate and integration tests in `crates/<name>/tests`

Minimum areas to protect over time:

- `packages/core` reactivity semantics: dependency tracking, batching, cleanup, owner disposal
- `packages/core` DOM helpers: template cloning, bindings, event wiring, `Show`, `For`
- `packages/vite-plugin` compiler output: TSX transform fixtures, structural snapshots, invalid input diagnostics
- `packages/server` SSR output: HTML escaping, structural parity, serialization behavior
- Rust crates: parser correctness, IR stability, optimizer passes, codegen invariants

Testing style rules:

- Prefer targeted assertions over giant snapshots.
- Use snapshots only when the generated structure is the behavior being protected.
- Cover edge cases and cleanup behavior, not only happy paths.
- When adding the first tests to a package, also add a package-level `test` script instead of relying on ad hoc commands.

## Production Readiness Rules

- Favor stable semantics over clever implementation shortcuts.
- Treat escaping, serialization, and DOM mutation safety as security-sensitive code paths.
- Keep runtime allocations and subscriptions intentional. Filament should stay cheap at runtime.
- Avoid introducing hidden fallback behavior that would make debugging or performance characteristics unclear.
- Add feature gates or clear TODO markers only when they map to an explicit roadmap item.
- Do not leave silent partial implementations. If something is unsupported, fail clearly.

## Open Source Contribution Rules

- Optimize for readable diffs and small, reviewable changes.
- Keep public APIs documented close to the code and in the main docs when relevant.
- When behavior changes, update the example usage and the relevant architecture or roadmap note.
- Prefer backwards-compatible evolution for published packages. If a breaking change is necessary, document the migration impact.
- Do not introduce repo-specific tribal knowledge. Put durable contributor guidance in tracked docs.
- New contributor-facing workflows should be scriptable from the repo root.

## Documentation Sync

Update documentation in the same change when you modify:

- public API names or signatures
- architectural boundaries
- roadmap scope or sequence
- required developer commands
- project positioning or terminology

At minimum, consider whether the change should touch:

- `README.md`
- `ARCHITECTURE.md`
- `ROADMAP.md`
- this `AGENTS.md`
