"use client";

/**
 * @file `DataPanel` — the composition inspector's Data tab: bindings
 * and data-source wiring (PLAN-0028 `p4-002`, PLAN-0026 §3.5).
 *
 * A rebase of `react/editor/bindings/BindingsSection.tsx` onto the
 * canonical read/commit path. The form vocabulary and the preview
 * feedback are the *same modules* the old section uses
 * (`bindings/binding-form.tsx`), which matters more here than
 * anywhere else in P4: DD-0019 §19's containment failures each get a
 * distinct message, and a second implementation that collapsed
 * "hit the 2 MiB cap" into "no data" would look correct and mislead.
 *
 * Reads come from {@link useNodeBindings}; writes from
 * `useBindingsCommit` — one functional `setData` per intent,
 * `recordHistory: true`, so an edit is one undo.
 *
 * ### Two independent availability axes, reported separately
 *
 * - The component may not declare the `bindings` carrier.
 * - The host may have configured no data-source adapter — §19 makes
 *   the adapter the only source of bindable data.
 *
 * Collapsing these into one empty state would tell an author their
 * component cannot be bound when in fact the editor simply has no
 * data, so they are distinguished (§8.5: the host may not fabricate
 * support, and it may not misattribute its absence either).
 */

import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { Label } from "@/primitives/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import {
	buildBindingTarget,
	splitPath,
	summarizeBinding,
	TARGET_KINDS,
	type TargetKind,
} from "../bindings/binding-form.js";
import { useDataSources } from "../bindings/use-data-sources.js";
import { useNodeBindings } from "./data/use-node-bindings.js";
import type { StudioInspectorPanel } from "./inspector-panel.js";

/** The Data tab body. Must render inside `<Puck>`. */
export function DataPanel(): ReactNode {
	const msg = useMsg();
	const state = useNodeBindings();
	const sources = useDataSources();
	const [kind, setKind] = useState<TargetKind>("prop");
	const [propPath, setPropPath] = useState("");
	const [itemName, setItemName] = useState("");
	const [expressionPath, setExpressionPath] = useState("");

	if (state.nodeId === null) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-data-panel-empty"
			>
				{msg("studio.fields.empty")}
			</p>
		);
	}

	if (!state.declared) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-data-panel-undeclared"
			>
				{msg("studio.editor.inspector.tab.data.empty")}
			</p>
		);
	}

	// A declaring component with no host adapter: a different answer
	// from "this component cannot be bound", and it says so.
	if (sources.status !== "ready" || sources.sources.length === 0) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-data-panel-no-adapter"
				data-source-status={sources.status}
			>
				{msg("studio.editor.binding.preview.no-adapter")}
			</p>
		);
	}

	const segments = splitPath(expressionPath);
	const canAdd =
		segments.length > 0 && (kind !== "prop" || splitPath(propPath).length > 0);

	return (
		<div
			className="flex flex-col gap-3"
			data-testid="ak-data-panel"
			data-node-id={state.nodeId}
			data-binding-count={state.bindings.length}
		>
			<ul className="flex flex-col gap-1" data-testid="ak-binding-list">
				{state.bindings.map((binding) => (
					<li
						key={binding.id}
						data-testid={`ak-binding-${binding.id}`}
						className="flex items-center justify-between gap-2 rounded border border-[var(--ak-studio-border)] px-2 py-1"
					>
						<span className="min-w-0 truncate text-[11px]">
							{summarizeBinding(binding)}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							data-testid={`ak-binding-remove-${binding.id}`}
							onClick={() => state.removeBinding(binding.id)}
						>
							{msg("studio.field.array.remove")}
						</Button>
					</li>
				))}
			</ul>

			<div className="flex flex-col gap-1">
				<Label htmlFor="ak-binding-kind" className="text-[11px]">
					{msg("studio.editor.binding.target")}
				</Label>
				<Select
					value={kind}
					onValueChange={(next) => {
						if (typeof next === "string") setKind(next as TargetKind);
					}}
				>
					<SelectTrigger
						id="ak-binding-kind"
						data-testid="ak-binding-kind"
						className="h-7 text-[11px]"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TARGET_KINDS.map((entry) => (
							<SelectItem key={entry} value={entry}>
								{msg(`studio.editor.binding.target.${entry}`)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{kind === "prop" ? (
				<div className="flex flex-col gap-1">
					<Label htmlFor="ak-binding-prop-path" className="text-[11px]">
						{msg("studio.editor.binding.propLabel")}
					</Label>
					<Input
						id="ak-binding-prop-path"
						data-testid="ak-binding-prop-path"
						className="h-7 text-[11px]"
						value={propPath}
						onChange={(event) => setPropPath(event.target.value)}
					/>
				</div>
			) : null}

			{kind === "repeat" ? (
				<div className="flex flex-col gap-1">
					<Label htmlFor="ak-binding-item-name" className="text-[11px]">
						{msg("studio.editor.binding.itemNameLabel")}
					</Label>
					<Input
						id="ak-binding-item-name"
						data-testid="ak-binding-item-name"
						className="h-7 text-[11px]"
						value={itemName}
						onChange={(event) => setItemName(event.target.value)}
					/>
				</div>
			) : null}

			<div className="flex flex-col gap-1">
				<Label htmlFor="ak-binding-expression" className="text-[11px]">
					{msg("studio.editor.binding.pathLabel")}
				</Label>
				<Input
					id="ak-binding-expression"
					data-testid="ak-binding-expression"
					className="h-7 text-[11px]"
					value={expressionPath}
					onChange={(event) => setExpressionPath(event.target.value)}
				/>
			</div>

			<Button
				type="button"
				size="sm"
				disabled={!canAdd}
				data-testid="ak-binding-add"
				onClick={() => {
					if (!canAdd) return;
					state.addBinding(buildBindingTarget(kind, propPath, itemName), {
						type: "path",
						root: "data",
						path: segments,
					});
					setPropPath("");
					setItemName("");
					setExpressionPath("");
				}}
			>
				{msg("studio.editor.binding.save")}
			</Button>

			{state.lastErrors.length > 0 ? (
				<ul className="flex flex-col gap-0.5" data-testid="ak-binding-errors">
					{state.lastErrors.map((error) => (
						<li
							key={error}
							className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
						>
							{error}
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/**
 * The roster entry `p4-009` registers. Exported from this file so the
 * promotion task wires the panel without editing it.
 */
export const DATA_PANEL: StudioInspectorPanel = {
	id: "data",
	labelKey: "studio.editor.inspector.tab.data",
	render: () => <DataPanel />,
};
