/**
 * @file Confirmation dialog for `StudioPagesSource.onDelete`
 * (plan 0004 P2). Mirrors `AddPageDialog`'s `submitting` + `error`
 * pattern verbatim so callers see a consistent form lifecycle.
 *
 * Capability-gated: only rendered by `PageRow` when the host actually
 * implements `onDelete` and the page is not `locked`. The confirm
 * button uses the `--ak-pages-danger-bg/-fg` semantic tokens.
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
import type { StudioPage } from "@/types/pages";

export interface PageDeleteConfirmDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly page: StudioPage;
	readonly onConfirm: () => void | Promise<void>;
}

export function PageDeleteConfirmDialog({
	open,
	onOpenChange,
	page,
	onConfirm,
}: PageDeleteConfirmDialogProps): ReactNode {
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

	const title = page.title.length > 0 ? page.title : (page.path ?? page.id);
	const body = msg("studio.module.layer.pages.delete.confirm.body").replace(
		"{title}",
		title,
	);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-testid={`ak-layer-page-delete-dialog-${page.id}`}
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.module.layer.pages.delete.confirm.title")}
					</DialogTitle>
				</DialogHeader>
				<p className="text-sm text-[var(--ak-pages-fg,var(--ak-studio-fg))]">
					{body}
				</p>
				{error !== null ? (
					<FieldError
						data-testid={`ak-layer-page-delete-dialog-${page.id}-error`}
					>
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
						data-testid={`ak-layer-page-delete-dialog-${page.id}-confirm`}
						className="bg-[var(--ak-pages-danger-bg,var(--destructive))] text-[var(--ak-pages-danger-fg,white)] hover:bg-[var(--ak-pages-danger-bg,var(--destructive))]/90"
					>
						{msg("studio.module.layer.pages.delete.confirm.confirm")}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
