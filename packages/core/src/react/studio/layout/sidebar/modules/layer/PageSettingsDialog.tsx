/**
 * @file Page settings + SEO dialog (plan 0004 P3).
 *
 * Mirrors `AddPageDialog`'s `try/catch → setError` + `submitting`
 * pattern. Prefills from the row's `StudioPage`; submits to
 * `StudioPagesSource.onUpdateSettings` with only the fields the user
 * changed (omitting unchanged optionals so hosts can use simple
 * `Object.assign`-style merges).
 *
 * Capability-gated by the caller: `PageRow` only mounts this when
 * `source.onUpdateSettings` is defined.
 */

import { type FormEvent, type ReactNode, useCallback, useState } from "react";
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
import { useMsg } from "@/state/editor-i18n-context";
import type {
	StudioPage,
	StudioPageSettingsInput,
	StudioPagesSource,
} from "@/types/pages";

export interface PageSettingsDialogProps {
	readonly open: boolean;
	readonly onOpenChange: (open: boolean) => void;
	readonly page: StudioPage;
	readonly onSubmit: NonNullable<StudioPagesSource["onUpdateSettings"]>;
}

interface FormState {
	readonly title: string;
	readonly path: string;
	readonly route: boolean;
	readonly description: string;
	readonly metaTitle: string;
	readonly metaDescription: string;
	readonly ogImage: string;
	readonly noindex: boolean;
}

function initialForm(page: StudioPage): FormState {
	return {
		title: page.title,
		path: page.path ?? "",
		route: page.route === true,
		description: page.description ?? "",
		metaTitle: page.seo?.metaTitle ?? "",
		metaDescription: page.seo?.metaDescription ?? "",
		ogImage: page.seo?.ogImage ?? "",
		noindex: page.seo?.noindex === true,
	};
}

/**
 * Build the `onUpdateSettings` payload, omitting fields whose
 * trimmed value matches the original. Empty SEO fields collapse the
 * `seo` block entirely so hosts can persist `seo: undefined`.
 */
function diffSettings(
	page: StudioPage,
	form: FormState,
): StudioPageSettingsInput {
	const trimmed = {
		title: form.title.trim(),
		path: form.path.trim(),
		description: form.description.trim(),
		metaTitle: form.metaTitle.trim(),
		metaDescription: form.metaDescription.trim(),
		ogImage: form.ogImage.trim(),
	};
	const out: { -readonly [K in keyof StudioPageSettingsInput]?: unknown } = {
		id: page.id,
	};
	if (trimmed.title !== page.title) out.title = trimmed.title;
	if (trimmed.path !== (page.path ?? "")) out.path = trimmed.path;
	if (form.route !== (page.route === true)) out.route = form.route;
	if (trimmed.description !== (page.description ?? ""))
		out.description = trimmed.description;
	const seo = {
		metaTitle: trimmed.metaTitle,
		metaDescription: trimmed.metaDescription,
		ogImage: trimmed.ogImage,
		noindex: form.noindex,
	};
	const seoChanged =
		seo.metaTitle !== (page.seo?.metaTitle ?? "") ||
		seo.metaDescription !== (page.seo?.metaDescription ?? "") ||
		seo.ogImage !== (page.seo?.ogImage ?? "") ||
		seo.noindex !== (page.seo?.noindex === true);
	if (seoChanged) {
		const seoOut: Record<string, unknown> = {};
		if (seo.metaTitle.length > 0) seoOut.metaTitle = seo.metaTitle;
		if (seo.metaDescription.length > 0)
			seoOut.metaDescription = seo.metaDescription;
		if (seo.ogImage.length > 0) seoOut.ogImage = seo.ogImage;
		if (seo.noindex) seoOut.noindex = true;
		out.seo = seoOut;
	}
	return out as StudioPageSettingsInput;
}

