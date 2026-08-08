"use client";

/**
 * @file The **definition-editing scope** surfaces (PLAN-0028
 * `p5-007`; PLAN-0026 §3.8.4; DD-0019 `ED-FA-013`, §14.4, §10.6).
 *
 * `p3-007` renamed the state field (`scope` → `definitionScope`) but
 * left the surface where it was: reachable only from the legacy
 * Layers rail, through {@link ComponentCanvasPanel}. This module is
 * the re-homing. It owns the two views of the scope, and both mount
 * in the promoted shell:
 *
 * - {@link DefinitionScopeBanner} — the **canvas column**, so that
 *   "I am editing a definition, not the page" is visible where the
 *   author is looking rather than only in an inspector tab, and so
 *   the way out is one click from the canvas.
 * - {@link DefinitionScopeCanvas} — the **inspector**: the
 *   combination strip (main component plus every expressible variant)
 *   and the scoped node list for whichever combination is active.
 *
 * `ComponentCanvasPanel` now renders the same
 * {@link DefinitionScopeCanvas}, so the legacy rail and the promoted
 * shell are one implementation rather than two that can drift.
 *
 * ## This is NOT `p5-002`'s component mode, and the strings say so
 *
 * Two shell modes could plausibly both be called "component mode",
 * and a product that ships both under one name pays for it in support
 * for as long as it exists. They are kept apart deliberately:
 *
 * | | what it edits | vocabulary |
 * |---|---|---|
 * | `p5-002` component mode | one **instance's** declared elements, in place on the page | `studio.editor.mode.*` / `studio.editor.target.*` — "Elements" |
 * | this scope | the **definition** itself, and each of its variants | `studio.editor.definition.*` / `studio.editor.component.*` — "definition" |
 *
 * So: an author "edits elements" inside an instance, and "opens a
 * definition" to change the component everywhere. No string in either
 * set names the other's concept.
 *
 * ## §10.6 fencing is the controller's, and stays there
 *
 * A selection can never span scopes, and changing scope clears it.
 * That is enforced once, in `react/editor/selection.ts:292-300`
 * (`setDefinitionScope` commits `selectedIds: []` on every change),
 * and reached from here only through
 * `scope.ts`'s `EditorScopeController`. Nothing in this file sets the
 * scope directly, so there is no path that could enter or leave a
 * definition without clearing the selection.
 *
 * ## Puck contract
 *
 * Rule 2 — the scope edits the contents of the declared
 * `root.props.componentLibrary` root prop; it introduces no second
 * document. The projection the strip and the node list render
 * (`componentDocument`) is a pure function of one `ComponentDefinition`
 * read out of that prop, and a fold goes back through the same commit
 * helpers as every other definition edit. Which definition is open,
 * and which combination is active, are transient editor state: no
 * history entry, nothing in `Data`.
 */

import type { SerializablePuckNode } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { Button } from "@/primitives/button";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import type { DocumentModel } from "../../../document-model/index.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { useComponentEditorRuntime } from "./editor-runtime.js";
import { scopedDefinitionId } from "./scope.js";
import { useComponentCanvas } from "./use-component-canvas.js";

function isNode(value: unknown): value is SerializablePuckNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string"
	);
}

/** Flatten the projected definition document into a node list. */
function nodeRows(
	node: SerializablePuckNode,
	depth = 0,
): readonly { id: string; type: string; depth: number }[] {
	const id = node.props.id;
	const self =
		typeof id === "string"
			? [{ id, type: node.type, depth }]
			: ([] as { id: string; type: string; depth: number }[]);
	const children = Object.values(node.props).flatMap((value) =>
		Array.isArray(value)
			? value.flatMap((child) =>
					isNode(child) ? nodeRows(child, depth + 1) : [],
				)
			: [],
	);
	return [...self, ...children];
}

/** Props for {@link DefinitionScopeBanner}. */
export interface DefinitionScopeBannerProps {
	/**
	 * The live document, passed rather than projected again: the canvas
	 * column already holds one and `readDocument` is the expensive part
	 * of every composition hook. The banner needs exactly one field of
	 * it — the open definition's name.
	 */
	readonly model: DocumentModel;
}

