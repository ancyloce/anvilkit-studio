/**
 * `@anvilkit/core/testing` — reusable test fixtures for plugin
 * authors. Promoted out of repeated copy-paste in first-party plugin
 * test files (phase4-012). The goal is that a plugin scaffold can
 * import from here and have a runnable baseline test with no
 * external stubbing.
 *
 * Stability: the shape of `createFakeStudioContext()` mirrors the
 * real `StudioPluginContext` interface from `@anvilkit/core/types`.
 * If that interface changes, this export moves in lockstep — hence
 * the subpath name, which pins consumers to a version-aligned
 * fixture.
 */
export type {
	FakeStudioContext,
	FakeStudioContextOverrides,
} from "./create-fake-studio-context.js";
export { createFakeStudioContext } from "./create-fake-studio-context.js";
export { createFakePageIR } from "./create-fake-page-ir.js";
export type {
	PluginLifecycleHarness,
	RegisterPluginOptions,
} from "./register-plugin.js";
export { registerPlugin } from "./register-plugin.js";
