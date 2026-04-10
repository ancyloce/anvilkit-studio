/**
 * @file Structural type guards for the two plugin flavors accepted by
 * {@link compilePlugins}.
 *
 * Host apps hand `createStudioConfig({ plugins: [...] })` a mixed
 * array of {@link StudioPlugin} objects (authored against this
 * package) and raw `@puckeditor/core` {@link Plugin} objects (third
 * party or Puck-built-ins like `blocksPlugin()`). The runtime routes
 * each element to a different code path:
 *
 * - `StudioPlugin` → `plugin.register(ctx)` is awaited and its
 *   {@link StudioPluginRegistration} is folded into the lifecycle,
 *   export, header, and override registries.
 * - `PuckPlugin` → passed through verbatim to `<Puck plugins={…}>`.
 *
 * Both checks are **pure** — no awaits, no throws, no side effects —
 * so they can be used freely inside tight loops and tests.
 *
 * ### Why structural and not nominal?
 *
 * Plugins are plain objects, not instances of a shared class, so
 * `instanceof` is not an option. The frozen {@link StudioPluginMeta}
 * shape (id + coreVersion + register function) is distinctive enough
 * that a structural check gives zero false positives for the real
 * Puck plugin surface.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-008-runtime-plugin-engine.md | core-008}
 */

import type { Plugin as PuckPlugin } from "@puckeditor/core";

import type { StudioPlugin } from "../types/plugin.js";

/**
 * Narrow helper — true if `value` is a non-null, non-array object.
 *
 * Arrays are excluded because neither {@link StudioPlugin} nor
 * {@link PuckPlugin} is ever authored as an array, and allowing them
 * through the check would make the `in` operator misbehave on later
 * field lookups.
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard that returns `true` if `value` conforms to the
 * {@link StudioPlugin} shape.
 *
 * The check is intentionally minimal — it validates the three fields
 * the runtime actually reads during compilation:
 *
 * 1. `meta.id` is a non-empty string.
 * 2. `meta.coreVersion` is a non-empty string.
 * 3. `register` is a function.
 *
 * Everything else on {@link StudioPluginMeta} (name, version,
 * description) is advisory and not required for the runtime to make
 * forward progress. A plugin that passes this guard but omits those
 * fields will still compile; the type system is the forcing function
 * for completeness at authoring time.
 *
 * Pure, synchronous, no side effects.
 */
export function isStudioPlugin(value: unknown): value is StudioPlugin {
	if (!isPlainObject(value)) {
		return false;
	}

	const meta = (value as { meta?: unknown }).meta;
	if (!isPlainObject(meta)) {
		return false;
	}

	const id = (meta as { id?: unknown }).id;
	const coreVersion = (meta as { coreVersion?: unknown }).coreVersion;
	if (typeof id !== "string" || id.length === 0) {
		return false;
	}
	if (typeof coreVersion !== "string" || coreVersion.length === 0) {
		return false;
	}

	const register = (value as { register?: unknown }).register;
	return typeof register === "function";
}

/**
 * Type guard that returns `true` if `value` conforms to the
 * `@puckeditor/core` {@link PuckPlugin} shape.
 *
 * Puck's plugin type is a bag of optional fields (`overrides`,
 * `fieldTransforms`, `render`, `icon`, `label`, `name`,
 * `mobilePanelHeight`) — there is no single required field to pin
 * the check on. This guard looks for **any** of the distinctive Puck
 * contribution surfaces:
 *
 * - `overrides` — slot component overrides.
 * - `fieldTransforms` — custom field renderers.
 * - `render` — a plugin-provided side panel or toolbar.
 *
 * An object that contributes none of those is either a vacuous
 * plugin (which callers should author as a `StudioPlugin` instead)
 * or something that was handed to the runtime by mistake. Rejecting
 * the empty object here means `compilePlugins([{}])` throws a clean
 * {@link StudioPluginError} instead of silently registering a no-op.
 *
 * Crucially, this guard **also** rejects anything that looks like a
 * {@link StudioPlugin} — the two guards are mutually exclusive so
 * `compilePlugins` can dispatch on a single `if / else` branch.
 *
 * Pure, synchronous, no side effects.
 */
export function isPuckPlugin(value: unknown): value is PuckPlugin {
	if (!isPlainObject(value)) {
		return false;
	}

	// A StudioPlugin is never a PuckPlugin — the `register()` method
	// is the discriminator.
	if (typeof (value as { register?: unknown }).register === "function") {
		return false;
	}

	const hasOverrides = "overrides" in value && isPlainObject(value.overrides);
	const hasFieldTransforms =
		"fieldTransforms" in value && isPlainObject(value.fieldTransforms);
	const hasRender = "render" in value && typeof value.render === "function";

	return hasOverrides || hasFieldTransforms || hasRender;
}
