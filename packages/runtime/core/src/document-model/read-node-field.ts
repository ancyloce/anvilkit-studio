/**
 * @file PLAN-0026 §3.2 as amended, Appendix A finding A-2 (`p2-003`) —
 * `readNodeField`, the one field read every inspector surface uses.
 * Pure and React-free.
 *
 * **The address is target-addressed, and that is the whole point.**
 * The plan's original signature was
 * `readNodeField(model, nodeId, family, property, layer)`. That shape
 * cannot express "the `cardTitle` target of this node" — it can only
 * ever reach a node's root target. Shipping it would have re-created
 * report 0021's read/write address mismatch one layer up, and it would
 * not have surfaced until component mode was built in P5.
 *
 * Three layers therefore share ONE address:
 *
 * | layer | address |
 * |---|---|
 * | storage | `props.appearance.targets[targetId]` |
 * | CSS | `[data-ak-style-node="<id>"][data-ak-style-target="<t>"]` |
 * | read/write | `(nodeIds, targetId, property, layer)` |
 *
 * That agreement is enforced **by construction**, not by discipline:
 * the address type below is derived from `UpdateAppearanceInput`, and
 * the assertions at the bottom of this file fail to compile if the two
 * ever drift apart.
 *
 * **Reuse, not reimplementation.** The mixed/unset/unsupported and
 * provenance math, and the capability filtering, are
 * `puck/read-appearance.ts`'s — consumed here, not copied. That module
 * is already React-free and already target-addressed
 * (`TargetReadInput`), which is exactly why `p2-002` left it in place
 * rather than relocating the sidecar-bound `inspector/field-state.ts`
 * into this directory.
 */

import type {
	AuthorableStyleProperty,
	BreakpointDefinition,
} from "@anvilkit/contracts/editor";
import { isTokenRef } from "../editor/tokens/walk.js";
import {
	AUTHORABLE_PROPERTY_LOCATIONS,
	type AuthorablePropertyLocation,
} from "../puck/component-metadata.js";
import {
	type AppearanceNode,
	type AppearanceReadState,
	readAppearanceProperty,
	readTargetHidden,
	readTargetStyleRefs,
	type TargetReadInput,
} from "../puck/read-appearance.js";
import { ROOT_STYLE_TARGET_ID } from "../puck/targets.js";
import type {
	AppearancePatch,
	UpdateAppearanceInput,
} from "../puck/update-appearance.js";
import type { DocumentModel } from "./types.js";

/**
 * The addressing members of the write path — everything in
 * `UpdateAppearanceInput` except its payload (`patch`) and its inputs
 * (`data`, `config`, which the model already holds).
 */
type WriteAddress = Pick<
	UpdateAppearanceInput,
	"nodeIds" | "targetId" | "layer"
>;

type SetPropertyPatch = Extract<AppearancePatch, { kind: "set-property" }>;

/**
 * Which field of a target to read. Mirrors the three `AppearancePatch`
 * kinds one-for-one, so every writable field is readable and no
 * readable field is unwritable.
 */
export type NodeFieldSelector =
	| {
			readonly field: "property";
			readonly property: SetPropertyPatch["property"];
	  }
	| { readonly field: "hidden" }
	| { readonly field: "styleRefs" };

/**
 * The read address.
 *
 * `nodeIds` is plural from the start: multi-select in component mode
 * means *the same `targetId` across several nodes*, which is exactly
 * what `updateAppearanceInData` already accepts. A singular signature
 * would force `p3-007` to widen it later.
 *
 * `targetId` is optional and defaults to the node's root target, so a
 * page-mode read is the same call with one field omitted rather than a
 * separate function.
 */
export type NodeFieldAddress = Omit<WriteAddress, "targetId"> & {
	readonly targetId?: WriteAddress["targetId"];
	/** Provenance viewport; defaults from `layer` (base = widest). */
	readonly viewportWidth?: number;
} & NodeFieldSelector;

/** One field's state plus the provenance the inspector renders. */
export interface NodeFieldRead<T> {
	/** value | mixed | unset | unsupported, with `resolved` provenance. */
	readonly state: AppearanceReadState<T>;
	/** The target actually read (the root target when omitted). */
	readonly targetId: string;
	/**
	 * The nodes that contributed. Nodes not declaring `targetId`, or not
	 * granting the property, are **absent** — never present-with-an-error.
	 */
	readonly nodeIds: readonly string[];
	/** The property's family, for property reads. */
	readonly family: AuthorablePropertyLocation["family"] | undefined;
	/**
	 * Whether a reset is available: something is written at the active
	 * layer, so clearing it would change the document.
	 */
	readonly canReset: boolean;
	/** Whether the effective value is a token reference. */
	readonly tokenDerived: boolean;
}

const EMPTY_IDS: readonly string[] = Object.freeze([]);

/**
 * The nodes that may participate in this read.
 *
 * Membership is computed from the model's already-resolved
 * `styleTargets` (cached per component type by `p2-001`), and the
 * filtered list is then handed to `read-appearance.ts`, whose own
 * `capableTargets` re-applies the same predicate. Pre-filtering is what
 * makes the two structurally unable to disagree about exclusion: the
 * ids the state was computed over are the ids reported here.
 */
