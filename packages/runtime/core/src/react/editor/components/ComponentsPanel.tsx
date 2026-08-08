"use client";

/**
 * @file `ComponentsPanel` — the document-local component library
 * (PLAN-0028 `p5-006`; ED-COMP-002/-005/-006/-007; DD-0019 §14.2,
 * §14.6).
 *
 * The Components tab of the promoted composition inspector, and still
 * the body the legacy Components rail module renders. Five things live
 * here, all of which PLAN-0026 §3.8.3 requires to survive the rewrite:
 *
 * 1. **create from the current selection** — the panel-side entry
 *    point, so a capture does not depend on reaching the canvas
 *    toolbar (which renders inside the iframe);
 * 2. the **library listing**, one row per definition with its live
 *    instance count;
 * 3. **insert another instance**, **rename**, and **open in isolated
 *    editing** per row;
 * 4. **delete** through {@link DeleteDefinitionDialog}, which is where
 *    the host's `componentDefinitionDelete` policy becomes visible to
 *    the user — the affected instance count is shown *before* anything
 *    is committed, and `block-when-referenced` refuses rather than
 *    offering a detach-all it is not allowed to perform;
 * 5. the **instance section** for whatever is selected, so variant,
 *    override, reset and detach are reachable from the same tab;
 * 6. the **definition canvas** (`p5-007`) — the combination strip and
 *    the scoped node list, re-homed out of the legacy Layers rail so
 *    the definition-editing scope is reachable from the promoted
 *    shell at all (PLAN-0026 §3.8.4).
 *
 * ### Puck contract
 *
 * Rule 2 — definitions are read from and written to the declared
 * `root.props.componentLibrary` root prop; the instance carrier is the
 * instance node's own declared prop. Rule 3 — the same `Data` the
 * compiler, preview, `<Render>` and export consume; nothing here keeps
 * a second copy or resolves an instance for rendering.
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
import type { StudioInspectorPanel } from "../composition/inspector-panel.js";
import { ComponentInstanceSection } from "./ComponentInstanceSection.js";
import { DefinitionScopeCanvas } from "./DefinitionScope.js";
import {
	type ComponentLibrary,
	type ComponentLibraryEntry,
	useComponentLibrary,
} from "./use-component-library.js";
import { useCreateComponent } from "./use-create-component.js";

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

/**
 * Capture the current selection as a new component.
 *
 * The canvas selection toolbar files its capture through
 * `bridge.componentCapture` and `CreateComponentDialog` names it,
 * because a modal cannot live inside the canvas iframe. This is the
 * *panel-side* entry point: the panel already renders in the main
 * document, so it names the component inline rather than through a
 * dialog, and the promoted shell no longer depends on reaching the
 * in-iframe toolbar to make a component at all.
 */
function CreateFromSelection(): ReactNode {
	const msg = useMsg();
	const create = useCreateComponent();
	const [name, setName] = useState("");
	const [errors, setErrors] = useState<readonly EditorError[]>([]);

	if (create === null) {
		return null;
	}

	const submit = () => {
		const trimmed = name.trim();
		if (trimmed.length === 0 || !create.canCreate) return;
		const outcome = create.create(trimmed);
		setErrors(outcome.errors);
		if (outcome.status === "committed") setName("");
	};

	return (
		<div className="flex flex-col gap-1" data-testid="ak-component-create">
			<div className="flex items-center gap-1">
				<Input
					value={name}
					aria-label={msg("studio.editor.component.nameLabel")}
					placeholder={msg("studio.editor.component.nameLabel")}
					className="h-6 flex-1 text-[11px]"
					data-testid="ak-component-create-name"
					onChange={(event) => setName(event.target.value)}
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
					className="h-6 shrink-0 px-2 text-[10px]"
					// Disabled before the refusal, not after it: a capture with
					// nothing selected has no meaning, and §14.3's validation is
					// still the backstop for everything a count cannot see.
					disabled={!create.canCreate || name.trim().length === 0}
					onClick={submit}
					data-testid="ak-component-create-submit"
				>
					{msg("studio.editor.component.createFromSelection")}
				</Button>
			</div>
			<ErrorList errors={errors} testId="ak-component-create-errors" />
		</div>
	);
}