export function PageSettingsDialog({
	open,
	onOpenChange,
	page,
	onSubmit,
}: PageSettingsDialogProps): ReactNode {
	const msg = useMsg();
	const [form, setForm] = useState<FormState>(() => initialForm(page));
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const reset = useCallback(() => {
		setForm(initialForm(page));
		setError(null);
		setSubmitting(false);
	}, [page]);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (next) reset();
			else {
				setError(null);
				setSubmitting(false);
			}
			onOpenChange(next);
		},
		[onOpenChange, reset],
	);

	const handleSubmit = useCallback(
		async (event: FormEvent<HTMLFormElement>): Promise<void> => {
			event.preventDefault();
			if (form.route && !form.path.startsWith("/")) {
				setError(msg("studio.module.layer.pages.settings.error.path"));
				return;
			}
			setError(null);
			setSubmitting(true);
			try {
				await onSubmit(diffSettings(page, form));
				setSubmitting(false);
				onOpenChange(false);
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
				setSubmitting(false);
			}
		},
		[form, msg, onOpenChange, onSubmit, page],
	);

	const submitDisabled =
		submitting ||
		form.title.trim().length === 0 ||
		(form.route && !form.path.startsWith("/"));
	const titleId = `ak-layer-page-settings-${page.id}-title`;
	const pathId = `ak-layer-page-settings-${page.id}-path`;
	const routeId = `ak-layer-page-settings-${page.id}-route`;
	const descId = `ak-layer-page-settings-${page.id}-description`;
	const metaTitleId = `ak-layer-page-settings-${page.id}-meta-title`;
	const metaDescId = `ak-layer-page-settings-${page.id}-meta-description`;
	const ogImageId = `ak-layer-page-settings-${page.id}-og-image`;
	const noindexId = `ak-layer-page-settings-${page.id}-noindex`;

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent
				data-testid={`ak-layer-page-settings-${page.id}`}
				showCloseButton={false}
			>
				<DialogHeader>
					<DialogTitle>
						{msg("studio.module.layer.pages.settings.title")}
					</DialogTitle>
				</DialogHeader>
				<form className="flex flex-col gap-3" onSubmit={handleSubmit}>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor={titleId}>
								{msg("studio.module.layer.pages.settings.field.title")}
							</FieldLabel>
							<Input
								id={titleId}
								value={form.title}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, title: event.target.value }))
								}
								required
								data-testid={`${titleId}-input`}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor={pathId}>
								{msg("studio.module.layer.pages.settings.field.path")}
							</FieldLabel>
							<Input
								id={pathId}
								value={form.path}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, path: event.target.value }))
								}
								placeholder="/about"
								data-testid={`${pathId}-input`}
							/>
						</Field>
						<Field orientation="horizontal">
							<Checkbox
								id={routeId}
								checked={form.route}
								onCheckedChange={(checked) =>
									setForm((prev) => ({ ...prev, route: checked === true }))
								}
								data-testid={`${routeId}-input`}
							/>
							<FieldContent>
								<FieldLabel htmlFor={routeId}>
									{msg("studio.module.layer.pages.settings.field.route")}
								</FieldLabel>
							</FieldContent>
						</Field>
						<Field>
							<FieldLabel htmlFor={descId}>
								{msg("studio.module.layer.pages.settings.field.description")}
							</FieldLabel>
							<Input
								id={descId}
								value={form.description}
								onChange={(event) =>
									setForm((prev) => ({
										...prev,
										description: event.target.value,
									}))
								}
								data-testid={`${descId}-input`}
							/>
						</Field>
					</FieldGroup>
					<div
						className="mt-2 flex flex-col gap-3 border-t border-[var(--ak-pages-border,var(--ak-studio-border))] pt-3"
						data-testid={`ak-layer-page-settings-${page.id}-seo`}
					>
						<h4 className="text-xs font-medium text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))]">
							{msg("studio.module.layer.pages.settings.seo.heading")}
						</h4>
						<FieldGroup>
							<Field>
								<FieldLabel htmlFor={metaTitleId}>
									{msg("studio.module.layer.pages.settings.seo.metaTitle")}
								</FieldLabel>
								<Input
									id={metaTitleId}
									value={form.metaTitle}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											metaTitle: event.target.value,
										}))
									}
									data-testid={`${metaTitleId}-input`}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={metaDescId}>
									{msg(
										"studio.module.layer.pages.settings.seo.metaDescription",
									)}
								</FieldLabel>
								<Input
									id={metaDescId}
									value={form.metaDescription}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											metaDescription: event.target.value,
										}))
									}
									data-testid={`${metaDescId}-input`}
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor={ogImageId}>
									{msg("studio.module.layer.pages.settings.seo.ogImage")}
								</FieldLabel>
								<Input
									id={ogImageId}
									type="url"
									value={form.ogImage}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											ogImage: event.target.value,
										}))
									}
									data-testid={`${ogImageId}-input`}
								/>
							</Field>
							<Field orientation="horizontal">
								<Checkbox
									id={noindexId}
									checked={form.noindex}
									onCheckedChange={(checked) =>
										setForm((prev) => ({
											...prev,
											noindex: checked === true,
										}))
									}
									data-testid={`${noindexId}-input`}
								/>
								<FieldContent>
									<FieldLabel htmlFor={noindexId}>
										{msg("studio.module.layer.pages.settings.seo.noindex")}
									</FieldLabel>
								</FieldContent>
							</Field>
						</FieldGroup>
					</div>
					{error !== null ? (
						<FieldError data-testid={`ak-layer-page-settings-${page.id}-error`}>
							{error}
						</FieldError>
					) : null}
					<DialogFooter className="mt-2">
						<DialogClose
							render={
								<Button variant="ghost" type="button" disabled={submitting}>
									{msg("studio.module.layer.pages.settings.cancel")}
								</Button>
							}
						/>
						<Button
							type="submit"
							disabled={submitDisabled}
							data-testid={`ak-layer-page-settings-${page.id}-submit`}
						>
							{msg("studio.module.layer.pages.settings.submit")}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
