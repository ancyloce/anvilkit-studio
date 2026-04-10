// Barrel for `@anvilkit/core/runtime`.
//
// Populated by `core-008` (plugin engine, errors, lifecycle) and
// `core-009` (export registry, header action composition). MUST
// remain React-free — architecture constraint enforced in `core-015`
// quality gates.

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
	type ExportRegistry,
	createExportRegistry,
} from "./export-registry.js";
export {
	type StudioHeaderAction,
	composeHeaderActions,
} from "./header-actions.js";
export {
	type LifecycleEventName,
	type LifecycleManager,
	type LifecycleSubscriber,
	createLifecycleManager,
} from "./lifecycle-manager.js";
export { CORE_VERSION } from "./version.js";
