/**
 * @file Pure reducers for the shipped command subset — Phase 0/1A
 * plus the Phase 2 token store (PLAN-0020 CORE-P0-008, CORE-P2-001;
 * DD-0019 §24.2; contract freeze CORE-P0-001 D-1/D-8).
 *
 * Reducers never mutate input, never generate ids or timestamps, and
 * preserve object references wherever a write turns out to be a
 * no-op — reference preservation is the fast path for the deep-equal
 * noop check in `applyEditorCommand`.
 */

import type {
	AtomicEditorCommand,
	AuthoringStateV1,
	EditorPatch,
	NodeAuthoringStateV1,
	ResponsiveFamily,
	ResponsiveLayerRef,
	ResponsiveValue,
} from "@anvilkit/contracts/editor";
import {
	setNodeOverride,
	setPropOverride,
} from "../components/instances.js";
import { deleteDefinition } from "../components/lifecycle.js";
import { applyComponentDefinitionPatch } from "../components/patch.js";
import {
	promoteComponentOverride,
	resetAllComponentOverrides,
	resetComponentOverride,
} from "../components/overrides.js";
import { getRecord, withRecord } from "../node-records.js";
import { applyEditorPatch } from "../patch.js";
import { applyStyleDefinitionPatch } from "../styles/patch.js";
import {
	attachStyleDefinition,
	deleteStyleDefinition,
	detachStyleDefinition,
} from "../styles/style-definitions.js";
import { applyTokenDeletion } from "../tokens/deletion.js";
import { applyTokenPatch } from "../tokens/patch.js";

type FamilyKey = Exclude<ResponsiveFamily, "hidden" | "styleRefs">;

function setResponsiveEntry<T>(
	value: ResponsiveValue<T> | undefined,
	layer: ResponsiveLayerRef,
	update: (current: T | undefined) => T | undefined,
): ResponsiveValue<T> | undefined {
	const current = value ?? {};
	if (layer === "base") {
		const nextBase = update(current.base);
		if (nextBase === current.base) {
			return value;
		}
		const next: ResponsiveValue<T> = { ...current };
		if (nextBase === undefined) {
			delete (next as { base?: T }).base;
		} else {
			(next as { base?: T }).base = nextBase;
		}
		return collapseResponsive(next);
	}
	const overrides = current.overrides ?? {};
	const existing = overrides[layer];
	const nextEntry = update(existing === null ? undefined : existing);
	if (nextEntry === (existing === null ? undefined : existing)) {
		return value;
	}
	const nextOverrides: Record<string, T | null> = { ...overrides };
	if (nextEntry === undefined) {
		delete nextOverrides[layer];
	} else {
		nextOverrides[layer] = nextEntry;
	}
	const next: ResponsiveValue<T> = { ...current };
	if (Object.keys(nextOverrides).length === 0) {
		delete (next as { overrides?: unknown }).overrides;
	} else {
		(next as { overrides?: Record<string, T | null> }).overrides =
			nextOverrides;
	}
	return collapseResponsive(next);
}

function collapseResponsive<T>(
	value: ResponsiveValue<T>,
): ResponsiveValue<T> | undefined {
	return value.base === undefined && value.overrides === undefined
		? undefined
		: value;
}

function reduceFamilyPatch(
	state: AuthoringStateV1,
	nodeIds: readonly string[],
	family: FamilyKey,
	layer: ResponsiveLayerRef,
	patch: EditorPatch<object>,
): AuthoringStateV1 {
	let next = state;
	for (const nodeId of nodeIds) {
		const record = getRecord(next, nodeId);
		const currentFamily = record[family] as ResponsiveValue<object> | undefined;
		const nextFamily = setResponsiveEntry(currentFamily, layer, (current) =>
			applyEditorPatch(current, patch),
		);
		if (nextFamily === currentFamily) {
			continue;
		}
		const nextRecord: NodeAuthoringStateV1 = { ...record };
		if (nextFamily === undefined) {
			delete (nextRecord as unknown as Record<string, unknown>)[family];
		} else {
			(nextRecord as unknown as Record<string, unknown>)[family] = nextFamily;
		}
		next = withRecord(next, nodeId, nextRecord);
	}
	return next;
}

/**
 * Reduce one validated atomic command (DD-0019 §24.2's
 * `reduceValidatedCommand`). Returns the input state unchanged (same
 * reference) for no-op writes.
 */
