"use client";

/**
 * @file `DesignSystemPanel` — document token and reusable-style
 * management (PLAN-0020 CORE-P2-001/-002/-003; ED-TOKEN-001..003,
 * ED-STYLEDEF-001/002; DD-0019 §9.4, §15.1).
 *
 * The management half of the design system, which previously had no
 * surface at all: the picker could create and attach a token, but
 * nothing could update one, author an alias, edit a mode value,
 * inspect where a token is used, or delete one with a considered
 * disposition. Same for reusable styles.
 *
 * ### Deletion is a two-step flow, deliberately
 *
 * Both delete paths show impact *before* committing — for tokens the
 * reference count, the alias dependents and the type-compatible
 * replacement choices; for styles the referencing-node count — and
 * the default disposition preserves appearance (`materialize`).
 * §15.1's rule is that deleting a shared value must never silently
 * change how the page looks, so "discard" is always an explicit
 * second choice, never the default.
 */

import type {
	EditorError,
	StyleDefinitionDeletionDisposition,
	TokenDeletionDisposition,
	TokenType,
} from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
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
	type DesignSystemModel,
	type DesignSystemToken,
	type TokenDeletionPreview,
	useDesignSystem,
} from "./use-design-system.js";

const TOKEN_TYPES: readonly TokenType[] = [
	"color",
	"length",
	"number",
	"fontFamily",
	"fontWeight",
	"shadow",
	"radius",
];

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

