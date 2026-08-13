"use client";

/**
 * @file Shared `ShortcutContext` builder (PLAN-0020 CORE-P1A-017 /
 * CORE-P1B-013). The §18 command implementations are defined ONCE
 * here and reused verbatim by both consumers: the keymap binder
 * (`EditorShortcuts`) and the canvas multi-select toolbar
 * (`SelectionToolbar`) — same duplicate/delete/wrap/unwrap semantics,
 * same one-dispatch path, same selection follow-ups.
 *
 * ### `p3-009`: off the command port, onto the commit helpers
 *
 * Duplicate and delete used to run through `port.commitNative`, which
 * folded a tree change and a sidecar reconciliation into one dispatch.
 * They now call `commitDuplicateNodes` / `commitDeleteNodes`
 * (`puck/update-tree.ts`, `p3-005`), which are the *same* one-intent /
 * one-`recordHistory` contract without the sidecar half — carriers
 * live in the nodes' own props, so a duplicated subtree carries its
 * own appearance and a deleted subtree takes its own with it. There is
 * nothing left to reconcile, which is why `remapForDuplicate` died
 * with the engine rather than being ported.
 *
 * Wrap and unwrap have no commit helper — they are structural
 * transforms with no `Data`-level equivalent in `PuckApi` — so they
 * keep `native-tree.ts`'s pure transforms and perform the identical
 * single `setData` dispatch here, through the shared {@link commitTree}
 * below. One intent, one history entry, no second write path.
 */

import type { Config, PuckApi, Data as PuckData } from "@puckeditor/core";
import { dispatchOneIntent } from "../../../puck/commit-protocol.js";
import { readEditorMetadata } from "../../../puck/component-metadata.js";
import {
	commitDeleteNodes,
	commitDuplicateNodes,
} from "../../../puck/update-tree.js";
import type { StudioEditorBridge } from "../bridge.js";
import type { ShortcutContext } from "./registry.js";

/** The plugin-context slice the command handlers need. */
export interface ShortcutHostContext {
	getPuckApi: () => {
		config: { components?: Record<string, unknown> };
		getParentById: (id: string) => { props?: unknown } | null | undefined;
	};
}

/** Pick the wrap container: first component declaring a `slotMap`. */
export function pickWrapContainer(
	components: Readonly<Record<string, unknown>> | undefined,
): { readonly type: string; readonly slotName: string } | null {
	for (const [type, component] of Object.entries(components ?? {})) {
		const metadata = readEditorMetadata(component);
		const slots = metadata?.slots ?? {};
		const slotName = Object.keys(slots).find(
			(name) => slots[name]?.layoutContainer === true,
		);
		if (slotName !== undefined) {
			return { type, slotName };
		}
	}
	return null;
}

function tryConfigComponents(
	ctx: ShortcutHostContext,
): Record<string, unknown> | undefined {
	try {
		return ctx.getPuckApi().config.components;
	} catch {
		return undefined;
	}
}

/**
 * Apply one pure tree transform as exactly ONE history entry.
 *
 * The collab writer gate is consulted first, so a gated session's
 * wrap/unwrap is refused by the write and not merely by a disabled
 * affordance — the same rule `puck/writer-gate.ts` enforces for every
 * commit helper. `null` from `transform` means "nothing to do": no
 * dispatch, no history entry.
 */
function commitTree(
	bridge: StudioEditorBridge,
	transform: (data: PuckData, config: Config) => PuckData | null,
): void {
	if (bridge.getWriterGateError() !== null) {
		return;
	}
	const api: PuckApi | null = bridge.getPuckApi();
	if (api === null) {
		return;
	}
	// The tree transforms resolve slots from the config, so it is threaded
	// from the live api rather than asked of the caller — it cannot drift
	// from the document being transformed (review 0036 H-3).
	const config = api.config as Config;
	// The shared commit protocol (review 0036 M-2): nothing is dispatched
	// unless a real change is going to land, so a wrap/unwrap that turns
	// out to be a no-op leaves no empty undo entry behind. `null` from
	// `transform` and a `walkTree` throw both read as "nothing to do" —
	// a shortcut must not throw out of a key handler.
	dispatchOneIntent(api, (data) => {
		let next: PuckData | null;
		try {
			next = transform(data, config);
		} catch {
			return { data, status: "rejected" as const, errors: [] };
		}
		return next === null || next === data
			? { data, status: "noop" as const, errors: [] }
			: { data: next, status: "updated" as const, errors: [] };
	});
}

