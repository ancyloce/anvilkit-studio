/**
 * @file Editor error builders and the shared dev-invariant helper
 * (PLAN-0020 CORE-P0-007; DD-0019 §9.5, §25).
 *
 * Development builds MAY throw {@link EditorInvariantError} at an
 * invariant violation; production builds convert the same violation
 * into a typed `EditorError` diagnostic and keep running. Every
 * editor module funnels its invariants through
 * {@link checkInvariant} so the behavior stays uniform.
 */

import type { EditorError, EditorErrorCode } from "@anvilkit/contracts/editor";

/** Thrown for invariant violations in development builds only. */
export class EditorInvariantError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "EditorInvariantError";
	}
}

/** Shorthand builder for a typed editor error. */
export function makeEditorError(
	code: EditorErrorCode,
	message: string,
	options?: {
		readonly severity?: EditorError["severity"];
		readonly recoverable?: boolean;
		readonly path?: readonly (string | number)[];
		readonly nodeIds?: readonly string[];
		readonly details?: Readonly<Record<string, unknown>>;
	},
): EditorError {
	return {
		code,
		message,
		severity: options?.severity ?? "error",
		recoverable: options?.recoverable ?? true,
		...(options?.path !== undefined ? { path: options.path } : {}),
		...(options?.nodeIds !== undefined ? { nodeIds: options.nodeIds } : {}),
		...(options?.details !== undefined ? { details: options.details } : {}),
	};
}

function isDevelopmentBuild(): boolean {
	// No node types in this browser-targeted package; read the global
	// defensively (bundlers inline `process.env.NODE_ENV`, node has the
	// real global, other runtimes fall through to `false`).
	const env = (
		globalThis as {
			process?: { env?: Record<string, string | undefined> };
		}
	).process?.env;
	return env?.NODE_ENV !== undefined && env.NODE_ENV !== "production";
}

/**
 * Check an internal invariant. Returns `null` when it holds. On
 * violation: throws {@link EditorInvariantError} in development,
 * returns the caller-supplied typed diagnostic in production
 * (DD-0019 §25).
 */
export function checkInvariant(
	condition: unknown,
	error: () => EditorError,
): EditorError | null {
	if (condition) {
		return null;
	}
	const diagnostic = error();
	if (isDevelopmentBuild()) {
		throw new EditorInvariantError(diagnostic.message);
	}
	return diagnostic;
}