function capableNodeIds(
	model: DocumentModel,
	address: NodeFieldAddress,
	targetId: string,
): readonly string[] {
	const kept: string[] = [];
	for (const nodeId of address.nodeIds) {
		const node = model.nodes.get(nodeId);
		if (node === undefined) continue;
		const target = node.styleTargets.find((entry) => entry.id === targetId);
		if (target === undefined) continue;
		if (
			address.field === "property" &&
			!target.properties.includes(address.property)
		) {
			continue;
		}
		kept.push(nodeId);
	}
	return kept.length === 0 ? EMPTY_IDS : kept;
}

/** Adapt the model to the shape `read-appearance.ts` consumes. */
function toTargetReadInput(
	model: DocumentModel,
	address: NodeFieldAddress,
	targetId: string,
	nodeIds: readonly string[],
	breakpoints: readonly BreakpointDefinition[],
): TargetReadInput {
	const nodes = new Map<string, AppearanceNode>();
	for (const nodeId of nodeIds) {
		const node = model.nodes.get(nodeId);
		if (node === undefined) continue;
		nodes.set(nodeId, {
			nodeId,
			type: node.type,
			appearance: node.appearance,
		});
	}
	return {
		nodes,
		config: model.config,
		breakpoints,
		nodeIds,
		targetId,
		layer: address.layer,
		...(address.viewportWidth !== undefined
			? { viewportWidth: address.viewportWidth }
			: {}),
	};
}

/**
 * Read one field of one style target across a selection.
 *
 * Nodes that do not declare the target — or do not grant the property —
 * are excluded from the read set rather than reported as an error. This
 * deliberately mirrors the write path's *pre-dispatch* exclusion rather
 * than the post-hoc `EDITOR_CAPABILITY_UNSUPPORTED` it raises
 * (`puck/update-appearance.ts`): the inspector must never render a
 * control whose commit would be rejected. An empty capable set reads as
 * `unsupported`.
 */
export function readNodeField<T = unknown>(
	model: DocumentModel,
	address: NodeFieldAddress,
): NodeFieldRead<T> {
	const targetId = address.targetId ?? ROOT_STYLE_TARGET_ID;
	const nodeIds = capableNodeIds(model, address, targetId);
	const breakpoints = model.designSystem?.breakpoints ?? [];
	const input = toTargetReadInput(
		model,
		address,
		targetId,
		nodeIds,
		breakpoints,
	);

	let state: AppearanceReadState<unknown>;
	let family: AuthorablePropertyLocation["family"] | undefined;
	if (address.field === "property") {
		family = AUTHORABLE_PROPERTY_LOCATIONS[address.property].family;
		state = readAppearanceProperty({ ...input, property: address.property });
	} else if (address.field === "hidden") {
		state = readTargetHidden(input);
	} else {
		state = readTargetStyleRefs(input);
	}

	return {
		state: state as AppearanceReadState<T>,
		targetId,
		nodeIds,
		family,
		canReset: state.kind === "value" && state.writtenAtLayer,
		tokenDerived: state.kind === "value" && isTokenRef(state.value),
	};
}

/* -------------------------------------------------------------------------
 * Address lockstep — the mechanism that makes "by construction" literal.
 *
 * These are type-level only and erase at build time. They exist so that
 * widening the write address without widening the read address is a
 * COMPILE ERROR rather than a defect discovered in P5.
 * ---------------------------------------------------------------------- */

type Assert<T extends true> = T;

/** Invariant type equality (distinguishes `any`/`unknown`/unions). */
type Eq<A, B> =
	(<X>() => X extends A ? 1 : 2) extends <X>() => X extends B ? 1 : 2
		? true
		: false;

/**
 * Every addressing member the WRITE path declares must exist on the
 * read address. Add `variant` to `UpdateAppearanceInput` and this line
 * stops compiling until the read address gains it too.
 */
type _EveryWriteAddressMemberIsReadable = Assert<
	Exclude<
		keyof UpdateAppearanceInput,
		"data" | "config" | "patch"
	> extends keyof NodeFieldAddress
		? true
		: false
>;

/** The shared members must have the SAME types, not merely exist. */
type _NodeIdsInLockstep = Assert<
	Eq<NodeFieldAddress["nodeIds"], UpdateAppearanceInput["nodeIds"]>
>;
type _LayerInLockstep = Assert<
	Eq<NodeFieldAddress["layer"], UpdateAppearanceInput["layer"]>
>;
type _TargetIdInLockstep = Assert<
	Eq<
		NonNullable<NodeFieldAddress["targetId"]>,
		UpdateAppearanceInput["targetId"]
	>
>;

/**
 * The readable property vocabulary must equal the writable one — so a
 * property that can be written can always be read back.
 */
type _PropertyVocabularyInLockstep = Assert<
	Eq<SetPropertyPatch["property"], AuthorableStyleProperty>
>;
