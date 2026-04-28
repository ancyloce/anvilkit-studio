/**
 * @file Public surface for `@anvilkit/ir/migrations` (Phase 6 / M10).
 *
 * Adds the `migratePageIR` / `downgradePageIR` helpers that formalize
 * the additive `PageIRNode.meta` contract introduced in
 * `@anvilkit/ir@0.22`. The IR document `version` literal stays `"1"`
 * across this transition — `meta` is purely additive, and these
 * helpers exist to make round-trip semantics explicit at the package
 * boundary, not to bump schema.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/phase-6-tasks.md | phase-6-tasks.md} for the M10 atomic task list.
 */

import type { PageIR, PageIRNode } from "@anvilkit/core/types";

import {
	type NodeMetaValidationIssue,
	PageIRNodeMetaError,
} from "./error.js";
import { stripMetaFromTree } from "./internal/strip-meta.js";
import {
	parseNodeMetaOrThrow,
	safeParseNodeMeta,
} from "./internal/validate-meta.js";

export { PageIRNodeMetaError } from "./error.js";
export type { NodeMetaValidationIssue } from "./error.js";

/**
 * The peer-range labels that {@link migratePageIR} accepts.
 *
 * `"0.21"` is the `1.0` GA peer range (no `meta`); `"0.22"` is the
 * `1.1` peer range (additive `meta`). The values map to
 * `@puckeditor/core` peer-range labels rather than to the IR
 * document's own `version` literal — the IR literal stays `"1"`.
 */
export const MIGRATION_VERSIONS = ["0.21", "0.22"] as const;

export type PageIRMigrationVersion = (typeof MIGRATION_VERSIONS)[number];

export interface PageIRMigrationOptions {
	/** Peer-range label of the document being migrated. */
	readonly from: PageIRMigrationVersion;
	/** Target peer-range label. */
	readonly to: PageIRMigrationVersion;
}

/**
 * Migrate a {@link PageIR} document between peer-range labels.
 *
 * - Pure no-op when `from === to` AND every node has `meta === undefined`.
 *   Returns the original reference.
 * - Validates every `node.meta` (when present) against the runtime
 *   caps documented on
 *   {@link import("@anvilkit/core/types").PageIRNodeMeta | PageIRNodeMeta}.
 *   Throws {@link PageIRNodeMetaError} on the first invalid node.
 * - Returns a structurally cloned, frozen IR when validation
 *   succeeds with at least one populated `meta`. The clone preserves
 *   `meta` byte-for-byte; it never synthesizes new fields.
 *
 * Importantly, this helper NEVER bumps `ir.version`. The literal
 * stays `"1"` across `0.21 ↔ 0.22`.
 */
export function migratePageIR(
	ir: PageIR,
	options: PageIRMigrationOptions,
): PageIR {
	assertKnownVersion(options.from, "from");
	assertKnownVersion(options.to, "to");

	const issues: NodeMetaValidationIssue[] = [];
	const hasAnyMeta = walkAndValidate(ir.root, [], issues);

	if (issues.length > 0) {
		throw new PageIRNodeMetaError(issues);
	}

	if (!hasAnyMeta) {
		// No-op: every node lacks `meta`, so the input already
		// satisfies both peer-range contracts. Return the original
		// reference to preserve referential equality.
		return ir;
	}

	return Object.freeze({
		...ir,
		root: cloneNodePreservingMeta(ir.root),
	});
}

function assertKnownVersion(
	value: string,
	label: "from" | "to",
): asserts value is PageIRMigrationVersion {
	if (!MIGRATION_VERSIONS.includes(value as PageIRMigrationVersion)) {
		throw new RangeError(
			`migratePageIR: \`${label}\` must be one of ${MIGRATION_VERSIONS.join(", ")}; received "${value}"`,
		);
	}
}

function walkAndValidate(
	node: PageIRNode,
	path: ReadonlyArray<string | number>,
	out: NodeMetaValidationIssue[],
): boolean {
	let hasMeta = false;
	if (node.meta !== undefined) {
		hasMeta = true;
		const result = safeParseNodeMeta(node.meta);
		if (!result.ok) {
			for (const issue of result.issues) {
				out.push({
					code: issue.code,
					message: issue.message,
					path: [...path, "meta", ...issue.path],
				});
			}
		}
	}
	if (node.children !== undefined) {
		for (let i = 0; i < node.children.length; i += 1) {
			const childHasMeta = walkAndValidate(
				node.children[i]!,
				[...path, "children", i],
				out,
			);
			hasMeta = hasMeta || childHasMeta;
		}
	}
	return hasMeta;
}

function cloneNodePreservingMeta(node: PageIRNode): PageIRNode {
	const cloned: Mutable<PageIRNode> = {
		id: node.id,
		type: node.type,
		props: node.props,
	};
	if (node.slot !== undefined) cloned.slot = node.slot;
	if (node.slotKind !== undefined) cloned.slotKind = node.slotKind;
	if (node.children !== undefined) {
		cloned.children = Object.freeze(
			node.children.map(cloneNodePreservingMeta),
		);
	}
	if (node.assets !== undefined) cloned.assets = node.assets;
	if (node.meta !== undefined) {
		// Validate-then-pass-through. `parseNodeMetaOrThrow` here
		// is a defensive belt-and-braces — `walkAndValidate` already
		// drained the issue list above. If we ever reach this with
		// invalid meta the throw is a clear bug, not silent data.
		cloned.meta = parseNodeMetaOrThrow(node.meta);
	}
	return Object.freeze(cloned);
}

/**
 * Recursively strip `meta` from every node in a {@link PageIR}.
 *
 * Use when surfacing IR to a `1.0` consumer that pins against the
 * pre-`meta` contract. Always returns a fresh, frozen tree — even
 * when the input had no `meta` to strip — so callers can safely
 * cache the result.
 */
export function downgradePageIR(ir: PageIR): PageIR {
	return stripMetaFromTree(ir);
}

type Mutable<T> = { -readonly [P in keyof T]: T[P] };
