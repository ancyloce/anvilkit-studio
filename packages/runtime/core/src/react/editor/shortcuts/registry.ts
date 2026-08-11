"use client";

/**
 * @file The §18 productivity command set and focus-scoped shortcut
 * registry (PLAN-0020 CORE-P1A-017).
 *
 * Commands: duplicate, delete, wrap, unwrap, lock, hide, select
 * parent, find layer — all operating on the multi-selection through
 * the reconciliation path (duplicate/delete reuse CORE-P1A-016's
 * one-dispatch `commitNative`; lock/hide are atomic multi-target port
 * commands with `source: "shortcut"`).
 *
 * Registry rules (§18, verbatim): active only while
 * `[data-ak-studio-root]` owns focus; never overrides host-global
 * shortcuts (unhandled keys pass through untouched — we only
 * `preventDefault` after deciding to run); coexists with Puck's own
 * bindings (no key here collides with Puck's undo/redo/arrow set);
 * **non-trusted events are ignored** — extension-injected keydowns
 * crash Puck's `monitorHotkeys`, and synthetic events must never
 * drive document mutations. Typing surfaces (inputs, textareas,
 * contenteditable) swallow everything except the Escape-based select
 * parent, which only acts outside them anyway.
 *
 * `EDITOR_SHORTCUT_KEYMAP` is the data the §26.2/P4-006 docs render.
 *
 * ### Component mode (PLAN-0028 `p5-002`, PLAN-0026 §3.7.2)
 *
 * Two keyboard rows of the §3.7.2 gesture table land here rather than
 * in the canvas, because this module is where focus scoping,
 * typing-surface suppression and the trusted-event guard already live
 * — a second keydown path would have to restate all three.
 *
 * - **`Escape` is a ladder**, one rung per press:
 *   `target → node → page mode → parent → cleared`. The first two rungs
 *   are new; the last two are the shipped `select-parent` behaviour with
 *   its terminal made explicit. A press that would have done nothing
 *   (no parent to escalate to) now clears the selection, which is the
 *   §3.7.2 page-mode cell. Nothing was removed to add the rungs.
 * - **`↑`/`↓` traverse declared targets** in declaration order while in
 *   component mode, and are inert in page mode so Puck's own arrow
 *   handling is untouched. They **stop at the ends**
 *   ({@link TARGET_TRAVERSAL_WRAPS}).
 *
 * Neither is in {@link EDITOR_SHORTCUT_KEYMAP}: that array is the
 * documented, labelled §18 productivity keymap and every row needs a
 * `studio.editor.shortcuts.*` catalog entry. The three component-mode
 * labels do not exist in the catalog yet, so rather than mislabel rows
 * these are mode-scoped navigation, matched by
 * {@link COMPONENT_MODE_KEYS}.
 */

import type {
	Config as PuckConfig,
	Data as PuckData,
	PuckApi,
} from "@puckeditor/core";
import {
	collectAppearanceNodes,
	documentBreakpoints,
	readTargetHidden,
} from "../../../puck/read-appearance.js";
import { ROOT_STYLE_TARGET_ID } from "../../../puck/targets.js";
import { commitAnnotationUpdate, isNodeLocked } from "../../../puck/update-annotations.js";
import { commitAppearanceUpdate } from "../../../puck/update-appearance.js";
import type { StudioEditorBridge } from "../bridge.js";
import {
	declaredTargetIds,
	stepTargetId,
	TARGET_TRAVERSAL_WRAPS,
} from "../canvas/component-mode.js";
import { isElementNode } from "../canvas/dom-registry.js";

export { TARGET_TRAVERSAL_WRAPS };

/** One §18 productivity command id. */
export type EditorShortcutCommandId =
	| "duplicate"
	| "delete"
	| "wrap"
	| "unwrap"
	| "lock"
	| "hide"
	| "select-parent"
	| "find-layer";

