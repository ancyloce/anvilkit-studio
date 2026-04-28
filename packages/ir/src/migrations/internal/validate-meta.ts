/**
 * @file Zod schema for `PageIRNodeMeta` field caps.
 *
 * Internal to `@anvilkit/ir/migrations`. Not re-exported from the
 * public barrel — the surface that consumers see is
 * {@link import("../index.js").migratePageIR | migratePageIR} and
 * {@link import("../index.js").downgradePageIR | downgradePageIR},
 * both of which call into this module to enforce the runtime
 * contract documented on
 * {@link import("@anvilkit/core/types").PageIRNodeMeta | PageIRNodeMeta}.
 *
 * Caps live here (not on the type surface) so that
 * `@anvilkit/core/types/ir.ts` stays runtime-free and consumers who
 * only `import type { PageIRNodeMeta }` pay zero bytes.
 */

import type { PageIRNodeMeta } from "@anvilkit/core/types";
import { z } from "zod";

import {
	type NodeMetaValidationIssue,
	PageIRNodeMetaError,
} from "../error.js";

export type { NodeMetaValidationIssue };
export { PageIRNodeMetaError };

const SEMVER_PATTERN =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const PAGE_IR_NODE_META_LIMITS = Object.freeze({
	ownerMaxLength: 256,
	notesMaxLength: 512,
	versionPattern: SEMVER_PATTERN,
} as const);

const PageIRNodeMetaSchema: z.ZodType<PageIRNodeMeta> = z
	.object({
		locked: z.boolean().optional(),
		owner: z
			.string()
			.max(PAGE_IR_NODE_META_LIMITS.ownerMaxLength, {
				message: `owner must be ≤ ${PAGE_IR_NODE_META_LIMITS.ownerMaxLength} characters`,
			})
			.optional(),
		version: z
			.string()
			.regex(SEMVER_PATTERN, {
				message: "version must match the semver pattern MAJOR.MINOR.PATCH",
			})
			.optional(),
		notes: z
			.string()
			.max(PAGE_IR_NODE_META_LIMITS.notesMaxLength, {
				message: `notes must be ≤ ${PAGE_IR_NODE_META_LIMITS.notesMaxLength} characters`,
			})
			.optional(),
	})
	.strict();

export interface NodeMetaValidationResult {
	readonly ok: boolean;
	readonly issues: readonly NodeMetaValidationIssue[];
}

/**
 * Non-throwing validator. Returns `{ ok: true, issues: [] }` when the
 * input satisfies every cap. Returns `{ ok: false, issues: [...] }`
 * with one entry per Zod issue otherwise.
 *
 * Intentionally does NOT clone the input — it inspects shape only.
 */
export function safeParseNodeMeta(meta: unknown): NodeMetaValidationResult {
	const result = PageIRNodeMetaSchema.safeParse(meta);
	if (result.success) {
		return { ok: true, issues: [] };
	}
	return {
		ok: false,
		issues: result.error.issues.map((issue) => ({
			code: issue.code,
			message: issue.message,
			path: issue.path.map((segment) =>
				typeof segment === "symbol" ? segment.toString() : segment,
			),
		})),
	};
}

/**
 * Throwing validator. Returns the input unchanged when valid; throws
 * a {@link PageIRNodeMetaError} listing every cap violation
 * otherwise.
 */
export function parseNodeMetaOrThrow(meta: unknown): PageIRNodeMeta {
	const result = safeParseNodeMeta(meta);
	if (!result.ok) {
		throw new PageIRNodeMetaError(result.issues);
	}
	return meta as PageIRNodeMeta;
}