interface DeleteDialogProps {
	readonly entry: ComponentLibraryEntry;
	readonly library: ComponentLibrary;
	readonly onClose: () => void;
}

/**
 * The §14.6 deletion confirmation.
 *
 * Three outcomes, all reachable and all explicit:
 *
 * - **Cancel** — nothing is dispatched, the document is untouched.
 * - **Delete** (no instances) — a plain delete.
 * - **Detach all and delete** — one atomic `Data`, so a single undo
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
	const referenced = entry.instanceCount > 0;
	const blocked =
		referenced && library.deletePolicy === "block-when-referenced";

	const run = useCallback(
		(detachAll: boolean) => {
			const outcome = library.deleteDefinition(entry.definition.id, {
				detachAll,
			});
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
					{/* Never disabled: there is no close button, so cancel is the
					    only way out. */}
					<DialogClose
						render={
							<Button
								variant="ghost"
								type="button"
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
							onClick={() => run(true)}
							data-testid="ak-component-delete-detach-all"
						>
							{msg("studio.editor.component.delete.detachAll")}
						</Button>
					) : (
						<Button
							type="button"
							variant="destructive"
							onClick={() => run(false)}
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

	const commitRename = useCallback(() => {
		setRenaming(false);
		if (draft.trim() === entry.definition.name) return;
		setErrors(library.rename(entry.definition.id, draft)?.errors ?? []);
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
			data-active={active ? "true" : "false"}
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
						onBlur={commitRename}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitRename();
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
					onClick={() => library.insertInstance(entry.definition.id)}
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
 * The Components panel.
 *
 * Must render inside `<Puck>` — both the library projection and every
 * write bind to the live `PuckApi`.
 */
export function ComponentsPanel(): ReactNode {
	const msg = useMsg();
	const library = useComponentLibrary();
	const [deleting, setDeleting] = useState<string | null>(null);

	const target = library.entries.find(
		(entry) => entry.definition.id === deleting,
	);
	const activeEntry = library.entries.find(
		(entry) => entry.definition.id === library.activeDefinitionId,
	);

	return (
		<section
			className="flex flex-col gap-2 p-2"
			aria-label={msg("studio.editor.component.library")}
			data-testid="ak-components-panel"
		>
			{/* The isolated-editing breadcrumb. Entering a component clears
			    the page selection (§10.6), so without a way back out the
			    promoted shell would have a one-way door. */}
			{activeEntry === undefined ? null : (
				<nav
					className="flex items-center gap-1 text-xs"
					aria-label={msg("studio.editor.component.breadcrumb")}
					data-testid="ak-components-scope"
				>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						className="h-6 px-2 text-[11px]"
						onClick={library.exitComponent}
						data-testid="ak-component-exit"
					>
						{msg("studio.editor.component.backToPage")}
					</Button>
					<span aria-hidden="true" className="text-[var(--ak-studio-muted-fg)]">
						/
					</span>
					<span
						className="truncate font-medium"
						data-testid="ak-component-name"
					>
						{activeEntry.definition.name}
					</span>
				</nav>
			)}

			{/* The definition canvas — combination strip plus the scoped
			    node list — re-homed out of the legacy Layers rail by
			    `p5-007` (PLAN-0026 §3.8.4). `null` in page scope, so this
			    tab is the library listing until a definition is open and
			    the definition-editing surface once one is. Axis authoring
			    is the Variants tab, so it is not repeated here. */}
			<DefinitionScopeCanvas />

			<CreateFromSelection />

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

			{/* Variant selection, overrides, reset and detach for whatever
			    instance is selected. `null` when the selection is not one. */}
			<ComponentInstanceSection />

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

/**
 * The roster entry `StudioPuckLayout` registers. Exported from this
 * file so the shell wires the panel without editing it — the same
 * contract `STYLE_PANEL` and `DATA_PANEL` follow.
 */
export const COMPONENTS_PANEL: StudioInspectorPanel = {
	id: "components",
	labelKey: "studio.editor.component.library",
	render: () => <ComponentsPanel />,
};
