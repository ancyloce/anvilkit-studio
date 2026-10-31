/**
 * @file A fetch-based reader of the Agent API's operation event stream
 * (`GET /operations/{id}/events`, SSE through the Studio proxy; plan 0005
 * §4.3–§4.5). `EventSource` cannot send `Last-Event-ID` on the first
 * request nor read `Retry-After`, so the stream is read with `fetch` and a
 * minimal SSE parser (event, data, id, retry, comments).
 *
 * Rules, all the caller's facts and never a guess of this module:
 * - every request resumes with `Last-Event-ID` = the last processed
 *   `eventSeq` (the caller's baseline first); the URL never carries `after`;
 * - `retry:` sets the reconnect delay; `end` closes the stream and is
 *   resumed after that delay; EOF or a disconnect asks the caller whether to
 *   resume (it knows whether its snapshot is terminal) and never means
 *   success;
 * - `reset_required` asks the caller for the new baseline (its refreshed
 *   snapshot's `coveredEventSeq`) and resumes from it at once;
 * - 401, 403 and 404 stop the stream with the error envelope (no retry);
 *   retryable 429 and 503 wait `Retry-After` (or the SSE retry delay) a
 *   bounded number of times, then stop with the envelope;
 * - nothing here creates, cancels or changes an operation.
 */
import type { components } from "./generated/agent";
import {
	asErrorEnvelope,
	type ErrorEnvelope,
	readJson,
} from "./operation-client";

type Schemas = components["schemas"];
export type OperationEventFrame = Schemas["OperationEventFrame"];
export type ResetFrame = Schemas["ResetFrame"];
export type EndFrame = Schemas["EndFrame"];

/** Why the reader stopped; the caller renders the state from it. */
export type StreamStop =
	| { readonly reason: "done" }
	| { readonly reason: "aborted" }
	| {
			readonly reason: "error";
			readonly status: number;
			readonly envelope: ErrorEnvelope | null;
	  };

export type StreamPhase = "connecting" | "live" | "reconnecting" | "waiting";

export interface StreamHandlers {
	/** One `operation.changed` frame; the reader advances its cursor after it. */
	onFrame(frame: OperationEventFrame): void;
	/**
	 * `reset_required`: the caller refreshes its snapshot and returns the
	 * `coveredEventSeq` to resume from, or `null` to stop.
	 */
	onReset(frame: ResetFrame): Promise<string | null>;
	/**
	 * The stream closed (EOF after the last event, an `end` frame, or a
	 * disconnect). `true` resumes from the last processed id after the retry
	 * delay; `false` ends the read as done.
	 */
	shouldResume(cause: "eof" | "end" | "disconnect"): boolean | Promise<boolean>;
	/** Presentation state changes; `waiting` carries the bounded wait in ms. */
	onPhase?(phase: StreamPhase, detail?: { readonly waitMs: number }): void;
}

export interface StreamOptions {
	readonly url: string;
	/** The last processed `eventSeq` (the snapshot's `coveredEventSeq` on the first open); `null` when none. */
	readonly lastEventId: string | null;
	readonly signal: AbortSignal;
	readonly fetch?: typeof fetch;
	readonly sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
	/** The reconnect delay until the server advertises `retry:` (ms). */
	readonly defaultRetryMs?: number;
	readonly maxRetryMs?: number;
	/** How many consecutive retryable 429/503 answers are waited out before the read stops. */
	readonly maxBusyRetries?: number;
}

const SEQUENCE = /^(0|[1-9][0-9]{0,19})$/;

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve) => {
		if (signal.aborted) return resolve();
		const timer = setTimeout(done, ms);
		function done() {
			clearTimeout(timer);
			signal.removeEventListener("abort", done);
			resolve();
		}
		signal.addEventListener("abort", done, { once: true });
	});
}

/** `Retry-After` in seconds (or an HTTP date) as milliseconds; `null` when absent or malformed. */
export function retryAfterMs(
	header: string | null,
	now = Date.now(),
): number | null {
	if (!header) return null;
	const trimmed = header.trim();
	if (/^[0-9]{1,6}$/.test(trimmed)) return Number(trimmed) * 1000;
	const date = Date.parse(trimmed);
	if (Number.isNaN(date)) return null;
	return Math.max(0, date - now);
}

interface SseEvent {
	readonly event: string;
	readonly data: string;
	readonly id: string | null;
	readonly retry: number | null;
}

/**
 * Parses an SSE byte stream into events: lines split on `\n` (a preceding
 * `\r` dropped), `field: value` with one optional leading space, multi-line
 * `data` joined with `\n`, a comment line ignored, an empty line dispatching.
 */
