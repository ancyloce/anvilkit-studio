"use client";

/**
 * @file `InteractionsSection` — the inspector's interactions editor
 * (PLAN-0020 CORE-P3-001; ED-INT-001/002; DD-0019 §16, §11.2).
 *
 * Appended to the universal inspector's static section list, which is
 * the surface later phases were told to extend additively — no new
 * panel, no second registry.
 *
 * Scope note: the frozen command union carries `interaction.create`
 * only, so this section lists and creates. Editing or removing an
 * interaction needs command members that do not exist yet, and
 * inventing them here would put a mutation path outside the freeze.
 */

import type {
	InteractionTrigger,
	InteractionV1,
} from "@anvilkit/contracts/editor";
import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import type { InspectorSectionProps } from "../inspector/sections-registry.js";
import { useNodeInteractions } from "./use-interactions.js";

/**
 * The trigger choices offered by the picker.
 *
 * §32.4 exercises click, hover and viewport, and each carries the extra
 * members §16 makes mandatory (`phase`, `threshold`) — so the picker
 * emits complete triggers rather than a bare type the schema rejects.
 */
const TRIGGER_CHOICES: readonly {
	readonly id: string;
	readonly labelKey: string;
	readonly trigger: InteractionTrigger;
}[] = [
	{
		id: "click",
		labelKey: "studio.editor.interaction.trigger.click",
		trigger: { type: "click" },
	},
	{
		id: "hover",
		labelKey: "studio.editor.interaction.trigger.hover",
		trigger: { type: "hover", phase: "enter" },
	},
	{
		id: "viewport",
		labelKey: "studio.editor.interaction.trigger.viewport",
		trigger: { type: "viewport", phase: "enter", threshold: 0.5 },
	},
];

/** A one-line human summary of what an interaction does. */
function summarize(interaction: InteractionV1): string {
	const action = interaction.actions[0];
	const rest =
		interaction.actions.length > 1 ? ` +${interaction.actions.length - 1}` : "";
	if (action === undefined) return `${interaction.trigger.type} → —${rest}`;
	const target =
		action.type === "url"
			? action.url
			: action.type === "navigate"
				? action.pageId
				: action.type === "animate"
					? action.targetNodeIds.join(", ")
					: action.targetNodeId;
	return `${interaction.trigger.type} → ${action.type} ${target}${rest}`;
}

/** The §16 interactions editor for the selected node. */
export function InteractionsSection({
	context,
}: InspectorSectionProps): ReactNode {
	const msg = useMsg();
	const state = useNodeInteractions(context);
	const [url, setUrl] = useState("");
	const [triggerId, setTriggerId] = useState("click");
	const [busy, setBusy] = useState(false);

	async function onAdd(): Promise<void> {
		const trimmed = url.trim();
		if (trimmed === "" || busy) return;
		setBusy(true);
		try {
			const choice =
			TRIGGER_CHOICES.find((entry) => entry.id === triggerId) ??
			TRIGGER_CHOICES[0];
		const result = await state.createUrlInteraction(
			trimmed,
			trimmed,
			choice?.trigger,
		);
			// Clear only on success, so a rejected URL stays visible for
			// the author to correct rather than vanishing silently.
			if (result !== null && result.status !== "rejected") setUrl("");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-col gap-2" data-testid="ak-interactions-section">
			{state.rows.length === 0 ? (
				<p className="text-[11px] text-[var(--ak-studio-muted-fg)]">
					{msg("studio.editor.interaction.empty")}
				</p>
			) : (
				<ul className="flex flex-col gap-1">
					{state.rows.map((row) => (
						<li
							key={row.interaction.id}
							className={cn(
								"rounded border border-[var(--ak-studio-border)] px-2 py-1 text-[11px]",
								row.effectiveEnabled
									? null
									: "text-[var(--ak-studio-muted-fg)]",
							)}
							data-testid="ak-interaction-row"
							data-enabled={row.effectiveEnabled ? "true" : "false"}
						>
							<span className="truncate font-medium">
								{row.interaction.name}
							</span>
							<span className="ml-1 truncate">
								{summarize(row.interaction)}
							</span>
							{row.missingNodeIds.length > 0 ? (
								<span
									className="ml-1 text-[var(--ak-studio-danger-fg,#b42318)]"
									data-testid="ak-interaction-dangling"
								>
									{msg("studio.editor.interaction.missingTarget")}
								</span>
							) : null}
						</li>
					))}
				</ul>
			)}

			<div className="flex items-center gap-1">
				<Select
					value={triggerId}
					onValueChange={(next) => {
						if (next !== null) setTriggerId(next);
					}}
				>
					<SelectTrigger
						size="sm"
						className="h-6 w-24 text-[11px]"
						aria-label={msg("studio.editor.interaction.triggerLabel")}
						data-testid="ak-interaction-trigger"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{TRIGGER_CHOICES.map((choice) => (
							<SelectItem key={choice.id} value={choice.id}>
								{msg(choice.labelKey)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<input
					type="url"
					value={url}
					onChange={(event) => setUrl(event.target.value)}
					placeholder={msg("studio.editor.interaction.urlPlaceholder")}
					aria-label={msg("studio.editor.interaction.urlLabel")}
					className="min-w-0 flex-1 rounded border border-[var(--ak-studio-border)] bg-transparent px-2 py-1 text-[11px]"
					data-testid="ak-interaction-url"
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[11px]"
					disabled={!state.canCreate || url.trim() === "" || busy}
					onClick={() => {
						void onAdd();
					}}
					data-testid="ak-interaction-add"
				>
					{msg("studio.editor.interaction.add")}
				</Button>
			</div>

			{state.lastErrors.length > 0 ? (
				<ul
					className="text-[11px] text-[var(--ak-studio-danger-fg,#b42318)]"
					data-testid="ak-interaction-errors"
				>
					{state.lastErrors.map((message) => (
						<li key={message}>{message}</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
