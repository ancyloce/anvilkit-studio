"use client";

/**
 * @file The binding editor's shared form vocabulary and its preview
 * feedback (PLAN-0028 `p4-002`).
 *
 * Extracted from `BindingsSection.tsx` **unchanged in behaviour** so the
 * composition `DataPanel` rebases that surface rather than reimplements
 * it. Two things live here because divergence between the two surfaces
 * would be a real defect, not a cosmetic one:
 *
 * - {@link buildBindingTarget} — the only place a `BindingTarget` is
 *   assembled from form fields, including the `"item"` fallback and the
 *   empty-segment filtering a hand-rolled second copy would forget;
 * - {@link BindingPreviewStatus} — DD-0019 §19's containment failures
 *   each get a *distinct* message. An author who hit the 2 MiB cap must
 *   not be told their data is empty, and a broken path must not read
 *   like an absent one. A second implementation that collapsed those
 *   cases would look correct and mislead.
 */

import type { Binding, BindingTarget } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useMsg } from "@/state/editor-i18n-context";
import type {
	evaluateExpression,
	PreviewDataResult,
} from "../../../editor/index.js";

/** What a binding can drive (`BindingTarget` minus its payloads). */
export const TARGET_KINDS = ["prop", "visibility", "repeat"] as const;

export type TargetKind = (typeof TARGET_KINDS)[number];

/** Split a dotted path into non-empty, trimmed segments. */
export function splitPath(path: string): readonly string[] {
	return path
		.split(".")
		.map((segment) => segment.trim())
		.filter((segment) => segment !== "");
}

/** Build a `BindingTarget` from the form's fields. */
export function buildBindingTarget(
	kind: TargetKind,
	propPath: string,
	itemName: string,
): BindingTarget {
	if (kind === "visibility") return { type: "visibility" };
	if (kind === "repeat") {
		return { type: "repeat", itemName: itemName.trim() || "item" };
	}
	return { type: "prop", path: splitPath(propPath) };
}

/** One-line summary of an existing binding. */
export function summarizeBinding(binding: Binding): string {
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

/** Props for {@link BindingPreviewStatus}. */
export interface BindingPreviewStatusProps {
	readonly preview: PreviewDataResult | null;
	readonly resolved: ReturnType<typeof evaluateExpression> | null;
}

/**
 * Preview + path resolution feedback.
 *
 * Every §19 containment failure gets a distinct message: an author who
 * hit the 2 MiB cap must not be told their data is empty.
 */
export function BindingPreviewStatus({
	preview,
	resolved,
}: BindingPreviewStatusProps): ReactNode {
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
