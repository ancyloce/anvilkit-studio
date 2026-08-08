"use client";

/**
 * @file `ComponentInstanceSection` — instance-mode inspector
 * (PLAN-0028 `p5-006`; ED-COMP-003/-004/-007/-008, ED-VARIANT-002;
 * DD-0019 §14.4, §14.5, §11.2).
 *
 * Rendered by the Components panel when the primary selection is a
 * component instance. Five things live here, all of which the spec
 * requires to be user-reachable:
 *
 * 1. the **variant selector** (one `Select` per declared axis);
 * 2. **exposed properties**, listed whether or not this instance
 *    overrides them, each with an override control and a reset;
 * 3. **node overrides** — the definition nodes this instance patches,
 *    each with reset and promote, plus reset-all;
 * 4. **detach**, which materializes the instance into plain nodes;
 * 5. the **unresolved-definition** notice, which states plainly that
 *    the instance's data is retained and will re-resolve.
 *
 * ### Overridden must not look inherited (`ED-FA-008`'s minimum)
 *
 * An exposed property row renders in one of two states, and they are
 * distinguishable three ways so no single channel carries the whole
 * signal: `data-provenance` for tests and hosts, a visible
 * override/inherited dot, and weight + colour. The flag driving it is
 * `inherited` — the same one `ResolvedValue` carries in `p2-003`'s
 * field-state union, read at the instance layer of the §14.4 cascade
 * rather than re-derived as a second notion of provenance.
 *
 * A native `<select>` would violate the repo's UI rule; the shared
 * `@anvilkit/ui` `Select` primitive is used instead.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import type { InstanceExposedProp } from "./use-component-instance.js";
import { useComponentInstance } from "./use-component-instance.js";

/** Render a stored override value in a single-line text control. */
function displayValue(value: InstanceExposedProp["value"]): string {
	if (value === undefined || value === null) return "";
	return typeof value === "string" ? value : JSON.stringify(value);
}

interface ExposedPropRowProps {
	readonly entry: InstanceExposedProp;
	readonly disabled: boolean;
	readonly onSet: (propId: string, value: string) => void;
	readonly onReset: (propId: string) => void;
}

/**
 * One exposed property, in its overridden or inherited state.
 *
 * The control is a plain text input because `ComponentPropDefinition`
 * carries a declared `type` but no editor field descriptor — typed
 * controls are `ED-FA-008`'s job, and inventing them here would mean
 * guessing an authoring vocabulary the contract does not yet state.
 * What this row does guarantee is the part `p5-006` owns: the two
 * states never render identically.
 */
function ExposedPropRow({
	entry,
	disabled,
	onSet,
	onReset,
}: ExposedPropRowProps): ReactNode {
	const msg = useMsg();
	const [draft, setDraft] = useState<string | null>(null);
	const stored = displayValue(entry.value);
	const value = draft ?? stored;

	const commit = () => {
		setDraft(null);
		if (value === stored) return;
		onSet(entry.definition.id, value);
	};

	return (
		<li
			className="flex flex-col gap-0.5"
			data-testid="ak-component-exposed-prop"
			data-prop-id={entry.definition.id}
			data-provenance={entry.inherited ? "inherited" : "override"}
		>
			<div className="flex items-center gap-1">
				<span
					aria-hidden="true"
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						entry.inherited
							? "bg-transparent ring-1 ring-[var(--ak-studio-border)]"
							: "bg-[var(--ak-studio-accent,currentColor)]",
					)}
				/>
				<span
					className={cn(
						"flex-1 truncate text-[10px]",
						entry.inherited
							? "text-[var(--ak-studio-muted-fg)]"
							: "font-semibold text-[var(--ak-studio-fg)]",
					)}
				>
					{entry.definition.name}
				</span>
				{entry.inherited ? null : (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-5 px-1.5 text-[10px]"
						disabled={disabled}
						onClick={() => onReset(entry.definition.id)}
						data-testid="ak-component-exposed-prop-reset"
					>
						{msg("studio.editor.component.instance.reset")}
					</Button>
				)}
			</div>
			<Input
				value={value}
				aria-label={entry.definition.name}
				disabled={disabled}
				className={cn(
					"h-6 text-[11px]",
					entry.inherited ? "text-[var(--ak-studio-muted-fg)]" : null,
				)}
				data-testid="ak-component-exposed-prop-input"
				onChange={(event) => setDraft(event.target.value)}
				onBlur={commit}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault();
						commit();
					}
					if (event.key === "Escape") {
						event.preventDefault();
						setDraft(null);
					}
				}}
			/>
		</li>
	);
}

/**
 * The instance section. `null` when the selection is not an instance,
 * which keeps the component safe to mount unconditionally.
 *
 * Must render inside `<Puck>`.
 */
export function ComponentInstanceSection(): ReactNode {
	const msg = useMsg();
	const model = useComponentInstance();

	if (model === null) {
		return null;
	}

	const disabled = !model.canMutate;

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
									disabled={disabled}
									onValueChange={(next) => {
										// Base UI yields `null` when a selection is
										// cleared; an axis with no option chosen is a
										// legal intermediate state expressed by
										// omitting the key, not by storing null.
										if (next === null) return;
										model.setVariant({
											...model.instance.variantSelection,
											[axis.id]: next,
										});
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

			{/* Exposed properties: every one the definition declares, so an
			    inherited value is *shown* as inherited rather than being
			    absent and therefore indistinguishable from an unset one. */}
			{model.exposedProps.length > 0 ? (
				<ul
					className="flex flex-col gap-1.5"
					data-testid="ak-component-exposed-props"
				>
					{model.exposedProps.map((entry) => (
						<ExposedPropRow
							key={entry.definition.id}
							entry={entry}
							disabled={disabled}
							onSet={(propId, next) => model.setExposedProp(propId, next)}
							onReset={(propId) => model.resetExposedProp(propId)}
						/>
					))}
				</ul>
			) : null}

			{/* Node overrides: reset one, promote one, reset all. */}
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
						disabled={disabled || model.overrides.length === 0}
						onClick={() => model.resetAllOverrides()}
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
								key={entry.definitionNodeId}
								className="flex items-center gap-1"
								data-testid="ak-component-override"
								data-override-label={entry.label}
								// Every row in this list IS an override, so the
								// attribute is constant — it exists so the same
								// selector reads provenance on both lists.
								data-provenance="override"
							>
								<span className="flex-1 truncate text-[10px] font-semibold">
									{entry.label}
								</span>
								<span
									className="shrink-0 truncate text-[10px] text-[var(--ak-studio-muted-fg)]"
									data-testid="ak-component-override-fields"
								>
									{entry.fields.join(", ")}
								</span>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-5 px-1.5 text-[10px]"
									disabled={disabled}
									onClick={() => model.resetOverride(entry)}
									data-testid="ak-component-override-reset"
								>
									{msg("studio.editor.component.instance.reset")}
								</Button>
								{/* Promote writes into the definition, so it needs a
								    definition to write to. */}
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-5 px-1.5 text-[10px]"
									disabled={disabled || model.unresolved}
									onClick={() => model.promoteOverride(entry)}
									data-testid="ak-component-override-promote"
								>
									{msg("studio.editor.component.instance.promote")}
								</Button>
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
				disabled={disabled || model.unresolved}
				onClick={() => model.detach()}
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
