/**
 * @file `updateAppearanceInData` + the one-dispatch commit helper
 * (PLAN-0025 §8.3, P2-04). Pure, React-free.
 *
 * The §8.3 write rules, implemented here and nowhere else:
 * - one user intent → ONE functional-updater `setData` dispatch with
 *   `recordHistory: true`; a multi-selection updates in that same
 *   functional update;
 * - a no-op does not dispatch and creates no history entry;
 * - the update function traverses with official `walkTree` and never
 *   mutates its input;
 * - the metadata allowlist (shared reader, §6.1) is validated BEFORE
 *   writing; unauthorized properties come back as structured
 *   `EditorError`s;
 * - written appearance is canonicalized (content-free → the
 *   `appearance` prop is REMOVED, §5.1) and schema-validated;
 * - `replaceRoot` is never used for node props (P2-00 decision).
 *
 * Write protocol: `value: undefined` removes the entry at the active
 * layer; nulls are never stored by this writer (write-time null means
 * removal — the specs' D-8 rule). An existing appearance value that
 * fails schema validation is refused, not overwritten: destroying
 * data a human may still want is worse than rejecting the edit.
 */

import type {
	AnvilAppearance,
	AuthorableStyleProperty,
	AuthorStyle,
	EditorError,
	ResponsiveLayerRef,
	ResponsiveValue,
	TargetAppearance,
} from "@anvilkit/contracts/editor";
import {
	canonicalizeAppearance,
	safeParseAppearance,
} from "@anvilkit/schema/editor";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { walkTree } from "@puckeditor/core";
import { makeEditorError } from "../editor/diagnostics.js";
import { deepEqualJson } from "../editor/patch.js";
import {
	AUTHORABLE_PROPERTY_LOCATIONS,
	resolveStyleTargets,
} from "./component-metadata.js";
import { documentBreakpoints } from "./read-appearance.js";

/** One appearance mutation applied at the active layer. */
export type AppearancePatch =
	| {
			readonly kind: "set-property";
			readonly property: AuthorableStyleProperty;
			/** The authored spec value; `undefined` removes the entry. */
			readonly value: unknown;
	  }
	| {
			readonly kind: "set-hidden";
			/** `undefined` removes the entry at the layer. */
			readonly value: boolean | undefined;
	  }
	| {
			readonly kind: "set-style-refs";
			/** `undefined` removes the entry at the layer. */
			readonly value: readonly string[] | undefined;
	  };

/** Input to {@link updateAppearanceInData}. */
export interface UpdateAppearanceInput {
	readonly data: Data;
	readonly config: Config;
	/** The selection; every id is validated before anything writes. */
	readonly nodeIds: readonly string[];
	readonly targetId: string;
	/** The active write layer (`"base"` or an enabled breakpoint id). */
	readonly layer: ResponsiveLayerRef;
	readonly patch: AppearancePatch;
}

