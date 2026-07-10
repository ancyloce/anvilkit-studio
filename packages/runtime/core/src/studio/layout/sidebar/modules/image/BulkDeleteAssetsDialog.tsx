/**
 * @file Confirmation dialog for bulk-deleting selected assets (report 0003
 * P2-7b). Mirrors the layer module's bulk-delete dialog — `submitting` +
 * inline `error` lifecycle, danger-token confirm button — and operates on a
 * count. `ImageModule` passes an `onConfirm` that removes the selected assets
 * through `StudioAssetSource.delete`.
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

export interface BulkDeleteAssetsDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	/** Number of assets that will be deleted. */
	readonly count: number;
	readonly onConfirm: () => void | Promise<void>;
}

export function BulkDeleteAssetsDialog({
	open,
	onOpenChange,
	count,
	onConfirm,
}: BulkDeleteAssetsDialogProps): ReactNode {
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

	const body = msg("studio.module.image.bulk.confirm.body").replace(
		"{count}",
		String(count),
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-testid="ak-image-bulk-delete-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.module.image.bulk.confirm.title")}
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--ak-studio-fg)]">{body}</p>
				{error !== null ? (
					<FieldError data-testid="ak-image-bulk-delete-dialog-error">
						{error}
					</FieldError>
				) : null}
				<DialogFooter className="mt-2">
					<DialogClose
						render={
							<Button variant="ghost" type="button" disabled={submitting}>
								{msg("studio.module.image.bulk.cancel")}
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
						data-testid="ak-image-bulk-delete-confirm"
					>
						{msg("studio.module.image.bulk.delete")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
