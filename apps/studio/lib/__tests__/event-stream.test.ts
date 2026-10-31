/**
 * The fetch-based SSE reader (plan 0005 §4.3–§4.5; verification row B3):
 * resume from the last processed id, `retry`, `end`, EOF before and after
 * the terminal snapshot, `reset_required` → snapshot baseline, 401/403
 * stop, retryable 429/503 wait `Retry-After` a bounded number of times, no
 * `after` parameter, nothing posted.
 */
import { describe, expect, it } from "vitest";
import {
	type OperationEventFrame,
	parseSse,
	readEventStream,
	retryAfterMs,
	type StreamStop,
} from "../agent/event-stream";

const encoder = new TextEncoder();
const ignore = (): undefined => undefined;

function sse(lines: string[]): ReadableStream<Uint8Array> {
	return new ReadableStream({
		start(controller) {
			controller.enqueue(encoder.encode(lines.join("\n")));
			controller.close();
		},
	});
}

function frameJson(
	seq: number,
	lifecycle = "running",
	phase = "running",
): string {
	const frame: OperationEventFrame = {
		operationId: "op_1",
		eventSeq: String(seq),
		transitionId: `tr_${seq}`,
		eventType: "operation.changed",
		revision: String(seq),
		occurredAt: "2026-10-23T19:51:41Z",
		payload: {
			lifecycle: lifecycle as OperationEventFrame["payload"]["lifecycle"],
			phase,
			control: "none",
			cleanup: "not_required",
			finance: "funded",
		},
	};
	return JSON.stringify(frame);
}

const changed = (seq: number, extra: string[] = []) => [
	...extra,
	`id: ${seq}`,
	"event: operation.changed",
	`data: ${frameJson(seq)}`,
	"",
];

type Scripted =
	| { kind: "stream"; lines: string[] }
	| { kind: "status"; status: number; retryAfter?: string; retryable?: boolean }
	| { kind: "throw" }
	| { kind: "hang-then-error" };

function harness(script: Scripted[]) {
	const requests: {
		url: string;
		lastEventId: string | null;
		accept: string | null;
	}[] = [];
	const sleeps: number[] = [];
	const fetchImpl: typeof fetch = async (input, init) => {
		const headers = new Headers(init?.headers);
		requests.push({
			url: String(input),
			lastEventId: headers.get("last-event-id"),
			accept: headers.get("accept"),
		});
		const next = script.shift();
		if (!next) throw new Error("script exhausted");
		switch (next.kind) {
			case "stream":
				return new Response(sse(next.lines), {
					status: 200,
					headers: { "content-type": "text/event-stream" },
				});
			case "status":
				return new Response(
					JSON.stringify({
						error: {
							code: next.status === 429 ? "CAPACITY_EXHAUSTED" : "FORBIDDEN",
							message: "scripted",
							requestId: "r",
							retryable:
								next.retryable ?? (next.status === 429 || next.status === 503),
						},
					}),
					{
						status: next.status,
						headers: {
							"content-type": "application/json",
							...(next.retryAfter ? { "retry-after": next.retryAfter } : {}),
						},
					},
				);
			case "throw":
				throw new TypeError("network down");
			case "hang-then-error": {
				// One complete event (terminated by its blank line) is delivered,
				// then the connection is reset before EOF. The error is raised on
				// the pull after the chunk, since erroring a stream clears its
				// queue.
				let sent = false;
				return new Response(
					new ReadableStream({
						pull(controller) {
							if (!sent) {
								sent = true;
								controller.enqueue(
									encoder.encode(`${changed(5).join("\n")}\n`),
								);
								return;
							}
							controller.error(new Error("connection reset"));
						},
					}),
					{ status: 200, headers: { "content-type": "text/event-stream" } },
				);
			}
		}
	};
	return {
		requests,
		sleeps,
		fetchImpl,
		sleep: async (ms: number) => {
			sleeps.push(ms);
		},
	};
}

