/**
 * @anvilkit/plugin-__NAME__ — __DISPLAY__ (category: __CATEGORY__).
 *
 * See the plugin authoring guide for the full StudioPlugin contract:
 *   https://github.com/ancyloce/anvilkit-studio/blob/main/apps/docs/src/content/docs/guides/plugin-authoring.mdx
 */
import type {
	StudioPlugin,
	StudioPluginContext,
	StudioPluginMeta,
} from "@anvilkit/core/types";

const META: StudioPluginMeta = {
	id: "anvilkit-plugin-__NAME__",
	name: "__DISPLAY__",
	version: "0.0.0",
	coreVersion: "^0.1.0-alpha",
	description: "__DISPLAY__ (category: __CATEGORY__).",
};

export interface __CLASSNAME__PluginOptions {
	/**
	 * Optional marker passed through at register time — wire your
	 * real options here (API endpoints, feature flags, etc).
	 */
	readonly label?: string;
}

/**
 * Create the __DISPLAY__ plugin.
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
