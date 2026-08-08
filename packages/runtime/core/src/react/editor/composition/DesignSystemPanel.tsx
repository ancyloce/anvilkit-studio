"use client";

/**
 * @file `DesignSystemPanel` — the composition inspector's Design System
 * tab: token groups, token editing and style definitions
 * (PLAN-0028 `p4-003`, PLAN-0026 §3.5/§3.8.3; DD-0019 `ED-FA-003`,
 * ED-TOKEN-001..003, ED-STYLEDEF-001/002, §9.4, §15.1).
 *
 * A rebase of `react/editor/tokens/DesignSystemPanel.tsx` onto the
 * canonical read/commit path, not a rewrite. The literal round-trip
 * (`tokens/token-literal-text.ts`) and the mode fallback
 * (`tokens/token-mode.ts`) are the *same modules* the retained panel
 * uses, and the picker is `design-system/DocumentTokenPicker.tsx` — so
 * the two surfaces cannot disagree about what a stored token value
 * says while both exist.
 *
 * Reads come from {@link useDesignSystemPanel}; writes from the shipped
 * `useDesignSystemCommit` (and, for attach/detach only,
 * `useAppearanceCommit`, because `styleRefs` lives on the node).
 *
 * ## Puck contract
 *
 * **Rule 2 — render state lives in declared fields.** `designSystem` is
 * a declared root prop. Every token, mode and style definition rendered
 * here is read from `root.props.designSystem` through `DocumentModel`
 * and written back to it through one `setData`. There is no sidecar, no
 * panel-local copy, and no state here that affects rendering.
 *
 * **Rule 3 — one pipeline, four consumers.** The panel changes a
 * *value*; it never resolves a token for rendering. Resolution happens
 * inside the one compiler (`style-compiler/compile.ts`, which reads the
 * same `root.props.designSystem` and `defaultTokenMode`), so editing a
 * token repaints editor, preview, production and export identically
 * through the existing compiled-appearance path. The `resolveToken`
 * calls behind this panel exist only to *display* what a token
 * currently means and to flag one that resolves nowhere.
 *
 * ## Three scope decisions, stated so the next reader does not assume
 * they were missed
 *
 * 1. **Per-target style attach is `ED-FA-005` — P1, deferred past R7.**
 *    Attach here writes the node's **root** target. The carrier already
 *    supports per-target (`TargetAppearance.styleRefs` is keyed by
 *    target), so the deferral is a UI decision, not a data limitation.
 * 2. **The mode switch selects; it never creates.** `p5-007` adds the
 *    `ED-FA-006` live-preview switch: picking a mode moves the shell's
 *    previewed mode, the canvas recompiles through the one compiler,
 *    and every node bound to a mode-varying token repaints — no
 *    reload, no second style path. What the switch deliberately cannot
 *    do is *declare* a mode. Its options are exactly
 *    `root.props.designSystem.tokenModes`, so the UI can never mint a
 *    third reserved id or redefine `light`/`dark`, whose meaning ADR
 *    0005 Part 2 §5 reserves so a future theme bridge stays possible.
 *    Authoring each mode's value was already here and is unchanged.
 * 3. **A token can only be deleted while nothing references it**, and a
 *    style definition deletes by discard. Absorbing a deletion
 *    (materialize / replace) rewrites references that live in two
 *    carriers — `designSystem` and node `props.appearance` — which is
 *    two commit helpers, two `setData` dispatches and therefore two
 *    undos. The panel shows the reference count instead of offering a
 *    disposition it cannot honour in one history entry.
 */

