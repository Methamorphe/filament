# Contributing

Thanks for your interest in Filament.

This repository is open for discussion, bug reports, architecture feedback, and design review.
Code contributions are intentionally more restricted for now.

## Current Policy

At the current stage of the project:

- issues and discussion are welcome
- proposed designs and API feedback are welcome
- unsolicited pull requests may be closed without review
- non-trivial code contributions are currently limited to maintainers

This is a deliberate IP policy choice while the project and its legal structure are still being finalized.

## Before Opening a Pull Request

If you think a code change is important:

1. Open an issue first.
2. Explain the problem, proposed approach, and compatibility impact.
3. Wait for maintainer confirmation before investing in a patch.

Pull requests that arrive without prior alignment may be declined even if technically correct.

## Why This Policy Exists

The goal is to keep the chain of title simple so the project can:

- stay open source
- preserve future commercial flexibility
- remain straightforward to diligence for partners or investors

Once the legal entity and contribution process are in place, the project may move to a CLA-based workflow for external code contributions.

## Contribution Standards

When contributions are requested or approved, they should:

- match the existing architecture direction
- include focused changes
- avoid drive-by refactors
- keep documentation updated when behavior changes
- preserve the "no hidden Virtual DOM" constraint

## Reporting Bugs

Please include:

- environment details
- reproduction steps
- expected behavior
- actual behavior
- relevant screenshots or stack traces if applicable

Security issues should not be filed publicly.
See [SECURITY.md](./SECURITY.md).
