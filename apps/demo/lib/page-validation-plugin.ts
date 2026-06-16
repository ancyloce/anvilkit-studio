/**
 * @file F7 — the formal `onBeforePublish` abort path (PRD 0004).
 *
 * Validates the page payload (`root.props`) before publish; throwing aborts
 * the publish (core's lifecycle catches the throw and skips `onPublish`). This
 * covers Puck's own publish button. The demo's `handlePublishClick` validates
 * the chrome panel's "Publish to live" path inline (it bypasses the queue).
 *
 * Demo-only — lives in `apps/demo/lib/`, not a published package.
 */

import type { StudioPlugin, StudioPluginMeta } from "@anvilkit/core";
import { validatePagePayload } from "@anvilkit/validator";

const meta: StudioPluginMeta = {
	id: "anvilkit-demo-page-validation",
	name: "Page Validation",
	version: "0.0.1",
	coreVersion: "^0.1.0-alpha",
	description:
		"Blocks publish when root.props fails validatePagePayload — demo only.",
};

export const pageValidationPlugin: StudioPlugin = {
	meta,
	register() {
		return {
			meta,
			hooks: {
				onBeforePublish: (_ctx, data) => {
					const result = validatePagePayload(data?.root?.props);
					if (!result.valid) {
						throw new Error(
							`Publish blocked — invalid page: ${
								result.issues[0]?.message ?? "validation failed"
							}`,
						);
					}
				},
			},
		};
	},
};
