/**
 * @file `layer/pages` add-page dialog (PRD §6.4).
 *
 * Captures `{ title, path, route }` and dispatches to
 * {@link StudioPagesSource.onCreate}. Validates `path` starts with `/`
 * when `route=true` per the build plan §4 D3. Async `onCreate` is
 * awaited so the host can report errors that surface in the form.
 */

import { type FormEvent, type ReactNode, useCallback, useState } from "react";

import { useStudioPagesSource } from "@/context/pages-source";
import { Button } from "@/primitives/button";
import { Checkbox } from "@/primitives/checkbox";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/primitives/dialog";
import {
	Field,
	FieldContent,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@/primitives/field";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-store";

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
	const titleId = "ak-layer-add-page-title";
	const pathId = "ak-layer-add-page-path";
	const routeId = "ak-layer-add-page-route";

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-testid="ak-layer-add-page-dialog"
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.module.layer.pages.dialog.title")}
					</DialogTitle>
				</DialogHeader>
				<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={titleId}>
								{msg("studio.module.layer.pages.dialog.field.title")}
							</FieldLabel>
							<Input
								id={titleId}
								value={form.title}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, title: event.target.value }))
								}
								required
								data-testid="ak-layer-add-page-title"
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={pathId}>
								{msg("studio.module.layer.pages.dialog.field.path")}
							</FieldLabel>
							<Input
								id={pathId}
								value={form.path}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, path: event.target.value }))
								}
								placeholder="/about"
								data-testid="ak-layer-add-page-path"
							/>
						</Field>
						<Field orientation="horizontal">
							<Checkbox
								id={routeId}
								checked={form.route}
								onCheckedChange={(checked) =>
									setForm((prev) => ({ ...prev, route: checked === true }))
								}
								data-testid="ak-layer-add-page-route"
							/>
							<FieldContent>
								<FieldLabel htmlFor={routeId}>
									{msg("studio.module.layer.pages.dialog.field.route")}
								</FieldLabel>
							</FieldContent>
						</Field>
						{error !== null ? (
							<FieldError data-testid="ak-layer-add-page-error">
								{error}
							</FieldError>
						) : null}
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
								disabled={submitDisabled}
								data-testid="ak-layer-add-page-submit"
							>
								{msg("studio.module.layer.pages.dialog.submit")}
							</Button>
						</DialogFooter>
					</FieldGroup>
				</form>
			</DialogContent>
		</Dialog>
	);
}
