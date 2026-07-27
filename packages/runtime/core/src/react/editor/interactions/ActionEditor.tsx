"use client";

/**
 * @file `ActionEditor` — per-family editors for the §16 action set
 * (PLAN-0020 CORE-P3-001; ED-INT-002).
 *
 * §16 declares six action families (navigate, url, scroll, visibility,
 * variant, animate) and this renders the fields each one needs, then
 * hands back a complete {@link InteractionAction}. Keeping assembly
 * here — rather than in the section — means the section never has to
 * know which fields belong to which family.
 *
 * ### Why the draft is a discriminated union
 *
 * Each family needs different fields, and a flat bag of optionals would
 * let an incomplete action be submitted (a `scroll` with no target, a
 * `variant` with no selection). The draft mirrors the action union, so
 * {@link buildAction} can return `null` for "not ready yet" and the
 * caller simply disables the button.
 *
 * ### Scope note on `animate`
 *
 * This edits a **single** tween step. Multi-step sequencing, stagger
 * and parallel composition are the timeline editor's job
 * (CORE-P3-003, ED-TIMELINE-001) — the contract supports them and
 * `buildMotionSchedule` already normalises them; only this form is
 * deliberately narrow.
 */

import type {
	AnimatableProperty,
	InteractionAction,
	VariantAxis,
} from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { Checkbox } from "@/primitives/checkbox";
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
import type { InteractionTargetOption } from "./use-interactions.js";

/** The action families offered, in §16's declaration order. */
export const ACTION_KINDS = [
	"url",
	"navigate",
	"scroll",
	"visibility",
	"variant",
	"animate",
] as const;

export type ActionKind = (typeof ACTION_KINDS)[number];

/** Animatable properties offered by the single-step animate form. */
const ANIMATABLE: readonly AnimatableProperty[] = [
	"opacity",
	"translateX",
	"translateY",
	"scale",
	"rotate",
	"backgroundColor",
	"textColor",
	"borderColor",
	"radius",
];

/** In-progress action fields. */
export interface ActionDraft {
	readonly kind: ActionKind;
	readonly url: string;
	readonly newTab: boolean;
	readonly pageId: string;
	readonly targetNodeId: string;
	readonly scrollBehavior: "smooth" | "instant";
	readonly visibility: "show" | "hide" | "toggle";
	readonly axisId: string;
	readonly optionId: string;
	readonly property: AnimatableProperty;
	readonly to: string;
	readonly durationMs: string;
}

/** A blank draft. */
export const EMPTY_ACTION_DRAFT: ActionDraft = {
	kind: "url",
	url: "",
	newTab: false,
	pageId: "",
	targetNodeId: "",
	scrollBehavior: "smooth",
	visibility: "toggle",
	axisId: "",
	optionId: "",
	property: "opacity",
	to: "0",
	durationMs: "300",
};

/** The §16 default easing — a standard ease-in-out curve. */
const DEFAULT_EASING = [0.4, 0, 0.2, 1] as const;

/**
 * Assemble a complete action, or `null` when the draft is incomplete.
 *
 * Returning `null` rather than a partial action keeps invalid
 * interactions out of the command pipeline entirely — the caller
 * disables submission instead of relying on validation to reject.
 */
export function buildAction(draft: ActionDraft): InteractionAction | null {
	switch (draft.kind) {
		case "url": {
			const url = draft.url.trim();
			if (url === "") return null;
			return draft.newTab
				? { type: "url", url, newTab: true }
				: { type: "url", url };
		}
		case "navigate": {
			const pageId = draft.pageId.trim();
			return pageId === "" ? null : { type: "navigate", pageId };
		}
		case "scroll":
			return draft.targetNodeId === ""
				? null
				: {
						type: "scroll",
						targetNodeId: draft.targetNodeId,
						behavior: draft.scrollBehavior,
					};
		case "visibility":
			return draft.targetNodeId === ""
				? null
				: {
						type: "visibility",
						targetNodeId: draft.targetNodeId,
						operation: draft.visibility,
					};
		case "variant":
			if (
				draft.targetNodeId === "" ||
				draft.axisId === "" ||
				draft.optionId === ""
			) {
				return null;
			}
			return {
				type: "variant",
				targetNodeId: draft.targetNodeId,
				selection: { [draft.axisId]: draft.optionId },
			};
		case "animate": {
			const durationMs = Number(draft.durationMs);
			if (draft.targetNodeId === "" || !Number.isFinite(durationMs)) {
				return null;
			}
			// Numeric-valued properties are parsed; colours stay strings.
			const numeric = Number(draft.to);
			const value = Number.isFinite(numeric) ? numeric : draft.to;
			return {
				type: "animate",
				targetNodeIds: [draft.targetNodeId],
				composition: "sequence",
				steps: [
					{
						to: { [draft.property]: value },
						transition: {
							type: "tween",
							durationMs,
							easing: DEFAULT_EASING,
						},
					},
				],
			};
		}
		default:
			return null;
	}
}

