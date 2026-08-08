"use client";

/**
 * @file `ViewportToolbar` — breakpoint switching and the undo/redo
 * surface for the composition shell (PLAN-0028 `p4-005`, PLAN-0026
 * §3.5).
 *
 * ### Previewing a breakpoint and authoring into it are ONE state
 *
 * The toolbar does not hold a viewport value of its own. Selecting a
 * breakpoint calls {@link useWriteLayer}'s `setLayer`, which the shell
 * routes to the viewport controller's `setWriteTarget`; the canvas
 * derives its width from that same layer (see
 * {@link viewportWidthForLayer}, consumed by `CompositionCanvas`). So
 * "I am previewing mobile" and "I am authoring mobile" cannot disagree
 * — there is one value and both readings are projections of it. Two
 * separate values is the specific defect `p4-004` and this task exist
 * to prevent structurally rather than by convention, and it is why the
 * shell binds to the controller instead of holding React state: the
 * canvas overlay renders outside `<Puck>` and cannot read this
 * context at all.
 *
 * ### Undo/redo is Puck's, surfaced — never a second history
 *
 * Every commit helper already dispatches with `recordHistory: true`,
 * and `PuckApi.history` publicly exposes `back` / `forward` /
 * `hasPast` / `hasFuture`. The buttons call those and derive their
 * disabled state from those. There is **no shell-side history stack**,
 * because a second history is a second source of truth about what the
 * document is (Puck contract rules 1 and 4).
 *
 * ### Shortcuts are not registered here
 *
 * `shortcuts/registry.ts` already implements the rules this task calls
 * for, and implements them at the right layer: active only while
 * `[data-ak-studio-root]` owns focus (so there is **no global
 * keymap**), typing surfaces swallow everything except the Escape
 * ladder (so text-editing keys reach the inline editor when it has
 * focus), and non-trusted events are ignored. That last rule is also
 * the `getModifierState` answer the task file asks for: extension-
 * injected keydowns are *rejected at the source* rather than patched
 * around downstream, so no defensive shim is added here.
 *
 * ### The mode toggle lives here, and it is the keyboard anchor
 *
 * `p5-002`. Editing granularity is a **canvas** concern — page mode
 * selects Puck nodes, component mode selects a declared element inside
 * one — so the control belongs on the canvas chrome rather than in the
 * shell frame. It writes `selection.setMode`, which the controller
 * documents as never entering history: there is no `Data` trace and
 * nothing to undo (PLAN-0026 §3.7.1 rule 1).
 *
 * It doubles as the **focus destination** when component mode is
 * entered from a canvas gesture. Without that, a double-click into a
 * component leaves focus wherever the pointer left it and the mode's
 * only keyboard surface is unreachable — the half of a11y a key
 * binding alone does not deliver.
 */

