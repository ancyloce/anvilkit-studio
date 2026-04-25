/**
 * @file Compatibility shim that wraps the legacy `aiHost` string prop
 * as a real {@link StudioPlugin}.
 *
 * The reference implementation at `ancyloce/anvilkit-puck-studio`
 * accepts an `aiHost` prop on its `<Studio>`-like component and runs
 * AI generation inline. The target architecture moves AI behind a
 * proper plugin (`@anvilkit/plugins/ai-generation` — Phase 3). This
 * adapter is the bridge: existing host apps can pass `aiHost` and
 * keep working while the real plugin lands, with a one-time
 * deprecation `console.warn` nudging migration.
 *
 * ### Why this lives in `src/compat/`
 *
 * 1. **Tree-shake isolation.** Consumers reach the adapter explicitly
 *    at `@anvilkit/core/compat`. The root `@anvilkit/core` barrel
 *    does **not** re-export it, so a host app that doesn't pass
 *    `aiHost` ships zero adapter bytes.
 * 2. **Forces the plugin contract to be usable.** Building this
 *    against {@link StudioPlugin} catches contract bugs before any
 *    real plugin exists — if `isStudioPlugin()` rejects this output,
 *    the contract is wrong, not the detector.
 * 3. **Stable migration story.** The real plugin can deprecate this
 *    file in a future minor release without touching the rest of the
 *    public API.
 *
 * ### Zero React, zero Puck runtime imports
 *
 * The only imports are `import type` references to the plugin
 * contract. Puck's `Data`/`PuckAction` types are pulled in
 * type-only via `StudioPluginContext.getPuckApi()`. The emitted
 * JavaScript has no runtime dependency on `react`, `react-dom`, or
 * `@puckeditor/core` — `verbatimModuleSyntax: true` erases all
 * type imports at build time.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-010-compat-ai-host.md | core-010}
 */

import type { Data as PuckData } from "@puckeditor/core";

import type { StudioPlugin, StudioPluginContext } from "../types/plugin.js";

/**
 * Configuration accepted by {@link aiHostAdapter}.
 *
 * Mirrors the shape the legacy `<Studio aiHost="…">` consumed:
 * a single string base URL and an optional path override. Anything
 * richer (auth headers, retry, streaming) belongs to the real
 * `@anvilkit/plugins/ai-generation` package.
 */
export interface AiHostAdapterOptions {
	/**
	 * Base URL of the legacy AI host (e.g.
	 * `"https://ai.example.com"`). The adapter appends
	 * {@link apiPath} (defaulting to `/generate`) and POSTs the
	 * current Puck data to that URL.
	 */
	readonly aiHost: string;

	/**
	 * Optional path appended to {@link aiHost}. Defaults to
	 * `"/generate"`. Override only if your legacy host exposes the
	 * generation endpoint at a different route — most consumers
	 * should leave this unset.
	 */
	readonly apiPath?: string;

	/**
	 * Optional per-request timeout in milliseconds. Defaults to
	 * `30_000` (30s) — long enough for legacy single-shot generation,
	 * short enough that a hung endpoint does not pin the editor
	 * indefinitely. Aborting produces the same `log("error", ...)`
	 * path as any other fetch failure.
	 */
	readonly timeoutMs?: number;
}

/**
 * Stable URL for the migration guide. Placeholder — finalized when
 * the migration docs are written in `core-015` or later. Hard-coded
 * here so the warning text is build-deterministic and the
 * `console.warn` call can be string-matched in tests.
 */
const MIGRATION_DOCS_URL = "https://anvilkit.dev/docs/migrations/ai-host";

/**
 * Frozen warning message. Hoisted to module scope so the
 * `console.warn` call site stays one line and the constant can be
 * referenced from tests if we ever want exact-text assertions.
 */
const DEPRECATION_MESSAGE = `@anvilkit/core: the \`aiHost\` prop is deprecated. Migrate to createAiGenerationPlugin() from @anvilkit/plugins/ai-generation. The adapter dispatches the endpoint's JSON response directly into Puck — treat the \`aiHost\` URL as a fully-trusted first-party service. See: ${MIGRATION_DOCS_URL}`;

/**
 * Default per-request timeout. 30 seconds matches the upper end of
 * browser fetch defaults and leaves room for slow model cold starts
 * without letting a hung endpoint pin the editor.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Hard ceiling on the JSON response body size (1 MiB). A pathological
 * or compromised endpoint cannot force Puck to ingest a multi-megabyte
 * blob — the adapter rejects oversize responses before parsing.
 */
