/**
 * @file `layer/pages` add-page dialog (PRD §6.4).
 *
 * Captures `{ title, path, route }` and dispatches to
 * {@link StudioPagesSource.onCreate}. Validates `path` starts with `/`
 * when `route=true` per the build plan §4 D3. Async `onCreate` is
 * awaited so the host can report errors that surface in the form.
 */

import { type FormEvent, type ReactNode, useCallback, useState } from "react";

import { useStudioPagesSource } from "../../../../context/pages-source.js";
import { Button } from "../../../../primitives/Button.js";
import { Dialog } from "../../../../primitives/Dialog.js";
import { Input } from "../../../../primitives/Input.js";
import { useMsg } from "../../../../state/editor-i18n-store.js";

export interface AddPageDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
}

interface FormState {
	readonly title: string;
	readonly path: string;
	readonly route: boolean;
}

const INITIAL_FORM: FormState = {
	title: "",
	path: "",
	route: false,
};

export function AddPageDialog({
	open,
	onOpenChange,
}: AddPageDialogProps): ReactNode {
	const msg = useMsg();
	const source = useStudioPagesSource();
	const [form, setForm] = useState<FormState>(INITIAL_FORM);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const reset = useCallback(() => {
		setForm(INITIAL_FORM);
		setError(null);
		setSubmitting(false);
	}, []);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) reset();
			onOpenChange(next);
		},
		[onOpenChange, reset],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>): Promise<void> => {
			event.preventDefault();
			if (form.route && !form.path.startsWith("/")) {
				setError(msg("studio.module.layer.pages.dialog.error.path"));
				return;
			}
			setError(null);
			setSubmitting(true);
			try {
				await source?.onCreate?.({
					title: form.title,
					path: form.path,
					route: form.route,
				});
				reset();
				onOpenChange(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setSubmitting(false);
			}
		},
		[form, msg, onOpenChange, reset, source],
	);

	const submitDisabled =
		submitting ||
		form.title.trim().length === 0 ||
		(form.route && !form.path.startsWith("/"));

	return (
		<Dialog.Root open={open} onOpenChange={handleOpenChange}>
			<Dialog.Portal>
				<Dialog.Backdrop />
				<Dialog.Popup data-testid="ak-layer-add-page-dialog">
					<Dialog.Title>
						{msg("studio.module.layer.pages.dialog.title")}
					</Dialog.Title>
					<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-[var(--ak-studio-muted-fg)]">
								{msg("studio.module.layer.pages.dialog.field.title")}
							</span>
							<Input
								value={form.title}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, title: event.target.value }))
								}
								required
								data-testid="ak-layer-add-page-title"
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm">
							<span className="text-[var(--ak-studio-muted-fg)]">
								{msg("studio.module.layer.pages.dialog.field.path")}
							</span>
							<Input
								value={form.path}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, path: event.target.value }))
								}
								placeholder="/about"
								data-testid="ak-layer-add-page-path"
							/>
						</label>
						<label className="flex items-center gap-2 text-sm">
							<input
								type="checkbox"
								checked={form.route}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, route: event.target.checked }))
								}
								data-testid="ak-layer-add-page-route"
							/>
							<span className="text-[var(--ak-studio-fg)]">
								{msg("studio.module.layer.pages.dialog.field.route")}
							</span>
						</label>
						{error !== null ? (
							<p
								role="alert"
								className="text-xs text-red-600 dark:text-red-400"
								data-testid="ak-layer-add-page-error"
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
								disabled={submitDisabled}
								data-testid="ak-layer-add-page-submit"
							>
								{msg("studio.module.layer.pages.dialog.submit")}
							</Button>
						</div>
					</form>
				</Dialog.Popup>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
