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
 */

import type { StudioEditorBridge } from "../bridge.js";
import type { InternalEditorCommandPort } from "../command-port.js";

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

/** True when the event originates inside a typing surface. */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	if (target.isContentEditable) {
		return true;
	}
	const tag = target.tagName;
	return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/** Everything the command handlers operate over. */
export interface ShortcutContext {
	readonly bridge: StudioEditorBridge;
	readonly port: InternalEditorCommandPort;
	/** Duplicate/remove through the CORE-P1A-016 one-dispatch path. */
	readonly duplicateNodes: (nodeIds: readonly string[]) => Promise<void>;
	readonly removeNodes: (nodeIds: readonly string[]) => Promise<void>;
	readonly wrapNodes: (nodeIds: readonly string[]) => Promise<void>;
	readonly unwrapNodes: (nodeIds: readonly string[]) => Promise<void>;
	/** Select the primary node's parent (Puck parent lookup). */
	readonly selectParent: () => void;
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
	const { bridge, port } = context;
	const selection = bridge.selection?.getState();
	const selectedIds = selection?.selectedIds ?? [];
	const writable = !port.isReadOnly() && !port.writersDisabled();

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

	const execute = (payload: Record<string, unknown>): void => {
		void port.execute({
			id: crypto.randomUUID(),
			expectedRevision: port.getSnapshot().revision,
			source: "shortcut",
			timestamp: Date.now(),
			...payload,
		} as never);
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
			if (selectedIds.length === 0 || !writable) return false;
			const anyUnlocked = selectedIds.some(
				(id) => port.getSnapshot().authoring.nodes[id]?.locked !== true,
			);
			execute({
				type: "node.lock.set",
				nodeIds: selectedIds,
				locked: anyUnlocked,
			});
			return true;
		}
		case "hide": {
			if (selectedIds.length === 0 || !writable) return false;
			const anyVisible = selectedIds.some(
				(id) => port.getSnapshot().authoring.nodes[id]?.hidden?.base !== true,
			);
			execute({
				type: "node.visibility.set",
				nodeIds: selectedIds,
				breakpointId: "base",
				hidden: anyVisible ? true : null,
			});
			return true;
		}
		case "select-parent":
			if (selection?.primaryId === undefined) return false;
			context.selectParent();
			return true;
		case "find-layer":
			context.focusLayerSearch();
			return true;
	}
}
