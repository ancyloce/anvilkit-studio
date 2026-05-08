// Barrel for `@anvilkit/core/runtime`.
//
// Populated by `core-008` (plugin engine, errors, lifecycle) and
// `core-009` (export registry, header action composition). MUST
// remain React-free — architecture constraint enforced in `core-015`
// quality gates.

export { jsonFormat } from "./built-in-formats/json-format.js";
export {
	compilePlugins,
	type StudioRuntime,
} from "./compile-plugins.js";
export { isPuckPlugin, isStudioPlugin } from "./detect-plugin.js";
export {
	StudioConfigError,
	StudioError,
	StudioExportError,
	StudioPluginError,
} from "./errors.js";
export {
	createExportRegistry,
	type ExportRegistry,
} from "./export-registry.js";
export {
	composeHeaderActions,
	type StudioHeaderAction,
} from "./header-actions.js";
export {
	createLifecycleManager,
	type LifecycleEventName,
	type LifecycleManager,
	type LifecycleSubscriber,
} from "./lifecycle-manager.js";
export { CORE_VERSION } from "./version.js";