/** Props for {@link ActionEditor}. */
export interface ActionEditorProps {
	readonly draft: ActionDraft;
	readonly onChange: (next: ActionDraft) => void;
	readonly targets: readonly InteractionTargetOption[];
	readonly pages: readonly { readonly id: string; readonly name: string }[];
	readonly variantAxes: readonly VariantAxis[];
}

/** Fields for whichever action family is selected. */
export function ActionEditor({
	draft,
	onChange,
	targets,
	pages,
	variantAxes,
}: ActionEditorProps): ReactNode {
	const msg = useMsg();
	const patch = (next: Partial<ActionDraft>): void =>
		onChange({ ...draft, ...next });

	const targetPicker = (
		<div className="flex flex-col gap-1">
			<Label htmlFor="ak-action-target" className="text-[11px]">
				{msg("studio.editor.interaction.action.target")}
			</Label>
			<Select
				value={draft.targetNodeId}
				onValueChange={(next) => {
					if (next !== null) patch({ targetNodeId: next });
				}}
			>
				<SelectTrigger
					id="ak-action-target"
					size="sm"
					className="h-7 text-[11px]"
					data-testid="ak-action-target"
				>
					<SelectValue
						placeholder={msg(
							"studio.editor.interaction.action.targetPlaceholder",
						)}
					/>
				</SelectTrigger>
				<SelectContent>
					{targets.map((target) => (
						<SelectItem key={target.id} value={target.id}>
							{target.label}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);

	return (
		<div className="flex flex-col gap-2" data-testid="ak-action-editor">
			<Select
				value={draft.kind}
				onValueChange={(next) => {
					if (next !== null) patch({ kind: next as ActionKind });
				}}
			>
				<SelectTrigger
					size="sm"
					className="h-7 text-[11px]"
					aria-label={msg("studio.editor.interaction.action.kind")}
					data-testid="ak-action-kind"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{ACTION_KINDS.map((kind) => (
						<SelectItem key={kind} value={kind}>
							{msg(`studio.editor.interaction.action.${kind}`)}
						</SelectItem>
					))}
				</SelectContent>
			</Select>

			{draft.kind === "url" ? (
				<>
					<Input
						type="url"
						value={draft.url}
						onChange={(event) => patch({ url: event.target.value })}
						placeholder={msg("studio.editor.interaction.urlPlaceholder")}
						aria-label={msg("studio.editor.interaction.urlLabel")}
						className="h-7 text-[11px]"
						data-testid="ak-interaction-url"
					/>
					<div className="flex items-center gap-1.5 text-[11px]">
						<Checkbox
							id="ak-action-newtab"
							checked={draft.newTab}
							onCheckedChange={(checked) =>
								patch({ newTab: checked === true })
							}
							data-testid="ak-action-newtab"
						/>
						<Label htmlFor="ak-action-newtab" className="text-[11px]">
							{msg("studio.editor.interaction.action.newTab")}
						</Label>
					</div>
				</>
			) : null}

			{draft.kind === "navigate" ? (
				pages.length > 0 ? (
					<Select
						value={draft.pageId}
						onValueChange={(next) => {
							if (next !== null) patch({ pageId: next });
						}}
					>
						<SelectTrigger
							size="sm"
							className="h-7 text-[11px]"
							aria-label={msg("studio.editor.interaction.action.page")}
							data-testid="ak-action-page"
						>
							<SelectValue
								placeholder={msg(
									"studio.editor.interaction.action.pagePlaceholder",
								)}
							/>
						</SelectTrigger>
						<SelectContent>
							{pages.map((page) => (
								<SelectItem key={page.id} value={page.id}>
									{page.name}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				) : (
					// No page adapter: the host still owns page ids, so accept
					// one rather than hiding the family entirely.
					<Input
						value={draft.pageId}
						onChange={(event) => patch({ pageId: event.target.value })}
						placeholder={msg(
							"studio.editor.interaction.action.pagePlaceholder",
						)}
						aria-label={msg("studio.editor.interaction.action.page")}
						className="h-7 text-[11px]"
						data-testid="ak-action-page"
					/>
				)
			) : null}

			{draft.kind === "scroll" ? (
				<>
					{targetPicker}
					<Select
						value={draft.scrollBehavior}
						onValueChange={(next) => {
							if (next !== null) {
								patch({ scrollBehavior: next as "smooth" | "instant" });
							}
						}}
					>
						<SelectTrigger
							size="sm"
							className="h-7 text-[11px]"
							aria-label={msg("studio.editor.interaction.action.behavior")}
							data-testid="ak-action-behavior"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="smooth">
								{msg("studio.editor.interaction.action.smooth")}
							</SelectItem>
							<SelectItem value="instant">
								{msg("studio.editor.interaction.action.instant")}
							</SelectItem>
						</SelectContent>
					</Select>
				</>
			) : null}

			{draft.kind === "visibility" ? (
				<>
					{targetPicker}
					<Select
						value={draft.visibility}
						onValueChange={(next) => {
							if (next !== null) {
								patch({ visibility: next as ActionDraft["visibility"] });
							}
						}}
					>
						<SelectTrigger
							size="sm"
							className="h-7 text-[11px]"
							aria-label={msg("studio.editor.interaction.action.operation")}
							data-testid="ak-action-operation"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{(["show", "hide", "toggle"] as const).map((operation) => (
								<SelectItem key={operation} value={operation}>
									{msg(`studio.editor.interaction.action.${operation}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</>
			) : null}

			{draft.kind === "variant" ? (
				<>
					{targetPicker}
					{variantAxes.length === 0 ? (
						// Only a component instance has axes; saying so beats an
						// empty picker the author cannot act on.
						<p
							className="text-[11px] text-[var(--ak-studio-muted-fg)]"
							data-testid="ak-action-no-variants"
						>
							{msg("studio.editor.interaction.action.noVariants")}
						</p>
					) : (
						<>
							<Select
								value={draft.axisId}
								onValueChange={(next) => {
									if (next !== null) patch({ axisId: next, optionId: "" });
								}}
							>
								<SelectTrigger
									size="sm"
									className="h-7 text-[11px]"
									aria-label={msg("studio.editor.interaction.action.axis")}
									data-testid="ak-action-axis"
								>
									<SelectValue
										placeholder={msg("studio.editor.interaction.action.axis")}
									/>
								</SelectTrigger>
								<SelectContent>
									{variantAxes.map((axis) => (
										<SelectItem key={axis.id} value={axis.id}>
											{axis.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<Select
								value={draft.optionId}
								onValueChange={(next) => {
									if (next !== null) patch({ optionId: next });
								}}
							>
								<SelectTrigger
									size="sm"
									className="h-7 text-[11px]"
									aria-label={msg("studio.editor.interaction.action.option")}
									data-testid="ak-action-option"
								>
									<SelectValue
										placeholder={msg("studio.editor.interaction.action.option")}
									/>
								</SelectTrigger>
								<SelectContent>
									{(
										variantAxes.find((axis) => axis.id === draft.axisId)
											?.options ?? []
									).map((option) => (
										<SelectItem key={option.id} value={option.id}>
											{option.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</>
					)}
				</>
			) : null}

			{draft.kind === "animate" ? (
				<>
					{targetPicker}
					<Select
						value={draft.property}
						onValueChange={(next) => {
							if (next !== null) {
								patch({ property: next as AnimatableProperty });
							}
						}}
					>
						<SelectTrigger
							size="sm"
							className="h-7 text-[11px]"
							aria-label={msg("studio.editor.interaction.action.property")}
							data-testid="ak-action-property"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ANIMATABLE.map((property) => (
								<SelectItem key={property} value={property}>
									{property}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Input
						value={draft.to}
						onChange={(event) => patch({ to: event.target.value })}
						aria-label={msg("studio.editor.interaction.action.to")}
						placeholder={msg("studio.editor.interaction.action.to")}
						className="h-7 text-[11px]"
						data-testid="ak-action-to"
					/>
					<Input
						type="number"
						value={draft.durationMs}
						onChange={(event) => patch({ durationMs: event.target.value })}
						aria-label={msg("studio.editor.interaction.action.duration")}
						className="h-7 text-[11px]"
						data-testid="ak-action-duration"
					/>
				</>
			) : null}
		</div>
	);
}
