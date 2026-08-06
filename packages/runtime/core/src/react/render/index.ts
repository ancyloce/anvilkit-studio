/**
 * @file `@anvilkit/core/react/render` — the RSC-safe public rendering
 * surface (PLAN-0025 §9.1). Deliberately a separate subpath from
 * `./react` and `./react/editor`: those barrels are `"use client"`
 * editor graphs, while this one must stay importable from React
 * Server Components without dragging editor chrome into the server
 * bundle.
 */

export {
	AnvilKitRender,
	type AnvilKitRenderProps,
} from "./AnvilKitRender.js";