/** Outcome of the pure update. */
export interface UpdateAppearanceResult {
	/** The next document; the INPUT reference when nothing changed. */
	readonly data: Data;
	readonly status: "updated" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

type MutableResponsive<T> = {
	base?: T;
	overrides?: Record<string, T | null>;
};

/** Set/remove one layered entry, pruning empty carriers. */
function withLayerValue<T>(
	value: ResponsiveValue<T> | undefined,
	layer: ResponsiveLayerRef,
	next: T | undefined,
): ResponsiveValue<T> | undefined {
	const draft: MutableResponsive<T> = {
		...(value?.base !== undefined ? { base: value.base } : {}),
		...(value?.overrides !== undefined
			? { overrides: { ...value.overrides } }
			: {}),
	};
	if (layer === "base") {
		if (next === undefined) delete draft.base;
		else draft.base = next;
	} else if (next === undefined) {
		if (draft.overrides !== undefined) {
			delete draft.overrides[layer];
			if (Object.keys(draft.overrides).length === 0) delete draft.overrides;
		}
	} else {
		draft.overrides = { ...draft.overrides, [layer]: next };
	}
	if (draft.base === undefined && draft.overrides === undefined) {
		return undefined;
	}
	return draft as ResponsiveValue<T>;
}

/** Apply a `set-property` patch inside the layered style carrier. */
function withStyleProperty(
	style: ResponsiveValue<AuthorStyle> | undefined,
	layer: ResponsiveLayerRef,
	property: AuthorableStyleProperty,
	value: unknown,
): ResponsiveValue<AuthorStyle> | undefined {
	const location = AUTHORABLE_PROPERTY_LOCATIONS[property];
	const currentLayer =
		layer === "base" ? style?.base : (style?.overrides?.[layer] ?? undefined);
	const currentFamily = (
		currentLayer as
			| Record<string, Record<string, unknown> | undefined>
			| undefined
	)?.[location.family];

	let nextFamily: Record<string, unknown> | undefined;
	if (value === undefined) {
		if (currentFamily === undefined) return style;
		const { [location.specKey]: _removed, ...rest } = currentFamily;
		nextFamily = Object.keys(rest).length > 0 ? rest : undefined;
	} else {
		nextFamily = { ...currentFamily, [location.specKey]: value };
	}

	const draftLayer: Record<string, unknown> = {
		...(currentLayer as Record<string, unknown> | undefined),
	};
	if (nextFamily === undefined) delete draftLayer[location.family];
	else draftLayer[location.family] = nextFamily;
	const nextLayer =
		Object.keys(draftLayer).length > 0
			? (draftLayer as AuthorStyle)
			: undefined;
	return withLayerValue(style, layer, nextLayer);
}

/** Apply the patch to one target's appearance carrier. */
function withPatchedTarget(
	target: TargetAppearance | undefined,
	layer: ResponsiveLayerRef,
	patch: AppearancePatch,
): TargetAppearance | undefined {
	const draft: {
		styleRefs?: ResponsiveValue<readonly string[]>;
		style?: ResponsiveValue<AuthorStyle>;
		hidden?: ResponsiveValue<boolean>;
	} = { ...target };
	if (patch.kind === "set-property") {
		const next = withStyleProperty(
			target?.style,
			layer,
			patch.property,
			patch.value,
		);
		if (next === undefined) delete draft.style;
		else draft.style = next;
	} else if (patch.kind === "set-hidden") {
		const next = withLayerValue(target?.hidden, layer, patch.value);
		if (next === undefined) delete draft.hidden;
		else draft.hidden = next;
	} else {
		const next = withLayerValue(target?.styleRefs, layer, patch.value);
		if (next === undefined) delete draft.styleRefs;
		else draft.styleRefs = next;
	}
	return Object.keys(draft).length > 0 ? draft : undefined;
}

/** Apply the patch to one node's (validated) appearance value. */
function withPatchedAppearance(
	appearance: AnvilAppearance | undefined,
	targetId: string,
	layer: ResponsiveLayerRef,
	patch: AppearancePatch,
): AnvilAppearance | undefined {
	// Keys we do not understand are PRESERVED, never dropped. The
	// schemas are `looseObject` precisely so a document written before
	// the canonical rename (which may still carry a stale `version`)
	// keeps working until `p7-002` strips it from the store — and
	// PLAN-0026 §5 defines that tolerance as *generic unknown-key
	// preservation*. Rebuilding the value from `targets` alone would
	// silently destroy them on the first edit.
	const { targets: _known, ...unknown } = (appearance ?? {}) as Record<
		string,
		unknown
	>;
	const targets = { ...appearance?.targets };
	const nextTarget = withPatchedTarget(targets[targetId], layer, patch);
	if (nextTarget === undefined) delete targets[targetId];
	else targets[targetId] = nextTarget;
	const draft: AnvilAppearance = {
		...(Object.keys(targets).length > 0 ? { targets } : {}),
	};
	const canonical = canonicalizeAppearance(draft);
	const hasUnknown = Object.keys(unknown).length > 0;
	if (canonical === undefined) {
		// `canonicalizeAppearance` collapses a target-free appearance to
		// `undefined` ("empty shells are never stored"). That rule must
		// not become a data-loss path for keys that arrived with the
		// document.
		return hasUnknown ? (unknown as AnvilAppearance) : undefined;
	}
	return hasUnknown
		? ({ ...unknown, ...canonical } as AnvilAppearance)
		: canonical;
}

/**
 * The §8.3 pure update: validate the whole intent, then produce the
 * next document in one pass. `status: "rejected"` writes nothing even
 * when only part of the selection failed — a partial multi-selection
 * write would break "one atomic multi-selection update" (§14.1).
 */
export function updateAppearanceInData(
	input: UpdateAppearanceInput,
): UpdateAppearanceResult {
	const errors: EditorError[] = [];
	const reject = (): UpdateAppearanceResult => ({
		data: input.data,
		status: "rejected",
		changedNodeIds: [],
		errors,
	});

	if (input.nodeIds.length === 0) {
		errors.push(
			makeEditorError("EDITOR_NODE_NOT_FOUND", "the selection is empty"),
		);
		return reject();
	}
	if (
		input.layer !== "base" &&
		!documentBreakpoints(input.data).some((entry) => entry.id === input.layer)
	) {
		errors.push(
			makeEditorError(
				"EDITOR_BREAKPOINT_INVALID",
				`breakpoint "${input.layer}" is not defined in the document design system`,
				{ details: { layer: input.layer } },
			),
		);
		return reject();
	}

	// Collect the current tree once (official traversal, slots included).
	const collected = new Map<
		string,
		{ readonly type: string; readonly appearance: unknown }
	>();
	walkTree(input.data, input.config, (content) => {
		for (const item of content) {
			const props = item.props as { id?: unknown; appearance?: unknown };
			if (typeof props.id === "string") {
				collected.set(props.id, {
					type: item.type as string,
					appearance: props.appearance,
				});
			}
		}
		return content;
	});

	// Validate the ENTIRE intent before writing anything.
	const nextById = new Map<string, AnvilAppearance | undefined>();
	for (const nodeId of input.nodeIds) {
		const node = collected.get(nodeId);
		if (node === undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_NODE_NOT_FOUND",
					`node "${nodeId}" does not exist in the document`,
					{ details: { nodeId } },
				),
			);
			continue;
		}
		const target = resolveStyleTargets(input.config, node.type).find(
			(entry) => entry.id === input.targetId,
		);
		if (target === undefined) {
			errors.push(
				makeEditorError(
					"EDITOR_CAPABILITY_UNSUPPORTED",
					`component "${node.type}" does not declare style target "${input.targetId}"`,
					{ details: { nodeId, targetId: input.targetId } },
				),
			);
			continue;
		}
		if (
			input.patch.kind === "set-property" &&
			!target.properties.includes(input.patch.property)
		) {
			errors.push(
				makeEditorError(
					"EDITOR_CAPABILITY_UNSUPPORTED",
					`property "${input.patch.property}" is not in the allowlist of target "${input.targetId}" on "${node.type}"`,
					{
						details: {
							nodeId,
							targetId: input.targetId,
							property: input.patch.property,
						},
					},
				),
			);
			continue;
		}

