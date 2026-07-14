/**
 * @file Confirmation dialog for deleting a single asset (replaces a
 * `window.confirm` call in `AssetOverflowMenu`). Mirrors
 * `BulkDeleteAssetsDialog` / `PageDeleteConfirmDialog`'s `submitting` +
 * inline `error` lifecycle so the delete flow reads consistently across
 * the sidebar.
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

export interface DeleteAssetDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	/** Display name of the asset being deleted. */
	readonly name: string;
	readonly onConfirm: () => void | Promise<void>;
}

export function DeleteAssetDialog({
	open,
	onOpenChange,
	name,
	onConfirm,
}: DeleteAssetDialogProps): ReactNode {
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

	const body = msg("studio.module.image.delete.confirm.body").replace(
		"{name}",
		name,
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-testid="ak-image-delete-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.module.image.delete.confirm.title")}
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--ak-studio-fg)]">{body}</p>
				{error !== null ? (
					<FieldError data-testid="ak-image-delete-dialog-error">
						{error}
					</FieldError>
				) : null}
				<DialogFooter className="mt-2">
					<DialogClose
						render={
							<Button variant="ghost" type="button" disabled={submitting}>
								{msg("studio.module.image.delete.confirm.cancel")}
							</Button>
						}
					/>
					<Button
						type="button"
						variant="destructive"
						disabled={submitting}
						onClick={() => {
							void handleConfirm();
						}}
						data-testid="ak-image-delete-dialog-confirm"
					>
						{msg("studio.module.image.delete.confirm.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
