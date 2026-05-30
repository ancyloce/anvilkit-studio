/**
 * @file Studio structured-logging helpers, extracted from
 * `use-studio-controller.ts` (review finding RX-b) so they are
 * unit-testable and reusable without the React shell.
 *
 * `writeStudioLog` is the single sink the `<Studio>` shell + plugin
 * context route every log record through: it shallow-redacts sensitive
 * meta keys, normalizes `Error` values to a fully-enumerable shape, and
 * falls back to `console` when no host logger is supplied.
 */

import type { StudioLogLevel } from "@/types/plugin";

/**
 * Host-supplied structured logger. Re-exported from `Studio.tsx` so the
 * public `@anvilkit/core/react` surface is unchanged.
 */
export type StudioLogger = (
	level: StudioLogLevel,
	message: string,
	meta?: Readonly<Record<string, unknown>>,
) => void;

const REDACTED_META_KEYS = [
	"token",
	"secret",
	"password",
	"apikey",
	"api_key",
	"authorization",
	"cookie",
	"bearer",
] as const;

function shouldRedactKey(key: string): boolean {
	const normalized = key.toLowerCase();
	for (const needle of REDACTED_META_KEYS) {
		if (normalized.includes(needle)) {
			return true;
		}
	}
	return false;
}

/**
 * Normalize an `Error` to a fully-enumerable shape so `name`/
 * `message`/`stack`/`cause` survive `JSON.stringify` boundaries (Next
 * dev overlay, host loggers, bug reports). `cause` is unwrapped
 * recursively (depth-bounded) because wrapper errors carry the real
 * reason there.
 */
export function normalizeLogError(
	error: Error,
	depth: number,
): Record<string, unknown> {
	const normalized: Record<string, unknown> = {
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
	const { cause } = error;
	if (cause !== undefined && depth > 0) {
		normalized.cause =
			cause instanceof Error ? normalizeLogError(cause, depth - 1) : cause;
	}
	return normalized;
}

/**
 * Build a log-meta object from an arbitrary thrown value (review
 * finding N-e). `Error`s become the recursive {@link normalizeLogError}
 * shape; everything else becomes `{ value: String(thrown) }`. Shared so
 * the controller and `HeaderActionButton` no longer hand-roll divergent
 * error shapes.
 */
export function errorToLogMeta(
	error: unknown,
	depth = 4,
): Record<string, unknown> {
	return error instanceof Error
		? normalizeLogError(error, depth)
		: { value: String(error) };
}

function normalizeLogValue(value: unknown): unknown {
	if (value instanceof Error) {
		return normalizeLogError(value, 4);
	}
	return value;
}

function redactLogMeta(
	meta: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(meta)) {
		out[key] = shouldRedactKey(key) ? "[REDACTED]" : normalizeLogValue(value);
	}
	return out;
}

export function writeStudioLog(
	logger: StudioLogger | undefined,
	level: StudioLogLevel,
	message: string,
	meta: Readonly<Record<string, unknown>> | undefined,
): void {
	const redactedMeta = meta === undefined ? undefined : redactLogMeta(meta);
	if (logger !== undefined) {
		try {
			logger(level, message, redactedMeta);
		} catch (error) {
			console.error("[studio] logger threw", error);
		}
		return;
	}

	const method =
		level === "error"
			? "error"
			: level === "warn"
				? "warn"
				: level === "debug"
					? "debug"
					: "info";
	console[method](`[studio] ${message}`, redactedMeta ?? {});
}
