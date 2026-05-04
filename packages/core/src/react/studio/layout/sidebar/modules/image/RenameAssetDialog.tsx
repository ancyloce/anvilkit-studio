/**
 * @file Inline rename dialog for an asset tile (PRD §7.4 Rename).
 *
 * Mirrors the `AddPageDialog` idiom — single field, cancel/submit row,
 * async `onSubmit` so the source can throw and the form can surface
 * the message inline.
 */

import { type FormEvent, type ReactNode, useEffect, useState } from "react";

import type { StudioAsset } from "../../../../../../types/sidebar.js";
import { Button } from "../../../../primitives/Button.js";
import { Dialog } from "../../../../primitives/Dialog.js";
import { Input } from "../../../../primitives/Input.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";

export interface RenameAssetDialogProps {
	readonly asset: StudioAsset | null;
	readonly onOpenChange: (open: boolean) => void;
	readonly onSubmit: (asset: StudioAsset, nextName: string) => Promise<void>;
}

export function RenameAssetDialog({
	asset,
	onOpenChange,
	onSubmit,
}: RenameAssetDialogProps): ReactNode {
	const msg = useMsg();
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (asset !== null) {
			setDraft(asset.name);
			setError(null);
			setSubmitting(false);
		}
	}, [asset]);

	const handleSubmit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
		event.preventDefault();
		if (asset === null) return;
		const trimmed = draft.trim();
		if (trimmed === "" || trimmed === asset.name) {
			onOpenChange(false);
			return;
		}
		setSubmitting(true);
		try {
			await onSubmit(asset, trimmed);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
			setSubmitting(false);
		}
	};

	return (
		<Dialog.Root open={asset !== null} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop />
				<Dialog.Popup data-testid="ak-image-rename-dialog">
					<Dialog.Title>{msg("studio.module.image.actions.rename")}</Dialog.Title>
					<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
						<Input
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							autoFocus
							required
							data-testid="ak-image-rename-input"
						/>
						{error !== null ? (
							<p
								role="alert"
								className="text-xs text-red-600 dark:text-red-400"
							>
								{error}
							</p>
						) : null}
						<div className="mt-2 flex justify-end gap-2">
							<Dialog.Close
								render={
									<Button variant="ghost" type="button">
										{msg("studio.module.layer.pages.dialog.cancel")}
									</Button>
								}
							/>
							<Button
								type="submit"
								disabled={submitting || draft.trim().length === 0}
								data-testid="ak-image-rename-submit"
							>
								{msg("studio.module.image.actions.rename")}
							</Button>
						</div>
					</form>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
