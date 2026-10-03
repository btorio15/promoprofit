# Deferred items (04-02)

- `npx tsc --noEmit` reports `src/app/layout.tsx(21,50): Cannot find name LayoutProps` on the base commit. It is a Next-generated global type (needs `next typegen`/build output) and is unrelated to this plan; no other tsc errors.
