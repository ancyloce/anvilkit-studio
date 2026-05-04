/**
 * @file Public barrel for `@anvilkit/core/react/overrides`.
 *
 * Phase 3 populates this barrel with the default override preset,
 * the `createStudioOverrides` factory, and the public types. Phase 5
 * wires the singleton into `<Studio>` behind a dynamic import.
 */

export { mergeOverrides } from "./merge-overrides";
export {
	createStudioOverrides,
	studioOverrides,
} from "./preset";
export {
	type CreateStudioOverridesOptions,
	type DefaultOverrideSlot,
	type StudioChromeMode,
} from "./types";
