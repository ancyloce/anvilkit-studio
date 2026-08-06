/**
 * @file PLAN-0025 §7.1 — public API of the unified appearance
 * compiler. Import via `@anvilkit/core/editor` (re-exported there);
 * this module is React-free and safe in Node, SSR, workers, and the
 * browser alike.
 */

export {
	type AppearanceCompilerCache,
	type CompiledTargetFragment,
	createAppearanceCompilerCache,
} from "./cache.js";
export {
	type CompileAppearanceInput,
	type CompiledAppearance,
	compileDocumentAppearance,
} from "./compile.js";
export { fingerprintOf } from "./diagnostics.js";
