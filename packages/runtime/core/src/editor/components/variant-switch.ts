/**
 * @file Instance variant switching with compatible-override
 * preservation (PLAN-0020 CORE-P2-009C/D; ED-VARIANT-001/002;
 * ADR 0005 "variant switching preserves compatible overrides;
 * incompatible ones become diagnostics").
 *
 * **What makes an override incompatible.** A definition's node *set*
 * is shared across variants — variant patches patch existing
 * definition nodes rather than restructuring the tree. What a variant
 * patch genuinely can change is which **props exist** on a node: a
 * patch may introduce a prop that no other combination has. An
 * instance override of such a prop is meaningful in the combination
 * that declares it and meaningless in one that does not.
 *
 * So compatibility is decided by resolving the definition under the
 * **new** combination (variant patch + exposed-prop defaults, but
 * deliberately *without* the instance's own overrides) and asking, per
 * override entry:
 *
 * - target definition node absent → the whole entry is incompatible;
 * - overridden prop key absent on that node → that key is
 *   incompatible, siblings survive;
 * - authoring families (layout/style/typography/hidden) are always
 *   compatible — they are presentation applied to a node that exists.
 *
 * ED-VARIANT-002's "never silently discard": every drop is reported.
 * Exposed-property overrides are definition-level and survive every
 * switch, so they are never touched here.
 */

import type {
	AuthoringStateV1,
	ComponentDefinitionV1,
	ComponentInstanceState,
	EditorError,
	JsonValue,
	NodeOverridePatch,
	SerializablePuckNode,
} from "@anvilkit/contracts/editor";
import { makeEditorError } from "../diagnostics.js";
import { withRecord } from "../node-records.js";
import { materializeInstance } from "./materialize.js";

/** One override (or override property) dropped by a switch. */
export interface DroppedOverride {
	readonly instanceNodeId: string;
	readonly definitionNodeId: string;
	/** Absent when the whole entry went because the node is gone. */
	readonly propertyKey?: string;
	readonly reason: "node-absent" | "property-absent";
}

/** The outcome of switching one or more instances. */
export interface VariantSwitchResult {
	readonly state: AuthoringStateV1;
	readonly dropped: readonly DroppedOverride[];
}

/** Index a materialized tree's nodes by their definition node id. */
function indexByDefinitionNode(
	node: SerializablePuckNode,
	instanceNodeId: string,
	into: Map<string, SerializablePuckNode>,
): void {
	const runtimeId = node.props.id;
	if (typeof runtimeId === "string") {
		const marker = `${instanceNodeId}::`;
		if (runtimeId.startsWith(marker)) {
			into.set(runtimeId.slice(marker.length), node);
		}
	}
	for (const value of Object.values(node.props)) {
		if (!Array.isArray(value)) {
			continue;
		}
		for (const entry of value) {
			if (
				typeof entry === "object" &&
				entry !== null &&
				!Array.isArray(entry) &&
				typeof (entry as { type?: unknown }).type === "string"
			) {
				indexByDefinitionNode(
					entry as unknown as SerializablePuckNode,
					instanceNodeId,
					into,
				);
			}
		}
	}
}

/**
 * The definition as it resolves under `selection`, with **no**
 * instance overrides applied — the baseline compatibility is judged
 * against.
 */
function resolveUnderSelection(
	instanceNodeId: string,
	instance: ComponentInstanceState,
	selection: Readonly<Record<string, string>>,
	definitions: Readonly<Record<string, ComponentDefinitionV1>>,
): Map<string, SerializablePuckNode> | undefined {
	const probe = materializeInstance(
		instanceNodeId,
		{
			...instance,
			variantSelection: selection,
			// Deliberately cleared: an override must not vouch for itself.
			nodeOverrides: {},
		},
		definitions,
	);
	if (probe.status !== "materialized") {
		return undefined;
	}
	const index = new Map<string, SerializablePuckNode>();
	indexByDefinitionNode(probe.node, instanceNodeId, index);
	return index;
}

/**
 * Switch the variant selection on each listed instance, keeping every
 * override that still applies and reporting each one that does not.
 */
export function switchInstanceVariant(
	state: AuthoringStateV1,
	instanceNodeIds: readonly string[],
	selection: Readonly<Record<string, string>>,
): VariantSwitchResult {
	let next = state;
	const dropped: DroppedOverride[] = [];

	for (const instanceNodeId of instanceNodeIds) {
		const record = next.nodes[instanceNodeId];
		const instance = record?.componentInstance;
		if (record === undefined || instance === undefined) {
			continue;
		}

		const resolved = resolveUnderSelection(
			instanceNodeId,
			instance,
			selection,
			next.componentDefinitions,
		);

		let nodeOverrides = instance.nodeOverrides;
		if (resolved !== undefined) {
			const kept: Record<string, NodeOverridePatch> = {};
			for (const [definitionNodeId, patch] of Object.entries(
				instance.nodeOverrides,
			)) {
				const node = resolved.get(definitionNodeId);
				if (node === undefined) {
					dropped.push({
						instanceNodeId,
						definitionNodeId,
						reason: "node-absent",
					});
					continue;
				}
				if (patch.props === undefined) {
					kept[definitionNodeId] = patch;
					continue;
				}
				const keptProps: Record<string, JsonValue> = {};
				for (const [key, value] of Object.entries(patch.props)) {
					if (Object.hasOwn(node.props, key)) {
						keptProps[key] = value;
					} else {
						dropped.push({
							instanceNodeId,
							definitionNodeId,
							propertyKey: key,
							reason: "property-absent",
						});
					}
				}
				const hasFamilies =
					patch.layout !== undefined ||
					patch.style !== undefined ||
					patch.typography !== undefined ||
					patch.hidden !== undefined;
				if (Object.keys(keptProps).length === 0) {
					if (hasFamilies) {
						const { props: _dropped, ...rest } = patch;
						kept[definitionNodeId] = rest;
					}
					continue;
				}
				kept[definitionNodeId] = { ...patch, props: keptProps };
			}
			nodeOverrides = kept;
		}

		next = withRecord(next, instanceNodeId, {
			...record,
			componentInstance: {
				...instance,
				variantSelection: selection,
				nodeOverrides,
			},
		});
	}

	return { state: next, dropped };
}

/** Dropped overrides as user-facing diagnostics (ED-VARIANT-002). */
export function droppedOverrideDiagnostics(
	dropped: readonly DroppedOverride[],
): readonly EditorError[] {
	return dropped.map((entry) =>
		makeEditorError(
			"EDITOR_NODE_NOT_FOUND",
			entry.propertyKey === undefined
				? `override on definition node "${entry.definitionNodeId}" does not apply to the selected variant and was removed`
				: `override of "${entry.propertyKey}" on definition node "${entry.definitionNodeId}" does not apply to the selected variant and was removed`,
			{
				severity: "warning",
				nodeIds: [entry.instanceNodeId],
				details: {
					kind: "incompatibleOverride",
					definitionNodeId: entry.definitionNodeId,
					propertyKey: entry.propertyKey,
					reason: entry.reason,
				},
			},
		),
	);
}