/** The mode-scoped keys of the §3.7.2 gesture table. */
export const COMPONENT_MODE_KEYS = {
	/** Previous declared target. */
	previousTarget: "arrowup",
	/** Next declared target. */
	nextTarget: "arrowdown",
} as const;

/** One keymap row (surfaced to the shortcut-reference docs). */
export interface EditorShortcutBinding {
	readonly command: EditorShortcutCommandId;
	/** `mod` = Cmd on macOS / Ctrl elsewhere. */
	readonly keys: string;
	/** `studio.editor.shortcuts.*` catalog key for the docs/UI. */
	readonly labelKey: string;
}

/** The frozen Phase 1A keymap (§18; docs source of truth). */
export const EDITOR_SHORTCUT_KEYMAP: readonly EditorShortcutBinding[] = [
	{
		command: "duplicate",
		keys: "mod+d",
		labelKey: "studio.editor.shortcuts.duplicate",
	},
	{
		command: "delete",
		keys: "delete",
		labelKey: "studio.editor.shortcuts.delete",
	},
	{ command: "wrap", keys: "mod+g", labelKey: "studio.editor.shortcuts.wrap" },
	{
		command: "unwrap",
		keys: "mod+shift+g",
		labelKey: "studio.editor.shortcuts.unwrap",
	},
	{
		command: "lock",
		keys: "mod+shift+l",
		labelKey: "studio.editor.shortcuts.lock",
	},
	{
		command: "hide",
		keys: "mod+shift+h",
		labelKey: "studio.editor.shortcuts.hide",
	},
	{
		command: "select-parent",
		keys: "escape",
		labelKey: "studio.editor.shortcuts.selectParent",
	},
	{
		command: "find-layer",
		keys: "mod+shift+f",
		labelKey: "studio.editor.shortcuts.findLayer",
	},
];

/** Match a keydown against a `mod+shift+key` style chord. */
export function matchesBinding(
	event: Pick<
		KeyboardEvent,
		"key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
	>,
	keys: string,
): boolean {
	const parts = keys.split("+");
	const key = parts.at(-1) ?? "";
	const needMod = parts.includes("mod");
	const needShift = parts.includes("shift");
	const hasMod = event.metaKey || event.ctrlKey;
	if (needMod !== hasMod || needShift !== event.shiftKey || event.altKey) {
		return false;
	}
	const eventKey = event.key.toLowerCase();
	if (key === "delete") {
		return eventKey === "delete" || eventKey === "backspace";
	}
	return eventKey === key;
}

/**
 * Trusted-event guard (the extension-injected-keydown hazard).
 * jsdom cannot dispatch trusted events, so tests opt in explicitly —
 * production code never flips this.
 */
let trustAllEventsForTests = false;

/** Test-only: treat constructed events as trusted. */
export function __setTrustAllEventsForTests(value: boolean): void {
	trustAllEventsForTests = value;
}

/** True when the event may drive commands (trusted or test-trusted). */
export function isTrustedEvent(event: Pick<Event, "isTrusted">): boolean {
	return event.isTrusted === true || trustAllEventsForTests;
}

/**
 * True when the event originates inside a typing surface.
 *
 * Duck-typed rather than `instanceof HTMLElement`: `p5-002` binds this
 * handler inside the canvas iframe as well, and the iframe is a
 * separate JS realm where `instanceof` against the parent window's
 * constructor is ALWAYS false — an in-canvas inline-editing session
 * would have failed the check and had its keystrokes eaten.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!isElementNode(target)) {
		return false;
	}
	const element = target as HTMLElement;
	if (element.isContentEditable === true) {
		return true;
	}
	const tag = element.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Everything the command handlers operate over. */
