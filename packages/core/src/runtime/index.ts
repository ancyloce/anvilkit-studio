// Barrel for `@anvilkit/core/runtime`.
//
// Populated by `core-008` (plugin engine — this task) and
// `core-009` (`createExportRegistry`, `composeHeaderActions`).
// MUST remain React-free — architecture constraint enforced in
// `core-015` quality gates.

export {
	type StudioRuntime,
	compilePlugins,
} from "./compile-plugins.js";
export { isPuckPlugin, isStudioPlugin } from "./detect-plugin.js";
export {
	StudioConfigError,
	StudioError,
	StudioExportError,
	StudioPluginError,
} from "./errors.js";
export {
	type LifecycleEventName,
	type LifecycleManager,
	type LifecycleSubscriber,
	createLifecycleManager,
} from "./lifecycle-manager.js";
export { CORE_VERSION } from "./version.js";
