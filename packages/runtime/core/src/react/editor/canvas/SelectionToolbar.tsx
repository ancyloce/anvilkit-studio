"use client";

/**
 * @file The canvas multi-select toolbar (PLAN-0020 CORE-P1B-013;
 * ED-CANVAS-006; DD-0019 §13.6).
 *
 * Appears in the authoring overlay above the multi-selection bounds
 * and is the UI entry point for:
 *
 * - **align** left/center/right/top/middle/bottom and **distribute**
 *   H/V (≥3 nodes) — built by `align.ts` (flow siblings sharing a
 *   parent get ONE parent-layout patch; absolute nodes move
 *   geometrically, cross-parent allowed) and committed through
 *   `commitCanvasAppearance` as ONE history entry, however many nodes
 *   move (PLAN-0028 `p4-006`: no command dispatch anywhere in `canvas/`);
 * - the **bulk ops** duplicate / delete / lock / hide /
 *   wrap-in-container, reusing the §18 shortcut implementations
 *   verbatim through the shared `ShortcutContext` — those live in
 *   `shortcuts/`, not here, and are rebased with that module.
 *
 * **Locked nodes are excluded from every mutating op** (`p3-006`
 * annotations). They stay *selectable* — `selection.ts` fences mutation,
 * not selection — so a marquee that swept one up cannot drag it along
 * into an align.
 *
 * Create-component-from-multi-select is deliberately absent — it
 * lands with CORE-P2-004 (Phase 2, ADR-gated).
 *
 * Interaction rides a document-capture click listener (the same
 * cross-document-portal rule as the handles: React's delegated events
 * do not cross into the iframe document).
 */