const MAX_RESPONSE_BYTES = 1_048_576;

/**
 * Sentinel error used by {@link readBoundedResponseBody} to signal
 * "the stream produced more bytes than {@link MAX_RESPONSE_BYTES}
 * allows; the read aborted before reading the entire body." The
 * caller distinguishes this from a generic network failure so the
 * log message can name the cap rather than the network.
 */
class ResponseTooLargeError extends Error {
	constructor(public readonly bytesRead: number) {
		super(
			`aiHost response exceeded ${MAX_RESPONSE_BYTES} bytes (read ${bytesRead} before aborting)`,
		);
		this.name = "ResponseTooLargeError";
	}
}

/**
 * Stream the response body into a bounded buffer.
 *
 * `Content-Length` is advisory — HTTP/2 and chunked transfer-encoding
 * routinely omit it, and a malicious endpoint can simply lie. The
 * caller already does an early-reject when a `Content-Length` larger
 * than the cap is declared; this helper closes the loophole by
 * counting bytes as they arrive and aborting once the running total
 * crosses {@link MAX_RESPONSE_BYTES}.
 *
 * Falls back to `response.text()` if `response.body` is not a
 * `ReadableStream` (some test mocks and intermediaries omit it). In
 * the fallback path the entire body is buffered, but that's only
 * reachable from controlled environments — production fetch always
 * exposes a stream.
 */
async function readBoundedResponseBody(
	response: Response,
	limit: number,
): Promise<string> {
	const body = response.body as ReadableStream<Uint8Array> | null | undefined;
	if (
		body === null ||
		body === undefined ||
		typeof body.getReader !== "function"
	) {
		// Fallback for shapes that omit `body` (some mocks, some
		// intermediaries). We can still post-check the resulting
		// string length so the cap is enforced — just less promptly.
		const text = await response.text();
		// `String.prototype.length` is a UTF-16 code-unit count, which
		// systematically under-counts the UTF-8 byte length used by the
		// streaming path: a single 4-byte UTF-8 emoji is 2 UTF-16 units,
		// and a 3-byte CJK glyph is 1 unit. A non-ASCII payload could
		// otherwise sneak past the cap here even though the streaming
		// path would have rejected it. Re-encode and measure bytes so
		// both paths enforce exactly the same `MAX_RESPONSE_BYTES` ceiling.
		const byteCount = new TextEncoder().encode(text).byteLength;
		if (byteCount > limit) {
			throw new ResponseTooLargeError(byteCount);
		}
		return text;
	}

	const reader = body.getReader();
	const decoder = new TextDecoder("utf-8");
	const chunks: string[] = [];
	let bytesRead = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) {
				break;
			}
			if (value === undefined) {
				continue;
			}
			bytesRead += value.byteLength;
			if (bytesRead > limit) {
				// Best-effort cancel so the underlying connection can
				// be closed promptly; ignore any cancel rejection
				// because we're already in the throw path.
				try {
					await reader.cancel();
				} catch {
					/* ignore */
				}
				throw new ResponseTooLargeError(bytesRead);
			}
			chunks.push(decoder.decode(value, { stream: true }));
		}
		// Flush any trailing multi-byte sequence still buffered in the
		// streaming decoder.
		chunks.push(decoder.decode());
	} finally {
		reader.releaseLock?.();
	}
	return chunks.join("");
}

/**
 * Plain-JS structural validator for the Puck `Data` shape.
 *
 * Intentionally dependency-free — importing Zod here would drag the
 * ~60 KB validator into the compat async chunk even for hosts that
 * never trigger an AI generation. The legacy endpoint contract is
 * narrow (`{ root, content, zones }`), so a hand-rolled check is
 * both cheaper and more defensible than a schema.
 *
 * The validator recurses into `content` and `zones` and checks every
 * component `type` against the mounted Puck config so a hostile
 * endpoint cannot smuggle an unknown component entry past the gate —
 * Puck renders component props into the DOM, and some component
 * packages pass strings through verbatim, which is the load-bearing
 * XSS surface the adapter needs to close.
 *
 * Anything that fails this check is logged and refused — preferring
 * a noisy log over an XSS-shaped dispatch into the editor.
 */
