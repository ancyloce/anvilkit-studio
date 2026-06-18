/**
 * Consistent Page API envelope. Every `/api/pages/*` route returns an
 * {@link ApiResponse}: a success carries `data`, a failure carries a stable
 * machine `code`, a human `message`, and (for validation errors) the structured
 * `issues`. Raw Zod errors are never serialized to the client.
 */

export interface ApiSuccess<T> {
	readonly ok: true;
	readonly data: T;
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

export function apiSuccess<T>(data: T): ApiSuccess<T> {
	return { ok: true, data };
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
