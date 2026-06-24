/**
 * @file New-folder dialog for the image module (PRD 0002 §7.4; report 0003
 * P2-11).
 *
 * Replaces the inline name input that used to live in {@link FolderNav}: the
 * panel-header actions menu now opens this dialog instead of an inline field,
 * so folder creation is a single cohesive surface. Mirrors the
 * {@link RenameAssetDialog} / `AddPageDialog` idiom — single field, cancel /
 * submit row, async `onSubmit` so the source can throw and the form can surface
 * the message inline. Remounts the form on each open so the draft starts empty.
 */

import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/primitives/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/primitives/field";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-context";

export interface NewFolderDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	/** Create the folder. May throw to surface an inline error. */
	readonly onSubmit: (name: string) => Promise<void>;
}

export function NewFolderDialog({
	open,
	onOpenChange,
	onSubmit,
}: NewFolderDialogProps): ReactNode {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				data-testid="ak-image-new-folder-dialog"
				showCloseButton={false}
			>
				{open ? (
					// Mount fresh per open so draft/error/submitting reset themselves.
					<NewFolderForm onOpenChange={onOpenChange} onSubmit={onSubmit} />
				) : null}
			</DialogContent>
		</Dialog>
	);
}

interface NewFolderFormProps {
	readonly onOpenChange: (open: boolean) => void;
	readonly onSubmit: (name: string) => Promise<void>;
}

function NewFolderForm({
	onOpenChange,
	onSubmit,
}: NewFolderFormProps): ReactNode {
	const msg = useMsg();
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (
		event: FormEvent<HTMLFormElement>,
	): Promise<void> => {
		event.preventDefault();
		const trimmed = draft.trim();
		if (trimmed === "") {
			onOpenChange(false);
			return;
		}
		setSubmitting(true);
		try {
			await onSubmit(trimmed);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSubmitting(false);
		}
	};
	const inputId = "ak-image-new-folder-input-field";

	return (
		<>
			<DialogHeader>
				<DialogTitle>{msg("studio.module.image.folder.new")}</DialogTitle>
			</DialogHeader>
			<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
				<FieldGroup>
					<Field>
						<FieldLabel htmlFor={inputId}>
							{msg("studio.module.image.folder.newPrompt")}
						</FieldLabel>
						<Input
							id={inputId}
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							placeholder={msg("studio.module.image.folder.newPrompt")}
							autoFocus
							required
							data-testid="ak-image-new-folder-input"
						/>
					</Field>
					{error !== null ? <FieldError>{error}</FieldError> : null}
					<DialogFooter className="mt-2">
						<DialogClose
							render={
								<Button variant="ghost" type="button">
									{msg("studio.module.layer.pages.dialog.cancel")}
								</Button>
							}
						/>
						<Button
							type="submit"
							disabled={submitting || draft.trim().length === 0}
							data-testid="ak-image-new-folder-submit"
						>
							{msg("studio.module.image.folder.create")}
						</Button>
					</DialogFooter>
				</FieldGroup>
			</form>
		</>
	);
}