function isPuckDataShape(
	value: unknown,
	componentTypes: ReadonlySet<string>,
): value is Partial<PuckData> {
	if (!isPlainRecord(value)) {
		return false;
	}

	if (value.root !== undefined && !isPuckRootShape(value.root)) {
		return false;
	}

	if (
		value.content !== undefined &&
		!isPuckContentShape(value.content, componentTypes)
	) {
		return false;
	}

	if (
		value.zones !== undefined &&
		!isPuckZonesShape(value.zones, componentTypes)
	) {
		return false;
	}

	return true;
}

/**
 * `typeof value === "object"` with `null` and `Array` excluded.
 * Used wherever the validator needs a plain `{ ... }` object.
 */
function isPlainRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate the `root` slot: an object, optionally with a plain `props`
 * record. Puck tolerates additional keys here, so unknown properties
 * are passed through.
 */
function isPuckRootShape(value: unknown): boolean {
	if (!isPlainRecord(value)) {
		return false;
	}
	if (value.props !== undefined && !isPlainRecord(value.props)) {
		return false;
	}
	return true;
}

/**
 * Validate the `content` array: each entry must be a plain record
 * with `type: string` and a plain `props` record (if present).
 * Anything else is a protocol violation the adapter refuses to pass
 * into Puck.
 */
function isPuckContentShape(
	value: unknown,
	componentTypes: ReadonlySet<string>,
): boolean {
	if (!Array.isArray(value)) {
		return false;
	}
	for (const entry of value) {
		if (!isPuckContentEntry(entry, componentTypes)) {
			return false;
		}
	}
	return true;
}

/**
 * Validate a single `content` entry. `type` must be a string —
 * anything else is a smuggled payload (an object, an array, a
 * function disguised via `{ type: "<script>", ... }`). `props`, if
 * present, must be a plain record.
 */
function isPuckContentEntry(
	value: unknown,
	componentTypes: ReadonlySet<string>,
): boolean {
	if (!isPlainRecord(value)) {
		return false;
	}
	if (typeof value.type !== "string") {
		return false;
	}
	if (!componentTypes.has(value.type)) {
		return false;
	}
	if (value.props !== undefined && !isPlainRecord(value.props)) {
		return false;
	}
	return true;
}

/**
 * Validate the `zones` map: a record where each value is a Puck
 * content array (same shape validated by {@link isPuckContentShape}).
 */
function isPuckZonesShape(
	value: unknown,
	componentTypes: ReadonlySet<string>,
): boolean {
	if (!isPlainRecord(value)) {
		return false;
	}
	for (const entry of Object.values(value)) {
		if (!isPuckContentShape(entry, componentTypes)) {
			return false;
		}
	}
	return true;
}

/**
 * Module-scoped one-shot guard for the deprecation warning.
 *
 * **Not** stored on `globalThis` — ESM module identity is
 * process-wide for the same module specifier, so a single
 * `let warned` here is sufficient to dedupe across every
 * `aiHostAdapter()` call within the host process.
 *
 * Tests that need to re-arm the warning use `vi.resetModules()` to
 * force a fresh module instance.
 */
let warned = false;

/**
 * Build a {@link StudioPlugin} that exposes a single header action
 * (`compat-ai-generate`) wired to the legacy AI host endpoint.
 *
 * The first call per process emits a one-time deprecation warning
 * via `console.warn`; subsequent calls are silent. The factory is
 * pure data — no module-load side effects, no globals registered —
 * so unused imports can be tree-shaken away by ESM bundlers.
 *
 * @param options - The legacy {@link AiHostAdapterOptions}.
 *
 * @example
 * ```ts
 * import { createStudioConfig } from "@anvilkit/core";
 * import { aiHostAdapter } from "@anvilkit/core/compat";
 *
 * const config = createStudioConfig({
 *   plugins: [aiHostAdapter({ aiHost: "https://ai.example.com" })],
 * });
 * ```
 */
