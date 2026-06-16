import { PageRootSchema } from "@anvilkit/schema";
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
 * Pure, isomorphic gateway that validates a page payload (`root.props`)
 * against the canonical `PageRootSchema` from `@anvilkit/schema`.
 *
 * Reuses the existing {@link ValidationResult}/{@link ValidationIssue} shape —
 * no new result type — mapping each Zod issue onto a `level: "error"` issue
 * with a symbol-safe `path` (mirrors the `validateAiSectionPatch` idiom in
 * `section.ts`). Carries no React import; runs in Node / Edge / browser.
 */
export function validatePagePayload(rootProps: unknown): ValidationResult {
	const result = PageRootSchema.safeParse(rootProps);
	if (result.success) {
		return { valid: true, issues: [] };
	}

	const issues: ValidationIssue[] = result.error.issues.map((zi) => ({
		level: "error",
		code: pageIssueCode(zi.code),
		message: zi.message,
		path: zi.path.map((segment) =>
			typeof segment === "symbol" ? segment.toString() : segment,
		),
	}));

	return { valid: false, issues };
}
