"use client";

/**
 * @file `StylePanel` — the composition inspector's Style tab
 * (PLAN-0028 `p4-001`, PLAN-0026 §3.5; PLAN-0025 §8.1–§8.3).
 *
 * P2-02 landed this panel as a **read-only summary**: a label per
 * declared target plus four `data-authored-*` attributes. This task
 * lands the value controls and the commit path, which is what makes the
 * promoted shell an editor rather than a viewer.
 *
 * ### One address, both directions
 *
 * Report 0021 §6 named the structural defect: editor *writes* landed in
 * the declared `appearance` prop while editor *reads* projected from a
 * sidecar that carrier documents never populated, so the inspector
 * could show nothing for state that was genuinely stored. Nothing here
 * can reproduce that. Reads go through `readNodeField` and writes
 * through `commitAppearanceUpdate`, and the read address
 * (`NodeFieldAddress`) is **derived from** the write input
 * (`UpdateAppearanceInput`) by type-level assertions in
 * `document-model/read-node-field.ts`. Widening one without the other
 * is a compile error, not a defect discovered later.
 *
 * ### Puck contract
 *
 * - **Rule 2** — every byte this panel writes lands in the declared
 *   `appearance` component prop. There is no sidecar, no root
 *   attachment, no editor-only store. The write layer, the selection
 *   and the active tab are editor *pointers*; they never enter `Data`.
 * - **Rule 3** — the carrier written here is the carrier
 *   `style-compiler/compile.ts` reads, so canvas, preview, production
 *   `<Render>` and export see the same value with no translation step
 *   between them. There is no second pipeline to disagree.
 * - **Rule 1/4** — state arrives through `createUsePuck` selectors and
 *   commits through one `PuckApi.dispatch({type:"setData"})`; the panel
 *   touches no Puck internals and no experimental Override.
 *
 * ### Target-scoped navigation (`p5-003`, PLAN-0026 §3.7.3)
 *
 * The breadcrumb and the target list are **one state with the canvas**,
 * not a second selection that has to be reconciled with it. Both read
 * `useShellSelection()` and both write through
 * `EditorSelectionController.setMode` / `.setTargetId`, so "selecting a
 * target in the panel" and "selecting a target on canvas" are literally
 * the same two calls. There is no panel-local target state for the two
 * surfaces to disagree about — the defect class is removed by
 * construction rather than guarded against.
 *
 * Target order is `SelectionStyleTarget` order, which is
 * `DocumentNode.styleTargets` order, which is
 * `resolveStyleTargets(config, type)` order — the *same* memoized call
 * `canvas/component-mode.ts`'s `declaredTargetIds` makes for `↑`/`↓`
 * traversal (`document-model/read-document.ts:131-141`). One ordering,
 * two surfaces, no second derivation to drift.
 *
 * ### Capability honesty (§8.5)
 *
 * - nothing selected → `studio.fields.empty`;
 * - a selection with no declared target in common →
 *   `studio.editor.inspector.tab.style.empty`;
 * - a **declared** target with no element in the current render branch
 *   → listed, disabled, labelled `studio.editor.target.absent`. Real
 *   case, not hypothetical: `blog-list`'s empty state renders `root`
 *   only (`blog-list/src/BlogList.tsx:176-190`, documented at
 *   `blog-list/src/config.ts:41-49`), so its five card-family targets
 *   are declared and unrenderable at the same time.
 * - properties withheld because an upstream primitive sets them inline
 *   are absent from the allowlist and therefore have no control here —
 *   no control, and no explanation, because there is nothing the author
 *   could do about it.
 *
 * "Absent" is only ever claimed when the panel can actually see the
 * canvas; with no registry, or with the selection unmounted, presence
 * reads `"unknown"` and nothing is disabled (`style/targets.ts`).
 *
 * Controls exist only for properties in a target's **allowlist**, the
 * same allowlist `updateAppearanceInData` validates against, so the
 * panel is structurally incapable of offering an edit the writer would
 * reject with `EDITOR_CAPABILITY_UNSUPPORTED`. Across a multi-selection
 * the offered set is the *intersection* (`style/targets.ts`) — the
 * writer rejects a whole intent if one node is incapable, so a union
 * would render controls guaranteed to fail.
 */

import { type ReactNode, use, useEffect, useReducer } from "react";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/primitives/breadcrumb";
import { Button } from "@/primitives/button";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioEditorBridge } from "../bridge.js";
import type { EditorSelectionController } from "../selection.js";
import { useDocumentModel } from "../use-document-model.js";
import {
	StudioEditorBridgeContext,
	useOptionalStudioEditor,
} from "../use-studio-editor.js";
import type { StudioInspectorPanel } from "./inspector-panel.js";
import type { StyleDefinitionChoice } from "./style/controls/misc.js";
import { StyleLayerSelector } from "./style/LayerSelector.js";
import { StyleErrorsProvider, useStyleErrors } from "./style/style-errors.js";
import { StyleTargetSection } from "./style/TargetSection.js";
import {
	resolveTargetPresence,
	type SelectionStyleTarget,
	selectionStyleTargets,
	summarizeAuthoredTarget,
	type TargetPresence,
} from "./style/targets.js";
import { useShellSelection } from "./use-shell-selection.js";

