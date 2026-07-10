/**
 * @file Unit tests for the shared {@link runPublishPipeline} runner — the
 * single owner of the `page_published` system event for BOTH the native Puck
 * `onPublish` path and the AnvilKit chrome `PublishPanel` (`onPublishClick`).
 *
 * The contract under test (PRD 0004 F9 + the "chrome publish must not miss
 * `page_published`" fix):
 *   - success (consumer resolves) → exactly one `page_published`, lightweight props;
 *   - a plugin `onBeforePublish` veto (throw) → no `page_published`;
 *   - a consumer throw / rejected promise → no `page_published`;
 *   - one pipeline run → at most one `page_published` (no duplication);
 *   - ordering: onBeforePublish → consumer → page_published → onAfterPublish.
 */

import type { AnalyticsAdapter } from "@anvilkit/analytics-core";
import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import {
	type PublishPipelineHooks,
	runPublishPipeline,
} from "../publish-pipeline.js";

const DATA = { root: { props: {} }, content: [], zones: {} } as PuckData;

/** A spy adapter recording every `track` call's name + props. */
function spyAdapter(): AnalyticsAdapter & {
	readonly calls: { name: string; props: Record<string, unknown> }[];
} {
	const calls: { name: string; props: Record<string, unknown> }[] = [];
	return {
		calls,
		track: (name, props) => {
			calls.push({ name, props });
		},
		identify: vi.fn(),
		flush: vi.fn(() => Promise.resolve()),
		updatePrivacyStatus: vi.fn(),
	};
}

/** Build hooks with sensible live-runtime defaults; override per test. */
function makeHooks(
	overrides: Partial<PublishPipelineHooks> & {
		analytics: AnalyticsAdapter | undefined;
	},
): PublishPipelineHooks {
	return {
		isRuntimeLive: () => true,
		consumerPublish: undefined,
		emitBeforePublish: undefined,
		emitAfterPublish: undefined,
		log: vi.fn(),
		...overrides,
	};
}

const publishedCalls = (a: ReturnType<typeof spyAdapter>) =>
	a.calls.filter((c) => c.name === "page_published");

describe("runPublishPipeline — success path", () => {
	it("emits exactly one page_published with only status_change on success", async () => {
		const a = spyAdapter();
		const consumerPublish = vi.fn(() => Promise.resolve());
		await runPublishPipeline(
			DATA,
			makeHooks({ analytics: a, consumerPublish }),
		);

		expect(consumerPublish).toHaveBeenCalledTimes(1);
		expect(publishedCalls(a)).toHaveLength(1);
		expect(publishedCalls(a)[0]?.props).toEqual({ status_change: "published" });
		// Forbidden-fields rule: only primitive props ever leave the pipeline.
		for (const v of Object.values(publishedCalls(a)[0]?.props ?? {})) {
			expect(["string", "number", "boolean"]).toContain(typeof v);
		}
	});

	it("treats an undefined consumer (e.g. native publish, no host handler) as a success", async () => {
		const a = spyAdapter();
		await runPublishPipeline(
			DATA,
			makeHooks({ analytics: a, consumerPublish: undefined }),
		);
		expect(publishedCalls(a)).toHaveLength(1);
	});

	it("runs onBeforePublish → consumer → page_published → onAfterPublish in order", async () => {
		const a = spyAdapter();
		const order: string[] = [];
		await runPublishPipeline(
			DATA,
			makeHooks({
				analytics: {
					...a,
					track: (name, props) => {
						order.push(`track:${name}`);
						a.calls.push({ name, props });
					},
				},
				emitBeforePublish: () => {
					order.push("before");
					return Promise.resolve();
				},
				consumerPublish: () => {
					order.push("consumer");
					return Promise.resolve();
				},
				emitAfterPublish: () => {
					order.push("after");
					return Promise.resolve();
				},
			}),
		);
		expect(order).toEqual([
			"before",
			"consumer",
			"track:page_published",
			"after",
		]);
	});

	it("emits page_published only ONCE per run (no duplication)", async () => {
		const a = spyAdapter();
		await runPublishPipeline(
			DATA,
			makeHooks({
				analytics: a,
				consumerPublish: () => Promise.resolve(),
				emitBeforePublish: () => Promise.resolve(),
				emitAfterPublish: () => Promise.resolve(),
			}),
		);
		expect(publishedCalls(a)).toHaveLength(1);
	});
});

describe("runPublishPipeline — failure / abort paths emit no success event", () => {
	it("does NOT emit page_published when a plugin onBeforePublish vetoes (throws)", async () => {
		const a = spyAdapter();
		const consumerPublish = vi.fn(() => Promise.resolve());
		const log = vi.fn();
		await runPublishPipeline(
			DATA,
			makeHooks({
				analytics: a,
				consumerPublish,
				log,
				emitBeforePublish: () => Promise.reject(new Error("veto")),
			}),
		);
		expect(publishedCalls(a)).toHaveLength(0);
		// Aborted before the consumer ran.
		expect(consumerPublish).not.toHaveBeenCalled();
		expect(log).toHaveBeenCalledWith(
			"error",
			"publish aborted by plugin",
			expect.anything(),
		);
	});

	it("does NOT emit page_published when the consumer throws synchronously", async () => {
		const a = spyAdapter();
		await runPublishPipeline(
			DATA,
			makeHooks({
				analytics: a,
				consumerPublish: () => {
					throw new Error("publish failed");
				},
			}),
		);
		expect(publishedCalls(a)).toHaveLength(0);
	});

	it("does NOT emit page_published when the consumer rejects", async () => {
		const a = spyAdapter();
		const emitAfterPublish = vi.fn(() => Promise.resolve());
		await runPublishPipeline(
			DATA,
			makeHooks({
				analytics: a,
				consumerPublish: () => Promise.reject(new Error("network")),
				emitAfterPublish,
			}),
		);
		expect(publishedCalls(a)).toHaveLength(0);
		// onAfterPublish never runs on a failed publish.
		expect(emitAfterPublish).not.toHaveBeenCalled();
	});
});

describe("runPublishPipeline — runtime-bound lifecycle gating", () => {
	it("skips the lifecycle emits when the runtime is not live but still publishes + emits", async () => {
		const a = spyAdapter();
		const emitBeforePublish = vi.fn(() => Promise.resolve());
		const emitAfterPublish = vi.fn(() => Promise.resolve());
		const consumerPublish = vi.fn(() => Promise.resolve());
		await runPublishPipeline(
			DATA,
			makeHooks({
				analytics: a,
				isRuntimeLive: () => false,
				emitBeforePublish,
				emitAfterPublish,
				consumerPublish,
			}),
		);
		// Consumer is NEVER gated (dropping a host save would be data loss).
		expect(consumerPublish).toHaveBeenCalledTimes(1);
		expect(publishedCalls(a)).toHaveLength(1);
		// Runtime-bound emits are skipped on a disposed/superseded runtime.
		expect(emitBeforePublish).not.toHaveBeenCalled();
		expect(emitAfterPublish).not.toHaveBeenCalled();
	});

	it("is a no-op-safe success when no adapter is wired", async () => {
		await expect(
			runPublishPipeline(
				DATA,
				makeHooks({
					analytics: undefined,
					consumerPublish: () => Promise.resolve(),
				}),
			),
		).resolves.toBeUndefined();
	});
});
