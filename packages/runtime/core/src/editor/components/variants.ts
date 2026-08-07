/**
 * @file Variant axis/combination model and matcher (PLAN-0020
 * CORE-P2-009A/B; ED-VARIANT-001; DD-0019 §14.2, §14.4, §24.4;
 * DD-DEC-009).
 *
 * The schema (CORE-P0-005D) already enforces the two caps and
 * rejects selections naming an unknown *axis*. What it cannot see —
 * and what this file owns — are the **identity rules** that make a
 * variant set unambiguous:
 *
 * - axis ids unique within a component, option ids unique within an axis;
 * - a variant selects **every** axis (the contract calls it "a full
 *   axis selection"); a partial selection would match no combination
 *   and silently render the base;
 * - each selection names a **declared option** of its axis;
 * - variant ids unique, and no two variants carrying the *same*
 *   combination — duplicates make `matchVariant` order-dependent,
 *   which would break the determinism ED-VARIANT-001 requires.
 *
 * Matching is exact over the declared axes, so it is total and
 * order-independent: for any selection at most one variant can match.
 */

import type {
	ComponentDefinition,
	ComponentVariant,
	EditorError,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import { EDITOR_COUNT_LIMITS } from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";

/** A stable key for one axis selection, independent of key order. */
export function variantCombinationKey(
	selection: Readonly<Record<string, string>>,
): string {
	return Object.keys(selection)
		.sort()
		.map((axisId) => `${axisId}=${selection[axisId]}`)
		.join("&");
}

/** How many combinations the declared axes can express. */
export function variantCombinationCount(axes: readonly VariantAxis[]): number {
	return axes.reduce((total, axis) => total * axis.options.length, 1);
}

/**
 * Validate a component's variant model. Returns every violation; an
 * empty array means the model is unambiguous and within caps.
 */
export function validateVariantModel(
	definition: ComponentDefinition,
): readonly EditorError[] {
	const errors: EditorError[] = [];
	const definitionId = definition.id;

	if (
		definition.variantAxes.length > EDITOR_COUNT_LIMITS.variantAxesPerComponent
	) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`components allow at most ${EDITOR_COUNT_LIMITS.variantAxesPerComponent} variant axes`,
				{
					details: {
						limitKey: "variantAxesPerComponent",
						limit: EDITOR_COUNT_LIMITS.variantAxesPerComponent,
						actual: definition.variantAxes.length,
						definitionId,
					},
				},
			),
		);
	}
	if (definition.variants.length > EDITOR_COUNT_LIMITS.variantsPerComponent) {
		errors.push(
			makeEditorError(
				"EDITOR_LIMIT_EXCEEDED",
				`components allow at most ${EDITOR_COUNT_LIMITS.variantsPerComponent} variants`,
				{
					details: {
						limitKey: "variantsPerComponent",
						limit: EDITOR_COUNT_LIMITS.variantsPerComponent,
						actual: definition.variants.length,
						definitionId,
					},
				},
			),
		);
	}

	// Axis identity.
	const axisIds = new Set<string>();
	const optionsByAxis = new Map<string, Set<string>>();
	for (const axis of definition.variantAxes) {
		if (axisIds.has(axis.id)) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`duplicate variant axis id "${axis.id}"`,
					{
						details: {
							kind: "variantAxis",
							definitionId,
							axisId: axis.id,
							reason: "duplicate-id",
						},
					},
				),
			);
		}
		axisIds.add(axis.id);

		const optionIds = new Set<string>();
		for (const option of axis.options) {
			if (optionIds.has(option.id)) {
				errors.push(
					makeEditorError(
						"EDITOR_COMMAND_CONFLICT",
						`duplicate option id "${option.id}" on axis "${axis.id}"`,
						{
							details: {
								kind: "variantAxisOption",
								definitionId,
								axisId: axis.id,
								optionId: option.id,
								reason: "duplicate-id",
							},
						},
					),
				);
			}
			optionIds.add(option.id);
		}
		optionsByAxis.set(axis.id, optionIds);
	}

	// Variant identity and selection completeness.
	const variantIds = new Set<string>();
	const combinations = new Map<string, string>();
	for (const variant of definition.variants) {
		if (variantIds.has(variant.id)) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`duplicate variant id "${variant.id}"`,
					{
						details: {
							kind: "componentVariant",
							definitionId,
							variantId: variant.id,
							reason: "duplicate-id",
						},
					},
				),
			);
		}
		variantIds.add(variant.id);

		for (const [axisId, optionId] of Object.entries(variant.selection)) {
			const options = optionsByAxis.get(axisId);
			if (options === undefined) {
				errors.push(
					makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`variant "${variant.id}" selects unknown axis "${axisId}"`,
						{
							details: {
								kind: "variantAxis",
								definitionId,
								variantId: variant.id,
								axisId,
							},
						},
					),
				);
				continue;
			}
			if (!options.has(optionId)) {
				errors.push(
					makeEditorError(
						"EDITOR_NODE_NOT_FOUND",
						`variant "${variant.id}" selects unknown option "${optionId}" on axis "${axisId}"`,
						{
							details: {
								kind: "variantAxisOption",
								definitionId,
								variantId: variant.id,
								axisId,
								optionId,
							},
						},
					),
				);
			}
		}

		const missing = definition.variantAxes
			.map((axis) => axis.id)
			.filter((axisId) => variant.selection[axisId] === undefined);
		if (missing.length > 0) {
			errors.push(
				makeEditorError(
					"EDITOR_CAPABILITY_UNSUPPORTED",
					`variant "${variant.id}" must select every axis; missing ${missing.join(", ")}`,
					{
						details: {
							kind: "componentVariant",
							definitionId,
							variantId: variant.id,
							reason: "incomplete-selection",
							missingAxisIds: missing,
						},
					},
				),
			);
			continue;
		}

		const key = variantCombinationKey(variant.selection);
		const existing = combinations.get(key);
		if (existing !== undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_COMMAND_CONFLICT",
					`variants "${existing}" and "${variant.id}" declare the same combination`,
					{
						details: {
							kind: "componentVariant",
							definitionId,
							variantId: variant.id,
							conflictsWith: existing,
							reason: "duplicate-combination",
						},
					},
				),
			);
			continue;
		}
		combinations.set(key, variant.id);
	}

	return errors;
}

/**
 * The variant matching `selection`, or `undefined` for none
 * (§24.4 step 1).
 *
 * Matching is **exact over every declared axis**: an instance whose
 * selection is partial or names an option no variant declares matches
 * nothing and renders the definition base. Because a valid model has
 * no duplicate combinations, at most one variant can match, so the
 * result does not depend on array order — the determinism property
 * ED-VARIANT-001 requires.
 */
export function matchVariant(
	definition: ComponentDefinition,
	selection: Readonly<Record<string, string>>,
): ComponentVariant | undefined {
	if (definition.variantAxes.length === 0) {
		return undefined;
	}
	return definition.variants.find((variant) =>
		definition.variantAxes.every(
			(axis) => variant.selection[axis.id] === selection[axis.id],
		),
	);
}
