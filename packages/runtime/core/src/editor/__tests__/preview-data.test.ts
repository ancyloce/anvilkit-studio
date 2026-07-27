/**
 * Preview-data containment — the §19 caps around a host adapter
 * (PLAN-0020 CORE-P3-005; ED-BIND-003).
 *
 * The adapter is host code Core does not control, so each test models
 * a way it can misbehave — hanging, throwing, returning too much — and
 * asserts the caller still gets a bounded, total result.
 */

import type {
	EditorDataSourceAdapter,
	JsonValue,
	PreviewDataRequest,
} from "@anvilkit/contracts/editor";
import { describe, expect, it, vi } from "vitest";
import {
	fetchPreviewData,
	measureJsonBytes,
	PREVIEW_DATA_LIMITS,
	truncateRecords,
} from "../bindings/preview-data.js";

/** An adapter whose `getPreviewData` behaves however a test needs. */
function adapterReturning(
	impl: (
		request: PreviewDataRequest,
		signal: AbortSignal,
	) => Promise<JsonValue>,
): EditorDataSourceAdapter {
	return {
		listSources: async () => [],
		getSchema: async () => ({ type: "object" }),
		getPreviewData: impl,
	};
}

const request: PreviewDataRequest = { sourceId: "s1" };

describe("measureJsonBytes", () => {
	it("measures UTF-8 bytes, not UTF-16 code units", () => {
		// Three-byte characters must not be undercounted as one each.
		expect(measureJsonBytes("日本語")).toBe(measureJsonBytes("aaaaaaaaa"));
	});

	it("returns null for an unserializable payload", () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		expect(measureJsonBytes(cyclic as JsonValue)).toBeNull();
	});
});

describe("truncateRecords", () => {
	it("clamps an array to the limit and reports truncation", () => {
		const result = truncateRecords([1, 2, 3, 4, 5], 3);
		expect(result.value).toEqual([1, 2, 3]);
		expect(result.truncated).toBe(true);
	});

	it("leaves a short array alone", () => {
		expect(truncateRecords([1, 2], 5)).toEqual({
			value: [1, 2],
			truncated: false,
		});
	});

	it("never truncates a non-array payload", () => {
		// Slicing an object would corrupt it rather than shorten it.
		const object = { a: 1, b: 2 };
		expect(truncateRecords(object, 1)).toEqual({
			value: object,
			truncated: false,
		});
	});
});

describe("fetchPreviewData — success path", () => {
	it("returns data with its measured size", async () => {
		const result = await fetchPreviewData(
			adapterReturning(async () => ({ rows: [1, 2] })),
			request,
		);
		expect(result.status).toBe("data");
		if (result.status !== "data") return;
		expect(result.value).toEqual({ rows: [1, 2] });
		expect(result.bytes).toBeGreaterThan(0);
		expect(result.truncated).toBe(false);
	});

	it("passes the resolved record limit down to the adapter", async () => {
		const getPreviewData = vi.fn(
			async (_request: PreviewDataRequest, _signal: AbortSignal) =>
				[] as JsonValue,
		);
		await fetchPreviewData(adapterReturning(getPreviewData), request);
		expect(getPreviewData.mock.calls[0]?.[0]).toMatchObject({
			limit: PREVIEW_DATA_LIMITS.defaultRecordLimit,
		});
	});

	it("clamps a caller limit above the §19 default", async () => {
		// A host asking for 5,000 records must not get them.
		const getPreviewData = vi.fn(
			async (_request: PreviewDataRequest, _signal: AbortSignal) =>
				[] as JsonValue,
		);
		await fetchPreviewData(adapterReturning(getPreviewData), {
			...request,
			limit: 5_000,
		});
		expect(getPreviewData.mock.calls[0]?.[0]).toMatchObject({
			limit: PREVIEW_DATA_LIMITS.defaultRecordLimit,
		});
	});

	it("truncates an over-long array even when the adapter ignores the limit", async () => {
		const rows = Array.from({ length: 120 }, (_, i) => i);
		const result = await fetchPreviewData(
			adapterReturning(async () => rows),
			request,
		);
		expect(result.status).toBe("data");
		if (result.status !== "data") return;
		expect((result.value as readonly unknown[]).length).toBe(
			PREVIEW_DATA_LIMITS.defaultRecordLimit,
		);
		expect(result.truncated).toBe(true);
	});
});

describe("fetchPreviewData — containment", () => {
	it("reports no-adapter without calling anything", async () => {
		const result = await fetchPreviewData(undefined, request);
		expect(result).toMatchObject({ status: "failed", reason: "no-adapter" });
	});

	it("times out a hanging adapter and aborts its signal", async () => {
		let observed: AbortSignal | undefined;
		const result = await fetchPreviewData(
			adapterReturning(
				(_req, signal) =>
					new Promise((resolve) => {
						observed = signal;
						signal.addEventListener("abort", () => resolve(null));
					}),
			),
			request,
			{ timeoutMs: 10 },
		);
		expect(result).toMatchObject({ status: "failed", reason: "timeout" });
		// The adapter must be *told* to stop, not merely ignored.
		expect(observed?.aborted).toBe(true);
	});

	it("rejects a payload above the byte cap without echoing it", async () => {
		const huge = "x".repeat(PREVIEW_DATA_LIMITS.maxBytes + 10);
		const result = await fetchPreviewData(
			adapterReturning(async () => huge),
			request,
		);
		expect(result.status).toBe("failed");
		if (result.status !== "failed") return;
		expect(result.reason).toBe("too-large");
		// §19 forbids preview responses leaving this boundary — the
		// diagnostic reports a size, never a sample of the data.
		expect(result.message).not.toContain("xxxx");
	});

	it("reports an adapter that throws", async () => {
		const result = await fetchPreviewData(
			adapterReturning(async () => {
				throw new Error("upstream 503");
			}),
			request,
		);
		expect(result).toMatchObject({
			status: "failed",
			reason: "adapter-error",
			message: "upstream 503",
		});
	});

	it("reports an unserializable payload rather than crashing", async () => {
		const cyclic: Record<string, unknown> = {};
		cyclic.self = cyclic;
		const result = await fetchPreviewData(
			adapterReturning(async () => cyclic as JsonValue),
			request,
		);
		expect(result).toMatchObject({
			status: "failed",
			reason: "adapter-error",
		});
	});

	it("honours a caller abort that fires before the adapter answers", async () => {
		const controller = new AbortController();
		const promise = fetchPreviewData(
			adapterReturning(
				(_req, signal) =>
					new Promise((resolve) => {
						signal.addEventListener("abort", () => resolve(null));
					}),
			),
			request,
			{ signal: controller.signal },
		);
		controller.abort();
		expect(await promise).toMatchObject({
			status: "failed",
			reason: "aborted",
		});
	});

	it("returns immediately when the caller signal is already aborted", async () => {
		const getPreviewData = vi.fn(
			async (_request: PreviewDataRequest, _signal: AbortSignal) =>
				null as JsonValue,
		);
		const result = await fetchPreviewData(
			adapterReturning(getPreviewData),
			request,
			{ signal: AbortSignal.abort() },
		);
		expect(result).toMatchObject({ status: "failed", reason: "aborted" });
		expect(getPreviewData).not.toHaveBeenCalled();
	});
});
