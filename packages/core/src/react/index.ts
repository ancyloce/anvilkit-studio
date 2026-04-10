// Barrel for `@anvilkit/core/react`.
//
// Populated by:
// - core-013 → Zustand stores (`stores/{export,ai,theme}-store.ts`)
//              for Studio-level state slices.
// - core-014 → `<Studio>`, `useStudio`, and the curried per-key
//              override merge helper.
//
// Note: `src/config/` also imports React (provider + hook from
// core-012). The rule is not "only react/ touches React" but
// "React is scoped to the two domains that own it" — config/ owns
// the host config read path, react/ owns the Studio shell and its
// slice stores.

export { Studio, type StudioProps } from "./components/Studio.js";
export { useStudio, type UseStudioResult } from "./hooks/use-studio.js";
export { mergeOverrides } from "./overrides/merge-overrides.js";
export * from "./stores/index.js";
