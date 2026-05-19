/**
 * @anvilkit/plugin-__NAME__ - __DISPLAY_COMMENT__ (category: __CATEGORY__).
 *
 * See the plugin authoring guide for the full StudioPlugin contract:
 *   https://github.com/ancyloce/anvilkit-studio/blob/main/apps/docs/src/content/docs/guides/plugin-authoring.mdx
 *
 * Subpath-export coupling: this plugin imports from
 * `@anvilkit/core/types` and (in tests) `@anvilkit/core/testing`.
 * Both subpaths are part of the documented @anvilkit/core public API
 * and are covered by the core package's release gates.
 */
import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
} from "@anvilkit/core/types";

const META: StudioPluginMeta = {
	id: "anvilkit-plugin-__NAME__",
	name: "__DISPLAY_STRING__",
	version: "0.0.0",
	coreVersion: "__CORE_VERSION_RANGE__",
	description: "__DISPLAY_STRING__ (category: __CATEGORY__).",
};

export interface __CLASSNAME__PluginOptions {
	/**
	 * Optional marker passed through at register time — wire your
	 * real options here (API endpoints, feature flags, etc).
	 */
	readonly label?: string;
}

/**
 * Create the __DISPLAY_COMMENT__ plugin.
 *
 * The factory pattern keeps the plugin stateless at module scope so
 * a host can register multiple instances with different options.
 */
export function __FACTORY__(
	opts: __CLASSNAME__PluginOptions = {},
): StudioPlugin {
	return {
		meta: META,
		register(_ctx: StudioPluginContext) {
			// TODO: wire your Puck surface here. Return additional
			// fields (e.g. `puckExtensions`, custom `hooks`) alongside
			// `meta`/`hooks` as needed. The plugin authoring guide
			// enumerates every supported extension point:
			// https://github.com/ancyloce/anvilkit-studio/blob/main/apps/docs/src/content/docs/guides/plugin-authoring.mdx
			return {
				meta: META,
				hooks: {
					onInit(ctx) {
						ctx.log("info", `${META.name} initialised`, {
							label: opts.label ?? null,
						});
					},
				},
			};
		},
	};
}
