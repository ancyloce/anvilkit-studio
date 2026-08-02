"use client";

/**
 * @file `ComponentInstanceSection` — instance-mode inspector
 * (PLAN-0020 CORE-P2-009H; ED-COMP-003/-004/-007/-008,
 * ED-VARIANT-002; DD-0019 §14.4, §14.5, §11.2).
 *
 * Rendered by `EditorInspectorPanel` when the primary selection is a
 * component instance. Four things live here, all of which the spec
 * requires to be user-reachable and none of which existed before:
 *
 * 1. the **variant selector** (one `<select>` per declared axis),
 *    dispatching `component.instance.variant.set`;
 * 2. **override management** — the list of overrides this instance
 *    carries, each with reset and promote, plus reset-all;
 * 3. **detach**, which materializes the instance into plain nodes;
 * 4. the **unresolved-definition** notice, which states plainly that
 *    the instance's data is retained and will re-resolve.
 *
 * A native `<select>` would violate the repo's UI rule; the shared
 * `@anvilkit/ui` `Select` primitive is used instead.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/primitives/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import { useComponentInstance } from "./use-component-instance.js";

/**
 * The instance section. `null` when the selection is not an instance —
 * the section registry also gates on this, but returning `null` keeps
 * the component safe to mount directly (tests, future surfaces).
 */
export function ComponentInstanceSection(): ReactNode {
	const msg = useMsg();
	const model = useComponentInstance();
	const [busy, setBusy] = useState(false);

	if (model === null) {
		return null;
	}

	const run = async (action: () => Promise<unknown>) => {
		setBusy(true);
		await action();
		setBusy(false);
	};

	return (
		<div
			className="flex flex-col gap-2"
			data-testid="ak-component-instance-section"
			data-instance-node-id={model.nodeId}
		>
			{model.unresolved ? (
				<p
					className="text-[11px] text-[var(--destructive)]"
					data-testid="ak-component-instance-unresolved"
					role="status"
				>
					{msg("studio.editor.component.instance.unresolved")}
				</p>
			) : (
				<div className="flex items-center gap-1">
					<p className="flex-1 truncate text-[11px] font-medium">
						{model.definition?.name}
					</p>
					{/* Entry into isolated editing from a selected instance
					    (ED-COMP-005) — the second of the two entry points the
					    spec requires, the other being the Components panel. */}
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-5 px-1.5 text-[10px]"
						onClick={() => model.editDefinition()}
						data-testid="ak-component-edit-definition"
					>
						{msg("studio.editor.component.instance.edit")}
					</Button>
				</div>
			)}

			{/* Variant selector — one control per declared axis. */}
			{(model.definition?.variantAxes.length ?? 0) > 0 ? (
				<div
					className="flex flex-col gap-1.5"
					data-testid="ak-component-instance-variants"
				>
					{model.definition?.variantAxes.map((axis) => {
						const current = model.instance.variantSelection[axis.id] ?? "";
						return (
							<label
								key={axis.id}
								className="flex flex-col gap-1 text-[11px]"
								data-testid="ak-component-instance-axis"
								data-axis-id={axis.id}
							>
								<span className="text-[var(--ak-studio-muted-fg)]">
									{axis.name}
								</span>
								<Select
									value={current}
									disabled={!model.canMutate || busy}
									onValueChange={(next) => {
										// Base UI yields `null` when a selection is
										// cleared; an axis with no option chosen is a
										// legal intermediate state expressed by
										// omitting the key, not by storing null.
										if (next === null) return;
										void run(() =>
											model.setVariant({
												...model.instance.variantSelection,
												[axis.id]: next,
											}),
										);
									}}
								>
									<SelectTrigger
										className="h-7 text-[11px]"
										aria-label={axis.name}
										data-testid={`ak-component-variant-select-${axis.id}`}
									>
										<SelectValue
											placeholder={msg(
												"studio.editor.component.instance.variantPlaceholder",
											)}
										/>
									</SelectTrigger>
									<SelectContent>
										{axis.options.map((option) => (
											<SelectItem
												key={option.id}
												value={option.id}
												data-testid={`ak-component-variant-option-${option.id}`}
											>
												{option.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</label>
						);
					})}
				</div>
			) : null}

			{/* Overrides: reset one, promote one, reset all. */}
			<div className="flex flex-col gap-1">
				<div className="flex items-baseline justify-between">
					<span className="text-[11px] font-medium">
						{msg("studio.editor.component.instance.overrides")}
					</span>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-5 px-1.5 text-[10px]"
						disabled={!model.canMutate || busy || model.overrides.length === 0}
						onClick={() => void run(() => model.resetAllOverrides())}
						data-testid="ak-component-reset-all"
					>
						{msg("studio.editor.component.instance.resetAll")}
					</Button>
				</div>
				{model.overrides.length === 0 ? (
					<p
						className="text-[10px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-component-overrides-empty"
					>
						{msg("studio.editor.component.instance.noOverrides")}
					</p>
				) : (
					<ul
						className="flex flex-col gap-1"
						data-testid="ak-component-overrides"
					>
						{model.overrides.map((entry) => (
							<li
								key={`${entry.kind}:${entry.definitionNodeId}:${entry.label}`}
								className="flex items-center gap-1"
								data-testid="ak-component-override"
								data-override-label={entry.label}
							>
								<span className="flex-1 truncate text-[10px]">
									{entry.label}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-5 px-1.5 text-[10px]"
									disabled={!model.canMutate || busy}
									onClick={() =>
										void run(() => model.resetOverride(entry))
									}
									data-testid="ak-component-override-reset"
								>
									{msg("studio.editor.component.instance.reset")}
								</Button>
								{/* Promote writes into the definition, which only makes
								    sense for a definition-node override — an exposed-prop
								    override has no definition node to write to. */}
								{entry.kind === "node" ? (
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-5 px-1.5 text-[10px]"
										disabled={!model.canMutate || busy || model.unresolved}
										onClick={() =>
											void run(() => model.promoteOverride(entry.target))
										}
										data-testid="ak-component-override-promote"
									>
										{msg("studio.editor.component.instance.promote")}
									</Button>
								) : null}
							</li>
						))}
					</ul>
				)}
			</div>

			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-6 self-start px-2 text-[10px]"
				disabled={!model.canMutate || busy || model.unresolved}
				onClick={() => void run(() => model.detach())}
				data-testid="ak-component-detach"
			>
				{msg("studio.editor.component.instance.detach")}
			</Button>

			{model.diagnostics.length > 0 ? (
				<ul
					className="flex flex-col gap-0.5 text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-component-instance-diagnostics"
					role="status"
					aria-live="polite"
				>
					{model.diagnostics.map((error) => (
						<li key={`${error.code}:${error.message}`}>{error.message}</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