describe("SSE parser", () => {
	it("parses fields, comments, multi-line data, retry and CRLF", async () => {
		const events = [];
		for await (const ev of parseSse(
			sse([
				": heartbeat",
				"retry: 1500",
				"id: 7",
				"event: operation.changed",
				'data: {"a":',
				"data:  1}",
				"",
				"event: end\r",
				'data: {"operationId":"op_1","reason":"server_shutdown"}\r',
				"\r",
			]),
		))
			events.push(ev);
		expect(events).toEqual([
			{ event: "operation.changed", data: '{"a":\n 1}', id: "7", retry: 1500 },
			{
				event: "end",
				data: '{"operationId":"op_1","reason":"server_shutdown"}',
				id: null,
				retry: null,
			},
		]);
	});

	it("reads Retry-After in seconds or as a date", () => {
		expect(retryAfterMs("3")).toBe(3000);
		expect(retryAfterMs(null)).toBeNull();
		expect(retryAfterMs("soon")).toBeNull();
		const now = Date.parse("2026-10-23T19:51:41Z");
		expect(retryAfterMs("Fri, 23 Oct 2026 19:51:43 GMT", now)).toBe(2000);
	});
});

describe("event stream reader", () => {
	it("opens from the snapshot baseline, advances the cursor, honours retry and resumes after EOF from the last processed id; never ?after=", async () => {
		const h = harness([
			{ kind: "stream", lines: [...changed(6, ["retry: 250"]), ...changed(7)] },
			{ kind: "stream", lines: [...changed(8, ["retry: 400"])] },
		]);
		const seen: string[] = [];
		let resumes = 0;
		const stop = await readEventStream(
			{
				url: "/api/agent/v1/operations/op_1/events",
				lastEventId: "5",
				signal: new AbortController().signal,
				fetch: h.fetchImpl,
				sleep: h.sleep,
			},
			{
				onFrame: (f) => seen.push(f.eventSeq),
				onReset: async () => null,
				shouldResume: () => resumes++ === 0,
			},
		);
		expect(stop).toEqual({ reason: "done" });
		expect(seen).toEqual(["6", "7", "8"]);
		expect(h.requests.map((r) => r.lastEventId)).toEqual(["5", "7"]);
		expect(h.requests.every((r) => !r.url.includes("after="))).toBe(true);
		expect(h.requests[0]?.accept).toBe("text/event-stream");
		expect(h.sleeps).toEqual([250]);
	});

	it("an `end` frame resumes after the retry delay from the last id; a disconnect does the same", async () => {
		const h = harness([
			{
				kind: "stream",
				lines: [
					...changed(3, ["retry: 300"]),
					"event: end",
					'data: {"operationId":"op_1","reason":"server_shutdown"}',
					"",
				],
			},
			{ kind: "hang-then-error" },
			{ kind: "throw" },
			{ kind: "stream", lines: changed(6) },
		]);
		const causes: string[] = [];
		const seen: string[] = [];
		const stop = await readEventStream(
			{
				url: "/x",
				lastEventId: null,
				signal: new AbortController().signal,
				fetch: h.fetchImpl,
				sleep: h.sleep,
			},
			{
				onFrame: (f) => seen.push(f.eventSeq),
				onReset: async () => null,
				shouldResume: (cause) => {
					causes.push(cause);
					return causes.length < 4;
				},
			},
		);
		expect(stop).toEqual({ reason: "done" });
		expect(seen).toEqual(["3", "5", "6"]);
		expect(causes).toEqual(["end", "disconnect", "disconnect", "eof"]);
		expect(h.requests.map((r) => r.lastEventId)).toEqual([null, "3", "5", "5"]);
		expect(h.sleeps).toEqual([300, 300, 300]);
	});

	it("reset_required takes the refreshed snapshot's coveredEventSeq as the baseline and reopens at once", async () => {
		const h = harness([
			{
				kind: "stream",
				lines: [
					...changed(2),
					"event: reset_required",
					'data: {"operationId":"op_1","coveredEventSeq":"40"}',
					"",
				],
			},
			{ kind: "stream", lines: changed(41) },
		]);
		const resets: string[] = [];
		const stop = await readEventStream(
			{
				url: "/x",
				lastEventId: "1",
				signal: new AbortController().signal,
				fetch: h.fetchImpl,
				sleep: h.sleep,
			},
			{
				onFrame: ignore,
				onReset: async (f) => {
					resets.push(f.coveredEventSeq);
					return "40";
				},
				shouldResume: () => false,
			},
		);
		expect(stop).toEqual({ reason: "done" });
		expect(resets).toEqual(["40"]);
		expect(h.requests.map((r) => r.lastEventId)).toEqual(["1", "40"]);
		expect(h.sleeps).toEqual([]);
	});

	it("stops on 401/403/404 with the envelope and never retries", async () => {
		for (const status of [401, 403, 404]) {
			const h = harness([{ kind: "status", status, retryable: false }]);
			const stop = await readEventStream(
				{
					url: "/x",
					lastEventId: "1",
					signal: new AbortController().signal,
					fetch: h.fetchImpl,
					sleep: h.sleep,
				},
				{
					onFrame: ignore,
					onReset: async () => null,
					shouldResume: () => true,
				},
			);
			expect(stop.reason).toBe("error");
			expect((stop as Extract<StreamStop, { reason: "error" }>).status).toBe(
				status,
			);
			expect(
				(stop as Extract<StreamStop, { reason: "error" }>).envelope?.error.code,
			).toBe("FORBIDDEN");
			expect(h.requests).toHaveLength(1);
			expect(h.sleeps).toEqual([]);
		}
	});

	it("waits Retry-After on a retryable 429/503 a bounded number of times, then stops with the envelope", async () => {
		const h = harness([
			{ kind: "status", status: 429, retryAfter: "2" },
			{ kind: "status", status: 503 },
			{ kind: "stream", lines: changed(9) },
		]);
		const phases: string[] = [];
		const stop = await readEventStream(
			{
				url: "/x",
				lastEventId: "8",
				signal: new AbortController().signal,
				fetch: h.fetchImpl,
				sleep: h.sleep,
				defaultRetryMs: 700,
			},
			{
				onFrame: ignore,
				onReset: async () => null,
				shouldResume: () => false,
				onPhase: (p, d) => phases.push(d ? `${p}:${d.waitMs}` : p),
			},
		);
		expect(stop).toEqual({ reason: "done" });
		expect(h.sleeps).toEqual([2000, 700]);
		expect(phases).toEqual([
			"connecting",
			"waiting:2000",
			"connecting",
			"waiting:700",
			"connecting",
			"live",
		]);
		expect(h.requests.map((r) => r.lastEventId)).toEqual(["8", "8", "8"]);

		const bounded = harness(
			Array.from({ length: 4 }, () => ({
				kind: "status" as const,
				status: 503,
			})),
		);
		const exhausted = await readEventStream(
			{
				url: "/x",
				lastEventId: null,
				signal: new AbortController().signal,
				fetch: bounded.fetchImpl,
				sleep: bounded.sleep,
				maxBusyRetries: 2,
			},
			{
				onFrame: ignore,
				onReset: async () => null,
				shouldResume: () => true,
			},
		);
		expect(exhausted.reason).toBe("error");
		expect(bounded.requests).toHaveLength(3);
	});

	it("an abort ends the read as aborted without another request", async () => {
		const controller = new AbortController();
		const h = harness([
			{
				kind: "stream",
				lines: changed(2),
			},
		]);
		const stop = await readEventStream(
			{
				url: "/x",
				lastEventId: null,
				signal: controller.signal,
				fetch: h.fetchImpl,
				sleep: h.sleep,
			},
			{
				onFrame: () => controller.abort(),
				onReset: async () => null,
				shouldResume: () => true,
			},
		);
		expect(stop).toEqual({ reason: "aborted" });
		expect(h.requests).toHaveLength(1);
	});
});