/**
 * The canvas-column banner. `null` in page scope.
 *
 * Says what is being edited and offers the way out. It does **not**
 * claim the page canvas is showing the definition — it is not; the
 * canvas below stays on the page, and the banner's whole job is to
 * make that state legible instead of leaving the author wondering why
 * their edits are not appearing where they expect.
 */
export function DefinitionScopeBanner({
	model,
}: DefinitionScopeBannerProps): ReactNode {
	const msg = useMsg();
	const runtime = useComponentEditorRuntime();
	const selection = useShellSelection();
	const definitionId = scopedDefinitionId(selection.definitionScope);
	if (definitionId === undefined) {
		return null;
	}
	const definition = model.componentLibrary?.definitions[definitionId];

	return (
		<div
			className="flex shrink-0 items-center gap-2 border-b border-[var(--ak-studio-border)] bg-[var(--ak-studio-layer-selection)] px-2 py-1 text-[11px]"
			data-testid="ak-definition-scope-banner"
			data-definition-id={definitionId}
		>
			<span className="shrink-0 text-[var(--ak-studio-muted-fg)]">
				{msg("studio.editor.definition.scope")}
			</span>
			<span
				className="min-w-0 flex-1 truncate font-medium"
				data-testid="ak-definition-scope-name"
			>
				{definition?.name ?? definitionId}
			</span>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-5 shrink-0 px-1.5 text-[10px]"
				onClick={runtime.exitComponent}
				data-testid="ak-definition-scope-exit"
			>
				{msg("studio.editor.component.backToPage")}
			</Button>
		</div>
	);
}

/**
 * The inspector-side definition canvas: combination strip plus the
 * scoped node list. `null` in page scope.
 *
 * Split in two the way `p5-006` split `ComponentCanvasPanel`: the
 * outer component reads only the selection's `definitionScope`, which
 * is cheap and needs no document, and the body — which projects the
 * whole read model through `useComponentCanvas` — mounts only inside
 * a scope. Page scope is the overwhelmingly common case and must not
 * pay for a projection just to discover nothing is open.
 */
export function DefinitionScopeCanvas(): ReactNode {
	const selection = useShellSelection();
	if (scopedDefinitionId(selection.definitionScope) === undefined) {
		return null;
	}
	return <DefinitionScopeCanvasBody />;
}

function DefinitionScopeCanvasBody(): ReactNode {
	const msg = useMsg();
	const canvas = useComponentCanvas();
	if (canvas === null) {
		return null;
	}

	const root = canvas.document.content?.[0];
	const rows = isNode(root) ? nodeRows(root) : [];

	return (
		<div
			className="flex flex-col gap-2"
			data-testid="ak-definition-scope-canvas"
			data-active-combination={canvas.activeKey}
		>
			{canvas.combinations.length > 1 ? (
				<div
					role="tablist"
					aria-label={msg("studio.editor.definition.combinations")}
					className="flex flex-wrap gap-1"
					data-testid="ak-component-variant-strip"
				>
					{canvas.combinations.map((combination) => (
						<button
							key={combination.key}
							type="button"
							role="tab"
							aria-selected={combination.key === canvas.activeKey}
							onClick={() => canvas.setActive(combination.key)}
							className={cn(
								"rounded border px-2 py-1 text-[11px] transition-colors",
								combination.key === canvas.activeKey
									? "border-[var(--ak-studio-border)] bg-[var(--ak-studio-layer-selection)]"
									: "border-transparent hover:bg-[var(--ak-studio-hover)]",
								combination.declared
									? null
									: "text-[var(--ak-studio-muted-fg)]",
							)}
							data-testid="ak-component-variant-tab"
						>
							{combination.label}
							{combination.declared ? null : (
								// An expressible combination with no variant yet —
								// selecting it shows the base, which is what the
								// user would get today.
								<span aria-hidden="true"> +</span>
							)}
						</button>
					))}
				</div>
			) : null}

			<ul className="flex flex-col gap-0.5" data-testid="ak-component-layers">
				{rows.map((row) => (
					<li
						key={row.id}
						className="truncate text-[11px]"
						style={{ paddingInlineStart: `${row.depth * 12}px` }}
						data-testid="ak-component-layer-row"
					>
						{row.type}
					</li>
				))}
			</ul>
		</div>
	);
}
