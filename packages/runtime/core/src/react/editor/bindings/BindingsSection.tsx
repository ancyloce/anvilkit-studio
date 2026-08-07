"use client";

/**
 * @file `BindingsSection` — the inspector's data-binding editor
 * (PLAN-0020 CORE-P3-006; ED-BIND-002/003; DD-0019 §19, §11.2).
 *
 * Covers the §32.4 scenario "bind props, conditions, and repeaters
 * through a host adapter": pick a source, pick what the binding drives
 * (a prop, visibility, or a repeat), write a path, and see live preview
 * data — including the containment failures, which are shown rather
 * than swallowed.
 *
 * ### Why failures are rendered, not hidden
 *
 * §19's caps mean a preview can time out, come back too large, or
 * resolve to nothing. Rendering an empty box in those cases would tell
 * the author their data is empty when in fact the request was refused.
 * Each `PreviewDataResult` failure reason gets its own message, and a
 * broken path is distinguished from an absent one.
 *
 * The section hides itself entirely when the host configured no
 * adapter — §19 makes the adapter the only source of bindable data, so
 * an editor with no adapter has nothing to offer.
 */

import type { BindingTarget, Binding } from "@anvilkit/contracts/editor";
import { type ReactNode, useMemo, useState } from "react";
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
	evaluateExpression,
	type PreviewDataResult,
} from "../../../editor/index.js";
import type { InspectorSectionProps } from "../inspector/sections-registry.js";
import { useBindingEditor } from "./use-binding-editor.js";

/** What a binding can drive (`BindingTarget` minus its payloads). */
const TARGET_KINDS = ["prop", "visibility", "repeat"] as const;
type TargetKind = (typeof TARGET_KINDS)[number];

/** Build a `BindingTarget` from the form's fields. */
function buildTarget(
	kind: TargetKind,
	propPath: string,
	itemName: string,
): BindingTarget {
	if (kind === "visibility") return { type: "visibility" };
	if (kind === "repeat") {
		return { type: "repeat", itemName: itemName.trim() || "item" };
	}
	return {
		type: "prop",
		path: propPath
			.split(".")
			.map((segment) => segment.trim())
			.filter((segment) => segment !== ""),
	};
}

/** One-line summary of an existing binding. */
function summarize(binding: Binding): string {
	const target =
		binding.target.type === "prop"
			? `prop ${binding.target.path.join(".")}`
			: binding.target.type === "repeat"
				? `repeat as ${binding.target.itemName}`
				: "visibility";
	const expression =
		binding.expression.type === "path"
			? `${binding.expression.root}.${binding.expression.path.join(".")}`
			: binding.expression.type;
	return `${target} ← ${expression}`;
}