export interface ShortcutContext {
	readonly bridge: StudioEditorBridge;
	/** Duplicate/remove through the `p3-005` one-dispatch commit helpers. */
	readonly duplicateNodes: (nodeIds: readonly string[]) => Promise<void>;
	readonly removeNodes: (nodeIds: readonly string[]) => Promise<void>;
	readonly wrapNodes: (nodeIds: readonly string[]) => Promise<void>;
	readonly unwrapNodes: (nodeIds: readonly string[]) => Promise<void>;
	/**
	 * Select the primary node's parent (Puck parent lookup). Returns
	 * `false` when there was no parent to escalate to — that answer is
	 * what lets the `Escape` ladder fall through to its terminal rung
	 * instead of silently doing nothing at the top of the tree.
	 */
	readonly selectParent: () => boolean;
	/** Focus the Layers search input (CORE-P1A-010's field). */
	readonly focusLayerSearch: () => void;
}

/**
 * Run one command over the current selection. Returns true when the
 * command consumed the event (callers then `preventDefault`).
 */
export function runShortcutCommand(
	commandId: EditorShortcutCommandId,
	context: ShortcutContext,
): boolean {
	const { bridge } = context;
	const selection = bridge.selection?.getState();
	const selectedIds = selection?.selectedIds ?? [];
	// `p3-009`: the sidecar's read-only safe mode is gone with the
	// sidecar, so writability is exactly the collab writer gate — and it
	// is the same gate the commit helpers enforce, so a shortcut that
	// renders as available is a shortcut whose write will be accepted.
	const writable = bridge.getWriterGateError() === null;

	/**
	 * Fire-and-forget guard for the async tree commands: a rejected
	 * import or transform used to vanish into an unhandled rejection
	 * with no trace, leaving the command a silent no-op (the exact
	 * failure mode that hid the root-slot walk gap). The frozen
	 * `EditorErrorCode` union (CORE-P0-001) has no generic
	 * command-failure code, so rather than widen a frozen contract the
	 * rejection is rethrown asynchronously — visible to the host's
	 * error reporting and the console instead of swallowed.
	 */
	const run = (
		commandId: EditorShortcutCommandId,
		operation: Promise<void>,
	): void => {
		void operation.catch((error: unknown) => {
			queueMicrotask(() => {
				throw error instanceof Error
					? new Error(`editor ${commandId} command failed: ${error.message}`, {
							cause: error,
						})
					: new Error(`editor ${commandId} command failed: ${String(error)}`);
			});
		});
	};

	/** The live `PuckApi`, or `null` before `<Puck>` mounts. */
	const puckApi = (): PuckApi | null => bridge.getPuckApi();
	const commitDeps = {
		getPuckApi: () => bridge.getPuckApi() as PuckApi,
		getWriterGateError: () => bridge.getWriterGateError(),
	};

	switch (commandId) {
		case "duplicate":
			if (selectedIds.length === 0 || !writable) return false;
			run("duplicate", context.duplicateNodes(selectedIds));
			return true;
		case "delete":
			if (selectedIds.length === 0 || !writable) return false;
			run("delete", context.removeNodes(selectedIds));
			return true;
		case "wrap":
			if (selectedIds.length === 0 || !writable) return false;
			run("wrap", context.wrapNodes(selectedIds));
			return true;
		case "unwrap":
			if (selectedIds.length === 0 || !writable) return false;
			run("unwrap", context.unwrapNodes(selectedIds));
			return true;
		case "lock": {
			// `p3-006`'s `editorAnnotations` root prop is where `locked`
			// lives now, so the read is `isNodeLocked` over the live `Data`
			// and the write is one `commitAnnotationUpdate` per node. The
			// deleted `node.lock.set` command took a node LIST and produced
			// one history entry for the whole selection; the annotation
			// helper is per-node, so a multi-select lock is currently N undo
			// steps rather than one. Recorded rather than papered over — the
			// fix is a plural `AnnotationEdit`, which is a contract change.
			if (selectedIds.length === 0 || !writable) return false;
			const api = puckApi();
			if (api === null) return false;
			const data = api.appState.data as PuckData;
			const locked = selectedIds.some((id) => !isNodeLocked(data, id));
			for (const nodeId of selectedIds) {
				commitAnnotationUpdate(commitDeps, {
					kind: "set-locked",
					nodeId,
					locked,
				});
			}
			return true;
		}
		case "hide": {
			// Visibility is the per-target `hidden` carrier at the base
			// layer (§5.1), written through the one appearance commit path.
			// `undefined` REMOVES the entry — the canonical spelling of the
			// deleted command's `hidden: null`.
			if (selectedIds.length === 0 || !writable) return false;
			const api = puckApi();
			if (api === null) return false;
			const config = api.config as PuckConfig;
			const data = api.appState.data as PuckData;
			const hiddenState = readTargetHidden({
				nodes: collectAppearanceNodes(data, config),
				config,
				breakpoints: documentBreakpoints(data),
				nodeIds: selectedIds,
				targetId: ROOT_STYLE_TARGET_ID,
				layer: "base",
			});
			// "Any visible" — a mixed selection hides rather than reveals,
			// matching the deleted command's `anyVisible` rule.
			const anyVisible =
				hiddenState.kind !== "value" || hiddenState.value !== true;
			commitAppearanceUpdate(commitDeps, {
				config,
				nodeIds: selectedIds,
				targetId: ROOT_STYLE_TARGET_ID,
				layer: "base",
				patch: {
					kind: "set-hidden",
					value: anyVisible ? true : undefined,
				},
			});
			return true;
		}
		case "select-parent": {
			// The §3.7.2 `Escape` ladder — exactly ONE rung per press.
			if (selection === undefined) return false;
			// Rung 1: drop the target, staying on the node inside the mode.
			if (selection.mode === "component" && selection.targetId !== undefined) {
				bridge.selection?.setTargetId(undefined);
				return true;
			}
			// Rung 2: leave component mode, keeping the node selected.
			// `setMode` never records history — there is nothing to undo.
			if (selection.mode === "component") {
				bridge.selection?.setMode("page");
				return true;
			}
			if (selection.primaryId === undefined) return false;
			// Rung 3: the shipped page-mode escalation.
			if (context.selectParent()) return true;
			// Rung 4: nothing left above — clear the selection.
			bridge.selection?.clear();
			return true;
		}
		case "find-layer":
			context.focusLayerSearch();
			return true;
	}
}

