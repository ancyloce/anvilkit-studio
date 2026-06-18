import { PageRootSchema } from "@anvilkit/schema";
import type { ZodError } from "zod";
import {
	PublishRequestSchema,
	PuckPageDataSchema,
	SaveDraftRequestSchema,
} from "./internal/puck-page-data-schema.js";
import type { ValidationIssue, ValidationResult } from "./types.js";

/**
 * Map a Zod issue code onto a stable `E_PAGE_*` validator code. The exact
 * string is advisory (callers surface `message`/`path`); the prefix lets
 * hosts group page-payload failures. Unknown codes fall back to the generic
 * bucket so new Zod versions never produce an untagged issue.
 */
function pageIssueCode(zodCode: string): string {
	switch (zodCode) {
		case "too_small":
			return "E_PAGE_REQUIRED"; // e.g. title .min(1)
		case "invalid_type":
			return "E_PAGE_INVALID_TYPE";
		case "invalid_format":
			return "E_PAGE_INVALID_FORMAT"; // slug regex / ogImage|canonical url
		case "invalid_value":
			return "E_PAGE_INVALID_VALUE"; // status enum
		default:
			return "E_PAGE_INVALID";
	}
}

/**
 * Project a {@link ZodError} onto the shared {@link ValidationIssue} shape — no
 * new result type — with a symbol-safe `path` (mirrors the `validateAiSectionPatch`
 * idiom in `section.ts`). Used by every page validator below.
 */
function toPageIssues(error: ZodError): ValidationIssue[] {
	return error.issues.map((zi) => ({
		level: "error" as const,
		code: pageIssueCode(zi.code),
		message: zi.message,
		path: zi.path.map((segment) =>
			typeof segment === "symbol" ? segment.toString() : segment,
		),
	}));
}

/**
 * Pure, isomorphic gateway that validates a page's `root.props` against the
 * canonical {@link PageRootSchema} from `@anvilkit/schema`. This is the
 * narrow, metadata-only check used by draft saves and settings edits.
 *
 * Carries no React import; runs in Node / Edge / browser.
 */
export function validatePageRootProps(rootProps: unknown): ValidationResult {
	const result = PageRootSchema.safeParse(rootProps);
	if (result.success) {
		return { valid: true, issues: [] };
	}
	return { valid: false, issues: toPageIssues(result.error) };
}

/**
 * Validate a *complete* Puck page document (`{ root, content, zones? }`) — the
 * check a publish must pass before the payload is written to storage. Delegates
 * `root.props` to the same {@link PageRootSchema} as {@link validatePageRootProps}
 * and additionally asserts the structural shape the renderer depends on.
 */
export function validatePuckPageData(data: unknown): ValidationResult {
	const result = PuckPageDataSchema.safeParse(data);
	if (result.success) {
		return { valid: true, issues: [] };
	}
	return { valid: false, issues: toPageIssues(result.error) };
}

/**
 * Validate the body of a `POST /api/pages/draft` request
 * (`{ slug?, title?, data: { root: { props } } }`). A draft only commits page
 * metadata, so this validates `data.root.props` and tolerates arbitrary
 * `content` (persisted verbatim).
 */
export function validateSaveDraftRequest(input: unknown): ValidationResult {
	const result = SaveDraftRequestSchema.safeParse(input);
	if (result.success) {
		return { valid: true, issues: [] };
	}
	return { valid: false, issues: toPageIssues(result.error) };
}

/**
 * Validate the body of a `POST /api/pages/publish` request
 * (`{ id?, slug?, data: PuckPageData }`). Publishing goes live, so the complete
 * payload is validated via {@link validatePuckPageData}.
 */
export function validatePublishRequest(input: unknown): ValidationResult {
	const result = PublishRequestSchema.safeParse(input);
	if (result.success) {
		return { valid: true, issues: [] };
	}
	return { valid: false, issues: toPageIssues(result.error) };
}

/**
 * @deprecated Renamed to {@link validatePageRootProps}. The old name only ever
 * validated `root.props` despite implying the full page payload; it is retained
 * as a thin alias for backward compatibility. Prefer {@link validatePageRootProps}
 * for metadata checks or {@link validatePuckPageData} for full-document checks.
 */
export function validatePagePayload(rootProps: unknown): ValidationResult {
	return validatePageRootProps(rootProps);
}