export function aiHostAdapter(options: AiHostAdapterOptions): StudioPlugin {
	if (!warned) {
		warned = true;
		console.warn(DEPRECATION_MESSAGE);
	}

	// Compute the full endpoint URL once at adapter-creation time so
	// every onClick invocation reuses the same string. Defaults to
	// `${aiHost}/generate` per the legacy contract.
	const endpoint = `${options.aiHost}${options.apiPath ?? "/generate"}`;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

	// `meta` is captured by the closure so the inner `register()`
	// can hand the same reference back inside the registration —
	// avoids the `this`-binding fragility of object literal methods.
	const meta = {
		id: "anvilkit-compat-ai-host",
		name: "Legacy aiHost Adapter",
		version: "0.1.0-alpha.0",
		coreVersion: "^0.1.0-alpha",
	} as const;

	return {
		meta,
		register() {
			return {
				meta,
				headerActions: [
					{
						id: "compat-ai-generate",
						label: "Generate with AI",
						group: "secondary",
						icon: "sparkles",
						async onClick(ctx: StudioPluginContext) {
							// AbortController enforces the per-request
							// timeout even when the endpoint never closes the
							// response stream. `clearTimeout` below prevents
							// the abort from firing after a successful
							// round-trip.
							const controller = new AbortController();
							const timeoutId = setTimeout(() => {
								controller.abort();
							}, timeoutMs);
							try {
								const response = await fetch(endpoint, {
									method: "POST",
									headers: { "Content-Type": "application/json" },
									body: JSON.stringify({
										currentData: ctx.getData(),
									}),
									signal: controller.signal,
								});

								if (!response.ok) {
									ctx.log(
										"error",
										`aiHost request failed with status ${response.status}`,
										{ endpoint, status: response.status },
									);
									return;
								}

								// `Content-Length` is advisory — HTTP/2 and
								// chunked transfer-encoding routinely omit it,
								// and a malicious endpoint can simply lie or
								// under-report. We keep the header as an
								// early-reject fast path (saves a round-trip
								// through the streaming reader for honest
								// oversize responses), but the load-bearing
								// enforcement happens in
								// `readBoundedResponseBody` below, which
								// counts bytes as the stream arrives and
								// aborts once the cap is crossed.
								const declaredLength =
									response.headers?.get?.("content-length") ?? null;
								if (
									declaredLength !== null &&
									Number(declaredLength) > MAX_RESPONSE_BYTES
								) {
									ctx.log("error", "aiHost response exceeds size limit", {
										endpoint,
										contentLength: declaredLength,
										limit: MAX_RESPONSE_BYTES,
									});
									return;
								}

								// Stream the body into a bounded buffer so a
								// chunked / HTTP-2 / lying-Content-Length
								// response cannot OOM the editor tab.
								let bodyText: string;
								try {
									bodyText = await readBoundedResponseBody(
										response,
										MAX_RESPONSE_BYTES,
									);
								} catch (readError) {
									if (readError instanceof ResponseTooLargeError) {
										ctx.log("error", "aiHost response exceeds size limit", {
											endpoint,
											bytesRead: readError.bytesRead,
											limit: MAX_RESPONSE_BYTES,
										});
										return;
									}
									ctx.log("error", "aiHost response stream read failed", {
										endpoint,
										error: readError,
									});
									return;
								}

								// A misbehaving or compromised endpoint could
								// dispatch arbitrary attacker-controlled JSON
								// into Puck — which renders prop values into
								// the DOM — so validate the shape BEFORE
								// dispatch. Anything that fails the structural
								// check is logged and dropped.
								let parsed: unknown;
								try {
									parsed = JSON.parse(bodyText);
								} catch (parseError) {
									ctx.log("error", "aiHost response was not valid JSON", {
										endpoint,
										error: parseError,
									});
									return;
								}

								const puckApi = ctx.getPuckApi();
								const componentTypes = new Set(
									Object.keys(puckApi.config.components),
								);

								if (!isPuckDataShape(parsed, componentTypes)) {
									ctx.log(
										"error",
										"aiHost response did not match Puck Data shape or registered component types; dispatch refused",
										{ endpoint },
									);
									return;
								}

								puckApi.dispatch({
									type: "setData",
									data: parsed,
								});
							} catch (error) {
								// Per the spec: minimum-viable error handling.
								// Log and let the user retry. Retry / backoff
								// belongs to `@anvilkit/plugins/ai-generation`.
								// `AbortError` is surfaced with an explicit
								// hint so operators can distinguish a timeout
								// from a generic network failure.
								const isAbort =
									typeof DOMException !== "undefined" &&
									error instanceof DOMException &&
									error.name === "AbortError";
								ctx.log(
									"error",
									isAbort
										? `aiHost request timed out after ${timeoutMs}ms`
										: "aiHost request failed",
									{ endpoint, error },
								);
							} finally {
								clearTimeout(timeoutId);
							}
						},
					},
				],
			};
		},
	};
}