/**
 * Component-mode keyboard traversal: `↑`/`↓` walk the primary node's
 * declared style targets in **declaration order**, stopping at the ends.
 *
 * Returns `true` when the key was consumed. Inert in page mode, inert
 * without a primary selection, and inert when the component declares no
 * targets — in every one of those cases the key passes through
 * untouched, which is what keeps Puck's own arrow handling working.
 *
 * This is the a11y half of component mode: without it the entire mode is
 * mouse-only, because every other way into a target is a pointer
 * gesture.
 */
export function runTargetTraversal(
	event: Pick<
		KeyboardEvent,
		"key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
	>,
	bridge: StudioEditorBridge,
	api: PuckApi | null,
): boolean {
	const selection = bridge.selection?.getState();
	if (selection === undefined || selection.mode !== "component") return false;
	const primaryId = selection.primaryId;
	if (primaryId === undefined || api === null) return false;
	const delta = matchesBinding(event, COMPONENT_MODE_KEYS.nextTarget)
		? 1
		: matchesBinding(event, COMPONENT_MODE_KEYS.previousTarget)
			? -1
			: 0;
	if (delta === 0) return false;
	const next = stepTargetId(
		declaredTargetIds(api, primaryId),
		selection.targetId,
		delta,
	);
	if (next === undefined) return false;
	// A press at either end is still CONSUMED even though nothing moves:
	// letting it fall through would scroll the canvas out from under a
	// keyboard user who has simply reached the last element.
	if (next !== selection.targetId) {
		bridge.selection?.setTargetId(next);
	}
	return true;
}
