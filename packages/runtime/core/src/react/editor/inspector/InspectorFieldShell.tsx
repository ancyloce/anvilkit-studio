"use client";

/**
 * @file `InspectorFieldShell` — the shared presentation frame every
 * universal inspector control renders inside (PLAN-0020
 * CORE-P1A-005; DD-0019 §11.3, ED-INSPECT-001).
 *
 * Owns the three cross-control affordances so each section control
 * stays a pure input:
 *
 * - **label** — resolved from the i18n catalog by the caller;
 * - **value-source display** — where the effective value comes from
 *   (base / a breakpoint / default), with inherited values shown
 *   muted (§12.3 provenance);
 * - **reset-at-layer** — visible only when the property is written at
 *   the active layer; dispatches the caller's `onReset` (a D-8
 *   `null`-patch through the port).
 *
 * All interactive elements are `@anvilkit/ui`-backed primitives
 * (repository rule — no hand-rolled controls).
 *
 * ### Layout
 *
 * `row` (the default) is the professional-inspector shape: a muted
 * label in a fixed-width gutter with the control filling the rest, so
 * a column of properties reads as one aligned list instead of a stack
 * of label/control pairs. Controls whose body is itself multi-row (box
 * edges, shadow layers, the gradient editor) pass `layout="stack"` and
 * keep the label above, which is the only shape that fits them at
 * inspector width.
 */

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/primitives/button";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import type { InspectorFieldState } from "./field-state.js";

/** Props for {@link InspectorFieldShell}. */
export interface InspectorFieldShellProps {
	readonly label: string;
	readonly state: InspectorFieldState<unknown>;
	/** Reset the property at the active layer. */
	readonly onReset: () => void;
	/** The control itself (input, select, toggle group, …). */
	readonly children: ReactNode;
	/** `row` = label gutter + control; `stack` = label above. */
	readonly layout?: "row" | "stack";
	readonly className?: string;
}

/** Human badge for the §12.3 value source. */
function sourceBadge(
	state: InspectorFieldState<unknown>,
	msg: (key: string, fallback?: string) => string,
): string | null {
	if (state.kind !== "value" && state.kind !== "unset") {
		return null;
	}
	const resolved = state.resolved;
	if (state.kind === "value" && state.writtenAtLayer) {
		return null;
	}
	if (resolved.source === "default") {
		return msg("studio.editor.inspector.source.default");
	}
	if (resolved.source === "base") {
		return msg("studio.editor.inspector.source.base");
	}
	// Breakpoint layers surface their id directly (labels join the
	// display with the CORE-P1A-008 toolbar).
	return resolved.source;
}

/** The shared field frame (label row + control + provenance). */
export function InspectorFieldShell({
	label,
	state,
	onReset,
	children,
	layout = "row",
	className,
}: InspectorFieldShellProps): ReactNode {
	const msg = useMsg();
	if (state.kind === "unsupported") {
		return null;
	}
	const badge = sourceBadge(state, msg);
	const writtenAtLayer = state.kind === "value" && state.writtenAtLayer;
	const row = layout === "row";

	const labelCell = (
		<div
			className={cn(
				"flex min-w-0 items-center gap-1",
				row ? "w-[38%] shrink-0 py-1.5" : "justify-between",
			)}
		>
			<span className="truncate text-[11px] font-medium text-[var(--ak-studio-muted-fg)]">
				{label}
			</span>
			<span className="flex shrink-0 items-center gap-0.5">
				{badge !== null ? (
					<span
						className="rounded bg-[var(--ak-studio-surface-2,transparent)] px-1 text-[10px] text-[var(--ak-studio-muted-fg)] opacity-80"
						data-testid="ak-inspector-source"
					>
						{badge}
					</span>
				) : null}
				{writtenAtLayer ? (
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-5"
						aria-label={msg("studio.editor.inspector.reset")}
						title={msg("studio.editor.inspector.reset")}
						onClick={onReset}
						data-testid="ak-inspector-reset"
					>
						<RotateCcw className="size-3" aria-hidden="true" />
					</Button>
				) : null}
			</span>
		</div>
	);

	const body =
		state.kind === "mixed" ? (
			<span
				className="rounded border border-dashed border-[var(--ak-studio-border)] px-2 py-1 text-[11px] text-[var(--ak-studio-muted-fg)] italic"
				data-testid="ak-inspector-mixed"
			>
				{msg("studio.editor.inspector.mixed")}
			</span>
		) : (
			children
		);

	return (
		<div
			className={cn(
				row ? "flex items-start gap-2" : "flex flex-col gap-1",
				className,
			)}
		>
			{labelCell}
			<div className={cn("flex min-w-0 flex-col gap-1", row && "flex-1")}>
				{body}
			</div>
		</div>
	);
}
