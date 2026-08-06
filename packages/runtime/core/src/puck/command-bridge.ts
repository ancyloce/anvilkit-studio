/**
 * @file P6-00 — the v2 command bridge (PLAN-0025 §11.2 command-port
 * row: "style/interaction/binding commands use one `setData`; stop
 * reading or writing sidecar revision").
 *
 * After the Phase 5 cutover every live document is v2, but the
 * overrides inspector still spoke the PLAN-0020 command vocabulary
 * into the sidecar engine — a style edit would have MINTED
 * `root.props.__anvilkit` into a v2 document. This module translates
 * that vocabulary onto the v2 carriers instead:
 *
 * - `node.layout.set` / `node.style.set` / `node.typography.set` /
 *   `node.visibility.set` → per-property `AppearancePatch` ops on the
 *   node's declared `root` target (`updateAppearanceInData`);
 * - `styleDefinition.attach` / `.detach` → `styleRefs` ops;
 * - `breakpoints.set`, `token.*`, `styleDefinition.create/update/
 *   delete` → one functional `designSystem` root-prop update
 *   (`updateDesignSystemInData`);
 * - `interaction.*` / `binding.*` → the owner node's §5.1 carrier
 *   arrays;
 * - everything else (`node.lock.set`, `node.rename`,
 *   `component.*`, …) → `{ kind: "unsupported" }`: the v2 model
 *   deliberately keeps only render-affecting state in documents, so
 *   these surface a typed capability error instead of silently
 *   minting a sidecar. Batches translate all-or-nothing.
 *
 * The bridge PLANS; the command port APPLIES the plan over the
 * current document and performs exactly ONE dispatch — preserving the
 * §10.5 one-intent/one-history-entry rule.
 */

