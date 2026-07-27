/**
 * @file Preview-data plumbing for the binding editor
 * (PLAN-0020 CORE-P3-005; ED-BIND-003; DD-0019 §19).
 *
 * §19, verbatim: "Preview requests time out after five seconds, accept
 * at most 2 MiB, and render at most 50 repeated records by default.
 * Core stores descriptors and expressions, never credentials or
 * preview responses."
 *
 * Every clause there is a containment rule, and this module is where
 * they are enforced — once, around an adapter Core does not control.
 * The adapter is host code: it may hang, return a gigabyte, or throw.
 * Callers get a bounded, total result either way.
 *
 * ### Why the response is returned and never persisted
 *
 * `fetchPreviewData` hands the payload back to its caller and keeps no
 * reference. That is the whole of "Core stores no preview responses":
 * the guarantee is not a policy someone must remember to honour but a
 * consequence of this module holding no cache. A future cache here
 * would silently break §19, so it belongs behind an explicit decision,
 * not an optimisation.
 *
 * The 2 MiB check measures the **serialized** payload rather than
 * trusting a `Content-Length` the adapter never saw — the adapter
 * returns parsed JSON, so bytes on the wire are not observable here.
 */

import type {
	EditorDataSourceAdapter,
	JsonValue,
	PreviewDataRequest,
} from "@anvilkit/contracts/editor";

/** The §19 preview caps. */
export const PREVIEW_DATA_LIMITS = {
	/** Wall-clock budget for one adapter call. */
	timeoutMs: 5_000,
	/** Maximum serialized payload accepted from the adapter. */
	maxBytes: 2 * 1024 * 1024,
	/** Default record cap for repeat previews. */
	defaultRecordLimit: 50,
} as const;

/** Why a preview request did not produce usable data. */
export type PreviewDataFailure =
	/** The adapter exceeded {@link PREVIEW_DATA_LIMITS.timeoutMs}. */
	| "timeout"
	/** The payload exceeded {@link PREVIEW_DATA_LIMITS.maxBytes}. */
	| "too-large"
	/** The adapter threw or rejected. */
	| "adapter-error"
	/** The caller aborted before the adapter answered. */
	| "aborted"
	/** No adapter is configured — the binding editor stays hidden. */
	| "no-adapter";

/** The outcome of one preview request. */
export type PreviewDataResult =
	| {
			readonly status: "data";
			readonly value: JsonValue;
			/** Serialized size, for surfacing "showing N of M" style hints. */
			readonly bytes: number;
			/** True when {@link truncateRecords} dropped trailing records. */
			readonly truncated: boolean;
	  }
	| {
			readonly status: "failed";
			readonly reason: PreviewDataFailure;
			/** Host-facing detail; never contains adapter response data. */
			readonly message: string;
	  };

/** Options for {@link fetchPreviewData}. */
export interface FetchPreviewDataOptions {
	/** Caller abort (component unmount, source switch). */
	readonly signal?: AbortSignal;
	/** Overrides the §19 default; still bounded by it. */
	readonly recordLimit?: number;
	/** Injected for tests; defaults to `PREVIEW_DATA_LIMITS.timeoutMs`. */
	readonly timeoutMs?: number;
}

/**
 * Serialized byte length of a JSON value, or `null` when it cannot be
 * serialized (a cycle, or a `BigInt` a misbehaving adapter returned).
 *
 * `TextEncoder` measures UTF-8 rather than UTF-16 code units, so a
 * payload of multibyte text is charged its real size instead of
 * roughly half of it.
 */
export function measureJsonBytes(value: JsonValue): number | null {
	try {
		const json = JSON.stringify(value);
		if (json === undefined) return null;
		return new TextEncoder().encode(json).length;
	} catch {
		return null;
	}
}

/**
 * Clamp an array payload to `limit` records.
 *
 * Non-array payloads pass through untouched: the record cap is about
 * repeaters, and truncating an object would corrupt it rather than
 * shorten it.
 */