/** Build the §18 command context over the live bridge. */
export function buildShortcutContext(
	bridge: StudioEditorBridge,
	ctx: ShortcutHostContext,
): ShortcutContext {
	const commitDeps = {
		getPuckApi: () => bridge.getPuckApi() as PuckApi,
		getWriterGateError: () => bridge.getWriterGateError(),
	};
	return {
		bridge,
		duplicateNodes: async (nodeIds) => {
			if (bridge.getPuckApi() === null) {
				return;
			}
			const result = commitDuplicateNodes(commitDeps, nodeIds);
			// Freeze §7: selection follows the new copy. `createdNodeIds` is
			// in the order the helper duplicated them, so the LAST entry is
			// the copy of the last selected node — the same node the old
			// `commitNative` loop left selected.
			const lastCopyId = result.createdNodeIds.at(-1);
			if (result.status === "committed" && lastCopyId !== undefined) {
				bridge.selection?.select(lastCopyId);
			}
		},
		removeNodes: async (nodeIds) => {
			if (bridge.getPuckApi() === null) {
				return;
			}
			const result = commitDeleteNodes(commitDeps, nodeIds);
			// A refused delete (locked node, Puck permission) must leave the
			// selection alone — clearing it would tell the author the nodes
			// went away.
			if (result.status === "committed") {
				bridge.selection?.clear();
			}
		},
		wrapNodes: async (nodeIds) => {
			const primary = nodeIds[0];
			if (primary === undefined) {
				return;
			}
			const container = pickWrapContainer(tryConfigComponents(ctx));
			if (container === null) {
				return; // no eligible container declared (§18 rule)
			}
			const { createStableIdAllocator, wrapNode } = await import(
				"../native-tree.js"
			);
			// ONE allocator for this wrap, created OUTSIDE the transform:
			// `commitTree` re-runs it when the document moved, and the
			// container id below is what the selection follows (review 0036
			// M-1). Without this the retry wraps into a different container
			// than the one we then select.
			const allocate = createStableIdAllocator();
			let containerId: string | null = null;
			commitTree(bridge, (data, config) => {
				const wrapped = wrapNode(
					data,
					primary,
					container.type,
					container.slotName,
					config,
					allocate,
				);
				if (wrapped === null) {
					return null;
				}
				containerId = wrapped.containerId;
				return wrapped.data;
			});
			if (containerId !== null) {
				bridge.selection?.select(containerId);
			}
		},
		unwrapNodes: async (nodeIds) => {
			const primary = nodeIds[0];
			if (primary === undefined) {
				return;
			}
			const { unwrapNode } = await import("../native-tree.js");
			commitTree(bridge, (data, config) => unwrapNode(data, primary, config));
		},
		selectParent: () => {
			try {
				const api = ctx.getPuckApi();
				const primary = bridge.selection?.getState().primaryId;
				if (primary === undefined) {
					return false;
				}
				const parent = api.getParentById(primary);
				const parentId = (parent?.props as { id?: string } | undefined)?.id;
				if (typeof parentId !== "string") {
					// Top of the tree: report the miss so the `Escape` ladder can
					// take its terminal rung instead of stalling here.
					return false;
				}
				bridge.selection?.select(parentId);
				return true;
			} catch {
				// <Puck> not bound yet.
				return false;
			}
		},
		focusLayerSearch: () => {
			bridge.focusLayerSearch?.();
		},
	};
}
