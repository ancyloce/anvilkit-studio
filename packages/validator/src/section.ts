/**
 * @file `@anvilkit/validator/section` — validation for section-level
 * AI patches.
 *
 * The Phase 3 sibling `validateAiOutput` validates a whole-page LLM
 * response against the `PageIR` shape. `validateAiSectionPatch` is the
 * subtree-scoped variant: given a patch the LLM produced for a
 * pre-derived {@link AiSectionContext}, decide whether the patch is
 * safe to apply via `puckApi.dispatch({ type: "setData", … })`.
 *
 * Returns a {@link ValidationResult} whose issues use one of four
 * codes — `PATCH_SHAPE`, `DISALLOWED_COMPONENT`, `INVALID_NODE`, or
 * `NON_SERIALIZABLE_PROP`. Anything that downgrades the safety of the
 * patch surfaces as `level: "error"`; advisory mismatches (an unknown
 * extra prop key) surface as `level: "warning"` so the caller can
 * decide whether to apply or block.
 */

import type {
	AiComponentSchema,
	AiSectionContext,
	AiSectionPatch,
} from "@anvilkit/core/types";

import { closestMatch } from "./internal/closest-match.js";
import { MAX_NODE_DEPTH } from "./internal/constants.js";
import { findNonSerializablePath } from "./internal/find-non-serializable-path.js";
import { makeComponentPropsSchema } from "./internal/make-zod-schema.js";
import type { ValidationIssue, ValidationResult } from "./types.js";

const SECTION_CODES = {
	PATCH_SHAPE: "PATCH_SHAPE",
	INVALID_NODE: "INVALID_NODE",
	NON_SERIALIZABLE_PROP: "NON_SERIALIZABLE_PROP",
	DISALLOWED_COMPONENT: "DISALLOWED_COMPONENT",
} as const;