/** The §19 bindings editor; `null` when the host has no adapter. */
export function BindingsSection({ context }: InspectorSectionProps): ReactNode {
	const msg = useMsg();

	const [kind, setKind] = useState<TargetKind>("prop");
	const [sourceId, setSourceId] = useState("");
	const editor = useBindingEditor(context, sourceId);
	const [dataPath, setDataPath] = useState("");
	const [propPath, setPropPath] = useState("");
	const [itemName, setItemName] = useState("item");
	const [busy, setBusy] = useState(false);

	const preview = editor?.preview ?? null;

	/**
	 * Evaluate the author's path against live preview data, so the row
	 * below the form answers "will this resolve?" before they commit.
	 */
	const resolved = useMemo(() => {
		if (preview?.status !== "data") return null;
		return evaluateExpression(
			{
				type: "path",
				root: "data",
				path: dataPath
					.split(".")
					.map((segment) => segment.trim())
					.filter((segment) => segment !== ""),
			},
			{ data: preview.value },
		);
	}, [preview, dataPath]);

	if (editor === null) return null;

	async function onSave(): Promise<void> {
		if (busy || editor === null) return;
		setBusy(true);
		try {
			await editor.saveBinding({
				target: buildTarget(kind, propPath, itemName),
				dataPath: dataPath
					.split(".")
					.map((segment) => segment.trim())
					.filter((segment) => segment !== ""),
			});
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2" data-testid="ak-bindings-section">
			{editor.bindings.length === 0 ? (
				<p className="text-[11px] text-[var(--ak-studio-muted-fg)]">
					{msg("studio.editor.binding.empty")}
				</p>
			) : (
				<ul className="flex flex-col gap-1">
					{editor.bindings.map((binding) => (
						<li
							key={binding.id}
							className="truncate rounded border border-[var(--ak-studio-border)] px-2 py-1 text-[11px]"
							data-testid="ak-binding-row"
						>
							{summarize(binding)}
						</li>
					))}
				</ul>
			)}

			<div className="flex flex-col gap-1">
				<Label htmlFor="ak-binding-source" className="text-[11px]">
					{msg("studio.editor.binding.source")}
				</Label>
				<Select
					value={sourceId}
					onValueChange={(next) => {
						if (next !== null) setSourceId(next);
					}}
				>
					<SelectTrigger
						id="ak-binding-source"
						size="sm"
						className="h-7 text-[11px]"
						data-testid="ak-binding-source"
					>
						<SelectValue
							placeholder={msg("studio.editor.binding.sourcePlaceholder")}
						/>
					</SelectTrigger>
					<SelectContent>
						{editor.sources.map((source) => (
							<SelectItem key={source.id} value={source.id}>
								{source.name}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-1">
				<Label htmlFor="ak-binding-kind" className="text-[11px]">
					{msg("studio.editor.binding.target")}
				</Label>
				<Select
					value={kind}
					onValueChange={(next) => {
						if (next !== null) setKind(next as TargetKind);
					}}
				>
					<SelectTrigger
						id="ak-binding-kind"
						size="sm"
						className="h-7 text-[11px]"
						data-testid="ak-binding-kind"
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
				<Input
					value={propPath}
					onChange={(event) => setPropPath(event.target.value)}
					placeholder={msg("studio.editor.binding.propPlaceholder")}
					aria-label={msg("studio.editor.binding.propLabel")}
					className="h-7 text-[11px]"
					data-testid="ak-binding-prop"
				/>
			) : null}

			{kind === "repeat" ? (
				<Input
					value={itemName}
					onChange={(event) => setItemName(event.target.value)}
					placeholder={msg("studio.editor.binding.itemNamePlaceholder")}
					aria-label={msg("studio.editor.binding.itemNameLabel")}
					className="h-7 text-[11px]"
					data-testid="ak-binding-item-name"
				/>
			) : null}

			<Input
				value={dataPath}
				onChange={(event) => setDataPath(event.target.value)}
				placeholder={msg("studio.editor.binding.pathPlaceholder")}
				aria-label={msg("studio.editor.binding.pathLabel")}
				className="h-7 text-[11px]"
				data-testid="ak-binding-path"
			/>

			<PreviewStatus preview={preview} resolved={resolved} />

			<Button
				type="button"
				size="sm"
				variant="ghost"
				className="h-6 self-start px-2 text-[11px]"
				disabled={busy || sourceId === "" || dataPath.trim() === ""}
				onClick={() => {
					void onSave();
				}}
				data-testid="ak-binding-save"
			>
				{msg("studio.editor.binding.save")}
			</Button>

			{editor.lastErrors.length > 0 ? (
				<ul
					className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
					data-testid="ak-binding-errors"
				>
					{editor.lastErrors.map((message) => (
						<li key={message}>{message}</li>
					))}
				</ul>
			) : null}
		</div>
	);
}

/**
 * Preview + path resolution feedback.
 *
 * Every §19 containment failure gets a distinct message: an author who
 * hit the 2 MiB cap must not be told their data is empty.
 */
function PreviewStatus({
	preview,
	resolved,
}: {
	readonly preview: PreviewDataResult | null;
	readonly resolved: ReturnType<typeof evaluateExpression> | null;
}): ReactNode {
	const msg = useMsg();
	if (preview === null) return null;

	if (preview.status === "failed") {
		return (
			<p
				className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
				data-testid="ak-binding-preview-failed"
				data-reason={preview.reason}
			>
				{msg(`studio.editor.binding.preview.${preview.reason}`)}
			</p>
		);
	}

	if (resolved === null) return null;

	if (resolved.status === "value") {
		return (
			<p
				className="truncate text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-binding-preview-value"
			>
				{JSON.stringify(resolved.value).slice(0, 120)}
			</p>
		);
	}

	// `missing` and `rejected` are different problems: a path that is not
	// there yet vs one the evaluator refused to walk.
	return (
		<p
			className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
			data-testid="ak-binding-preview-unresolved"
			data-status={resolved.status}
		>
			{msg(
				resolved.status === "missing"
					? "studio.editor.binding.preview.missingPath"
					: "studio.editor.binding.preview.rejectedPath",
			)}
		</p>
	);
}