export function truncateRecords(
	value: JsonValue,
	limit: number,
): { readonly value: JsonValue; readonly truncated: boolean } {
	if (!Array.isArray(value) || value.length <= limit) {
		return { value, truncated: false };
	}
	return { value: value.slice(0, limit), truncated: true };
}

/**
 * Read `signal.aborted` without letting the compiler narrow it.
 *
 * TypeScript treats `options.signal.aborted` as a readonly property
 * and narrows it to `false` after an early guard — but an
 * `AbortSignal` flips to aborted *while* we await the adapter, which
 * is precisely the case these later checks exist for. Going through a
 * function keeps every read live.
 */
function isAborted(signal: AbortSignal | undefined): boolean {
	return signal?.aborted === true;
}

/**
 * Call a host adapter for preview data under the §19 caps.
 *
 * Total: never throws, never hangs past the timeout, and never returns
 * a payload above the byte cap. On any failure the caller is expected
 * to fall back to fixture data and surface a warning — a failed
 * preview must degrade the editor, not block authoring.
 */
export async function fetchPreviewData(
	adapter: EditorDataSourceAdapter | undefined,
	request: PreviewDataRequest,
	options: FetchPreviewDataOptions = {},
): Promise<PreviewDataResult> {
	if (adapter === undefined) {
		return {
			status: "failed",
			reason: "no-adapter",
			message: "no data source adapter is configured",
		};
	}

	const timeoutMs = options.timeoutMs ?? PREVIEW_DATA_LIMITS.timeoutMs;
	const limit = Math.min(
		request.limit ??
			options.recordLimit ??
			PREVIEW_DATA_LIMITS.defaultRecordLimit,
		PREVIEW_DATA_LIMITS.defaultRecordLimit,
	);

	// One controller drives both the timeout and the caller's abort, so
	// the adapter is told to stop in either case rather than being left
	// running behind a promise nobody awaits.
	const controller = new AbortController();
	let timedOut = false;
	const timer = setTimeout(() => {
		timedOut = true;
		controller.abort();
	}, timeoutMs);
	const onCallerAbort = (): void => controller.abort();
	options.signal?.addEventListener("abort", onCallerAbort);

	try {
		if (isAborted(options.signal)) {
			return { status: "failed", reason: "aborted", message: "aborted" };
		}

		const value = await adapter.getPreviewData(
			{ ...request, limit },
			controller.signal,
		);

		if (timedOut) {
			return {
				status: "failed",
				reason: "timeout",
				message: `preview request exceeded ${timeoutMs} ms`,
			};
		}
		if (isAborted(options.signal)) {
			return { status: "failed", reason: "aborted", message: "aborted" };
		}

		const bytes = measureJsonBytes(value);
		if (bytes === null) {
			return {
				status: "failed",
				reason: "adapter-error",
				message: "preview payload is not serializable",
			};
		}
		if (bytes > PREVIEW_DATA_LIMITS.maxBytes) {
			// Reported by size only. Echoing any of the payload here would
			// put response data into a diagnostic, which §19 forbids.
			return {
				status: "failed",
				reason: "too-large",
				message: `preview payload is ${bytes} B, above the ${PREVIEW_DATA_LIMITS.maxBytes} B cap`,
			};
		}

		const clamped = truncateRecords(value, limit);
		return {
			status: "data",
			value: clamped.value,
			bytes,
			truncated: clamped.truncated,
		};
	} catch (error) {
		if (timedOut) {
			return {
				status: "failed",
				reason: "timeout",
				message: `preview request exceeded ${timeoutMs} ms`,
			};
		}
		if (isAborted(options.signal) || controller.signal.aborted) {
			return { status: "failed", reason: "aborted", message: "aborted" };
		}
		return {
			status: "failed",
			reason: "adapter-error",
			// The adapter's message may name a host resource, but never
			// carries response rows; a thrown Error is not the payload.
			message: error instanceof Error ? error.message : "adapter failed",
		};
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener("abort", onCallerAbort);
	}
}