export function reduceValidatedCommand(
	state: AuthoringStateV1,
	command: AtomicEditorCommand,
): AuthoringStateV1 {
	switch (command.type) {
		case "node.layout.set":
			return reduceFamilyPatch(
				state,
				command.nodeIds,
				"layout",
				command.breakpointId,
				command.patch as EditorPatch<object>,
			);
		case "node.style.set":
			return reduceFamilyPatch(
				state,
				command.nodeIds,
				"style",
				command.breakpointId,
				command.patch as EditorPatch<object>,
			);
		case "node.typography.set":
			return reduceFamilyPatch(
				state,
				command.nodeIds,
				"typography",
				command.breakpointId,
				command.patch as EditorPatch<object>,
			);
		case "node.visibility.set": {
			let next = state;
			for (const nodeId of command.nodeIds) {
				const record = getRecord(next, nodeId);
				const nextHidden = setResponsiveEntry(
					record.hidden,
					command.breakpointId,
					() => (command.hidden === null ? undefined : command.hidden),
				);
				if (nextHidden === record.hidden) {
					continue;
				}
				const nextRecord: NodeAuthoringStateV1 = { ...record };
				if (nextHidden === undefined) {
					delete (nextRecord as { hidden?: unknown }).hidden;
				} else {
					(nextRecord as { hidden?: ResponsiveValue<boolean> }).hidden =
						nextHidden;
				}
				next = withRecord(next, nodeId, nextRecord);
			}
			return next;
		}
		case "node.lock.set": {
			let next = state;
			for (const nodeId of command.nodeIds) {
				const record = getRecord(next, nodeId);
				const current = record.locked === true;
				if (current === command.locked) {
					continue;
				}
				const nextRecord: NodeAuthoringStateV1 = { ...record };
				if (command.locked) {
					(nextRecord as { locked?: boolean }).locked = true;
				} else {
					delete (nextRecord as { locked?: boolean }).locked;
				}
				next = withRecord(next, nodeId, nextRecord);
			}
			return next;
		}
		case "node.rename": {
			const record = getRecord(state, command.nodeId);
			const nextName =
				command.name === null || command.name === "" ? undefined : command.name;
			if (record.name === nextName) {
				return state;
			}
			const nextRecord: NodeAuthoringStateV1 = { ...record };
			if (nextName === undefined) {
				delete (nextRecord as { name?: string }).name;
			} else {
				(nextRecord as { name?: string }).name = nextName;
			}
			return withRecord(state, command.nodeId, nextRecord);
		}
		case "breakpoints.set": {
			// Normalize order from widths (§12.2): widest first, matching
			// the desktop-first merge order.
			const sorted = [...command.breakpoints]
				.sort((a, b) => b.maxWidth - a.maxWidth)
				.map((breakpoint, index) =>
					breakpoint.order === index
						? breakpoint
						: { ...breakpoint, order: index },
				);
			const nextIds = new Set(sorted.map((breakpoint) => breakpoint.id));
			const removedIds = state.breakpoints
				.map((breakpoint) => breakpoint.id)
				.filter((id) => !nextIds.has(id));

			const sameList =
				sorted.length === state.breakpoints.length &&
				sorted.every((entry, index) => {
					const current = state.breakpoints[index];
					return (
						current !== undefined &&
						current.id === entry.id &&
						current.label === entry.label &&
						current.maxWidth === entry.maxWidth &&
						current.order === entry.order &&
						current.enabled === entry.enabled
					);
				});

			let next: AuthoringStateV1 = sameList
				? state
				: { ...state, breakpoints: sorted };
			if (removedIds.length === 0) {
				return next;
			}
			// Fold or drop overrides written at removed breakpoints.
			for (const [nodeId, record] of Object.entries(state.nodes)) {
				let nextRecord: NodeAuthoringStateV1 = record;
				for (const family of [
					"layout",
					"style",
					"typography",
					"hidden",
					"styleRefs",
				] as const) {
					const value = nextRecord[family] as
						| ResponsiveValue<unknown>
						| undefined;
					if (value?.overrides === undefined) {
						continue;
					}
					let familyValue = value;
					for (const removedId of removedIds) {
						const override = familyValue.overrides?.[removedId];
						if (override === undefined || override === null) {
							continue;
						}
						const mode = command.removedOverrides?.[removedId] ?? "discard";
						let base = familyValue.base;
						if (mode === "merge-to-base") {
							// Property-wise fold for spec objects; wholesale
							// replacement for scalars (`hidden`) — the removed
							// layer's value wins over base, matching what the
							// user saw at that breakpoint.
							base =
								typeof base === "object" &&
								base !== null &&
								typeof override === "object" &&
								!Array.isArray(override)
									? { ...base, ...override }
									: override;
						}
						const nextOverrides: Record<string, unknown> = {
							...familyValue.overrides,
						};
						delete nextOverrides[removedId];
						const rebuilt: Record<string, unknown> = {};
						if (base !== undefined) {
							rebuilt.base = base;
						}
						if (Object.keys(nextOverrides).length > 0) {
							rebuilt.overrides = nextOverrides;
						}
						familyValue = rebuilt as ResponsiveValue<unknown>;
					}
					if (familyValue !== value) {
						const collapsed = collapseResponsive(
							familyValue as ResponsiveValue<object>,
						);
						nextRecord = { ...nextRecord };
						if (collapsed === undefined) {
							delete (nextRecord as unknown as Record<string, unknown>)[family];
						} else {
							(nextRecord as unknown as Record<string, unknown>)[family] =
								collapsed;
						}
					}
				}
				if (nextRecord !== record) {
					next = withRecord(next, nodeId, nextRecord);
				}
			}
			return next;
		}
		case "node.responsiveOverride.set": {
			let next = state;
			for (const nodeId of command.nodeIds) {
				const record = getRecord(next, nodeId);
				const family = command.family;
				const currentFamily = record[family] as
					| ResponsiveValue<unknown>
					| undefined;
				if (currentFamily?.overrides?.[command.breakpointId] === undefined) {
					continue;
				}
				const nextFamily = setResponsiveEntry(
					currentFamily,
					command.breakpointId,
					() => undefined,
				);
				const nextRecord: NodeAuthoringStateV1 = { ...record };
				if (nextFamily === undefined) {
					delete (nextRecord as unknown as Record<string, unknown>)[family];
				} else {
					(nextRecord as unknown as Record<string, unknown>)[family] =
						nextFamily;
				}
				next = withRecord(next, nodeId, nextRecord);
			}
			return next;
		}
		case "styleDefinition.create":
			// Validation rejects duplicate ids, so this only ever adds.
			return {
				...state,
				styleDefinitions: {
					...state.styleDefinitions,
					[command.definition.id]: command.definition,
				},
			};
		case "styleDefinition.update": {
			const current = state.styleDefinitions[command.styleDefinitionId];
			if (current === undefined) {
				return state;
			}
			const next = applyStyleDefinitionPatch(current, command.patch);
			if (next === current) {
				return state;
			}
			// Referencing nodes hold ids, not copies, so the change
			// propagates by resolution alone (ED-STYLEDEF-002).
			return {
				...state,
				styleDefinitions: {
					...state.styleDefinitions,
					[command.styleDefinitionId]: next,
				},
			};
		}
		case "styleDefinition.attach":
			return attachStyleDefinition(
				state,
				command.nodeIds,
				command.styleDefinitionId,
				command.layer,
				command.position,
			);
		case "styleDefinition.detach":
			return detachStyleDefinition(
				state,
				command.nodeIds,
				command.styleDefinitionId,
				command.layer,
			);
		case "styleDefinition.delete":
			return deleteStyleDefinition(
				state,
				command.styleDefinitionId,
				command.disposition.kind === "materialize",
			);
		case "component.override.reset":
			return resetComponentOverride(
				state,
				command.instanceNodeId,
				command.target,
				command.layer,
			);
		case "component.override.resetAll":
			return resetAllComponentOverrides(state, command.instanceNodeIds);
		case "component.override.promote":
			return promoteComponentOverride(
				state,
				command.instanceNodeId,
				command.target,
				command.layer,
			);
		case "component.definition.update": {
			const definition = state.componentDefinitions[command.definitionId];
			if (definition === undefined) {
				return state;
			}
			const next = applyComponentDefinitionPatch(definition, command.patch);
			if (next === definition) {
				return state;
			}
			// The revision bump is what makes propagation observable to
			// instances holding `definitionRevision` (ED-COMP-002).
			return {
				...state,
				componentDefinitions: {
					...state.componentDefinitions,
					[command.definitionId]: {
						...next,
						revision: definition.revision + 1,
						updatedAt: new Date(command.timestamp).toISOString(),
					},
				},
			};
		}
		case "component.definition.delete":
			// Instance records are deliberately left alone: dropping them
			// would destroy the ED-COMP-007 retention guarantee.
			return deleteDefinition(state, command.definitionId);
		case "component.instance.propOverride.set":
			return setPropOverride(
				state,
				command.instanceNodeId,
				command.propId,
				command.value,
			);
		case "component.instance.nodeOverride.set":
			return setNodeOverride(
				state,
				command.instanceNodeId,
				command.definitionNodeId,
				command.patch,
			);
		case "token.create": {
			// Validation rejects duplicate ids, so this only ever adds.
			return {
				...state,
				tokens: { ...state.tokens, [command.token.id]: command.token },
			};
		}
		case "token.update": {
			const current = state.tokens[command.tokenId];
			if (current === undefined) {
				return state;
			}
			const next = applyTokenPatch(current, command.patch);
			if (next === current) {
				return state;
			}
			return {
				...state,
				tokens: { ...state.tokens, [command.tokenId]: next },
			};
		}
		case "token.delete":
			// Rewrites every reference per the disposition and drops the
			// token, in one reduction (ED-TOKEN-003).
			return applyTokenDeletion(state, command.tokenId, command.disposition, {
				tokenMode: command.tokenMode,
			});
		default:
			// Later-phase commands never reach reduction: validation
			// rejects them with EDITOR_CAPABILITY_UNSUPPORTED first.
			return state;
	}
}
