/**
 * Consistent Page API envelope. Every `/api/pages/*` route returns an
 * {@link ApiResponse}: a success carries `data`, a failure carries a stable
 * machine `code`, a human `message`, and (for validation errors) the structured
 * `issues`. Raw Zod errors are never serialized to the client.
 */

export interface ApiSuccess<T> {
	readonly ok: true;
	readonly data: T;
	/**
	 * Conditions the write honored but the caller should know about — today
	 * only `E_PAGE_REMOTE_LOCK_UNREADABLE`, reported when a stored remote
	 * component lock this build cannot parse was preserved instead of being
	 * replaced by the request (S1-T04). Absent when there is nothing to report.
	 */
	readonly warnings?: readonly unknown[];
}

export interface ApiFailure {
	readonly ok: false;
	readonly code: string;
	readonly message: string;
	readonly issues?: readonly unknown[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/** Stable failure codes surfaced in {@link ApiFailure.code}. */
export const API_ERROR = {
	validation: "E_VALIDATION",
	notFound: "E_NOT_FOUND",
	conflict: "E_CONFLICT",
	badRequest: "E_BAD_REQUEST",
} as const;

export function apiSuccess<T>(
	data: T,
	warnings?: readonly unknown[],
): ApiSuccess<T> {
	return warnings === undefined || warnings.length === 0
		? { ok: true, data }
		: { ok: true, data, warnings };
}

export function apiFailure(
	code: string,
	message: string,
	issues?: readonly unknown[],
): ApiFailure {
	return issues === undefined
		? { ok: false, code, message }
		: { ok: false, code, message, issues };
}
