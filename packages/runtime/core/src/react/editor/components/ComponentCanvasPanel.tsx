"use client";

/**
 * @file `ComponentCanvasPanel` — the **legacy Layers-rail** mount of
 * the definition-editing scope (PLAN-0020 CORE-P2-009F/G; DD-DEC-010;
 * DD-0019 §14.4, §10.6).
 *
 * **Statically imported, deliberately** — matching
 * `EditorInspectorMount`. The `lazy(() => import(...))` boundary in
 * exactly this position never resolved in `apps/studio` (dev *and*
 * production; see the Phase 1B close), leaving the panel permanently
 * suspended. §28 impact is nil either way: the only caller ships
 * inside the async `StudioLayout` chunk, so these bytes never reach
 * the `<Studio>` entry chunk — verified against the budget.
 *
 * ### `p5-007` re-homed the surface; this file kept the mount
 *
 * PLAN-0026 §3.8.4's finding was that `p3-007` renamed the state
 * field (`scope` → `definitionScope`) without moving the surface out
 * of the rail. The combination strip and the scoped node list now
 * live in {@link DefinitionScopeCanvas}, which the promoted shell's
 * Components tab mounts as well — so the two shells run **one**
 * implementation, and this file is what is left of the rail-only
 * mount: the breadcrumb, the shared canvas, and the variant-axis
 * form.
 *
 * The breadcrumb reads the open definition straight out of the
 * document model instead of through `useComponentCanvas`, because
 * {@link DefinitionScopeCanvas} owns that hook — calling it twice
 * would give the breadcrumb and the strip two independent
 * "which combination is active" states. The name lookup is a field
 * read on a projection this legacy surface can afford; the promoted
 * shell's banner takes the model it already holds.
 *
 * **Split in two by `p5-006`**, and the split is kept: the outer
 * component reads only the selection's `definitionScope` — cheap, and
 * available without the document — and the body mounts only *inside*
 * a component scope. The Layers panel renders this on every one of
 * its renders, and page scope is the overwhelmingly common case.
 */

import type { ReactNode } from "react";
import { Button } from "@/primitives/button";
import { useMsg } from "@/state/editor-i18n-context";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { useOptionalDocumentModel } from "../use-document-model.js";
import { DefinitionScopeCanvas } from "./DefinitionScope.js";
import { useComponentEditorRuntime } from "./editor-runtime.js";
import { scopedDefinitionId } from "./scope.js";
import { VariantAxisEditor } from "./VariantAxisEditor.js";

/** The isolated definition canvas; `null` outside a definition scope. */
export function ComponentCanvasPanel(): ReactNode {
	const selection = useShellSelection();
	if (scopedDefinitionId(selection.definitionScope) === undefined) {
		return null;
	}
	return <ComponentCanvasBody />;
}

/** The panel itself. Mounted only inside a definition scope. */
function ComponentCanvasBody(): ReactNode {
	const msg = useMsg();
	const model = useOptionalDocumentModel();
	const runtime = useComponentEditorRuntime();
	const selection = useShellSelection();
	const definitionId = scopedDefinitionId(selection.definitionScope);
	const definition =
		definitionId === undefined
			? undefined
			: model?.componentLibrary?.definitions[definitionId];
	// A scope pointing at a definition that no longer exists renders
	// nothing rather than a shell with an empty name.
	if (definition === undefined) {
		return null;
	}

	return (
		<section
			className="flex flex-col gap-2 p-2"
			aria-label={msg("studio.editor.component.canvas")}
			data-testid="ak-component-canvas"
		>
			<nav
				className="flex items-center gap-1 text-xs"
				aria-label={msg("studio.editor.component.breadcrumb")}
			>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[11px]"
					onClick={runtime.exitComponent}
					data-testid="ak-component-exit"
				>
					{msg("studio.editor.component.backToPage")}
				</Button>
				<span aria-hidden="true" className="text-[var(--ak-studio-muted-fg)]">
					/
				</span>
				<span className="truncate font-medium" data-testid="ak-component-name">
					{definition.name}
				</span>
			</nav>

			<DefinitionScopeCanvas />

			{/* Variant axis authoring (ED-VARIANT-001). It lives here
			    because axes are definition state and definition edits
			    require this scope (freeze §6) — the form cannot be
			    rendered anywhere its submits would be valid. The promoted
			    shell gives it its own Variants tab instead, so the two
			    shells never render it twice. */}
			<VariantAxisEditor />
		</section>
	);
}