import type { TokenMode, TokenType } from "@anvilkit/contracts/editor";
import { type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import { Input } from "@/primitives/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/primitives/select";
import { useMsg } from "@/state/editor-i18n-context";
import {
	formatTokenLiteral,
	parseTokenLiteral,
} from "../tokens/token-literal-text.js";
import { DocumentTokenPicker } from "./design-system/DocumentTokenPicker.js";
import type {
	DesignSystemStyleRow,
	DesignSystemTokenRow,
} from "./design-system/read-design-system.js";
import {
	canDeleteToken,
	type DesignSystemPanelState,
	useDesignSystemPanel,
} from "./design-system/use-design-system-panel.js";
import type { StudioInspectorPanel } from "./inspector-panel.js";
import { reservedTokenModeLabelKey } from "./token-mode.js";

const TOKEN_TYPES: readonly TokenType[] = [
	"color",
	"length",
	"number",
	"fontFamily",
	"fontWeight",
	"shadow",
	"radius",
];

/** One row's local parse error, rendered inline. */
function ErrorList({
	errors,
	testId,
}: {
	readonly errors: readonly string[];
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
			{errors.map((message) => (
				<li key={message}>{message}</li>
			))}
		</ul>
	);
}

/**
 * A declared mode's label.
 *
 * An author-given name always wins. A mode whose `name` is its own id
 * carries no author intent — that is what `readDesignSystem`
 * synthesizes for an undeclared default — so a **reserved** id renders
 * under its localized reserved label instead of the raw string
 * `light`. The reservation in ADR 0005 Part 2 §5 is on what the id
 * *means*, not on how it is spelled in a given locale.
 */
function tokenModeLabel(
	mode: TokenMode,
	msg: (key: string, fallback?: string) => string,
): string {
	const reserved = reservedTokenModeLabelKey(mode.id);
	return mode.name === mode.id && reserved !== undefined
		? msg(reserved)
		: mode.name;
}

/**
 * The live-preview mode switch (`ED-FA-006`, `p5-007`).
 *
 * Writes the shell's previewed token mode. That value reaches
 * `useCompiledAppearance` → `compileDocumentAppearance` — the one
 * compiler — so the canvas repaints every node bound to a mode-varying
 * token by *recompiling the document*, not by swapping a preview
 * sheet. Editor and production therefore cannot disagree about what a
 * mode looks like.
 *
 * Switching records nothing: which mode is previewed is where the
 * author is pointing, never `Data` and never a history entry. The
 * values it points at are declared and are undoable.
 *
 * With fewer than two declared modes there is nothing to switch
 * between, so the active mode is stated rather than offered as a
 * one-option select — the panel's standing rule against rendering a
 * control that cannot do anything.
 */
function TokenModeSwitch({
	state,
}: {
	readonly state: DesignSystemPanelState;
}): ReactNode {
	const msg = useMsg();
	const label = msg("studio.editor.token.mode");
	const only = state.modes[0];

	return (
		<div
			className="flex items-center gap-1"
			data-testid="ak-token-mode-switch"
			data-active-mode={state.activeMode}
		>
			<span className="shrink-0 text-[10px] text-[var(--ak-studio-muted-fg)]">
				{label}
			</span>
			{state.modes.length < 2 ? (
				<span
					className="text-[10px] font-medium"
					data-testid="ak-token-mode-single"
				>
					{only === undefined ? state.activeMode : tokenModeLabel(only, msg)}
				</span>
			) : (
				<Select
					value={state.activeMode}
					onValueChange={(next) => {
						if (typeof next === "string") state.setActiveMode(next);
					}}
				>
					<SelectTrigger
						className="h-6 w-28 text-[10px]"
						aria-label={label}
						data-testid="ak-token-mode-select"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{state.modes.map((mode) => (
							<SelectItem
								key={mode.id}
								value={mode.id}
								data-testid={`ak-token-mode-option-${mode.id}`}
							>
								{tokenModeLabel(mode, msg)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			)}
		</div>
	);
}

/** One token: rename, per-mode value, alias, usage, delete. */
function TokenRow({
	state,
	row,
	onDelete,
}: {
	readonly state: DesignSystemPanelState;
	readonly row: DesignSystemTokenRow;
	readonly onDelete: () => void;
}): ReactNode {
	const msg = useMsg();
	const [errors, setErrors] = useState<readonly string[]>([]);

	return (
		<li
			className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-1.5"
			data-testid="ak-token-row"
			data-token-id={row.token.id}
			data-token-usage={row.usageCount}
		>
			<div className="flex items-center gap-1">
				{/*
				 * Uncontrolled, and keyed on the stored path so an EXTERNAL
				 * rename re-seeds it. A once-only `useState(row.path)` on a
				 * row keyed by token id meant that after Ctrl+Z the field
				 * still showed the undone name, the blur guard compared it
				 * against the reverted path, and the rename was re-dispatched —
				 * undo could not stick. Same for a collab peer's rename.
				 */}
				<Input
					key={row.path}
					defaultValue={row.path}
					aria-label={msg("studio.editor.token.name")}
					className="h-6 flex-1 text-[11px]"
					data-testid="ak-token-name"
					onBlur={(event) => {
						if (event.target.value === row.path) return;
						state.renameToken(row.token.id, event.target.value);
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") event.currentTarget.blur();
					}}
				/>
				<span
					className="shrink-0 text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-token-usage-count"
					title={msg("studio.editor.token.usage")}
				>
					{row.usageCount}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					onClick={onDelete}
					data-testid={`ak-token-delete-${row.token.id}`}
				>
					{msg("studio.editor.component.delete.action")}
				</Button>
			</div>

			{/* Per-mode values, with the fallback made visible. Modes are
			    read-only as a *set* (ED-FA-006); their values are not. */}
			<ul className="flex flex-col gap-0.5" data-testid="ak-token-modes">
				{row.modes.map((mode) => {
					const literal =
						mode.value?.kind === "literal"
							? formatTokenLiteral(row.token.type, mode.value.value)
							: null;
					const text = literal?.text ?? "";
					const resolved = mode.resolution;
					return (
						<li
							key={mode.modeId}
							className="flex items-center gap-1 text-[10px]"
							data-testid="ak-token-mode"
							data-mode-id={mode.modeId}
							data-active={mode.modeId === state.activeMode ? "true" : "false"}
							data-token-derived={mode.tokenDerived ? "true" : "false"}
						>
							{/* The mode the canvas is currently compiling is marked
							    here too, so "which value am I looking at on the
							    canvas" is answerable without going back to the
							    switch. */}
							<span
								className={
									mode.modeId === state.activeMode
										? "w-12 shrink-0 font-medium"
										: "w-12 shrink-0 text-[var(--ak-studio-muted-fg)]"
								}
							>
								{mode.modeName}
							</span>
							{mode.tokenDerived ? (
								// A REFERENCE, rendered as a reference: monospaced,
								// badged with the token-value label, and never as a
								// text box the author could overwrite with a string.
								// This is the read-side half of the provenance display
								// `p4-001` renders in the Style panel.
								<span
									className="flex min-w-0 flex-1 items-center gap-1"
									data-testid="ak-token-mode-ref"
								>
									<span className="shrink-0 rounded bg-[var(--ak-studio-layer-selection)] px-1 text-[9px] uppercase">
										{msg("studio.editor.inspector.tokenValue")}
									</span>
									<span className="min-w-0 truncate font-mono">
										{mode.aliasPath ?? msg("studio.editor.token.unresolved")}
									</span>
								</span>
							) : (
								<Input
									key={text}
									defaultValue={text}
									aria-label={`${row.path} ${mode.modeName}`}
									placeholder={
										mode.value === undefined
											? msg("studio.editor.token.inherited")
											: undefined
									}
									className="h-5 flex-1 text-[10px]"
									data-testid="ak-token-mode-value"
									disabled={literal?.editable === false}
									onBlur={(event) => {
										const next = event.target.value;
										// An untouched field must not write. Tabbing through
										// a mode with no declared value used to convert it
										// from inherited into an empty-string literal.
										if (next === text) return;
										// Strict parse against the token's DECLARED type —
										// the same discriminator the compiler resolves with.
										// An unparsable draft is reported and never written,
										// so a typo cannot replace a `CssLength` object with
										// the raw string the author happened to type.
										const parsed = parseTokenLiteral(row.token.type, next);
										if (parsed === null) {
											setErrors([
												msg("studio.editor.token.invalidValue").replace(
													"{type}",
													row.token.type,
												),
											]);
											return;
										}
										setErrors([]);
										state.setTokenValue(row.token.id, mode.modeId, {
											kind: "literal",
											value: parsed.value,
										});
									}}
								/>
							)}
							<span
								className="w-16 shrink-0 truncate text-[var(--ak-studio-muted-fg)]"
								data-testid="ak-token-resolved"
							>
								{resolved.status === "resolved"
									? formatTokenLiteral(row.token.type, resolved.value).text
									: msg("studio.editor.token.unresolved")}
							</span>
						</li>
					);
				})}
			</ul>

			{/* Alias authoring through the one picker. Self-alias is
			    excluded structurally rather than rejected after the fact;
			    cycles and over-deep chains still resolve to `unresolved`,
			    which the row shows. */}
			<div className="flex items-center gap-1">
				<span className="text-[10px] text-[var(--ak-studio-muted-fg)]">
					{msg("studio.editor.token.alias")}
				</span>
				<DocumentTokenPicker
					type={row.token.type}
					excludeTokenIds={[row.token.id]}
					testId={`ak-token-alias-${row.token.id}`}
					// The alias lands in the mode the author is LOOKING at.
					// It used to always land in `defaultMode`, which was
					// unambiguous only while there was no way to look at
					// another one: with `p5-007`'s switch, aliasing while
					// previewing dark and having the value appear under light
					// would be the surface silently disagreeing with itself.
					// Identical behaviour until the mode is switched, because
					// `activeMode` falls back to `defaultMode`.
					onAttach={(tokenId) =>
						state.setTokenValue(row.token.id, state.activeMode, {
							kind: "alias",
							tokenId,
						})
					}
				/>
			</div>

			{row.unresolved ? (
				<p
					className="text-[10px] text-[var(--destructive)]"
					data-testid="ak-token-unresolved"
				>
					{msg("studio.editor.token.unresolved")}
				</p>
			) : null}
			<ErrorList errors={errors} testId="ak-token-row-errors" />
		</li>
	);
}

/** Confirm + impact for one token. */
function TokenDeleteDialog({
	state,
	row,
	onClose,
}: {
	readonly state: DesignSystemPanelState;
	readonly row: DesignSystemTokenRow;
	readonly onClose: () => void;
}): ReactNode {
	const msg = useMsg();
	const deletable = canDeleteToken(row);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				data-testid="ak-token-delete-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>{msg("studio.editor.token.delete.title")}</DialogTitle>
				</DialogHeader>
				<p className="text-sm">{row.path}</p>
				{/*
				 * The impact is the reference count, stated plainly. It is not
				 * a disposition chooser: with today's helpers a rewrite of the
				 * references would span two carriers and two history entries
				 * (see this file's header), so a referenced token is not
				 * deletable rather than deletable-and-silently-repainting.
				 */}
				<p
					className="text-xs text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-token-delete-impact"
					data-usage-count={row.usageCount}
				>
					{`${msg("studio.editor.token.usage")}: ${row.usageCount}`}
				</p>
				<DialogFooter className="mt-2">
					<Button
						type="button"
						variant="ghost"
						onClick={onClose}
						data-testid="ak-token-delete-cancel"
					>
						{msg("studio.editor.component.delete.cancel")}
					</Button>
					<Button
						type="button"
						variant="destructive"
						disabled={!deletable}
						onClick={() => {
							state.deleteToken(row.token.id);
							onClose();
						}}
						data-testid="ak-token-delete-confirm"
					>
						{msg("studio.editor.component.delete.action")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** Reusable style definitions: create, rename, attach/detach, delete. */
function StyleSection({
	state,
}: {
	readonly state: DesignSystemPanelState;
}): ReactNode {
	const msg = useMsg();
	const [name, setName] = useState("");
	const [deleting, setDeleting] = useState<string | null>(null);
	const target = state.styles.find(
		(entry) => entry.definition.id === deleting,
	) as DesignSystemStyleRow | undefined;

	return (
		<section
			className="flex flex-col gap-1.5"
			aria-label={msg("studio.editor.style.definitions")}
			data-testid="ak-style-definitions"
		>
			<h3 className="text-[11px] font-medium">
				{msg("studio.editor.style.definitions")}
			</h3>
			{state.styles.length === 0 ? (
				<p
					className="text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-styles-empty"
				>
					{msg("studio.editor.style.empty")}
				</p>
			) : (
				<ul className="flex flex-col gap-1" data-testid="ak-styles-list">
					{state.styles.map((entry) => {
						const attached = state.attachedStyleIds.includes(
							entry.definition.id,
						);
						return (
							<li
								key={entry.definition.id}
								className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-1.5"
								data-testid="ak-style-row"
								data-style-id={entry.definition.id}
								data-attached={attached ? "true" : "false"}
							>
								<div className="flex items-center gap-1">
									<Input
										key={entry.definition.name}
										defaultValue={entry.definition.name}
										aria-label={msg("studio.editor.style.name")}
										className="h-6 flex-1 text-[11px]"
										data-testid="ak-style-name"
										onBlur={(event) => {
											if (event.target.value === entry.definition.name) return;
											state.renameStyle(
												entry.definition.id,
												event.target.value,
											);
										}}
									/>
									<span
										className="shrink-0 text-[10px] text-[var(--ak-studio-muted-fg)]"
										data-testid="ak-style-usage-count"
									>
										{entry.nodeIds.length}
									</span>
								</div>
								<div className="flex flex-wrap gap-1">
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-5 px-1.5 text-[10px]"
										disabled={!state.canAttach || attached}
										onClick={() => state.attachStyle(entry.definition.id)}
										data-testid={`ak-style-attach-${entry.definition.id}`}
									>
										{msg("studio.editor.style.attach")}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-5 px-1.5 text-[10px]"
										disabled={!state.canAttach || !attached}
										onClick={() => state.detachStyle(entry.definition.id)}
										data-testid={`ak-style-detach-${entry.definition.id}`}
									>
										{msg("studio.editor.style.detach")}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										className="h-5 px-1.5 text-[10px]"
										onClick={() => setDeleting(entry.definition.id)}
										data-testid={`ak-style-delete-${entry.definition.id}`}
									>
										{msg("studio.editor.component.delete.action")}
									</Button>
								</div>
							</li>
						);
					})}
				</ul>
			)}

			<div className="flex items-center gap-1">
				<Input
					value={name}
					aria-label={msg("studio.editor.style.create")}
					placeholder={msg("studio.editor.style.create")}
					className="h-6 flex-1 text-[11px]"
					data-testid="ak-style-create-input"
					onChange={(event) => setName(event.target.value)}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[10px]"
					disabled={name.trim() === ""}
					onClick={() => {
						state.createStyle(name);
						setName("");
					}}
					data-testid="ak-style-create-submit"
				>
					{msg("studio.editor.style.create")}
				</Button>
			</div>

			{target === undefined ? null : (
				<Dialog
					open
					onOpenChange={(open) => {
						if (!open) setDeleting(null);
					}}
				>
					<DialogContent
						data-testid="ak-style-delete-dialog"
						showCloseButton={false}
					>
						<DialogHeader>
							<DialogTitle>
								{msg("studio.editor.style.delete.title")}
							</DialogTitle>
						</DialogHeader>
						{/* The affected-element count is shown BEFORE committing:
						    §15.1's rule is that a shared value never changes the
						    page silently. `materialize` is not offered because it
						    would have to write those elements' own layers, which
						    is a second carrier and a second history entry. */}
						<p
							className="text-xs text-[var(--ak-studio-muted-fg)]"
							data-testid="ak-style-delete-impact"
						>
							{msg("studio.editor.style.delete.impact").replace(
								"{count}",
								String(target.nodeIds.length),
							)}
						</p>
						<DialogFooter className="mt-2">
							<Button
								type="button"
								variant="ghost"
								onClick={() => setDeleting(null)}
								data-testid="ak-style-delete-cancel"
							>
								{msg("studio.editor.component.delete.cancel")}
							</Button>
							<Button
								type="button"
								variant="destructive"
								onClick={() => {
									state.deleteStyle(target.definition.id);
									setDeleting(null);
								}}
								data-testid="ak-style-delete-discard"
							>
								{msg("studio.editor.style.delete.discard")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</section>
	);
}

/** The Design System tab body. Must render inside `<Puck>`. */
export function DesignSystemPanel(): ReactNode {
	const msg = useMsg();
	const state = useDesignSystemPanel();
	const [name, setName] = useState("");
	const [type, setType] = useState<TokenType>("color");
	const [value, setValue] = useState("");
	const [createError, setCreateError] = useState<readonly string[]>([]);
	const [deleting, setDeleting] = useState<string | null>(null);

	const deletingRow = state.groups
		.flatMap((group) => group.tokens)
		.find((row) => row.token.id === deleting);

	return (
		<section
			className="flex flex-col gap-3"
			aria-label={msg("studio.editor.token.system")}
			data-testid="ak-design-system-panel"
			data-token-count={state.tokenCount}
		>
			{/* The previewed mode, above the tokens it re-resolves. */}
			<TokenModeSwitch state={state} />

			<div className="flex flex-col gap-1.5">
				<h3 className="text-[11px] font-medium">
					{msg("studio.editor.token.tokens")}
				</h3>
				{state.tokenCount === 0 ? (
					<p
						className="text-[10px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-tokens-empty"
					>
						{msg("studio.editor.token.empty")}
					</p>
				) : (
					<div className="flex flex-col gap-2" data-testid="ak-tokens-list">
						{state.groups.map((group) => (
							<div
								key={group.name}
								className="flex flex-col gap-1"
								data-testid="ak-token-group"
								data-group-name={group.name}
							>
								{/* The group heading is the token path prefix — data,
								    not a translatable string, so it is rendered
								    verbatim rather than keyed. */}
								{group.name === "" ? null : (
									<p className="font-mono text-[10px] uppercase text-[var(--ak-studio-muted-fg)]">
										{group.name}
									</p>
								)}
								<ul className="flex flex-col gap-1">
									{group.tokens.map((row) => (
										<TokenRow
											key={row.token.id}
											state={state}
											row={row}
											onDelete={() => setDeleting(row.token.id)}
										/>
									))}
								</ul>
							</div>
						))}
					</div>
				)}

				<div className="flex flex-wrap items-center gap-1">
					<Input
						value={name}
						aria-label={msg("studio.editor.token.name")}
						placeholder={msg("studio.editor.token.name")}
						className="h-6 flex-1 text-[11px]"
						data-testid="ak-token-create-name"
						onChange={(event) => setName(event.target.value)}
					/>
					<Select
						value={type}
						onValueChange={(next) => {
							if (typeof next === "string") setType(next as TokenType);
						}}
					>
						<SelectTrigger
							className="h-6 w-24 text-[10px]"
							aria-label={msg("studio.editor.token.type")}
							data-testid="ak-token-create-type"
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{TOKEN_TYPES.map((entry) => (
								<SelectItem key={entry} value={entry}>
									{entry}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					<Input
						value={value}
						aria-label={msg("studio.editor.token.value")}
						placeholder={msg("studio.editor.token.value")}
						className="h-6 w-24 text-[10px]"
						data-testid="ak-token-create-value"
						onChange={(event) => setValue(event.target.value)}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[10px]"
						disabled={name.trim() === ""}
						onClick={() => {
							// Parsed against the DECLARED type before anything
							// commits, so a typo cannot store a raw string where the
							// compiler expects a `CssLength`.
							const parsed = parseTokenLiteral(type, value);
							if (parsed === null) {
								setCreateError([
									msg("studio.editor.token.invalidValue").replace(
										"{type}",
										type,
									),
								]);
								return;
							}
							setCreateError([]);
							state.createToken({ name, type, value: parsed.value });
							setName("");
							setValue("");
						}}
						data-testid="ak-token-create-submit"
					>
						{msg("studio.editor.token.create")}
					</Button>
				</div>
				<ErrorList errors={createError} testId="ak-token-create-errors" />
			</div>

			<StyleSection state={state} />

			<ErrorList errors={state.lastErrors} testId="ak-design-system-errors" />

			{deletingRow === undefined ? null : (
				<TokenDeleteDialog
					state={state}
					row={deletingRow}
					onClose={() => setDeleting(null)}
				/>
			)}
		</section>
	);
}

/**
 * The roster entry `p4-009` registers. Exported from this file so the
 * promotion task wires the panel without editing it.
 *
 * `studio.editor.token.system` ("Design system") is the shipped catalog
 * key for this surface in all four locales — reused rather than
 * re-keyed, so the tab needs no new catalog entries.
 */
export const DESIGN_SYSTEM_PANEL: StudioInspectorPanel = {
	id: "design-system",
	labelKey: "studio.editor.token.system",
	render: () => <DesignSystemPanel />,
};
