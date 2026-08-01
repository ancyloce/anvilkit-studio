"use client";

/**
 * @file `VariantAxisEditor` — variant axis/option authoring
 * (PLAN-0020 CORE-P2-009H; ED-VARIANT-001; DD-0019 §14.2).
 *
 * The form the `variants.spec.ts` header used to say "does not ship
 * yet". It renders inside the isolated component canvas, because
 * axes belong to the definition and definition edits require the
 * component's own scope (freeze §6) — placing it anywhere else would
 * produce a form whose every submit is rejected.
 *
 * Limits are surfaced *before* they are hit (the add-axis control
 * disables at 3, the combination counter shows the running total) and
 * again as an explicit error if a submit crosses one, so the user
 * never has to guess why an edit refused.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-context";
import {
	useVariantAuthoring,
	type VariantAuthoring,
	type VariantEditOutcome,
} from "./use-variant-authoring.js";

function ErrorList({
	errors,
	testId,
}: {
	readonly errors: readonly EditorError[];
	readonly testId: string;
}): ReactNode {
	if (errors.length === 0) return null;
	return (
		<ul
			className="flex flex-col gap-0.5 text-[11px] text-[var(--destructive)]"
			data-testid={testId}
			role="status"
			aria-live="polite"
		>
			{errors.map((error) => (
				<li key={`${error.code}:${error.message}`}>{error.message}</li>
			))}
		</ul>
	);
}

/** A one-field inline form used for both "add axis" and "add option". */
function AddForm({
	label,
	testId,
	disabled,
	onSubmit,
}: {
	readonly label: string;
	readonly testId: string;
	readonly disabled: boolean;
	readonly onSubmit: (name: string) => Promise<VariantEditOutcome>;
}): ReactNode {
	const [value, setValue] = useState("");
	const [errors, setErrors] = useState<readonly EditorError[]>([]);

	const submit = useCallback(async () => {
		const outcome = await onSubmit(value);
		setErrors(outcome.errors);
		if (outcome.status === "committed") {
			setValue("");
		}
	}, [onSubmit, value]);

	return (
		<div className="flex flex-col gap-1">
			<div className="flex items-center gap-1">
				<Input
					value={value}
					aria-label={label}
					placeholder={label}
					disabled={disabled}
					className="h-6 flex-1 text-[11px]"
					data-testid={`${testId}-input`}
					onChange={(event) => setValue(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							void submit();
						}
					}}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[10px]"
					disabled={disabled}
					onClick={() => void submit()}
					data-testid={`${testId}-submit`}
				>
					{label}
				</Button>
			</div>
			<ErrorList errors={errors} testId={`${testId}-errors`} />
		</div>
	);
}

interface AxisRowProps {
	readonly authoring: VariantAuthoring;
	readonly axisId: string;
}

function AxisRow({ authoring, axisId }: AxisRowProps): ReactNode {
	const msg = useMsg();
	const axis = authoring.axes.find((entry) => entry.id === axisId);
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [renaming, setRenaming] = useState(false);
	const [draft, setDraft] = useState(axis?.name ?? "");

	if (axis === undefined) return null;

	const commitRename = async () => {
		setRenaming(false);
		if (draft.trim() === axis.name) return;
		setErrors((await authoring.renameAxis(axis.id, draft)).errors);
	};

	return (
		<li
			className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-1.5"
			data-testid="ak-variant-axis"
			data-axis-id={axis.id}
		>
			<div className="flex items-center gap-1">
				{renaming ? (
					<Input
						autoFocus
						value={draft}
						aria-label={msg("studio.editor.variant.axis.rename")}
						className="h-6 flex-1 text-[11px]"
						data-testid="ak-variant-axis-rename-input"
						onChange={(event) => setDraft(event.target.value)}
						onBlur={() => void commitRename()}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void commitRename();
							}
							if (event.key === "Escape") {
								event.preventDefault();
								setDraft(axis.name);
								setRenaming(false);
							}
						}}
					/>
				) : (
					<span className="flex-1 truncate text-[11px] font-medium">
						{axis.name}
					</span>
				)}
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					onClick={() => {
						setDraft(axis.name);
						setRenaming(true);
					}}
					data-testid="ak-variant-axis-rename"
				>
					{msg("studio.editor.variant.axis.rename")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					onClick={async () =>
						setErrors((await authoring.removeAxis(axis.id)).errors)
					}
					data-testid="ak-variant-axis-remove"
				>
					{msg("studio.editor.variant.axis.remove")}
				</Button>
			</div>
			<ul className="flex flex-wrap gap-1" data-testid="ak-variant-options">
				{axis.options.map((option) => (
					<li
						key={option.id}
						className="flex items-center gap-1 rounded bg-[var(--ak-studio-muted)] px-1.5 py-0.5"
						data-testid="ak-variant-option"
						data-option-id={option.id}
					>
						<span className="text-[10px]">{option.name}</span>
						<button
							type="button"
							aria-label={`${msg("studio.editor.variant.option.remove")} ${option.name}`}
							className="text-[10px] text-[var(--ak-studio-muted-fg)]"
							onClick={async () =>
								setErrors(
									(await authoring.removeOption(axis.id, option.id)).errors,
								)
							}
							data-testid="ak-variant-option-remove"
						>
							×
						</button>
					</li>
				))}
			</ul>
			<AddForm
				label={msg("studio.editor.variant.option.add")}
				testId={`ak-variant-option-add-${axis.id}`}
				disabled={false}
				onSubmit={(name) => authoring.addOption(axis.id, name)}
			/>
			<ErrorList errors={errors} testId="ak-variant-axis-errors" />
		</li>
	);
}

/**
 * The variant-axis authoring form, or `null` outside an isolated
 * component scope (or while writers are unavailable).
 */
export function VariantAxisEditor(): ReactNode {
	const msg = useMsg();
	const authoring = useVariantAuthoring();
	if (authoring === null) {
		return null;
	}
	return (
		<section
			className="flex flex-col gap-1.5"
			aria-label={msg("studio.editor.variant.axes")}
			data-testid="ak-variant-editor"
		>
			<div className="flex items-baseline justify-between">
				<h3 className="text-[11px] font-medium">
					{msg("studio.editor.variant.axes")}
				</h3>
				<span
					className="text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-variant-combination-count"
				>
					{msg("studio.editor.variant.limits")
						.replace("{axes}", String(authoring.axes.length))
						.replace("{maxAxes}", String(authoring.maxAxes))
						.replace(
							"{combinations}",
							String(authoring.expressibleCombinations),
						)
						.replace("{maxCombinations}", String(authoring.maxCombinations))}
				</span>
			</div>
			<ul className="flex flex-col gap-1" data-testid="ak-variant-axes">
				{authoring.axes.map((axis) => (
					<AxisRow key={axis.id} authoring={authoring} axisId={axis.id} />
				))}
			</ul>
			<AddForm
				label={msg("studio.editor.variant.axis.add")}
				testId="ak-variant-axis-add"
				disabled={!authoring.canAddAxis}
				onSubmit={(name) => authoring.addAxis(name)}
			/>
		</section>
	);
}