import type {
	CssBoxEdges,
	ResponsiveLayerRef,
} from "@anvilkit/contracts/editor";
import type {
	PuckApi,
	Config as PuckConfig,
	Data as PuckDataType,
} from "@puckeditor/core";
import {
	type ReactNode,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react";
import { useMsg } from "@/state/editor-i18n-context";
import { ROOT_STYLE_TARGET_ID } from "../../../puck/targets.js";
import { useStudioPluginContext } from "../../../studio/context/plugin-context.js";
import type { StudioEditorBridge } from "../bridge.js";
import { buildShortcutContext } from "../shortcuts/context.js";
import { runShortcutCommand } from "../shortcuts/registry.js";
import {
	type AlignEdge,
	type AlignInput,
	type AlignNode,
	buildAlignOps,
	buildDistributeOps,
} from "./align.js";
import {
	type CanvasAppearanceOp,
	commitCanvasAppearance,
	isCanvasNodeLocked,
	readAuthoredProperty,
} from "./appearance.js";
import { isElementNode } from "./dom-registry.js";
import type { CanvasRect } from "./geometry.js";
import { useOverlayPortalRegistration } from "./overlay-root.js";

const ALIGN_EDGES: readonly AlignEdge[] = [
	"left",
	"center",
	"right",
	"top",
	"middle",
	"bottom",
];

const BULK_COMMANDS = ["duplicate", "delete", "lock", "hide", "wrap"] as const;

/**
 * Create-component-from-multi-select — the canvas entry point
 * CORE-P1B-013 deliberately deferred to Phase 2 (CORE-P2-004),
 * because it is ADR-0005-gated component work rather than
 * align/distribute.
 */
const CREATE_COMPONENT_ACTION = "create-component";

/**
 * Ask for a component name, then capture (CORE-P2-004/-009H;
 * ED-COMP-001).
 *
 * Validation runs **here**, before the dialog opens: a selection that
 * cannot be captured should say so immediately rather than after the
 * user has typed a name. Only a valid selection files the request.
 *
 * The capture itself runs in `CreateComponentDialog` (main document —
 * this toolbar renders inside the canvas iframe, where a modal cannot
 * live) and is still ONE `commitCreateComponent`, so one undo restores
 * the exact pre-capture document.
 */
async function requestComponentCapture(
	bridge: StudioEditorBridge,
	api: PuckApi,
	config: PuckConfig,
): Promise<void> {
	const selectedIds = bridge.selection?.getState().selectedIds ?? [];
	if (selectedIds.length === 0) {
		return;
	}
	const { validateCreateComponentSelection } = await import(
		"../../../puck/create-component.js"
	);
	const errors = validateCreateComponentSelection(
		api.appState.data as PuckDataType,
		config,
		selectedIds,
	);
	if (errors.some((error) => error.severity === "error")) {
		// Surfaced through the shared diagnostic center rather than
		// swallowed — a refused capture must tell the user why.
		bridge.diagnostics.setDiagnostics("editor.component.create", errors);
		return;
	}
	bridge.diagnostics.setDiagnostics("editor.component.create", []);
	bridge.componentCapture.request(selectedIds);
}

/**
 * Build the align input over the live selection.
 *
 * Geometry comes from the rendered DOM (the same DOM the compiled
 * stylesheet styles); the authored `inset` merge base comes from the
 * read model. Locked nodes drop out here — before any op is built — so
 * a mutating gesture can never carry one.
 */
export function alignInputOf(
	bridge: StudioEditorBridge,
	api: PuckApi,
	layer: ResponsiveLayerRef,
): AlignInput | null {
	const registry = bridge.canvasRegistry;
	const selection = bridge.selection?.getState();
	if (registry === null || registry === undefined || selection === undefined) {
		return null;
	}
	const nodes: AlignNode[] = [];
	for (const nodeId of selection.selectedIds) {
		const element = registry.getPrimaryElement(nodeId);
		if (element === null || isCanvasNodeLocked(api, nodeId)) {
			continue;
		}
		const view = element.ownerDocument.defaultView;
		const scrollX = view?.scrollX ?? 0;
		const scrollY = view?.scrollY ?? 0;
		const toContent = (rect: DOMRect): CanvasRect => ({
			x: rect.left + scrollX,
			y: rect.top + scrollY,
			width: rect.width,
			height: rect.height,
		});
		// Inline-style fallback for detached documents (tests).
		const position =
			(view?.getComputedStyle(element).position ?? element.style.position) ===
			"absolute"
				? ("absolute" as const)
				: ("flow" as const);
		const parentHost = element.parentElement?.closest("[data-ak-node]") ?? null;
		const parentId =
			parentHost === null ? null : (registry.getNodeId(parentHost) ?? null);
		const parentRectSource = parentHost ?? element.parentElement;
		// Only absolute nodes write `inset`; reading it for flow nodes
		// would be a wasted projection per node per click.
		const inset =
			position === "absolute"
				? readAuthoredProperty<CssBoxEdges>(
						api,
						nodeId,
						ROOT_STYLE_TARGET_ID,
						"inset",
						layer,
					)
				: undefined;
		nodes.push({
			nodeId,
			rect: toContent(element.getBoundingClientRect()),
			position,
			parentId,
			...(parentRectSource === null
				? {}
				: { parentRect: toContent(parentRectSource.getBoundingClientRect()) }),
			...(inset === undefined ? {} : { inset }),
		});
	}
	if (nodes.length < 2) {
		return null;
	}
	const flow = nodes.filter((node) => node.position === "flow");
	const parents = new Set(flow.map((node) => node.parentId));
	const flowParentId =
		parents.size === 1 ? ([...parents][0] ?? undefined) : undefined;
	let parentDirection: "row" | "column" | undefined;
	if (flowParentId !== undefined && flowParentId !== null) {
		const parentElement = registry.getPrimaryElement(flowParentId);
		const direction =
			parentElement === null
				? undefined
				: (parentElement.ownerDocument.defaultView?.getComputedStyle(
						parentElement,
					).flexDirection ?? parentElement.style.flexDirection);
		parentDirection = direction?.startsWith("column") ? "column" : "row";
	}
	return {
		nodes,
		...(parentDirection !== undefined ? { parentDirection } : {}),
		...(flowParentId !== undefined ? { flowParentId } : {}),
	};
}

/** Props for {@link SelectionToolbar}. */
export interface SelectionToolbarProps {
	readonly bridge: StudioEditorBridge;
}

/** The multi-select align/distribute/bulk-op toolbar. */
export function SelectionToolbar({ bridge }: SelectionToolbarProps): ReactNode {
	const msg = useMsg();
	const ctx = useStudioPluginContext();
	useSyncExternalStore(bridge.subscribe, bridge.getVersion, bridge.getVersion);
	const hostRef = useRef<HTMLDivElement | null>(null);
	useOverlayPortalRegistration(
		hostRef,
		useMemo(() => ({ disableDrag: true }), []),
	);

	// Document-capture click routing (cross-document portal rule).
	// Bound to the live canvas document — NOT the host ref — so the
	// listener exists before the toolbar's first appearance.
	const doc = useSyncExternalStore(
		bridge.subscribe,
		() => bridge.canvasDocument,
		() => bridge.canvasDocument,
	);
	useEffect(() => {
		if (doc === null) {
			return;
		}
		const onClick = (event: Event): void => {
			const target = event.target;
			if (
				!isElementNode(target) ||
				target.closest("[data-ak-selection-toolbar]") === null
			) {
				return;
			}
			const button = target.closest("[data-ak-toolbar-action]");
			if (button === null || button.hasAttribute("disabled")) {
				return;
			}
			event.preventDefault();
			event.stopPropagation();
			const action = button.getAttribute("data-ak-toolbar-action") ?? "";
			const api = bridge.getPuckApi();
			const layer = bridge.responsive?.getActiveLayer() ?? "base";
			/** Every op of one align/distribute intent → ONE history entry. */
			const commitOps = (ops: readonly CanvasAppearanceOp[]): void => {
				if (api === null || ops.length === 0) {
					return;
				}
				const result = commitCanvasAppearance(
					{ getPuckApi: () => api },
					{ layer, ops },
				);
				bridge.diagnostics.setDiagnostics(
					"canvas.appearance",
					result.status === "rejected" ? result.errors : [],
				);
			};
			if ((ALIGN_EDGES as readonly string[]).includes(action)) {
				const input = api === null ? null : alignInputOf(bridge, api, layer);
				if (input !== null) {
					commitOps(buildAlignOps(action as AlignEdge, input));
				}
				return;
			}
			if (action === "distribute-x" || action === "distribute-y") {
				const input = api === null ? null : alignInputOf(bridge, api, layer);
				if (input !== null) {
					commitOps(
						buildDistributeOps(action === "distribute-x" ? "x" : "y", input),
					);
				}
				return;
			}
			if (action === CREATE_COMPONENT_ACTION) {
				if (api !== null) {
					void requestComponentCapture(bridge, api, api.config as PuckConfig);
				}
				return;
			}
			if ((BULK_COMMANDS as readonly string[]).includes(action)) {
				runShortcutCommand(
					action as (typeof BULK_COMMANDS)[number],
					buildShortcutContext(bridge, ctx),
				);
			}
		};
		doc.addEventListener("click", onClick, true);
		return () => doc.removeEventListener("click", onClick, true);
	}, [doc, bridge, ctx]);

	const selection = bridge.selection?.getState();
	const selectedIds = selection?.selectedIds ?? [];
	if (
		selectedIds.length < 2 ||
		bridge.getWriterGateError() !== null ||
		bridge.inline?.getSession() != null
	) {
		return null;
	}
	const registry = bridge.canvasRegistry;
	const rects = selectedIds
		.map((id) => registry?.getPrimaryElement(id) ?? null)
		.filter((element): element is HTMLElement => element !== null)
		.map((element) => {
			const view = element.ownerDocument.defaultView;
			const rect = element.getBoundingClientRect();
			return {
				x: rect.left + (view?.scrollX ?? 0),
				y: rect.top + (view?.scrollY ?? 0),
			};
		});
	if (rects.length < 2) {
		return null;
	}
	const left = Math.min(...rects.map((rect) => rect.x));
	const top = Math.max(0, Math.min(...rects.map((rect) => rect.y)) - 34);
	const canDistribute = selectedIds.length >= 3;

	const button = (
		action: string,
		label: string,
		disabled = false,
	): ReactNode => (
		<button
			key={action}
			type="button"
			data-ak-toolbar-action={action}
			aria-label={label}
			title={label}
			disabled={disabled}
			// Presentation (including :hover and :disabled, which inline
			// styles cannot express) lives in the `[data-ak-toolbar-action]`
			// rules shipped to BOTH documents — `overrides/styles.src.css`
			// for the host and `theme/iframe-theme.ts` for the canvas iframe.
			style={{ pointerEvents: "auto" }}
		>
			{label}
		</button>
	);

	return (
		<div
			ref={hostRef}
			role="toolbar"
			data-ak-selection-toolbar
			aria-label={msg("studio.editor.canvas.align.toolbar")}
			// Only the computed position is inline; surface, border, elevation
			// and hover feedback come from the `[data-ak-selection-toolbar]`
			// rules in `overrides/styles.src.css` + `theme/iframe-theme.ts`.
			// Those use `--ak-studio-panel` / `--ak-studio-panel-fg`, which —
			// unlike the previous `--editor-text` (defined nowhere, so text
			// was pinned to #111 and vanished on the dark panel) — are
			// guaranteed present in both documents.
			style={{
				position: "absolute",
				left: `${left}px`,
				top: `${top}px`,
				pointerEvents: "auto",
				zIndex: 1,
			}}
		>
			{ALIGN_EDGES.map((edge) =>
				button(edge, msg(`studio.editor.canvas.align.${edge}`)),
			)}
			{button(
				"distribute-x",
				msg("studio.editor.canvas.align.distributeH"),
				!canDistribute,
			)}
			{button(
				"distribute-y",
				msg("studio.editor.canvas.align.distributeV"),
				!canDistribute,
			)}
			<span aria-hidden="true" data-ak-toolbar-separator />
			{BULK_COMMANDS.map((command) =>
				button(command, msg(`studio.editor.shortcuts.${command}`)),
			)}
			{button(
				CREATE_COMPONENT_ACTION,
				msg("studio.editor.component.createFromSelection"),
			)}
		</div>
	);
}
