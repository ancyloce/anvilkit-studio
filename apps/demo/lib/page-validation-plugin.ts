/**
 * @file F7 — the formal `onBeforePublish` abort path (PRD 0004).
 *
 * Validates the page payload (`root.props`) before publish; throwing aborts
 * the publish (core's `runPublishPipeline` catches the throw, skips the consumer
 * publish, and never emits `page_published`). As of the unified publish path
 * this `onBeforePublish` runs for BOTH Puck's native publish AND the AnvilKit
 * chrome's "Publish to live" — the chrome path no longer bypasses the queue. The
 * demo's `handlePublishClick` still validates inline (defense in depth) before
 * the actual persist.
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
