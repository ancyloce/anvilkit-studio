/**
 * @file Vendored Zod schema for `PageIRNodeMeta` field caps inside
 * `@anvilkit/validator`. Mirrors
 * `packages/ir/src/migrations/internal/validate-meta.ts` deliberately
 * — the validator package must not import from `@anvilkit/ir` to
 * keep its dep contract minimal (architecture §8).
 *
 * Caps:
 * - `notes` ≤ 512 characters
 * - `owner` ≤ 256 characters
 * - `version` matches the semver pattern (`MAJOR.MINOR.PATCH` with
 *   optional pre-release / build suffix)
 * - `locked` is a boolean
 * - unknown keys are rejected
 */

import { z } from "zod";

const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const NODE_META_LIMITS = Object.freeze({
	ownerMaxLength: 256,
	notesMaxLength: 512,
	versionPattern: SEMVER_PATTERN,
} as const);

const NodeMetaSchema = z
	.object({
		locked: z.boolean().optional(),
		owner: z.string().max(NODE_META_LIMITS.ownerMaxLength).optional(),
		version: z.string().regex(SEMVER_PATTERN).optional(),
		notes: z.string().max(NODE_META_LIMITS.notesMaxLength).optional(),
	})
	.strict();

export interface NodeMetaIssue {
	readonly code: "INVALID_NODE_META";
	readonly message: string;
	readonly path: ReadonlyArray<string | number>;
}

/**
 * Inspect a candidate `meta` value. Returns an empty array when the
 * input is valid (or when `meta` is undefined — the caller is
 * responsible for skipping that case).
 *
 * Each issue's `path` is relative to the meta object itself; callers
 * splice it onto the surrounding patch path (e.g.
 * `["replacement", i, "meta", ...issuePath]`).
 */
export function validateNodeMeta(meta: unknown): readonly NodeMetaIssue[] {
	const result = NodeMetaSchema.safeParse(meta);
	if (result.success) {
		return [];
	}
	return result.error.issues.map((issue) => ({
		code: "INVALID_NODE_META" as const,
		message: issue.message,
		path: issue.path.map((segment) =>
			typeof segment === "symbol" ? segment.toString() : segment,
		),
	}));
}
