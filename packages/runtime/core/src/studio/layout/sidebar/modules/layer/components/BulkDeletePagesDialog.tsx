/**
 * @file Confirmation dialog for bulk-deleting selected pages (report 0003
 * P2-7a). Mirrors {@link PageDeleteConfirmDialog} — `submitting` + inline
 * `error` lifecycle, danger-token confirm button — but operates on a count
 * rather than a single page.
 *
 * Rendered by {@link PagesPanel} when a multi-selection is bulk-deleted; the
 * panel passes the number of deletable pages and an `onConfirm` that removes
 * them through `StudioPagesSource.onDelete`.
 */

import { type ReactNode, useCallback, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import { FieldError } from "@/primitives/field";
import { useMsg } from "@/state/editor-i18n-context";

export interface BulkDeletePagesDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	/** Number of pages that will be deleted (the deletable subset of the selection). */
	readonly count: number;
	readonly onConfirm: () => void | Promise<void>;
}

export function BulkDeletePagesDialog({
	open,
	onOpenChange,
	count,
	onConfirm,
}: BulkDeletePagesDialogProps): ReactNode {
	const msg = useMsg();
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) {
				setError(null);
				setSubmitting(false);
			}
			onOpenChange(next);
		},
		[onOpenChange],
	);

	const handleConfirm = useCallback(async (): Promise<void> => {
		setError(null);
		setSubmitting(true);
		try {
			await onConfirm();
			setSubmitting(false);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSubmitting(false);
		}
	}, [onConfirm, onOpenChange]);

	const body = msg("studio.module.layer.pages.bulk.confirm.body").replace(
		"{count}",
		String(count),
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-testid="ak-layer-pages-bulk-delete-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.module.layer.pages.bulk.confirm.title")}
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--ak-pages-fg,var(--ak-studio-fg))]">
					{body}
				</p>
				{error !== null ? (
					<FieldError data-testid="ak-layer-pages-bulk-delete-dialog-error">
						{error}
					</FieldError>
				) : null}
				<DialogFooter className="mt-2">
					<DialogClose
						render={
							<Button variant="ghost" type="button" disabled={submitting}>
								{msg("studio.module.layer.pages.delete.confirm.cancel")}
							</Button>
						}
					/>
					<Button
						type="button"
						disabled={submitting}
						onClick={() => {
							void handleConfirm();
						}}
						data-testid="ak-layer-pages-bulk-delete-confirm"
						className="bg-[var(--ak-pages-danger-bg,var(--destructive))] text-[var(--ak-pages-danger-fg,white)] hover:bg-[var(--ak-pages-danger-bg,var(--destructive))]/90"
					>
						{msg("studio.module.layer.pages.delete.confirm.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