import type {
	BindingV1,
	DesignSystemV1,
	EditorCommand,
	InteractionV1,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type { Config, Data } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { authorablePropertyForSpecKey } from "./component-metadata.js";
import {
	type AppearancePatch,
	updateAppearanceInData,
} from "./update-appearance.js";
import { updateDesignSystemInData } from "./update-design-system.js";

/** One appearance write the plan wants applied. */
export interface AppearanceOp {
	readonly nodeIds: readonly string[];
	readonly layer: ResponsiveLayerRef;
	readonly patch: AppearancePatch;
}

export type V2CommandPlan =
	| { readonly kind: "appearance"; readonly ops: readonly AppearanceOp[] }
	| {
			readonly kind: "design-system";
			readonly update: (
				current: DesignSystemV1 | undefined,
			) => DesignSystemV1 | undefined;
	  }
	| {
			readonly kind: "node-carriers";
			readonly carrier: "interactions" | "bindings";
			readonly ownerNodeId: string;
			readonly update: (
				current: readonly (InteractionV1 | BindingV1)[],
			) => readonly (InteractionV1 | BindingV1)[];
	  }
	| { readonly kind: "composite"; readonly plans: readonly V2CommandPlan[] }
	| {
			/** Per-node styleRefs edit; current refs read at APPLY time. */
			readonly kind: "style-refs";
			readonly nodeIds: readonly string[];
			readonly layer: ResponsiveLayerRef;
			readonly mutate: (
				current: readonly string[],
			) => readonly string[] | undefined;
	  }
	| {
			/** Clear one family's override entry at a breakpoint (D-1). */
			readonly kind: "clear-family-override";
			readonly nodeIds: readonly string[];
			readonly breakpointId: string;
			readonly family: string;
	  }
	| {
			/** Remove an interaction wherever its owner carries it. */
			readonly kind: "delete-interaction";
			readonly interactionId: string;
	  }
	| { readonly kind: "unsupported"; readonly reason: string };

const FAMILY_OF = {
	"node.layout.set": "layout",
	"node.style.set": "visual",
	"node.typography.set": "typography",
} as const;

/** Empty design system, for creates on documents that have none. */
const EMPTY_DESIGN_SYSTEM: DesignSystemV1 = {
	version: "1",
	breakpoints: [],
	tokens: {},
	tokenModes: {},
	defaultTokenMode: "default",
	styleDefinitions: {},
};

function familyPatchToOps(
	family: "layout" | "visual" | "typography",
	nodeIds: readonly string[],
	layer: ResponsiveLayerRef,
	patch: Readonly<Record<string, unknown>>,
): AppearanceOp[] | undefined {
	const ops: AppearanceOp[] = [];
	for (const [specKey, value] of Object.entries(patch)) {
		const property = authorablePropertyForSpecKey(family, specKey);
		if (property === undefined) return undefined;
		ops.push({
			nodeIds,
			layer,
			patch: {
				kind: "set-property",
				property,
				// EditorPatch uses `null` for removal; AppearancePatch uses
				// `undefined`.
				value: value === null ? undefined : value,
			},
		});
	}
	return ops;
}

/**
 * Translate one PLAN-0020 command for a v2 document. Returns
 * `unsupported` rather than guessing — the caller surfaces a typed
 * capability error and never writes.
 */
export function planV2Command(command: EditorCommand): V2CommandPlan {
	const c = command as EditorCommand & Record<string, unknown>;
	switch (c.type as string) {
		case "node.layout.set":
		case "node.style.set":
		case "node.typography.set": {
			const family = FAMILY_OF[c.type as keyof typeof FAMILY_OF];
			const ops = familyPatchToOps(
				family,
				c.nodeIds as readonly string[],
				c.breakpointId as ResponsiveLayerRef,
				c.patch as Readonly<Record<string, unknown>>,
			);
			if (ops === undefined) {
				return {
					kind: "unsupported",
					reason: `unknown ${family} property in patch`,
				};
			}
			return { kind: "appearance", ops };
		}
		case "node.visibility.set":
			return {
				kind: "appearance",
				ops: [
					{
						nodeIds: c.nodeIds as readonly string[],
						layer: c.breakpointId as ResponsiveLayerRef,
						patch: {
							kind: "set-hidden",
							value: (c.hidden as boolean | null) ?? undefined,
						},
					},
				],
			};
		case "breakpoints.set":
			return {
				kind: "design-system",
				update: (current) => ({
					...(current ?? EMPTY_DESIGN_SYSTEM),
					breakpoints: c.breakpoints as DesignSystemV1["breakpoints"],
				}),
			};
		case "token.create":
		case "token.update": {
			const token = c.token as DesignSystemV1["tokens"][string];
			return {
				kind: "design-system",
				update: (current) => {
					const base = current ?? EMPTY_DESIGN_SYSTEM;
					return {
						...base,
						tokens: { ...base.tokens, [token.id]: token },
					};
				},
			};
		}
		case "token.delete": {
			const tokenId = c.tokenId as string;
			return {
				kind: "design-system",
				update: (current) => {
					if (current === undefined) return current;
					const { [tokenId]: _removed, ...tokens } = current.tokens;
					return { ...current, tokens };
				},
			};
		}
		case "styleDefinition.create":
		case "styleDefinition.update": {
			const definition =
				c.definition as DesignSystemV1["styleDefinitions"][string];
			return {
				kind: "design-system",
				update: (current) => {
					const base = current ?? EMPTY_DESIGN_SYSTEM;
					return {
						...base,
						styleDefinitions: {
							...base.styleDefinitions,
							[definition.id]: definition,
						},
					};
				},
			};
		}
		case "styleDefinition.delete": {
			const definitionId = c.definitionId as string;
			return {
				kind: "design-system",
				update: (current) => {
					if (current === undefined) return current;
					const { [definitionId]: _removed, ...styleDefinitions } =
						current.styleDefinitions;
					return { ...current, styleDefinitions };
				},
			};
		}
		case "styleDefinition.attach": {
			const definitionId = c.styleDefinitionId as string;
			const position = c.position as number | undefined;
			return {
				kind: "style-refs",
				nodeIds: c.nodeIds as readonly string[],
				layer: c.layer as ResponsiveLayerRef,
				mutate: (current) => {
					if (current.includes(definitionId)) return current;
					const next = [...current];
					next.splice(position ?? next.length, 0, definitionId);
					return next;
				},
			};
		}
		case "styleDefinition.detach": {
			const definitionId = c.styleDefinitionId as string;
			return {
				kind: "style-refs",
				nodeIds: c.nodeIds as readonly string[],
				layer: c.layer as ResponsiveLayerRef,
				mutate: (current) => {
					const next = current.filter((id) => id !== definitionId);
					return next.length === 0 ? undefined : next;
				},
			};
		}
		case "node.responsiveOverride.set":
			return {
				kind: "clear-family-override",
				nodeIds: c.nodeIds as readonly string[],
				breakpointId: c.breakpointId as string,
				family: c.family as string,
			};
		case "interaction.delete":
			return {
				kind: "delete-interaction",
				interactionId: c.interactionId as string,
			};
		case "interaction.create":
		case "interaction.update": {
			const interaction = c.interaction as InteractionV1;
			return {
				kind: "node-carriers",
				carrier: "interactions",
				ownerNodeId: interaction.sourceNodeId,
				update: (current) => [
					...current.filter(
						(entry) => (entry as InteractionV1).id !== interaction.id,
					),
					interaction,
				],
			};
		}
		case "binding.update": {
			const binding = c.binding as BindingV1;
			return {
				kind: "node-carriers",
				carrier: "bindings",
				ownerNodeId: binding.nodeId,
				update: (current) => [
					...current.filter((entry) => (entry as BindingV1).id !== binding.id),
					binding,
				],
			};
		}
		case "batch": {
			const plans = (c.commands as readonly EditorCommand[]).map(planV2Command);
			const unsupported = plans.find(
				(plan): plan is Extract<V2CommandPlan, { kind: "unsupported" }> =>
					plan.kind === "unsupported",
			);
			// All-or-nothing: one untranslatable member fails the batch.
			if (unsupported !== undefined) return unsupported;
			return { kind: "composite", plans };
		}
		default:
			return {
				kind: "unsupported",
				reason: `"${String(c.type)}" has no v2 equivalent (v2 documents carry render-affecting state only)`,
			};
	}
}

/** Outcome of applying a plan over a document. */
export interface V2PlanApplication {
	readonly data: Data;
	readonly changed: boolean;
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly { readonly message: string }[];
}

/**
 * Apply a plan purely over `data`. The caller (command port) owns the
 * single dispatch when `changed` is true.
 */
export function applyV2Plan(
	plan: V2CommandPlan,
	data: Data,
	config: Config,
): V2PlanApplication {
	switch (plan.kind) {
		case "appearance": {
			let current = data;
			const changedNodeIds = new Set<string>();
			for (const op of plan.ops) {
				const result = updateAppearanceInData({
					data: current,
					config,
					nodeIds: op.nodeIds,
					targetId: "root",
					layer: op.layer,
					patch: op.patch,
				});
				if (result.status === "rejected") {
					return {
						data,
						changed: false,
						changedNodeIds: [],
						errors: result.errors,
					};
				}
				for (const id of result.changedNodeIds) changedNodeIds.add(id);
				current = result.data;
			}
			return {
				data: current,
				changed: current !== data,
				changedNodeIds: [...changedNodeIds],
				errors: [],
			};
		}
		case "design-system": {
			const result = updateDesignSystemInData({ data, update: plan.update });
			if (result.status === "rejected") {
				return {
					data,
					changed: false,
					changedNodeIds: [],
					errors: result.errors,
				};
			}
			return {
				data: result.data,
				changed: result.data !== data,
				changedNodeIds: [],
				errors: [],
			};
		}
		case "node-carriers": {
			let changed = false;
			const next = walkTree(data, config, (content) => {
				let touched = false;
				const mapped = content.map((item) => {
					const props = item.props as Record<string, unknown>;
					if (props.id !== plan.ownerNodeId) return item;
					const current = Array.isArray(props[plan.carrier])
						? (props[plan.carrier] as readonly (InteractionV1 | BindingV1)[])
						: [];
					const updated = plan.update(current);
					touched = true;
					changed = true;
					const nextProps: Record<string, unknown> = { ...props };
					if (updated.length === 0) {
						delete nextProps[plan.carrier];
					} else {
						nextProps[plan.carrier] = updated;
					}
					return { ...item, props: nextProps };
				});
				// Boundary cast: the mapped items ARE the same ComponentData
				// shapes with a widened props record.
				return touched
					? (mapped as unknown as Parameters<Parameters<typeof walkTree>[2]>[0])
					: undefined;
			});
			return {
				data: changed ? (next as Data) : data,
				changed,
				changedNodeIds: changed ? [plan.ownerNodeId] : [],
				errors: changed
					? []
					: [
							{
								message: `owner node "${plan.ownerNodeId}" not found for ${plan.carrier}`,
							},
						],
			};
		}
		case "composite": {
			let current = data;
			const changedNodeIds = new Set<string>();
			for (const member of plan.plans) {
				const applied = applyV2Plan(member, current, config);
				if (applied.errors.length > 0) {
					return {
						data,
						changed: false,
						changedNodeIds: [],
						errors: applied.errors,
					};
				}
				for (const id of applied.changedNodeIds) changedNodeIds.add(id);
				current = applied.data;
			}
			return {
				data: current,
				changed: current !== data,
				changedNodeIds: [...changedNodeIds],
				errors: [],
			};
		}
		case "style-refs": {
			let current = data;
			const changedNodeIds = new Set<string>();
			for (const nodeId of plan.nodeIds) {
				const appearance = readNodeAppearance(current, config, nodeId);
				const refs = readLayerStyleRefs(appearance, plan.layer);
				const next = plan.mutate(refs);
				if (next === refs) continue;
				const result = updateAppearanceInData({
					data: current,
					config,
					nodeIds: [nodeId],
					targetId: "root",
					layer: plan.layer,
					patch: { kind: "set-style-refs", value: next },
				});
				if (result.status === "rejected") {
					return {
						data,
						changed: false,
						changedNodeIds: [],
						errors: result.errors,
					};
				}
				for (const id of result.changedNodeIds) changedNodeIds.add(id);
				current = result.data;
			}
			return {
				data: current,
				changed: current !== data,
				changedNodeIds: [...changedNodeIds],
				errors: [],
			};
		}
		case "clear-family-override": {
			let current = data;
			const changedNodeIds = new Set<string>();
			// ResponsiveLayerRef is `"base" | BreakpointId` — a plain id.
			const layer: ResponsiveLayerRef = plan.breakpointId;
			for (const nodeId of plan.nodeIds) {
				const appearance = readNodeAppearance(current, config, nodeId);
				const ops = clearFamilyOps(appearance, plan.family, plan.breakpointId);
				for (const patch of ops) {
					const result = updateAppearanceInData({
						data: current,
						config,
						nodeIds: [nodeId],
						targetId: "root",
						layer,
						patch,
					});
					if (result.status === "rejected") {
						return {
							data,
							changed: false,
							changedNodeIds: [],
							errors: result.errors,
						};
					}
					for (const id of result.changedNodeIds) changedNodeIds.add(id);
					current = result.data;
				}
			}
			return {
				data: current,
				changed: current !== data,
				changedNodeIds: [...changedNodeIds],
				errors: [],
			};
		}
		case "delete-interaction": {
			let ownerId: string | null = null;
			walkTree(data, config, (content) => {
				for (const item of content) {
					const props = item.props as Record<string, unknown>;
					const list = props.interactions;
					if (
						Array.isArray(list) &&
						list.some(
							(entry) => (entry as InteractionV1).id === plan.interactionId,
						)
					) {
						ownerId = (props.id as string) ?? null;
					}
				}
			});
			if (ownerId === null) {
				return {
					data,
					changed: false,
					changedNodeIds: [],
					errors: [
						{ message: `interaction "${plan.interactionId}" not found` },
					],
				};
			}
			return applyV2Plan(
				{
					kind: "node-carriers",
					carrier: "interactions",
					ownerNodeId: ownerId,
					update: (current) =>
						current.filter(
							(entry) => (entry as InteractionV1).id !== plan.interactionId,
						),
				},
				data,
				config,
			);
		}
		case "unsupported":
			return {
				data,
				changed: false,
				changedNodeIds: [],
				errors: [{ message: plan.reason }],
			};
	}
}

/** Read one node's appearance carrier (or undefined). */
function readNodeAppearance(
	data: Data,
	config: Config,
	nodeId: string,
): Record<string, unknown> | undefined {
	let found: Record<string, unknown> | undefined;
	walkTree(data, config, (content) => {
		for (const item of content) {
			const props = item.props as Record<string, unknown>;
			if (props.id === nodeId && props.appearance !== undefined) {
				found = props.appearance as Record<string, unknown>;
			}
		}
	});
	return found;
}

/** The ordered styleRefs at one layer of the root target. */
function readLayerStyleRefs(
	appearance: Record<string, unknown> | undefined,
	layer: ResponsiveLayerRef,
): readonly string[] {
	const target = (
		appearance?.targets as
			| Record<string, { styleRefs?: MutableRefs }>
			| undefined
	)?.root;
	const refs = target?.styleRefs;
	if (refs === undefined) return [];
	if (layer === "base") return refs.base ?? [];
	const entry = refs.overrides?.[layer];
	return entry ?? [];
}

interface MutableRefs {
	base?: readonly string[];
	overrides?: Record<string, readonly string[] | null>;
}

/**
 * The AppearancePatch ops that clear one family's override entry at a
 * breakpoint: every property of that family currently overridden
 * there is removed (D-1 — resume inheritance).
 */
function clearFamilyOps(
	appearance: Record<string, unknown> | undefined,
	family: string,
	breakpointId: string,
): AppearancePatch[] {
	const target = (
		appearance?.targets as Record<string, Record<string, unknown>> | undefined
	)?.root;
	if (target === undefined) return [];
	if (family === "hidden") {
		const overrides = (target.hidden as MutableRefs | undefined)?.overrides;
		return overrides?.[breakpointId] === undefined
			? []
			: [{ kind: "set-hidden", value: undefined }];
	}
	if (family === "styleRefs") {
		const overrides = (target.styleRefs as MutableRefs | undefined)?.overrides;
		return overrides?.[breakpointId] === undefined
			? []
			: [{ kind: "set-style-refs", value: undefined }];
	}
	const styleFamily = family === "style" ? "visual" : family;
	const style = target.style as
		| { overrides?: Record<string, Record<string, Record<string, unknown>>> }
		| undefined;
	const layerValue = style?.overrides?.[breakpointId];
	const familySpec = layerValue?.[styleFamily];
	if (familySpec === undefined) return [];
	const ops: AppearancePatch[] = [];
	for (const specKey of Object.keys(familySpec)) {
		const property = authorablePropertyForSpecKey(
			styleFamily as "layout" | "visual" | "typography",
			specKey,
		);
		if (property === undefined) continue;
		ops.push({ kind: "set-property", property, value: undefined });
	}
	return ops;
}
