"use client";

/**
 * @file `useComponentInstance` — the instance-mode model behind the
 * inspector's Component section (PLAN-0028 `p5-006`;
 * ED-COMP-003/-004/-007/-008, ED-VARIANT-002; DD-0019 §14.4, §14.5).
 *
 * Everything a user can do to a *placed* component: pick its variant,
 * see which of its exposed properties are overridden and which are
 * inherited, override or reset one, reset every override at once,
 * promote a node override into the definition, and detach the instance
 * into plain nodes.
 *
 * ### What `p5-006` changed
 *
 * The instance and its definition used to be read from
 * `port.getSnapshot().authoring` — the sidecar. They are now read from
 * `p2-004`'s projection: the instance from the node's **own declared
 * prop** and the definition from `root.props.componentLibrary`
 * (contract rule 2). Every write is a `p3-002`/`p3-003` carrier commit,
 * one history-recording `setData` per intent.
 *
 * The override vocabulary follows the commit path rather than the old
 * command union: `p3-003` resets and promotes a **whole definition
 * node's** patch, so the UI addresses whole nodes too. Offering a
 * per-family reset the writer cannot express would render controls
 * guaranteed to fail — the same rule `StylePanel` follows for
 * allowlisted properties.
 *
 * ### Two behaviours the spec calls for explicitly
 *
 * - **Compatible overrides survive a variant switch.**
 *   `updateInstanceSelectionInData` keeps every override that still
 *   addresses a live node/property under the new selection and
 *   *reports* the rest as warnings. They surface as
 *   {@link ComponentInstanceModel.diagnostics} rather than being
 *   discarded, so a dropped override is visible (ED-VARIANT-002).
 * - **An unresolvable definition retains its instance data.** Nothing
 *   here clears the instance carrier when a definition is missing; the
 *   instance keeps its overrides and re-resolves when the definition
 *   returns (ED-COMP-007).
 */

import type {
	ComponentDefinition,
	ComponentInstanceState,
	ComponentPropDefinition,
	EditorError,
	JsonValue,
	NodeOverridePatch,
} from "@anvilkit/contracts/editor";
import { useCallback, useEffect, useMemo, useState } from "react";
import { randomId } from "@/shared/node-id";
import type { InstanceOverrideEdit } from "../../../puck/update-instance-overrides.js";
import {
	commitDetachInstance,
	commitInstanceOverride,
} from "../../../puck/update-instance-overrides.js";
import { commitInstanceSelection } from "../../../puck/update-variants.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { useOptionalDocumentModel } from "../use-document-model.js";
import {
	useComponentEditorRuntime,
	useComponentWriterGateGetter,
	usePuckApiGetter,
} from "./editor-runtime.js";

/**
 * One node override the instance carries, addressed for reset/promote.
 *
 * Addresses a whole definition node, because that is what `p3-003`'s
 * `reset-node-override` and `promote` edits address. `fields` is the
 * summary of what the patch actually carries, so the row says *what*
 * is overridden without pretending each part is separately resettable.
 */
export interface InstanceOverrideEntry {
	readonly definitionNodeId: string;
	/** The node's display label — its id, which is its stable address. */
	readonly label: string;
	/** `title`, `layout`, `typography`, … in the patch. */
	readonly fields: readonly string[];
}

/**
 * One exposed property of the definition, as this instance sees it.
 *
 * `inherited` is the same flag `ResolvedValue` carries in `p2-003`'s
 * field-state union — not a second provenance concept, the same one
 * read at the instance layer of the §14.4 cascade. It is what makes an
 * overridden field render differently from an inherited one
 * (`ED-FA-008`'s minimum).
 */
export interface InstanceExposedProp {
	readonly definition: ComponentPropDefinition;
	/** False when this instance carries an override for the property. */
	readonly inherited: boolean;
	/** The override when present, else the definition's default. */
	readonly value: JsonValue | undefined;
}

