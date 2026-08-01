"use client";

/**
 * @file `ComponentsPanel` — the document-local component library
 * (PLAN-0020 CORE-P2-009F/G/H; ED-COMP-002/-005/-006/-007;
 * DD-0019 §14.2, §14.5).
 *
 * One row per definition, with the four lifecycle affordances §14.5
 * requires: open in isolated editing, insert another instance, rename,
 * and delete. Deletion routes through {@link DeleteDefinitionDialog},
 * which is where the host's `componentDefinitionDelete` policy becomes
 * visible to the user — the affected instance count is shown *before*
 * anything is committed, and `block-when-referenced` refuses rather
 * than offering a detach-all it is not allowed to perform.
 *
 * Statically imported for the same reason `ComponentCanvasPanel` is:
 * the `lazy(() => import(...))` boundary in exactly this position
 * never resolved in `apps/studio` (see the Phase 1B close), and the
 * only caller ships inside the async `StudioLayout` chunk, so these
 * bytes never reach the `<Studio>` entry chunk.
 */

import type { EditorError } from "@anvilkit/contracts/editor";
import type { ReactNode } from "react";
import { useCallback, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import { Input } from "@/primitives/input";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";
import {
	type ComponentLibrary,
	type ComponentLibraryEntry,
	useComponentLibrary,
} from "./use-component-library.js";

/** Render command rejections so a refusal is never silent. */
function ErrorList({
	errors,
	testId,
}: {
	readonly errors: readonly EditorError[];
	readonly testId: string;
}): ReactNode {
	if (errors.length === 0) {
		return null;
	}
	return (
		<ul
			className="flex flex-col gap-1 text-[11px] text-[var(--destructive)]"
			data-testid={testId}
			// Announced without stealing focus — the rejection is
			// informational, and focus belongs to whatever the user was
			// operating (a11y acceptance, ED-A11Y-002).
			role="status"
			aria-live="polite"
		>
			{errors.map((error) => (
				<li key={`${error.code}:${error.message}`}>{error.message}</li>
			))}
		</ul>
	);
}

interface DeleteDialogProps {
	readonly entry: ComponentLibraryEntry;
	readonly library: ComponentLibrary;
	readonly onClose: () => void;
}

/**
 * The §14.5 deletion confirmation.
 *
 * Three outcomes, all reachable and all explicit:
 *
 * - **Cancel** — nothing is dispatched, the document is untouched.
 * - **Delete** (no instances) — a plain delete.
 * - **Detach all and delete** — one atomic batch, so a single undo
 *   restores both the definition and every instance's reference.
 *
 * Under `block-when-referenced` the third option is not offered at
 * all and a referenced definition simply cannot be deleted; the dialog
 * says so rather than presenting a button that will be rejected.
 */
function DeleteDefinitionDialog({
	entry,
	library,
	onClose,
}: DeleteDialogProps): ReactNode {
	const msg = useMsg();
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const [busy, setBusy] = useState(false);
	const referenced = entry.instanceCount > 0;
	const blocked =
		referenced && library.deletePolicy === "block-when-referenced";

	const run = useCallback(
		async (detachAll: boolean) => {
			setBusy(true);
			const outcome = await library.deleteDefinition(entry.definition.id, {
				detachAll,
			});
			setBusy(false);
			if (outcome.status === "committed") {
				onClose();
				return;
			}
			setErrors(outcome.errors);
		},
		[library, entry.definition.id, onClose],
	);

	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent
				data-testid="ak-component-delete-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.editor.component.delete.title")}
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--ak-studio-fg)]">
					{entry.definition.name}
				</p>
				<p
					className="text-xs text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-component-delete-impact"
				>
					{referenced
						? msg("studio.editor.component.delete.instances").replace(
								"{count}",
								String(entry.instanceCount),
							)
						: msg("studio.editor.component.delete.unreferenced")}
				</p>
				{blocked ? (
					<p
						className="text-xs text-[var(--destructive)]"
						data-testid="ak-component-delete-blocked"
					>
						{msg("studio.editor.component.delete.blocked")}
					</p>
				) : null}
				<ErrorList errors={errors} testId="ak-component-delete-errors" />
				<DialogFooter className="mt-2">
					<DialogClose
						render={
							<Button
								variant="ghost"
								type="button"
								disabled={busy}
								data-testid="ak-component-delete-cancel"
							>
								{msg("studio.editor.component.delete.cancel")}
							</Button>
						}
					/>
					{blocked ? null : referenced ? (
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={() => void run(true)}
							data-testid="ak-component-delete-detach-all"
						>
							{msg("studio.editor.component.delete.detachAll")}
						</Button>
					) : (
						<Button
							type="button"
							variant="destructive"
							disabled={busy}
							onClick={() => void run(false)}
							data-testid="ak-component-delete-confirm"
						>
							{msg("studio.editor.component.delete.confirm")}
						</Button>
					)}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface RowProps {
	readonly entry: ComponentLibraryEntry;
	readonly library: ComponentLibrary;
	readonly onDelete: () => void;
}