		let current: AnvilAppearance | undefined;
		if (node.appearance !== undefined) {
			const parsed = safeParseAppearance(node.appearance);
			if (!parsed.success) {
				errors.push(
					makeEditorError(
						"EDITOR_CONTRACT_UNSUPPORTED_VERSION",
						`node "${nodeId}" carries an appearance value that fails validation; refusing to overwrite it`,
						{ details: { nodeId } },
					),
				);
				continue;
			}
			current = parsed.data;
		}

		const next = withPatchedAppearance(
			current,
			input.targetId,
			input.layer,
			input.patch,
		);
		if (next !== undefined) {
			const validated = safeParseAppearance(next);
			if (!validated.success) {
				errors.push(
					makeEditorError(
						"EDITOR_INVALID_CSS_VALUE",
						`the patched value for node "${nodeId}" fails appearance validation`,
						{ details: { nodeId, issues: validated.error.issues.length } },
					),
				);
				continue;
			}
		}
		nextById.set(nodeId, next);
	}
	if (errors.length > 0) {
		return reject();
	}

	const changedNodeIds = [...nextById.entries()]
		.filter(
			([nodeId, next]) =>
				!deepEqualJson(collected.get(nodeId)?.appearance, next),
		)
		.map(([nodeId]) => nodeId)
		.sort();
	if (changedNodeIds.length === 0) {
		return {
			data: input.data,
			status: "noop",
			changedNodeIds: [],
			errors: [],
		};
	}

	const changed = new Set(changedNodeIds);
	const nextData = walkTree(input.data, input.config, (content) =>
		content.map((item) => {
			const props = item.props as { id?: unknown };
			const nodeId = typeof props.id === "string" ? props.id : undefined;
			if (nodeId === undefined || !changed.has(nodeId)) return item;
			const next = nextById.get(nodeId);
			const { appearance: _dropped, ...rest } = item.props as Record<
				string,
				unknown
			>;
			return {
				...item,
				props: (next === undefined
					? rest
					: { ...rest, appearance: next }) as typeof item.props,
			};
		}),
	);
	return {
		data: nextData,
		status: "updated",
		changedNodeIds,
		errors: [],
	};
}

/** Dependencies of {@link commitAppearanceUpdate} (thunk = testable). */
export interface AppearanceCommitDeps {
	readonly getPuckApi: () => PuckApi;
}

/** Outcome of a commit attempt. */
export interface AppearanceCommitResult {
	readonly status: "committed" | "noop" | "rejected";
	readonly changedNodeIds: readonly string[];
	readonly errors: readonly EditorError[];
}

/**
 * Commit one appearance intent through ONE history-recording
 * functional-updater `setData` dispatch (§8.3). Validates against the
 * live document first: a no-op or rejection dispatches NOTHING, so it
 * can never create an empty history entry. If the document moved
 * between validation and the reducer running, the functional updater
 * re-derives the same intent against the newer document.
 */
export function commitAppearanceUpdate(
	deps: AppearanceCommitDeps,
	input: Omit<UpdateAppearanceInput, "data">,
): AppearanceCommitResult {
	const api = deps.getPuckApi();
	const current = api.appState.data as Data;
	const result = updateAppearanceInData({ ...input, data: current });
	if (result.status !== "updated") {
		return {
			status: result.status === "noop" ? "noop" : "rejected",
			changedNodeIds: [],
			errors: result.errors,
		};
	}
	api.dispatch({
		type: "setData",
		recordHistory: true,
		data: (previous: Data) =>
			previous === current
				? result.data
				: updateAppearanceInData({ ...input, data: previous }).data,
	} as Parameters<PuckApi["dispatch"]>[0]);
	return {
		status: "committed",
		changedNodeIds: result.changedNodeIds,
		errors: [],
	};
}