/** The instance-mode surface for one selected instance node. */
export interface ComponentInstanceModel {
	readonly nodeId: string;
	readonly instance: ComponentInstanceState;
	/** `null` when the referenced definition is not in the document. */
	readonly definition: ComponentDefinition | null;
	/** True when the definition is missing — data retained (ED-COMP-007). */
	readonly unresolved: boolean;
	/** Every exposed property, overridden and inherited alike. */
	readonly exposedProps: readonly InstanceExposedProp[];
	/** The node overrides this instance carries. */
	readonly overrides: readonly InstanceOverrideEntry[];
	readonly canMutate: boolean;
	/** Warnings from the last commit (dropped overrides, refusals). */
	readonly diagnostics: readonly EditorError[];
	readonly setVariant: (
		selection: Readonly<Record<string, string>>,
	) => InstanceCommitOutcome;
	/** Override one exposed property on this instance. */
	readonly setExposedProp: (
		propId: string,
		value: JsonValue,
	) => InstanceCommitOutcome;
	/** Clear one exposed-property override, restoring the inherited value. */
	readonly resetExposedProp: (propId: string) => InstanceCommitOutcome;
	/** Clear one definition node's override patch. */
	readonly resetOverride: (
		entry: InstanceOverrideEntry,
	) => InstanceCommitOutcome;
	readonly resetAllOverrides: () => InstanceCommitOutcome;
	/** Push one node override up into the shared definition. */
	readonly promoteOverride: (
		entry: InstanceOverrideEntry,
	) => InstanceCommitOutcome;
	readonly detach: () => InstanceCommitOutcome;
	/**
	 * Open this instance's definition in isolated editing — the
	 * selected-instance entry point (ED-COMP-005). Transient UI state:
	 * no history entry, and the page selection is restored on exit.
	 */
	readonly editDefinition: () => void;
}

/** The outcome of any instance write. */
export interface InstanceCommitOutcome {
	readonly status: "committed" | "noop" | "rejected";
	readonly errors: readonly EditorError[];
}

const NO_ERRORS: readonly EditorError[] = Object.freeze([]);
const NO_PROPS: readonly InstanceExposedProp[] = Object.freeze([]);
const NO_OVERRIDES: readonly InstanceOverrideEntry[] = Object.freeze([]);

/** Which parts of a node patch are actually set. */
function patchFields(patch: NodeOverridePatch): readonly string[] {
	const fields: string[] = [];
	for (const [family, value] of Object.entries(patch)) {
		if (value === undefined) continue;
		if (family === "props") {
			fields.push(...Object.keys(value as Readonly<Record<string, unknown>>));
			continue;
		}
		fields.push(family);
	}
	return fields.sort();
}

/** Flatten one instance's node overrides into addressable rows. */
function overrideEntries(
	instance: ComponentInstanceState,
): readonly InstanceOverrideEntry[] {
	const entries = Object.entries(instance.nodeOverrides)
		.map(([definitionNodeId, patch]) => ({
			definitionNodeId,
			label: definitionNodeId,
			fields: patchFields(patch),
		}))
		.filter((entry) => entry.fields.length > 0)
		.sort((a, b) => a.definitionNodeId.localeCompare(b.definitionNodeId));
	return entries.length === 0 ? NO_OVERRIDES : entries;
}

/**
 * Every exposed property, tagged with whether this instance overrides
 * it. Both states are listed — an inherited property that is simply
 * absent from the panel cannot be *shown* as inherited, and showing
 * the difference is the whole point.
 */
function exposedPropRows(
	definition: ComponentDefinition | null,
	instance: ComponentInstanceState,
): readonly InstanceExposedProp[] {
	if (definition === null || definition.exposedProps.length === 0) {
		return NO_PROPS;
	}
	return definition.exposedProps.map((prop) => {
		const overridden = Object.hasOwn(instance.propOverrides, prop.id);
		return {
			definition: prop,
			inherited: !overridden,
			value: overridden ? instance.propOverrides[prop.id] : prop.defaultValue,
		};
	});
}

/**
 * The instance model for the primary selected node, or `null` when
 * nothing selected is a component instance.
 *
 * Degrades to `null` outside `<Puck>` rather than throwing — the
 * section is mounted by chrome that production always renders inside
 * the provider, but tests and hosts may not.
 */