/** Impact preview + disposition choice for one token (ED-TOKEN-003). */
function TokenDeleteDialog({
	model,
	entry,
	onClose,
}: {
	readonly model: DesignSystemModel;
	readonly entry: DesignSystemToken;
	readonly onClose: () => void;
}): ReactNode {
	const msg = useMsg();
	const [preview, setPreview] = useState<TokenDeletionPreview | null>(null);
	const [replacementId, setReplacementId] = useState<string>("");
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [busy, setBusy] = useState(false);

	// Load the impact once, on open. Re-planning per keystroke would
	// show the user a moving target while they decide.
	if (preview === null && !busy) {
		setBusy(true);
		void model
			.previewTokenDeletion(entry.token.id, { kind: "materialize" })
			.then((next) => {
				setPreview(next);
				setBusy(false);
			});
	}

	const run = useCallback(
		async (disposition: TokenDeletionDisposition) => {
			setBusy(true);
			const outcome = await model.deleteToken(entry.token.id, disposition);
			setBusy(false);
			if (outcome.status === "committed") {
				onClose();
				return;
			}
			setErrors(outcome.errors);
		},
		[model, entry.token.id, onClose],
	);

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
				<p className="text-sm">{entry.path}</p>
				<p
					className="text-xs text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-token-delete-impact"
				>
					{msg("studio.editor.token.delete.impact")
						.replace("{count}", String(preview?.siteCount ?? 0))
						.replace("{aliases}", String(preview?.aliasDependents.length ?? 0))}
				</p>
				<ErrorList
					errors={preview?.errors ?? []}
					testId="ak-token-delete-plan-errors"
				/>

				{/* Type-compatible replacement choices only (§15.1). */}
				{(preview?.replacements.length ?? 0) > 0 ? (
					<label className="flex flex-col gap-1 text-[11px]">
						<span className="text-[var(--ak-studio-muted-fg)]">
							{msg("studio.editor.token.delete.replaceWith")}
						</span>
						<Select value={replacementId} onValueChange={setReplacementId}>
							<SelectTrigger
								className="h-7 text-[11px]"
								aria-label={msg("studio.editor.token.delete.replaceWith")}
								data-testid="ak-token-delete-replacement"
							>
								<SelectValue
									placeholder={msg("studio.editor.token.delete.replaceNone")}
								/>
							</SelectTrigger>
							<SelectContent>
								{preview?.replacements.map((candidate) => (
									<SelectItem key={candidate.id} value={candidate.id}>
										{candidate.name}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</label>
				) : null}

				<ErrorList errors={errors} testId="ak-token-delete-errors" />
				<DialogFooter className="mt-2">
					<Button
						type="button"
						variant="ghost"
						disabled={busy}
						onClick={onClose}
						data-testid="ak-token-delete-cancel"
					>
						{msg("studio.editor.component.delete.cancel")}
					</Button>
					{replacementId.length > 0 ? (
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={() =>
								void run({ kind: "replace", tokenId: replacementId })
							}
							data-testid="ak-token-delete-replace"
						>
							{msg("studio.editor.token.delete.replace")}
						</Button>
					) : (
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={() => void run({ kind: "materialize" })}
							data-testid="ak-token-delete-materialize"
						>
							{msg("studio.editor.token.delete.materialize")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

/** One token row: rename, per-mode value, alias, usage, delete. */
function TokenRow({
	model,
	entry,
	onDelete,
}: {
	readonly model: DesignSystemModel;
	readonly entry: DesignSystemToken;
	readonly onDelete: () => void;
}): ReactNode {
	const msg = useMsg();
	const [name, setName] = useState(entry.path);
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [aliasTarget, setAliasTarget] = useState("");

	return (
		<li
			className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-1.5"
			data-testid="ak-token-row"
			data-token-id={entry.token.id}
		>
			<div className="flex items-center gap-1">
				<Input
					value={name}
					aria-label={msg("studio.editor.token.name")}
					className="h-6 flex-1 text-[11px]"
					data-testid="ak-token-name"
					disabled={!model.canMutate}
					onChange={(event) => setName(event.target.value)}
					onBlur={async () => {
						if (name === entry.path) return;
						setErrors((await model.renameToken(entry.token.id, name)).errors);
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
					{entry.usageCount}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					disabled={!model.canMutate}
					onClick={onDelete}
					data-testid={`ak-token-delete-${entry.token.id}`}
				>
					{msg("studio.editor.component.delete.action")}
				</Button>
			</div>

			{/* Per-mode values, with the fallback made visible. */}
			<ul className="flex flex-col gap-0.5" data-testid="ak-token-modes">
				{model.modes.map((mode) => {
					const value = entry.token.values[mode.id];
					const resolved = entry.resolvedByMode[mode.id];
					return (
						<li
							key={mode.id}
							className="flex items-center gap-1 text-[10px]"
							data-testid="ak-token-mode"
							data-mode-id={mode.id}
						>
							<span className="w-12 shrink-0 text-[var(--ak-studio-muted-fg)]">
								{mode.name}
							</span>
							<Input
								defaultValue={
									value?.kind === "literal" ? String(value.value ?? "") : ""
								}
								aria-label={`${entry.path} ${mode.name}`}
								placeholder={
									value === undefined
										? msg("studio.editor.token.inherited")
										: undefined
								}
								className="h-5 flex-1 text-[10px]"
								data-testid="ak-token-mode-value"
								disabled={!model.canMutate || value?.kind === "alias"}
								onBlur={async (event) => {
									setErrors(
										(
											await model.setTokenValue(entry.token.id, mode.id, {
												kind: "literal",
												value: event.target.value,
											})
										).errors,
									);
								}}
							/>
							<span
								className="w-16 shrink-0 truncate text-[var(--ak-studio-muted-fg)]"
								data-testid="ak-token-resolved"
							>
								{resolved === undefined
									? msg("studio.editor.token.unresolved")
									: String(resolved)}
							</span>
						</li>
					);
				})}
			</ul>

			{/* Alias authoring — cycles and depth are rejected by the
			    reducer's own graph check, and the rejection is rendered. */}
			<div className="flex items-center gap-1">
				<Select
					value={aliasTarget}
					disabled={!model.canMutate}
					onValueChange={async (next) => {
						setAliasTarget(next);
						setErrors(
							(
								await model.setTokenValue(entry.token.id, model.defaultMode, {
									kind: "alias",
									tokenId: next,
								})
							).errors,
						);
					}}
				>
					<SelectTrigger
						className="h-5 flex-1 text-[10px]"
						aria-label={msg("studio.editor.token.alias")}
						data-testid={`ak-token-alias-${entry.token.id}`}
					>
						<SelectValue placeholder={msg("studio.editor.token.alias")} />
					</SelectTrigger>
					<SelectContent>
						{model.tokens
							.filter(
								(candidate) =>
									candidate.token.id !== entry.token.id &&
									candidate.token.type === entry.token.type,
							)
							.map((candidate) => (
								<SelectItem key={candidate.token.id} value={candidate.token.id}>
									{candidate.path}
								</SelectItem>
							))}
					</SelectContent>
				</Select>
			</div>

			{entry.unresolved ? (
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

/** Reusable style definitions: create, rename, attach/detach, delete. */
function StyleSection({
	model,
}: {
	readonly model: DesignSystemModel;
}): ReactNode {
	const msg = useMsg();
	const [name, setName] = useState("");
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [deleting, setDeleting] = useState<string | null>(null);
	const target = model.styles.find((entry) => entry.definition.id === deleting);

	const remove = useCallback(
		async (disposition: StyleDefinitionDeletionDisposition) => {
			if (target === undefined) return;
			const outcome = await model.deleteStyle(
				target.definition.id,
				disposition,
			);
			if (outcome.status === "committed") {
				setDeleting(null);
				return;
			}
			setErrors(outcome.errors);
		},
		[model, target],
	);

	return (
		<section
			className="flex flex-col gap-1.5"
			aria-label={msg("studio.editor.style.definitions")}
			data-testid="ak-style-definitions"
		>
			<h3 className="text-[11px] font-medium">
				{msg("studio.editor.style.definitions")}
			</h3>
			{model.styles.length === 0 ? (
				<p
					className="text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-styles-empty"
				>
					{msg("studio.editor.style.empty")}
				</p>
			) : (
				<ul className="flex flex-col gap-1" data-testid="ak-styles-list">
					{model.styles.map((entry) => (
						<li
							key={entry.definition.id}
							className="flex flex-col gap-1 rounded border border-[var(--ak-studio-border)] p-1.5"
							data-testid="ak-style-row"
							data-style-id={entry.definition.id}
						>
							<div className="flex items-center gap-1">
								<Input
									defaultValue={entry.definition.name}
									aria-label={msg("studio.editor.style.name")}
									className="h-6 flex-1 text-[11px]"
									data-testid="ak-style-name"
									disabled={!model.canMutate}
									onBlur={async (event) => {
										if (event.target.value === entry.definition.name) return;
										setErrors(
											(
												await model.renameStyle(
													entry.definition.id,
													event.target.value,
												)
											).errors,
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
									disabled={
										!model.canMutate || model.selectedNodeIds.length === 0
									}
									onClick={async () =>
										setErrors(
											(await model.attachStyle(entry.definition.id)).errors,
										)
									}
									data-testid={`ak-style-attach-${entry.definition.id}`}
								>
									{msg("studio.editor.style.attach")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-5 px-1.5 text-[10px]"
									disabled={
										!model.canMutate || model.selectedNodeIds.length === 0
									}
									onClick={async () =>
										setErrors(
											(await model.detachStyle(entry.definition.id)).errors,
										)
									}
									data-testid={`ak-style-detach-${entry.definition.id}`}
								>
									{msg("studio.editor.style.detach")}
								</Button>
								<Button
									type="button"
									variant="ghost"
									size="sm"
									className="h-5 px-1.5 text-[10px]"
									disabled={!model.canMutate}
									onClick={() => setDeleting(entry.definition.id)}
									data-testid={`ak-style-delete-${entry.definition.id}`}
								>
									{msg("studio.editor.component.delete.action")}
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			<div className="flex items-center gap-1">
				<Input
					value={name}
					aria-label={msg("studio.editor.style.create")}
					placeholder={msg("studio.editor.style.create")}
					className="h-6 flex-1 text-[11px]"
					data-testid="ak-style-create-input"
					disabled={!model.canMutate}
					onChange={(event) => setName(event.target.value)}
				/>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-6 px-2 text-[10px]"
					disabled={!model.canMutate}
					onClick={async () => {
						const outcome = await model.createStyle(name);
						setErrors(outcome.errors);
						if (outcome.status === "committed") setName("");
					}}
					data-testid="ak-style-create-submit"
				>
					{msg("studio.editor.style.create")}
				</Button>
			</div>
			<ErrorList errors={errors} testId="ak-style-errors" />

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
								onClick={() => void remove({ kind: "discard" })}
								data-testid="ak-style-delete-discard"
							>
								{msg("studio.editor.style.delete.discard")}
							</Button>
							<Button
								type="button"
								onClick={() => void remove({ kind: "materialize" })}
								data-testid="ak-style-delete-materialize"
							>
								{msg("studio.editor.style.delete.materialize")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</section>
	);
}

/**
 * The design-system panel. `null` when the editor runtime is off, so a
 * host without the visual editor sees no change.
 */
export function DesignSystemPanel(): ReactNode {
	const msg = useMsg();
	const model = useDesignSystem();
	const [name, setName] = useState("");
	const [type, setType] = useState<TokenType>("color");
	const [value, setValue] = useState("");
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [deleting, setDeleting] = useState<string | null>(null);

	if (model === null) {
		return null;
	}
	const target = model.tokens.find((entry) => entry.token.id === deleting);

	return (
		<section
			className="flex flex-col gap-3 p-2"
			aria-label={msg("studio.editor.token.system")}
			data-testid="ak-design-system-panel"
		>
			<div className="flex flex-col gap-1.5">
				<h3 className="text-[11px] font-medium">
					{msg("studio.editor.token.tokens")}
				</h3>
				{model.tokens.length === 0 ? (
					<p
						className="text-[10px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-tokens-empty"
					>
						{msg("studio.editor.token.empty")}
					</p>
				) : (
					<ul className="flex flex-col gap-1" data-testid="ak-tokens-list">
						{model.tokens.map((entry) => (
							<TokenRow
								key={entry.token.id}
								model={model}
								entry={entry}
								onDelete={() => setDeleting(entry.token.id)}
							/>
						))}
					</ul>
				)}

				<div className="flex flex-wrap items-center gap-1">
					<Input
						value={name}
						aria-label={msg("studio.editor.token.name")}
						placeholder={msg("studio.editor.token.name")}
						className="h-6 flex-1 text-[11px]"
						data-testid="ak-token-create-name"
						disabled={!model.canMutate}
						onChange={(event) => setName(event.target.value)}
					/>
					<Select
						value={type}
						disabled={!model.canMutate}
						onValueChange={(next) => setType(next as TokenType)}
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
						disabled={!model.canMutate}
						onChange={(event) => setValue(event.target.value)}
					/>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[10px]"
						disabled={!model.canMutate}
						onClick={async () => {
							const outcome = await model.createToken({ name, type, value });
							setErrors(outcome.errors);
							if (outcome.status === "committed") {
								setName("");
								setValue("");
							}
						}}
						data-testid="ak-token-create-submit"
					>
						{msg("studio.editor.token.create")}
					</Button>
				</div>
				<ErrorList errors={errors} testId="ak-token-create-errors" />
			</div>

			<StyleSection model={model} />

			{target === undefined ? null : (
				<TokenDeleteDialog
					model={model}
					entry={target}
					onClose={() => setDeleting(null)}
				/>
			)}
		</section>
	);
}