import type {
	BreakpointDefinition,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import { type ReactNode, useEffect, useRef } from "react";
import { Button } from "@/primitives/button";
import { useMsg } from "@/state/editor-i18n-context";
import { useReactivePuck } from "../../utils/use-reactive-puck.js";
import { useDocumentModel } from "../use-document-model.js";
import { useOptionalStudioEditor } from "../use-studio-editor.js";
import { useShellSelection } from "./use-shell-selection.js";
import { useWriteLayer } from "./write-layer.js";

/**
 * The canvas width for a layer, or `undefined` for the base layer
 * (which means "no constraint" — the canvas fills its column).
 *
 * Pure and exported so the canvas and the toolbar cannot compute the
 * viewport differently from the same layer.
 */
export function viewportWidthForLayer(
	layer: ResponsiveLayerRef,
	breakpoints: readonly BreakpointDefinition[],
): number | undefined {
	if (layer === "base") return undefined;
	return breakpoints.find((entry) => entry.id === layer)?.maxWidth;
}

/** Enabled breakpoints in display order; base is implicit and never stored. */
function enabledBreakpoints(
	breakpoints: readonly BreakpointDefinition[] | undefined,
): readonly BreakpointDefinition[] {
	// Copy before sorting: the array comes from the projected document
	// and `sort` mutates in place. `toSorted` is not in this package's
	// lib target.
	return [...(breakpoints ?? [])]
		.filter((entry) => entry.enabled)
		.sort((a, b) => a.order - b.order);
}

/** Breakpoint switcher + undo/redo. Must render inside `<Puck>`. */
export function ViewportToolbar(): ReactNode {
	const msg = useMsg();
	const model = useDocumentModel();
	const { layer, setLayer } = useWriteLayer();
	const selection = useShellSelection();
	const selectionController = useOptionalStudioEditor()?.selection ?? null;
	const componentModeRef = useRef<HTMLButtonElement | null>(null);
	const lastMode = useRef(selection.mode);
	// Entering component mode moves focus to the control that governs it,
	// so the `Escape` ladder and `↑`/`↓` traversal are reachable from
	// wherever the mode was entered — including a canvas double-click,
	// which otherwise leaves focus inside the iframe on nothing. Only the
	// page → component EDGE moves focus: re-focusing on every target
	// change would yank focus back out of whatever the author is editing.
	useEffect(() => {
		if (lastMode.current !== "component" && selection.mode === "component") {
			componentModeRef.current?.focus({ preventScroll: true });
		}
		lastMode.current = selection.mode;
	}, [selection.mode]);
	// Narrow selectors: primitives only, so an unrelated document change
	// does not re-render the toolbar.
	const hasPast = useReactivePuck((state) => state.history.hasPast);
	const hasFuture = useReactivePuck((state) => state.history.hasFuture);
	const back = useReactivePuck((state) => state.history.back);
	const forward = useReactivePuck((state) => state.history.forward);

	const breakpoints = enabledBreakpoints(model.designSystem?.breakpoints);

	return (
		<div
			className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-[var(--ak-studio-border)] px-2"
			data-testid="ak-viewport-toolbar"
			data-active-layer={layer}
		>
			<div
				className="flex items-center gap-1"
				role="group"
				aria-label={msg("studio.editor.responsive.breakpoints")}
				data-testid="ak-viewport-breakpoints"
			>
				<Button
					type="button"
					size="sm"
					variant={layer === "base" ? "secondary" : "ghost"}
					aria-pressed={layer === "base"}
					data-testid="ak-viewport-layer-base"
					onClick={() => setLayer("base")}
				>
					{msg("studio.editor.responsive.base")}
				</Button>
				{breakpoints.map((entry) => (
					<Button
						key={entry.id}
						type="button"
						size="sm"
						variant={layer === entry.id ? "secondary" : "ghost"}
						aria-pressed={layer === entry.id}
						data-testid={`ak-viewport-layer-${entry.id}`}
						data-max-width={entry.maxWidth}
						onClick={() => setLayer(entry.id)}
					>
						{entry.label}
					</Button>
				))}
			</div>

			{/* Editing granularity (§3.7.1 rule 1): editor state only —
			    `setMode` records no history and writes no `Data`. */}
			<div
				className="flex items-center gap-1"
				role="group"
				aria-label={msg("studio.editor.mode.toggle")}
				data-testid="ak-editor-mode"
				data-active-mode={selection.mode}
			>
				<Button
					type="button"
					size="sm"
					variant={selection.mode === "page" ? "secondary" : "ghost"}
					aria-pressed={selection.mode === "page"}
					data-testid="ak-editor-mode-page"
					onClick={() => selectionController?.setMode("page")}
				>
					{msg("studio.editor.mode.page")}
				</Button>
				<Button
					ref={componentModeRef}
					type="button"
					size="sm"
					variant={selection.mode === "component" ? "secondary" : "ghost"}
					aria-pressed={selection.mode === "component"}
					// Component mode addresses an element INSIDE a node, so it
					// is meaningless without one selected — disabled rather than
					// silently inert.
					disabled={
						selection.primaryId === null || selectionController === null
					}
					title={msg("studio.editor.mode.toggle")}
					data-testid="ak-editor-mode-component"
					onClick={() => selectionController?.setMode("component")}
				>
					{msg("studio.editor.mode.component")}
				</Button>
			</div>

			<div className="flex items-center gap-1">
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={!hasPast}
					data-testid="ak-history-undo"
					onClick={() => back()}
				>
					{msg("studio.actions.undo")}
				</Button>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={!hasFuture}
					data-testid="ak-history-redo"
					onClick={() => forward()}
				>
					{msg("studio.actions.redo")}
				</Button>
			</div>
		</div>
	);
}