export async function* parseSse(
	body: ReadableStream<Uint8Array>,
): AsyncGenerator<SseEvent> {
	const reader = body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let event = "";
	let data: string[] = [];
	let id: string | null = null;
	let retry: number | null = null;
	const dispatch = (): SseEvent | null => {
		if (data.length === 0 && event === "" && id === null && retry === null)
			return null;
		const out: SseEvent = {
			event: event || "message",
			data: data.join("\n"),
			id,
			retry,
		};
		event = "";
		data = [];
		id = null;
		retry = null;
		return out;
	};
	const handle = (line: string): SseEvent | null => {
		if (line === "") return dispatch();
		if (line.startsWith(":")) return null;
		const colon = line.indexOf(":");
		const field = colon === -1 ? line : line.slice(0, colon);
		let value = colon === -1 ? "" : line.slice(colon + 1);
		if (value.startsWith(" ")) value = value.slice(1);
		switch (field) {
			case "event":
				event = value;
				break;
			case "data":
				data.push(value);
				break;
			case "id":
				if (!value.includes("\0")) id = value;
				break;
			case "retry":
				if (/^[0-9]+$/.test(value)) retry = Number(value);
				break;
			default:
				break;
		}
		return null;
	};
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			buffer += decoder.decode(value, { stream: true });
			let newline = buffer.indexOf("\n");
			while (newline !== -1) {
				let line = buffer.slice(0, newline);
				buffer = buffer.slice(newline + 1);
				if (line.endsWith("\r")) line = line.slice(0, -1);
				const ev = handle(line);
				if (ev) yield ev;
				newline = buffer.indexOf("\n");
			}
		}
		buffer += decoder.decode();
		if (buffer !== "") {
			const ev = handle(buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer);
			if (ev) yield ev;
		}
		const last = dispatch();
		if (last) yield last;
	} finally {
		reader.releaseLock();
	}
}

type Closed =
	| { readonly kind: "eof" }
	| { readonly kind: "disconnect" }
	| { readonly kind: "end" }
	| { readonly kind: "reset"; readonly frame: ResetFrame };

/**
 * Reads the stream until it is done, stopped by an error or aborted. The
 * returned promise never rejects for stream conditions; a handler's own
 * exception propagates.
 */
export async function readEventStream(
	options: StreamOptions,
	handlers: StreamHandlers,
): Promise<StreamStop> {
	const doFetch = options.fetch ?? fetch;
	const sleep = options.sleep ?? defaultSleep;
	const maxRetryMs = options.maxRetryMs ?? 30_000;
	const maxBusy = options.maxBusyRetries ?? 5;
	let retryMs = options.defaultRetryMs ?? 2_000;
	let last = options.lastEventId;
	let busy = 0;
	let opened = false;
	const { signal } = options;

	const consume = async (body: ReadableStream<Uint8Array>): Promise<Closed> => {
		try {
			for await (const ev of parseSse(body)) {
				if (ev.retry !== null)
					retryMs = Math.min(Math.max(ev.retry, 100), maxRetryMs);
				switch (ev.event) {
					case "operation.changed": {
						const frame = parse<OperationEventFrame>(ev.data);
						if (!frame || typeof frame.eventSeq !== "string") break;
						handlers.onFrame(frame);
						last = SEQUENCE.test(frame.eventSeq) ? frame.eventSeq : last;
						if (ev.id && SEQUENCE.test(ev.id)) last = ev.id;
						break;
					}
					case "reset_required": {
						const frame = parse<ResetFrame>(ev.data);
						if (frame) return { kind: "reset", frame };
						break;
					}
					case "end":
						return { kind: "end" };
					default:
						break;
				}
			}
			return { kind: "eof" };
		} catch {
			return signal.aborted ? { kind: "eof" } : { kind: "disconnect" };
		}
	};

	for (;;) {
		if (signal.aborted) return { reason: "aborted" };
		handlers.onPhase?.(opened ? "reconnecting" : "connecting");
		const headers: Record<string, string> = { Accept: "text/event-stream" };
		if (last !== null && SEQUENCE.test(last)) headers["Last-Event-ID"] = last;
		let response: Response;
		try {
			response = await doFetch(options.url, {
				headers,
				cache: "no-store",
				signal,
			});
		} catch {
			if (signal.aborted) return { reason: "aborted" };
			if (!(await handlers.shouldResume("disconnect")))
				return { reason: "done" };
			await sleep(retryMs, signal);
			continue;
		}
		const type = response.headers.get("content-type") ?? "";
		if (response.ok && type.startsWith("text/event-stream") && response.body) {
			opened = true;
			busy = 0;
			handlers.onPhase?.("live");
			const closed = await consume(response.body);
			if (signal.aborted) return { reason: "aborted" };
			if (closed.kind === "reset") {
				const baseline = await handlers.onReset(closed.frame);
				if (baseline === null) return { reason: "done" };
				last = baseline;
				continue;
			}
			if (!(await handlers.shouldResume(closed.kind)))
				return { reason: "done" };
			await sleep(retryMs, signal);
			continue;
		}
		const envelope = asErrorEnvelope(await readJson(response));
		const status = response.status;
		const retryable =
			(status === 429 || status === 503) && envelope?.error.retryable !== false;
		if (retryable && busy < maxBusy) {
			busy += 1;
			const waitMs = Math.min(
				retryAfterMs(response.headers.get("retry-after")) ?? retryMs,
				maxRetryMs,
			);
			handlers.onPhase?.("waiting", { waitMs });
			await sleep(waitMs, signal);
			continue;
		}
		return { reason: "error", status, envelope };
	}
}

function parse<T>(data: string): T | null {
	try {
		const value: unknown = JSON.parse(data);
		return typeof value === "object" && value !== null ? (value as T) : null;
	} catch {
		return null;
	}
}
