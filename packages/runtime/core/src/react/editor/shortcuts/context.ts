"use client";

/**
 * @file Shared `ShortcutContext` builder (PLAN-0020 CORE-P1A-017 /
 * CORE-P1B-013). The §18 command implementations are defined ONCE
 * here and reused verbatim by both consumers: the keymap binder
 * (`EditorShortcuts`) and the canvas multi-select toolbar
 * (`SelectionToolbar`) — same duplicate/delete/wrap/unwrap semantics,
 * same one-dispatch `commitNative` path, same selection follow-ups.
 */

import type { StudioEditorBridge } from "../bridge.js";
import type { InternalEditorCommandPort } from "../command-port.js";
import { readEditorMetadata } from "../decorate-config.js";
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
		const slotName = Object.keys(metadata?.slotMap ?? {})[0];
		if (
			metadata?.capabilities.layoutContainer === true &&
			slotName !== undefined
		) {
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

/** Build the §18 command context over the live bridge + port. */
export function buildShortcutContext(
	bridge: StudioEditorBridge,
	port: InternalEditorCommandPort,
	ctx: ShortcutHostContext,
): ShortcutContext {
	return {
		bridge,
		port,
		duplicateNodes: async (nodeIds) => {
			const [{ duplicateNode }, { remapForDuplicate }] = await Promise.all([
				import("../native-tree.js"),
				import("../../../editor/index.js"),
			]);
			let lastCopyId: string | null = null;
			port.commitNative((data, authoring) => {
				let nextData = data;
				let nextAuthoring = authoring;
				let any = false;
				for (const nodeId of nodeIds) {
					const duplicated = duplicateNode(nextData, nodeId);
					if (duplicated === null) {
						continue;
					}
					any = true;
					lastCopyId = duplicated.newRootId;
					nextData = duplicated.data;
					nextAuthoring = remapForDuplicate(
						nextAuthoring,
						duplicated.idMap,
					).state;
				}
				return any ? { data: nextData, authoring: nextAuthoring } : null;
			});
			if (lastCopyId !== null) {
				bridge.selection?.select(lastCopyId);
			}
		},
		removeNodes: async (nodeIds) => {
			const { removeNode } = await import("../native-tree.js");
			port.commitNative((data, authoring) => {
				let nextData = data;
				let any = false;
				for (const nodeId of nodeIds) {
					const next = removeNode(nextData, nodeId);
					if (next !== null) {
						nextData = next;
						any = true;
					}
				}
				return any ? { data: nextData, authoring } : null;
			});
			bridge.selection?.clear();
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
			const { wrapNode } = await import("../native-tree.js");
			let containerId: string | null = null;
			port.commitNative((data, authoring) => {
				const wrapped = wrapNode(
					data,
					primary,
					container.type,
					container.slotName,
				);
				if (wrapped === null) {
					return null;
				}
				containerId = wrapped.containerId;
				return { data: wrapped.data, authoring };
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
			port.commitNative((data, authoring) => {
				const next = unwrapNode(data, primary);
				return next === null ? null : { data: next, authoring };
			});
		},
		selectParent: () => {
			try {
				const api = ctx.getPuckApi();
				const primary = bridge.selection?.getState().primaryId;
				if (primary === undefined) {
					return;
				}
				const parent = api.getParentById(primary);
				const parentId = (parent?.props as { id?: string } | undefined)?.id;
				if (typeof parentId === "string") {
					bridge.selection?.select(parentId);
				}
			} catch {
				// <Puck> not bound yet.
			}
		},
		focusLayerSearch: () => {
			bridge.focusLayerSearch?.();
		},
	};
}
