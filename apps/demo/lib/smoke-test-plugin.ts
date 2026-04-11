/**
 * @file Demo-only smoke test plugin for `core-016`.
 *
 * The `smokeTestPlugin` is intentionally trivial: it exists to prove
 * the `@anvilkit/core` plugin contract is invokable end-to-end from
 * the `apps/demo` host and that the compile → lifecycle → render
 * pipeline is hot. Every lifecycle hook logs to the browser console
 * so a human running the manual verification checklist can watch the
 * events fire as they drag blocks, edit fields, and click publish.
 *
 * This file lives in `apps/demo/lib/` — not in a published package —
 * because it has zero runtime value outside the demo. If you find
 * yourself wanting to reuse this logic in another app, author a real
 * plugin package instead.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-016-demo-migration.md | core-016}
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";

/**
 * Plugin metadata hoisted to module scope so both the `StudioPlugin`
 * object and its `register()` return value reference the same frozen
 * record. Avoids any `this` binding concerns when `compilePlugins`
 * invokes `register()` and keeps the identity check in
 * `compilePlugins`' duplicate-id guard deterministic.
 */
const smokeTestPluginMeta: StudioPluginMeta = {
	id: "anvilkit-demo-smoke-test",
	name: "Smoke Test Plugin",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Logs every lifecycle event — demo only, not for production.",
};

/**
 * No-op plugin that logs every lifecycle event the runtime fires at
 * it. Mount it via `<Studio plugins={[smokeTestPlugin]} />` in the
 * editor page to verify the plugin system is wired correctly.
 */
export const smokeTestPlugin: StudioPlugin = {
	meta: smokeTestPluginMeta,
	register() {
		return {
			meta: smokeTestPluginMeta,
			hooks: {
				onInit: () => {
					console.log("[smoke] onInit");
				},
				onDataChange: (_ctx, data) => {
					console.log("[smoke] onDataChange", {
						nodeCount: data?.content?.length ?? 0,
					});
				},
				onBeforePublish: () => {
					console.log("[smoke] onBeforePublish");
				},
				onAfterPublish: () => {
					console.log("[smoke] onAfterPublish");
				},
				onDestroy: () => {
					console.log("[smoke] onDestroy");
				},
			},
		};
	},
};
