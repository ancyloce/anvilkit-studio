"use client";

/**
 * @file `VariantAxisEditor` — variant axis/option authoring
 * (PLAN-0028 `p5-006`; ED-VARIANT-001; DD-0019 §14.2).
 *
 * The Variants tab of the promoted composition inspector, and the same
 * form the isolated component canvas renders. Axes belong to the
 * definition and definition edits address the `componentLibrary` root
 * prop, so the form is live only while a definition is open in
 * isolated editing (freeze §6) — open one from the Components tab and
 * this fills in.
 *
 * ### Limits are surfaced before they are hit
 *
 * `p5-006`'s acceptance criterion is that
 * `MAX_EXPRESSIBLE_COMBINATIONS` reaches the author *before* an edit
 * is refused, not as an error afterwards. Three things do that, in
 * increasing order of directness:
 *
 * - the running `{axes}/{maxAxes} · {combinations}/{maxCombinations}`
 *   counter, always visible;
 * - **add axis** disables at the 3-axis cap;
 * - **add option** disables per axis the moment one more option would
 *   push the combination product past the cap — which is the case a
 *   global counter cannot express, because whether an option fits
 *   depends on which axis it lands on.
 *
 * The write-time rejection stays as the backstop. A disabled control
 * is a courtesy; `updateVariantModelInData` is the enforcement.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-context";
import type { StudioInspectorPanel } from "../composition/inspector-panel.js";
import { useShellSelection } from "../composition/use-shell-selection.js";
import { scopedDefinitionId } from "./scope.js";
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
			className="flex flex-col gap-0.5 text-[11px]"
			data-testid={testId}
			role="status"
			aria-live="polite"
		>
			{/* Coloured per entry: this list also carries `warning`
			    severities (an edit that committed but dropped declared
			    variants), and painting those as errors would read as a
			    failure. */}
			{errors.map((error) => (
				<li
					key={`${error.code}:${error.message}`}
					className={
						error.severity === "error"
							? "text-[var(--destructive)]"
							: "text-[var(--ak-studio-muted-fg)]"
					}
				>
					{error.message}
				</li>
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
	readonly onSubmit: (name: string) => VariantEditOutcome;
}): ReactNode {
	const [value, setValue] = useState("");
	const [errors, setErrors] = useState<readonly EditorError[]>([]);

	const submit = useCallback(() => {
		if (disabled) return;
		const outcome = onSubmit(value);
		setErrors(outcome.errors);
		if (outcome.status === "committed") {
			setValue("");
		}
	}, [disabled, onSubmit, value]);

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
							submit();
						}
					}}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[10px]"
					disabled={disabled}
					onClick={submit}
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

	const commitRename = () => {
		setRenaming(false);
		if (draft.trim() === axis.name) return;
		setErrors(authoring.renameAxis(axis.id, draft).errors);
	};
	const canAddOption = authoring.canAddOption(axis.id);

	return (
		<li
			className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-1.5"
			data-testid="ak-variant-axis"
			data-axis-id={axis.id}
			data-can-add-option={canAddOption ? "true" : "false"}
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
						onBlur={commitRename}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitRename();
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
					onClick={() => setErrors(authoring.removeAxis(axis.id).errors)}
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
							onClick={() =>
								setErrors(authoring.removeOption(axis.id, option.id).errors)
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
				// The per-axis half of the combination cap: one more option
				// on THIS axis multiplies the product by more than one more
				// option on a shorter one, so the affordance is judged per
				// axis rather than against the global counter.
				disabled={!canAddOption}
				onSubmit={(name) => authoring.addOption(axis.id, name)}
			/>
			<ErrorList errors={errors} testId="ak-variant-axis-errors" />
		</li>
	);
}

/**
 * The variant-axis authoring form, or `null` outside an isolated
 * component scope (or while writers are unavailable).
 *
 * Must render inside `<Puck>`.
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
			data-combinations={authoring.expressibleCombinations}
			data-max-combinations={authoring.maxCombinations}
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

/**
 * The Variants tab body: the axis editor when a definition is open,
 * and an honest empty state when none is.
 *
 * The empty state matters. The tab is always in the roster, so without
 * it the panel would render blank and read as broken rather than as
 * "open a component first" — the same §8.5 honesty rule the Style and
 * Data tabs follow for undeclared capabilities.
 *
 * The scope check is done **here**, on the selection alone, rather
 * than by letting {@link useVariantAuthoring} return `null`: that hook
 * projects the whole document, and the tab must not pay for a
 * projection to discover that no component is open.
 */
export function VariantsPanel(): ReactNode {
	const msg = useMsg();
	const selection = useShellSelection();
	if (scopedDefinitionId(selection.definitionScope) === undefined) {
		return (
			<p
				className="px-3 py-6 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
				data-testid="ak-variants-panel-empty"
			>
				{msg("studio.editor.component.empty")}
			</p>
		);
	}
	return <VariantAxisEditor />;
}

/**
 * The roster entry `StudioPuckLayout` registers. Exported from this
 * file so the shell wires the panel without editing it — the same
 * contract `STYLE_PANEL` and `DATA_PANEL` follow.
 */
export const VARIANTS_PANEL: StudioInspectorPanel = {
	id: "variants",
	labelKey: "studio.editor.component.variants",
	render: () => <VariantsPanel />,
};
