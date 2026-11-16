# ADR 001: pnpm workspace monorepo

## Status

Accepted — 2026-11-16

## Context

Need shared Arc/QuickNode TypeScript modules and a Next.js dashboard without premature service sprawl.

## Decision

Use a pnpm workspace with `apps/web`, `packages/chain`, and `packages/quicknode`. Packages export TypeScript source; Next.js transpiles them.

## Consequences

- Shared types without publishing to npm
- CI can test packages independently
- Requires Node 20+ and pnpm
