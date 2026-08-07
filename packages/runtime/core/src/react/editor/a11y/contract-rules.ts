"use client";

/**
 * @file Contract-level accessibility rules (PLAN-0020 CORE-P1A-012;
 * ED-A11Y-001/002 contract subset; DD-0019 §20).
 *
 * Rules evaluable **without DOM access** — pure functions over the
 * Puck data tree and each component's declared capability metadata:
 *
 * - `image-missing-alt` — an image target (declared via
 *   `metadata.editor.capabilities.imageAdjust`) whose `srcPropPath`
 *   holds a value while its `altPropPath` is empty;
 * - `empty-accessible-name` — a declared inline-text target (the
 *   contract-level stand-in for link/button names) whose prop value
 *   is empty on a component type named like an interactive control;
 * - `skipped-heading-level` — heading levels (declared via a
 *   `metadata.editor` heading hint or a numeric `level` prop on
 *   Heading-typed components) that skip more than one step in
 *   document order.
 *
 * Issues carry **stable fingerprints** — `rule:nodeId[:target]` — so
 * navigation state and dismissals survive unrelated edits; incremental
 * evaluation memoizes per node record reference. DOM rules (contrast,
 * focus, touch targets) land in Phase 1B (CORE-P1B-011).
 */

import type { Data as PuckData } from "@puckeditor/core";
import type { EditorCapabilityRegistry } from "../../../types/editor-api.js";

/** One accessibility issue (§20 contract subset). */
export interface AccessibilityIssue {
	/** Stable fingerprint: `rule:nodeId[:targetId]`. */
	readonly fingerprint: string;
	readonly rule:
		| "image-missing-alt"
		| "empty-accessible-name"
		| "skipped-heading-level";
	readonly severity: "error" | "warning";
	readonly nodeId: string;
	readonly componentType: string;
	/** i18n key for the issue message (resolved by the panel). */
	readonly messageKey: string;
	/** The prop path a safe fix would write (when one exists). */
	readonly targetPropPath?: string;
}

interface TreeNode {
	readonly id: string;
	readonly type: string;
	readonly props: Readonly<Record<string, unknown>>;
}

/** Depth-first walk over content + all zones (document order). */
function walkTree(data: PuckData): TreeNode[] {
	const out: TreeNode[] = [];
	const visit = (items: readonly unknown[] | undefined): void => {
		for (const item of items ?? []) {
			const node = item as {
				type?: string;
				props?: Record<string, unknown>;
			};
			if (typeof node.type !== "string") {
				continue;
			}
			const props = node.props ?? {};
			const id = typeof props.id === "string" ? props.id : undefined;
			if (id !== undefined) {
				out.push({ id, type: node.type, props });
			}
		}
	};
	visit(data.content as readonly unknown[] | undefined);
	for (const zone of Object.values(
		(data as { zones?: Record<string, readonly unknown[]> }).zones ?? {},
	)) {
		visit(zone);
	}
	return out;
}

function readPath(
	props: Readonly<Record<string, unknown>>,
	path: string,
): unknown {
	let current: unknown = props;
	for (const segment of path.split(".")) {
		if (typeof current !== "object" || current === null) {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}
	return current;
}

function isBlank(value: unknown): boolean {
	return (
		value === undefined ||
		value === null ||
		(typeof value === "string" && value.trim() === "")
	);
}

const INTERACTIVE_TYPE_PATTERN = /button|link|cta|anchor/i;
const HEADING_TYPE_PATTERN = /heading|title/i;

/**
 * Evaluate the contract rule set over one document (document order).
 * Deterministic: same data + metadata → identical issue list.
 */
export function evaluateContractRules(
	data: PuckData,
	capabilities: EditorCapabilityRegistry,
	options?: {
		/**
		 * `EditorPolicies.requireAltText` (CORE-P1B-010): when false or
		 * absent, missing alt is a warning (decorative-empty-alt is an
		 * explicit authoring choice); when true it is an error and joins
		 * the export-policy path (CORE-P4-008).
		 */
		readonly requireAltText?: boolean;
	},
): readonly AccessibilityIssue[] {
	const issues: AccessibilityIssue[] = [];
	let lastHeadingLevel: number | null = null;

	for (const node of walkTree(data)) {
		const metadata = capabilities.forComponent(node.type);

		for (const target of metadata?.images ?? []) {
			if (target.altPropPath === undefined) {
				continue;
			}
			const src = readPath(node.props, target.srcPropPath);
			const alt = readPath(node.props, target.altPropPath);
			if (!isBlank(src) && isBlank(alt)) {
				issues.push({
					fingerprint: `image-missing-alt:${node.id}:${target.id}`,
					rule: "image-missing-alt",
					severity: options?.requireAltText === true ? "error" : "warning",
					nodeId: node.id,
					componentType: node.type,
					messageKey: "studio.editor.a11y.imageMissingAlt",
					targetPropPath: target.altPropPath,
				});
			}
		}

		if (INTERACTIVE_TYPE_PATTERN.test(node.type)) {
			const textTargets = metadata?.inlineText ?? [];
			const candidates =
				textTargets.length > 0
					? textTargets.map((target) => target.propPath)
					: ["label", "text", "children", "title"];
			const hasName = candidates.some(
				(path) => !isBlank(readPath(node.props, path)),
			);
			if (!hasName) {
				issues.push({
					fingerprint: `empty-accessible-name:${node.id}`,
					rule: "empty-accessible-name",
					severity: "error",
					nodeId: node.id,
					componentType: node.type,
					messageKey: "studio.editor.a11y.emptyAccessibleName",
					targetPropPath: candidates[0],
				});
			}
		}

		if (HEADING_TYPE_PATTERN.test(node.type)) {
			const rawLevel = node.props.level ?? node.props.rank;
			const level =
				typeof rawLevel === "number"
					? rawLevel
					: typeof rawLevel === "string" && /^h?[1-6]$/i.test(rawLevel)
						? Number(rawLevel.replace(/^h/i, ""))
						: null;
			if (level !== null) {
				if (lastHeadingLevel !== null && level > lastHeadingLevel + 1) {
					issues.push({
						fingerprint: `skipped-heading-level:${node.id}`,
						rule: "skipped-heading-level",
						severity: "warning",
						nodeId: node.id,
						componentType: node.type,
						messageKey: "studio.editor.a11y.skippedHeadingLevel",
						targetPropPath: "level",
					});
				}
				lastHeadingLevel = level;
			}
		}
	}
	return issues;
}
