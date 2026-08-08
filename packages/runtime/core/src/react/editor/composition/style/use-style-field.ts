"use client";

/**
 * @file `useStyleField` — the Style panel's read/commit binding
 * (PLAN-0028 `p4-001`).
 *
 * One hook, one address, both directions:
 *
 * - **read** through `useNodeField` (`document-model/read-node-field.ts`),
 *   which projects `appState.data` — the same `Data` the compiler,
 *   `<Render>` and the exporters consume;
 * - **write** through `useAppearanceCommit`, one intent → one
 *   history-recording `setData` dispatch.
 *
 * The address is `NodeFieldAddress`, which is derived **by
 * construction** from `UpdateAppearanceInput`: the read and the write
 * cannot drift apart without a compile error in
 * `read-node-field.ts`'s lockstep assertions. Report 0021's defect —
 * writes landing in the declared carrier while reads projected from a
 * sidecar — is unrepresentable here, because there is one address and
 * one storage location.
 *
 * **`undefined` is the reset protocol**, not a separate command:
 * `AppearancePatch`'s `value: undefined` removes the entry at the
 * active layer (`puck/update-appearance.ts`). `reset()` is therefore
 * literally `commit(undefined)` and no second write path exists to
 * disagree with the first.
 */

import type { ResponsiveLayerRef } from "@anvilkit/contracts/editor";
import { useCallback } from "react";
import type {
	NodeFieldRead,
	NodeFieldSelector,
} from "../../../../document-model/index.js";
import type { AppearancePatch } from "../../../../puck/update-appearance.js";
import { useReactivePuck } from "../../../utils/use-reactive-puck.js";
import { useNodeField } from "../../use-document-model.js";
import { useAppearanceCommit } from "../use-appearance-commit.js";
import type { StyleFieldHandle } from "./controls/handle.js";
import { useStyleErrors } from "./style-errors.js";

/** Where a style field reads and writes. */
export interface StyleFieldAddress {
	/** The whole selection; a multi-select write is one atomic update. */
	readonly nodeIds: readonly string[];
	readonly targetId: string;
	/** `"base"` or an enabled breakpoint id. */
	readonly layer: ResponsiveLayerRef;
}

/** Build the patch for one selector + value (`undefined` = remove). */
function toPatch(selector: NodeFieldSelector, value: unknown): AppearancePatch {
	if (selector.field === "property") {
		return { kind: "set-property", property: selector.property, value };
	}
	if (selector.field === "hidden") {
		return { kind: "set-hidden", value: value as boolean | undefined };
	}
	return {
		kind: "set-style-refs",
		value: value as readonly string[] | undefined,
	};
}

/** A field handle plus the full read, for callers that need both. */
export interface StyleField<T> extends StyleFieldHandle<T> {
	/** The underlying read: provenance, capable nodes, token origin. */
	readonly read: NodeFieldRead<T>;
}

/**
 * Bind one field of one style target across the selection.
 *
 * Must render inside `<Puck>` — `useNodeField` and `useAppearanceCommit`
 * are both Puck-provider bound. Call it once per rendered control: the
 * document projection underneath is memoized per `(data, config)`, so N
 * controls share one traversal rather than paying N.
 */
export function useStyleField<T>(
	address: StyleFieldAddress,
	selector: NodeFieldSelector,
): StyleField<T> {
	const config = useReactivePuck((state) => state.config);
	const commitAppearance = useAppearanceCommit();
	const { report } = useStyleErrors();
	const read = useNodeField<T>({ ...address, ...selector });

	const { nodeIds, targetId, layer } = address;
	const write = useCallback(
		(value: unknown): void => {
			const result = commitAppearance({
				config,
				nodeIds,
				targetId,
				layer,
				patch: toPatch(selector, value),
			});
			// A rejection writes nothing; saying so is the difference
			// between "not supported" and "silently dropped".
			report(result.errors);
		},
		[commitAppearance, config, nodeIds, targetId, layer, selector, report],
	);

	return {
		read,
		state: read.state,
		commit: write,
		reset: () => write(undefined),
		layer,
	};
}
