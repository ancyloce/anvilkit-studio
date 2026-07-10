/**
 * @file The single, shared publish runner for `<Studio>` (PRD 0004 F9 +
 * the "Chrome PublishPanel must not miss `page_published`" fix).
 *
 * Both publish entry points — Puck's native `onPublish` and the AnvilKit
 * chrome's `PublishPanel` "Publish to live" (`onPublishClick`) — funnel
 * through {@link runPublishPipeline}, so the `page_published` system
 * event is emitted in **exactly one** place, on the success path only,
 * for either trigger. The controller wraps each call in its single-flight
 * `publishQueueRef` chain; this function owns only the per-publish
 * success/failure sequence:
 *
 *   1. `onBeforePublish` lifecycle (plugins may veto by throwing) — skipped
 *      and treated as an abort when the runtime is no longer live.
 *   2. the consumer publish fn (`onPublish` / `onPublishClick`) — a throw,
 *      a rejected promise, or (by convention) any abort the host signals by
 *      throwing stops the pipeline here.
 *   3. `trackPagePublished` — emitted ONLY if steps 1–2 did not early-return.
 *   4. `onAfterPublish` lifecycle — skipped when the runtime is no longer live.
 *
 * Extracted as a pure async function (no React, no refs) so the
 * success/failure/no-duplicate contract is unit-testable without mounting
 * `<Studio>`. System-event ownership stays in core: the host never calls
 * `analytics.track("page_published")` itself.
 */

import type { AnalyticsAdapter } from "@anvilkit/analytics-core";
import type { Data as PuckData } from "@puckeditor/core";
import type { StudioLogLevel } from "@/types/plugin";
import { trackPagePublished } from "./analytics-events.js";

/** Dependencies the controller injects into one publish run. */
export interface PublishPipelineHooks {
	/**
	 * Re-checked immediately before each runtime-bound lifecycle emit. The
	 * consumer publish fn is NOT gated by this (dropping a host's save would
	 * be data loss); only the plugin lifecycle emits are.
	 */
	readonly isRuntimeLive: () => boolean;
	/**
	 * Emit `onBeforePublish`. A throw/rejection aborts the publish — no
	 * consumer call, no `page_published`. Omit when there is no live runtime
	 * to emit against.
	 */
	readonly emitBeforePublish?: () => Promise<unknown>;
	/**
	 * The host publish handler (`onPublish` or `onPublishClick`). A throw or
	 * rejected promise marks the publish as failed: `page_published` is NOT
	 * emitted. `undefined` is a successful no-op (the success event still
	 * fires, matching Puck's native publish with no host handler).
	 */
	readonly consumerPublish:
		| ((data: PuckData) => void | Promise<void>)
		| undefined;
	/** Emit `onAfterPublish` after a successful publish. */
	readonly emitAfterPublish?: () => Promise<unknown>;
	/** Latest analytics adapter (or `undefined` ⇒ the success event is a no-op). */
	readonly analytics: AnalyticsAdapter | undefined;
	/** Structured-log sink (bound to the host logger by the controller). */
	readonly log: (
		level: StudioLogLevel,
		message: string,
		meta?: Readonly<Record<string, unknown>>,
	) => void;
}

/**
 * Run one publish to completion. Resolves whether the publish succeeded or
 * was aborted — the queue stays alive either way; an aborted publish simply
 * does not emit `page_published`.
 */
export async function runPublishPipeline(
	nextData: PuckData,
	hooks: PublishPipelineHooks,
): Promise<void> {
	// 1. onBeforePublish veto (runtime-bound: skip if disposed/superseded).
	if (hooks.isRuntimeLive() && hooks.emitBeforePublish !== undefined) {
		try {
			await hooks.emitBeforePublish();
		} catch (error) {
			hooks.log("error", "publish aborted by plugin", { error });
			return;
		}
	}

	// 2. Consumer publish (never gated — dropping a host save is data loss).
	try {
		await hooks.consumerPublish?.(nextData);
	} catch (error) {
		hooks.log("error", "consumer onPublish threw", { error });
		return;
	}

	// 3. Success — emit the single lightweight system event. Reached only when
	// neither the plugin veto nor the consumer aborted above.
	trackPagePublished(hooks.analytics, "published");

	// 4. onAfterPublish (runtime-bound).
	if (hooks.isRuntimeLive() && hooks.emitAfterPublish !== undefined) {
		await hooks.emitAfterPublish();
	}
}