/** One definition row: name (renameable in place) plus its actions. */
function ComponentRow({ entry, library, onDelete }: RowProps): ReactNode {
	const msg = useMsg();
	const [renaming, setRenaming] = useState(false);
	const [draft, setDraft] = useState(entry.definition.name);
	const [errors, setErrors] = useState<readonly EditorError[]>([]);
	const active = library.activeDefinitionId === entry.definition.id;

	const commitRename = useCallback(async () => {
		setRenaming(false);
		if (draft.trim() === entry.definition.name) return;
		const result = await library.rename(entry.definition.id, draft);
		setErrors(result?.errors ?? []);
	}, [draft, entry.definition, library]);

	return (
		<li
			className={cn(
				"flex flex-col gap-1 rounded border px-2 py-1.5",
				active
					? "border-[var(--ak-studio-border)] bg-[var(--ak-studio-hover)]"
					: "border-transparent",
			)}
			data-testid="ak-component-row"
			data-component-id={entry.definition.id}
		>
			<div className="flex items-center gap-1">
				{renaming ? (
					<Input
						autoFocus
						value={draft}
						aria-label={msg("studio.editor.component.rename")}
						className="h-6 flex-1 text-[11px]"
						data-testid="ak-component-rename-input"
						onChange={(event) => setDraft(event.target.value)}
						onBlur={() => void commitRename()}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								void commitRename();
							}
							if (event.key === "Escape") {
								event.preventDefault();
								setDraft(entry.definition.name);
								setRenaming(false);
							}
						}}
					/>
				) : (
					<button
						type="button"
						// The row's primary action is "open this component",
						// which is what a user expects from clicking its name.
						onClick={() => library.enterComponent(entry.definition.id)}
						className="flex-1 truncate text-left text-[11px] font-medium"
						data-testid={`ak-component-open-${entry.definition.id}`}
					>
						{entry.definition.name}
					</button>
				)}
				<span
					className="shrink-0 text-[10px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-component-instance-count"
				>
					{entry.instanceCount}
				</span>
			</div>
			<div className="flex flex-wrap items-center gap-1">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					disabled={!library.canMutate}
					onClick={() => void library.insertInstance(entry.definition.id)}
					data-testid={`ak-component-insert-${entry.definition.id}`}
				>
					{msg("studio.editor.component.insertInstance")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					disabled={!library.canMutate}
					onClick={() => {
						setDraft(entry.definition.name);
						setRenaming(true);
					}}
					data-testid={`ak-component-rename-${entry.definition.id}`}
				>
					{msg("studio.editor.component.rename")}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-5 px-1.5 text-[10px]"
					disabled={!library.canMutate}
					onClick={onDelete}
					data-testid={`ak-component-delete-${entry.definition.id}`}
				>
					{msg("studio.editor.component.delete.action")}
				</Button>
				{entry.combinationCount > 0 ? (
					<span
						className="text-[10px] text-[var(--ak-studio-muted-fg)]"
						data-testid="ak-component-combination-count"
					>
						{msg("studio.editor.component.combinations").replace(
							"{count}",
							String(entry.combinationCount),
						)}
					</span>
				) : null}
			</div>
			<ErrorList errors={errors} testId="ak-component-row-errors" />
		</li>
	);
}

/**
 * The Components panel. Renders `null` when the editor runtime is off,
 * so a host without the visual editor sees no change at all.
 */
export function ComponentsPanel(): ReactNode {
	const msg = useMsg();
	const library = useComponentLibrary();
	const [deleting, setDeleting] = useState<string | null>(null);

	if (library === null) {
		return null;
	}

	const target = library.entries.find(
		(entry) => entry.definition.id === deleting,
	);

	return (
		<section
			className="flex flex-col gap-2 p-2"
			aria-label={msg("studio.editor.component.library")}
			data-testid="ak-components-panel"
		>
			{library.entries.length === 0 ? (
				<p
					className="px-1 py-4 text-center text-[11px] text-[var(--ak-studio-muted-fg)]"
					data-testid="ak-components-empty"
				>
					{msg("studio.editor.component.empty")}
				</p>
			) : (
				<ul className="flex flex-col gap-1" data-testid="ak-components-list">
					{library.entries.map((entry) => (
						<ComponentRow
							key={entry.definition.id}
							entry={entry}
							library={library}
							onDelete={() => setDeleting(entry.definition.id)}
						/>
					))}
				</ul>
			)}
			{target === undefined ? null : (
				<DeleteDefinitionDialog
					entry={target}
					library={library}
					onClose={() => setDeleting(null)}
				/>
			)}
		</section>
	);
}
