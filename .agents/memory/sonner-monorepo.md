---
name: sonner in pnpm monorepo
description: sonner's Toaster component crashes with "invalid hook call / multiple React copies" in this pnpm monorepo; use plain React state + window custom events instead.
---

## Rule
Do NOT use sonner's `<Toaster>` or `toast()` in the outfit-generator artifact (or other pnpm workspace artifacts). It triggers "Cannot read properties of null (reading 'useState')" — the React multiple-copies bug — on first Vite dep optimization.

**Why:** In this pnpm monorepo, sonner resolves its own React peer dependency separately from the workspace's React singleton. When Vite first optimizes sonner, it loads a different React instance, causing hook call invariant violations.

**How to apply:** For non-blocking notifications (e.g. the vision indexer "Preparing photo search…" toast), use a self-contained floating div component driven by `window.addEventListener` on a custom event and local `useState`. No external toast library needed. See `src/App.tsx` `IndexingToast` component for the pattern.
