"use client";

/**
 * @file `ComponentCanvasPanel` — the isolated component editing
 * surface (PLAN-0020 CORE-P2-009F/G; DD-DEC-010; DD-0019 §14.4,
 * §10.6).
 *
 * Renders the breadcrumb back to the page, the combination strip
 * (main component plus every expressible variant), and the scoped
 * node list for whichever combination is active.
 *
 * **Statically imported, deliberately** — matching
 * `EditorInspectorMount`. The `lazy(() => import(...))` boundary in
 * exactly this position never resolved in `apps/studio` (dev *and*
 * production; see the Phase 1B close), leaving the panel permanently
 * suspended. §28 impact is nil either way: the only caller ships
 * inside the async `StudioLayout` chunk, so these bytes never reach
 * the `<Studio>` entry chunk — verified against the budget.
 */

import type { SerializablePuckNode } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { Button } from "@/primitives/button";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import { useComponentCanvas } from "./use-component-canvas.js";
import { VariantAxisEditor } from "./VariantAxisEditor.js";

function isNode(value: unknown): value is SerializablePuckNode {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value) &&
		typeof (value as { type?: unknown }).type === "string"
	);
}

/** Flatten the projected document into a scoped node list (009G). */
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

/** The isolated component canvas; `null` outside a component scope. */
export function ComponentCanvasPanel(): ReactNode {
	const msg = useMsg();
	const canvas = useComponentCanvas();
	if (canvas === null) {
		return null;
	}

	const root = canvas.document.content?.[0];
	const rows = isNode(root) ? nodeRows(root) : [];

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
					onClick={canvas.exit}
					data-testid="ak-component-exit"
				>
					{msg("studio.editor.component.backToPage")}
				</Button>
				<span aria-hidden="true" className="text-[var(--ak-studio-muted-fg)]">
					/
				</span>
				<span className="truncate font-medium" data-testid="ak-component-name">
					{canvas.definition.name}
				</span>
			</nav>

			{canvas.combinations.length > 1 ? (
				<div
					role="tablist"
					aria-label={msg("studio.editor.component.variants")}
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

			{/* Variant axis authoring (ED-VARIANT-001). It lives here
			    because axes are definition state and definition edits
			    require this scope (freeze §6) — the form cannot be
			    rendered anywhere its submits would be valid. */}
			<VariantAxisEditor />
		</section>
	);
}