function isRecordLike(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasValueAtPath(
	value: Record<string, unknown>,
	path: readonly PropertyKey[],
): boolean {
	let current = value;
	for (let index = 0; index < path.length; index += 1) {
		const segment = path[index]!;
		if (typeof segment === "symbol" || !(segment in current)) {
			return false;
		}
		if (index === path.length - 1) {
			return true;
		}
		const next = current[segment];
		if (typeof next !== "object" || next === null) {
			return false;
		}
		current = next as Record<string, unknown>;
	}
	return true;
}

/**
 * Validate an {@link AiSectionPatch} against the
 * {@link AiSectionContext} the host originally derived for the
 * selection.
 *
 * Validation order:
 *
 * 1. `PATCH_SHAPE` — patch is an object; `zoneId` matches `ctx.zoneId`;
 *    `nodeIds` matches `ctx.nodeIds` (same length + order);
 *    `replacement` is an array; `replacement.length` equals
 *    `nodeIds.length` *unless* `ctx.allowResize === true`.
 * 2. Per replacement node, in array order:
 *    - `INVALID_NODE` for shape violations (missing id/type, props not
 *      an object, slot/slotKind/children malformed, props that fail
 *      the component's field schema).
 *    - `NON_SERIALIZABLE_PROP` for any prop value the IR cannot
 *      round-trip through JSON.
 *    - `DISALLOWED_COMPONENT` when the node's `type` is not in
 *      `ctx.availableComponents`.
 *    - Recursively walks `children` with the same rules.
 *
 * Always returns a fully populated {@link ValidationResult}; the
 * caller decides whether to apply (when `valid === true`) or reject.
 *
 * Pure function — no I/O, no global state.
 */
export function validateAiSectionPatch(
	patch: unknown,
	ctx: AiSectionContext,
): ValidationResult {
	const issues: ValidationIssue[] = [];

	if (!isRecordLike(patch)) {
		issues.push({
			level: "error",
			code: SECTION_CODES.PATCH_SHAPE,
			message: "Patch must be an object.",
			path: [],
		});
		return { valid: false, issues };
	}

	const patchRecord = patch as Record<string, unknown>;

	if (patchRecord.zoneId !== ctx.zoneId) {
		issues.push({
			level: "error",
			code: SECTION_CODES.PATCH_SHAPE,
			message: `Patch zoneId "${String(patchRecord.zoneId)}" does not match context zoneId "${ctx.zoneId}".`,
			path: ["zoneId"],
		});
	}

	const patchNodeIds = patchRecord.nodeIds;
	if (!Array.isArray(patchNodeIds)) {
		issues.push({
			level: "error",
			code: SECTION_CODES.PATCH_SHAPE,
			message: "Patch nodeIds must be an array.",
			path: ["nodeIds"],
		});
	} else {
		if (patchNodeIds.length !== ctx.nodeIds.length) {
			issues.push({
				level: "error",
				code: SECTION_CODES.PATCH_SHAPE,
				message: `Patch nodeIds length (${patchNodeIds.length}) does not match context nodeIds length (${ctx.nodeIds.length}).`,
				path: ["nodeIds"],
			});
		} else {
			for (let i = 0; i < patchNodeIds.length; i++) {
				if (patchNodeIds[i] !== ctx.nodeIds[i]) {
					issues.push({
						level: "error",
						code: SECTION_CODES.PATCH_SHAPE,
						message: `Patch nodeIds[${i}] "${String(patchNodeIds[i])}" does not match context nodeIds[${i}] "${ctx.nodeIds[i]}".`,
						path: ["nodeIds", i],
					});
				}
			}
		}
	}

	const replacement = patchRecord.replacement;
	if (!Array.isArray(replacement)) {
		issues.push({
			level: "error",
			code: SECTION_CODES.PATCH_SHAPE,
			message: "Patch replacement must be an array.",
			path: ["replacement"],
		});
		return { valid: false, issues };
	}

	if (
		!ctx.allowResize &&
		Array.isArray(patchNodeIds) &&
		replacement.length !== patchNodeIds.length
	) {
		issues.push({
			level: "error",
			code: SECTION_CODES.PATCH_SHAPE,
			message: `Patch replacement length (${replacement.length}) does not match nodeIds length (${patchNodeIds.length}); enable ctx.allowResize for size-changing patches.`,
			path: ["replacement"],
		});
	}

	const componentMap = new Map<string, AiComponentSchema>();
	for (const component of ctx.availableComponents) {
		componentMap.set(component.componentName, component);
	}
	const componentNames = ctx.availableComponents.map((c) => c.componentName);

	for (let i = 0; i < replacement.length; i++) {
		walkNode(
			replacement[i],
			["replacement", i],
			componentMap,
			componentNames,
			issues,
			0,
		);
	}

	return {
		valid: issues.every((issue) => issue.level !== "error"),
		issues,
	};
}

function walkNode(
	node: unknown,
	pathSegments: readonly (string | number)[],
	componentMap: Map<string, AiComponentSchema>,
	componentNames: readonly string[],
	issues: ValidationIssue[],
	depth: number,
): void {
	if (depth >= MAX_NODE_DEPTH) {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: `Node tree exceeds maximum depth of ${MAX_NODE_DEPTH}.`,
			path: [...pathSegments],
		});
		return;
	}

	if (!isRecordLike(node)) {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: "Replacement entries must be objects.",
			path: [...pathSegments],
		});
		return;
	}

	const nodeRecord = node as Record<string, unknown>;

	if (typeof nodeRecord.id !== "string") {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: "Node is missing a string 'id' property.",
			path: [...pathSegments, "id"],
		});
	}

	const nodeType = nodeRecord.type;
	const nodeProps = nodeRecord.props;
	let propsRecord: Record<string, unknown> | undefined;

	if (isRecordLike(nodeProps)) {
		propsRecord = nodeProps;
		const nonSer = findNonSerializablePath(
			propsRecord,
			[...pathSegments, "props"],
			new WeakSet(),
			0,
		);
		if (nonSer) {
			issues.push({
				level: "error",
				code: SECTION_CODES.NON_SERIALIZABLE_PROP,
				message: `Prop value is not JSON-serialisable (${nonSer.reason}). PageIR values must round-trip through JSON.`,
				path: nonSer.path,
				...(typeof nodeType === "string" ? { componentName: nodeType } : {}),
			});
		}
	} else {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: "Node props must be an object.",
			path: [...pathSegments, "props"],
		});
	}

	if (nodeRecord.slot !== undefined && typeof nodeRecord.slot !== "string") {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: "Node slot must be a string when present.",
			path: [...pathSegments, "slot"],
		});
	}

	if (
		nodeRecord.slotKind !== undefined &&
		nodeRecord.slotKind !== "slot" &&
		nodeRecord.slotKind !== "zone"
	) {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: 'Node slotKind must be "slot" or "zone" when present.',
			path: [...pathSegments, "slotKind"],
		});
	}

	if (typeof nodeType !== "string") {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: "Node is missing a string 'type' property.",
			path: [...pathSegments, "type"],
		});
		walkChildren(
			nodeRecord,
			pathSegments,
			componentMap,
			componentNames,
			issues,
			depth,
		);
		return;
	}

	const componentSchema = componentMap.get(nodeType);

	if (!componentSchema) {
		const suggestion = closestMatch(nodeType, componentNames);
		const suggestionText = suggestion ? ` Did you mean "${suggestion}"?` : "";
		issues.push({
			level: "error",
			code: SECTION_CODES.DISALLOWED_COMPONENT,
			message: `Component "${nodeType}" is not in the zone's allowed-components list.${suggestionText}`,
			path: [...pathSegments, "type"],
			componentName: nodeType,
		});
	} else if (propsRecord) {
		const propsSchema = makeComponentPropsSchema(componentSchema.fields);
		const result = propsSchema.safeParse(propsRecord);

		if (!result.success) {
			for (const zi of result.error.issues) {
				const normalizedIssuePath = zi.path.map((segment) =>
					typeof segment === "symbol" ? String(segment) : segment,
				);

				let detail = "INVALID_FIELD_TYPE";
				if (
					zi.code === "invalid_type" &&
					!hasValueAtPath(propsRecord, zi.path)
				) {
					detail = "MISSING_REQUIRED_FIELD";
				} else if (zi.code === "invalid_value") {
					detail = "INVALID_ENUM_VALUE";
				}

				issues.push({
					level: "error",
					code: SECTION_CODES.INVALID_NODE,
					message: `[${detail}] ${zi.message}`,
					path: [...pathSegments, "props", ...normalizedIssuePath],
					componentName: nodeType,
				});
			}
		}

		const knownFieldNames = new Set(
			componentSchema.fields.map((f) => f.name),
		);
		for (const propKey of Object.keys(propsRecord)) {
			if (propKey === "id") continue;
			if (!knownFieldNames.has(propKey)) {
				issues.push({
					level: "warning",
					code: SECTION_CODES.INVALID_NODE,
					message: `Property "${propKey}" is not defined in the schema for "${nodeType}".`,
					path: [...pathSegments, "props", propKey],
					componentName: nodeType,
				});
			}
		}
	}

	walkChildren(
		nodeRecord,
		pathSegments,
		componentMap,
		componentNames,
		issues,
		depth,
	);
}

function walkChildren(
	nodeRecord: Record<string, unknown>,
	pathSegments: readonly (string | number)[],
	componentMap: Map<string, AiComponentSchema>,
	componentNames: readonly string[],
	issues: ValidationIssue[],
	depth: number,
): void {
	const children = nodeRecord.children;
	if (children === undefined) return;

	if (!Array.isArray(children)) {
		issues.push({
			level: "error",
			code: SECTION_CODES.INVALID_NODE,
			message: `children must be an array when present, got ${children === null ? "null" : typeof children}.`,
			path: [...pathSegments, "children"],
		});
		return;
	}

	for (let i = 0; i < children.length; i++) {
		walkNode(
			children[i],
			[...pathSegments, "children", i],
			componentMap,
			componentNames,
			issues,
			depth + 1,
		);
	}
}
