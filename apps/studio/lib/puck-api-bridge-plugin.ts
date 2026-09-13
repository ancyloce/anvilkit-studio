/**
 * @file Demo-only bridge from the editor page to the mounted editor's
 * `StudioPluginContext`, so a host-side write (the page rail's rename /
 * settings patch of the open page's `root.props`) reaches the document
 * Puck actually holds — not just the host's cached copies.
 *
 * `<Studio data>` is initial-only: after mount every change flows out of
 * Puck through `onChange`, so a root-prop patch applied only host-side is
 * undone by the next `onChange` (the whole document, old title included).
 * The public plugin context is the documented seam to the live `PuckApi`
 * (`ctx.getPuckApi().dispatch(...)`); this plugin hands it to the host for
 * exactly the window in which it is safe to call — from `onReady` (Puck
 * mounted, API bound) to `onDestroy` (`<Studio>` unmounting).
 *
 * Lives in `apps/studio/lib/` like `smoke-test-plugin.ts`: it is host
 * plumbing for this page, not a reusable plugin.
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import type { StudioPluginContext } from "@anvilkit/core/types";
import type { RefObject } from "react";

const puckApiBridgePluginMeta: StudioPluginMeta = {
	id: "anvilkit-demo-puck-api-bridge",
	name: "Puck API Bridge",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Exposes the mounted editor's plugin context to the host page — demo only.",
};

/**
 * A plugin that keeps `ref.current` pointing at the live plugin context
 * while `<Studio>` is mounted with its Puck API bound, and `null`
 * otherwise. A page-switch remount (`key`) runs the outgoing editor's
 * `onDestroy` and the incoming one's `onReady`; the identity guard keeps
 * a late `onDestroy` from clearing a newer binding.
 */
export function createPuckApiBridgePlugin(
	ref: RefObject<StudioPluginContext | null>,
): StudioPlugin {
	return {
		meta: puckApiBridgePluginMeta,
		register() {
			return {
				meta: puckApiBridgePluginMeta,
				hooks: {
					onReady: (ctx) => {
						ref.current = ctx;
					},
					onDestroy: (ctx) => {
						if (ref.current === ctx) ref.current = null;
					},
				},
			};
		},
	};
}