const NO_DEFINITIONS: readonly StyleDefinitionChoice[] = Object.freeze([]);

/**
 * The Style tab body. Must render inside `<Puck>`; wire it into
 * `StudioPuckLayout` through {@link STYLE_PANEL}.
 */
export function StylePanel(): ReactNode {
	return (
		<StyleErrorsProvider>
			<StylePanelBody />
		</StyleErrorsProvider>
	);
}

function StylePanelBody(): ReactNode {
	const msg = useMsg();
	const selection = useShellSelection();
	const model = useDocumentModel();
	const { errors } = useStyleErrors();
	// The controller comes from the SAME accessor `useShellSelection`
	// reads through, deliberately: taking it off the bridge directly
	// would let the panel write to a controller the panel is not reading
	// from during the window before the port installs — which is the
	// two-disagreeing-selections defect this task exists to avoid. The
	// bridge is consulted only for the canvas DOM registry, which has no
	// reader/writer duality.
	const controller: EditorSelectionController | null =
		useOptionalStudioEditor()?.selection ?? null;
	const bridge = use(StudioEditorBridgeContext);

	if (selection.nodeIds.length === 0) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-style-panel-empty"
			>
				{msg("studio.fields.empty")}
			</p>
		);
	}

	const common = selectionStyleTargets(model, selection.nodeIds);

	if (common.length === 0) {
		// §8.5: a component that has not declared editable appearance says
		// so — the panel never invents capabilities for it.
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-style-panel-undeclared"
			>
				{msg("studio.editor.inspector.tab.style.empty")}
			</p>
		);
	}

	// Component mode narrows to the one target being edited (`p3-007`);
	// page mode shows every target the selection has in common. An active
	// target the *selection* does not share — reachable when a
	// multi-selection grows to include a node that does not declare it —
	// yields no section, but the navigator still renders so the author can
	// move somewhere writable. Saying "no visual style options" there
	// would be false: the component has them, this selection does not.
	const targets =
		selection.mode === "component" && selection.targetId !== undefined
			? common.filter((entry) => entry.id === selection.targetId)
			: common;

	const breakpoints = model.designSystem?.breakpoints ?? [];
	const definitions: readonly StyleDefinitionChoice[] =
		model.designSystem === undefined
			? NO_DEFINITIONS
			: Object.values(model.designSystem.styleDefinitions).map(
					(definition) => ({
						id: definition.id,
						name: definition.name,
					}),
				);
	const primary = selection.primaryId;
	const nodeType =
		primary === null ? "" : (model.nodes.get(primary)?.type ?? "");

	return (
		<div
			className="flex flex-col gap-3"
			data-testid="ak-style-panel"
			data-node-id={primary ?? ""}
			data-node-type={nodeType}
			data-node-count={selection.nodeIds.length}
			data-breakpoints={breakpoints.length}
			data-mode={selection.mode}
			data-target-id={selection.targetId ?? ""}
		>
			{/* Navigation needs somewhere to write. Without a controller —
			    a panel under a bare `<Puck>`, the shell's degraded path —
			    there is no shared selection to move, so the panel shows the
			    sections it can and offers no picker that would do nothing. */}
			{controller === null || primary === null ? null : (
				<StyleTargetNavigator
					bridge={bridge}
					controller={controller}
					componentName={nodeType === "" ? primary : nodeType}
					nodeIds={selection.nodeIds}
					targets={common}
					activeTargetId={
						selection.mode === "component" ? selection.targetId : undefined
					}
				/>
			)}

			{targets.some((target) => target.responsive) ? (
				<StyleLayerSelector breakpoints={breakpoints} />
			) : null}

			{targets.map((target) => (
				<StyleTargetSection
					key={target.id}
					target={target}
					nodeIds={selection.nodeIds}
					authored={summarizeAuthoredTarget(model, primary, target.id)}
					definitions={definitions}
				/>
			))}

			{errors.length > 0 ? (
				<ul className="flex flex-col gap-0.5" data-testid="ak-style-errors">
					{errors.map((error) => (
						<li
							key={`${error.code}:${error.message}`}
							className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
						>
							{error.message}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/* ------------------------------------------------------------------ *
 * Breadcrumb + target picker — one state with the canvas
 * ------------------------------------------------------------------ */

interface StyleTargetNavigatorProps {
	/** Carries the canvas DOM registry; `null` outside an editor mount. */
	readonly bridge: StudioEditorBridge | null;
	/** The one place a target selection is written, panel or canvas. */
	readonly controller: EditorSelectionController;
	/** The primary node's component type — the breadcrumb's first crumb. */
	readonly componentName: string;
	readonly nodeIds: readonly string[];
	/** Every target the selection shares, in declaration order. */
	readonly targets: readonly SelectionStyleTarget[];
	/** The active target, or `undefined` at node level / in page mode. */
	readonly activeTargetId: string | undefined;
}

/**
 * `‹Component› ▸ ‹Target›` plus the list that doubles as the picker.
 *
 * **Why this is a separate component and not inlined.** It is the only
 * part of the panel that depends on the canvas DOM, so it is the only
 * part that has to re-render when the canvas mutates. Subscribing here
 * keeps the property controls — twenty-odd `useStyleField` bindings —
 * out of the canvas's mutation path entirely; a drag repaints the
 * picker's presence state and nothing else.
 */
function StyleTargetNavigator({
	bridge,
	controller,
	componentName,
	nodeIds,
	targets,
	activeTargetId,
}: StyleTargetNavigatorProps): ReactNode {
	const msg = useMsg();
	const registry = bridge?.canvasRegistry ?? null;
	// Same subscription the canvas overlay uses (`canvas/overlay-root.tsx`):
	// the registry rebuilds lazily on DOM mutations and notifies, so
	// presence follows the render instead of freezing at first paint.
	const [, bump] = useReducer((count: number) => count + 1, 0);
	useEffect(() => {
		const unobserve = registry?.observe(bump);
		return () => unobserve?.();
	}, [registry]);

	const entries = targets.map((target) => ({
		target,
		presence: resolveTargetPresence(registry, nodeIds, target.id),
	}));
	const active = entries.find((entry) => entry.target.id === activeTargetId);
	const absentLabel = msg("studio.editor.target.absent");
	// The whole trail as one phrase, the same string the canvas live
	// region announces (`canvas/target-outline.tsx`) — so what a screen
	// reader hears in the panel and what it hears on canvas agree.
	const trail =
		active === undefined
			? componentName
			: msg("studio.editor.target.breadcrumb")
					.replace("{component}", componentName)
					.replace("{target}", active.target.label);

	return (
		<div className="flex flex-col gap-1.5" data-testid="ak-style-target-nav">
			<Breadcrumb aria-label={trail} data-testid="ak-style-breadcrumb">
				<BreadcrumbList className="text-[11px]">
					<BreadcrumbItem>
						{active === undefined ? (
							<BreadcrumbPage data-testid="ak-style-breadcrumb-component">
								{componentName}
							</BreadcrumbPage>
						) : (
							// Rung 1 of the same ladder `Escape` walks
							// (`shortcuts/registry.ts`): back to the node, still in
							// component mode. Leaving the mode is rung 2 and belongs
							// to the mode toggle, not here.
							<Button
								type="button"
								variant="link"
								size="xs"
								className="h-5 px-0 text-[11px] text-muted-foreground"
								onClick={() => controller.setTargetId(undefined)}
								data-testid="ak-style-breadcrumb-component"
							>
								{componentName}
							</Button>
						)}
					</BreadcrumbItem>
					{active === undefined ? null : (
						<>
							<BreadcrumbSeparator />
							<BreadcrumbItem>
								<BreadcrumbPage data-testid="ak-style-breadcrumb-target">
									{active.target.label}
								</BreadcrumbPage>
							</BreadcrumbItem>
						</>
					)}
					{active?.presence === "absent" ? (
						<BreadcrumbItem>
							<span
								className="text-[10px] text-[var(--ak-studio-muted-fg)]"
								data-testid="ak-style-breadcrumb-absent"
							>
								{absentLabel}
							</span>
						</BreadcrumbItem>
					) : null}
				</BreadcrumbList>
			</Breadcrumb>

			<ul
				className="flex flex-wrap gap-1"
				aria-label={msg("studio.editor.target.list")}
				data-testid="ak-style-target-list"
			>
				{entries.map(({ target, presence }) => (
					<li key={target.id}>
						<TargetPickerButton
							controller={controller}
							target={target}
							presence={presence}
							absentLabel={absentLabel}
							active={target.id === activeTargetId}
						/>
					</li>
				))}
			</ul>
		</div>
	);
}

/** One entry of the picker. Disabled exactly when proven absent. */
function TargetPickerButton({
	controller,
	target,
	presence,
	absentLabel,
	active,
}: {
	readonly controller: EditorSelectionController;
	readonly target: SelectionStyleTarget;
	readonly presence: TargetPresence;
	readonly absentLabel: string;
	readonly active: boolean;
}): ReactNode {
	const absent = presence === "absent";
	return (
		<Button
			type="button"
			variant={active ? "secondary" : "ghost"}
			size="xs"
			disabled={absent}
			aria-current={active ? "true" : undefined}
			title={absent ? absentLabel : undefined}
			onClick={() => {
				// Two calls, one state. `setMode` is what makes the canvas
				// agree; both are non-history by construction
				// (`react/editor/selection.ts`), so entering a target is not
				// something the author can undo into.
				controller.setMode("component");
				controller.setTargetId(target.id);
			}}
			data-testid={`ak-style-target-pick-${target.id}`}
			data-presence={presence}
		>
			{target.label}
			{absent ? (
				<span className="ml-1 text-[10px] opacity-70">{absentLabel}</span>
			) : null}
		</Button>
	);
}

/**
 * The roster entry `p4-009` registers. Exported from this file so the
 * promotion task wires the panel without editing it.
 */
export const STYLE_PANEL: StudioInspectorPanel = {
	id: "style",
	labelKey: "studio.editor.inspector.tab.style",
	render: () => <StylePanel />,
};