export function useComponentInstance(): ComponentInstanceModel | null {
	const model = useOptionalDocumentModel();
	const selection = useShellSelection();
	const runtime = useComponentEditorRuntime();
	const getPuckApi = usePuckApiGetter();
	const getWriterGateError = useComponentWriterGateGetter();
	const [diagnostics, setDiagnostics] =
		useState<readonly EditorError[]>(NO_ERRORS);

	const nodeId = selection.primaryId;
	const instance =
		nodeId === null || model === null
			? undefined
			: model.nodes.get(nodeId)?.componentInstance;
	const definition =
		instance === undefined || model === null
			? null
			: (model.componentLibrary?.definitions[instance.definitionId] ?? null);

	/*
	 * Diagnostics describe ONE instance, so they are dropped the moment
	 * the user selects a different one. Without this, switching instance
	 * A's variant (say, two overrides dropped) and then clicking
	 * instance B rendered A's drop report inside B's inspector as though
	 * it described B.
	 */
	useEffect(() => {
		// `nodeId` is the trigger, not an input — re-running when it
		// changes is the entire point of this effect.
		void nodeId;
		setDiagnostics(NO_ERRORS);
	}, [nodeId]);

	const record = useCallback(
		(result: InstanceCommitOutcome): InstanceCommitOutcome => {
			setDiagnostics(result.errors.length === 0 ? NO_ERRORS : result.errors);
			return result;
		},
		[],
	);

	const override = useCallback(
		(edit: InstanceOverrideEdit): InstanceCommitOutcome => {
			const api = getPuckApi();
			if (nodeId === null || api === null) {
				return { status: "rejected", errors: NO_ERRORS };
			}
			const result = commitInstanceOverride(
				{ getPuckApi: () => api },
				[nodeId],
				edit,
			);
			return record({ status: result.status, errors: result.errors });
		},
		[nodeId, getPuckApi, record],
	);

	/**
	 * Switch the instance's variant (ED-VARIANT-002).
	 *
	 * Overrides that still apply under the new combination survive; the
	 * rest are dropped **with a visible diagnostic**, which the commit
	 * returns directly rather than this hook replaying the switch to
	 * recover a report the writer already produced.
	 */
	const setVariant = useCallback(
		(
			variantSelection: Readonly<Record<string, string>>,
		): InstanceCommitOutcome => {
			const api = getPuckApi();
			if (nodeId === null || api === null) {
				return { status: "rejected", errors: NO_ERRORS };
			}
			const result = commitInstanceSelection(
				{ getPuckApi: () => api },
				[nodeId],
				variantSelection,
			);
			return record({ status: result.status, errors: result.errors });
		},
		[nodeId, getPuckApi, record],
	);

	const setExposedProp = useCallback(
		(propId: string, value: JsonValue) =>
			override({ kind: "set-exposed-prop", propId, value }),
		[override],
	);

	/**
	 * Reset restores the **inherited** value, not a control default:
	 * removing the entry lets the §14.4 cascade resolve the property
	 * from the layer below (variant patch, or the definition base).
	 */
	const resetExposedProp = useCallback(
		(propId: string) => override({ kind: "reset-exposed-prop", propId }),
		[override],
	);

	const resetOverride = useCallback(
		(entry: InstanceOverrideEntry) =>
			override({
				kind: "reset-node-override",
				definitionNodeId: entry.definitionNodeId,
			}),
		[override],
	);

	const resetAllOverrides = useCallback(
		() => override({ kind: "reset-all" }),
		[override],
	);

	/**
	 * Promote writes into the DEFINITION and removes the override from
	 * the instance in the same commit, so the override becomes shared
	 * rather than being redundantly re-stated in both places. Both
	 * halves land in one `Data`, therefore one undo.
	 */
	const promoteOverride = useCallback(
		(entry: InstanceOverrideEntry) =>
			override({ kind: "promote", definitionNodeId: entry.definitionNodeId }),
		[override],
	);

	/**
	 * Detach the instance into ordinary page nodes (ED-COMP-004).
	 *
	 * An unresolvable definition rejects rather than half-detaching: the
	 * instance's data must survive (ED-COMP-007).
	 */
	const detach = useCallback((): InstanceCommitOutcome => {
		const api = getPuckApi();
		if (nodeId === null || api === null) {
			return { status: "rejected", errors: NO_ERRORS };
		}
		const result = commitDetachInstance(
			{ getPuckApi: () => api, getWriterGateError },
			[nodeId],
			() => randomId(),
		);
		return record({ status: result.status, errors: result.errors });
	}, [nodeId, getPuckApi, getWriterGateError, record]);

	const definitionId = instance?.definitionId;
	const editDefinition = useCallback(() => {
		if (definitionId === undefined) return;
		runtime.enterComponent(definitionId);
	}, [definitionId, runtime]);

	return useMemo(() => {
		if (nodeId === null || instance === undefined) return null;
		return {
			nodeId,
			instance,
			definition,
			unresolved: definition === null,
			exposedProps: exposedPropRows(definition, instance),
			overrides: overrideEntries(instance),
			canMutate: runtime.canMutate,
			diagnostics,
			setVariant,
			setExposedProp,
			resetExposedProp,
			resetOverride,
			resetAllOverrides,
			promoteOverride,
			detach,
			editDefinition,
		};
	}, [
		nodeId,
		instance,
		definition,
		runtime.canMutate,
		diagnostics,
		setVariant,
		setExposedProp,
		resetExposedProp,
		resetOverride,
		resetAllOverrides,
		promoteOverride,
		detach,
		editDefinition,
	]);
}
