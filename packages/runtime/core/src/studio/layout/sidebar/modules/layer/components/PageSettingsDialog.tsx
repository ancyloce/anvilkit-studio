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
import { Switch } from "@/primitives/switch";
import { useMsg } from "@/state/editor-i18n-context";
import { useSidebarRegistry } from "@/state/sidebar-registry/use-sidebar-registry";
import type {
	StudioPage,
	StudioPageSeo,
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
	/**
	 * SEO sub-block, edited by the plugin-registered
	 * {@link StudioPageSettingsSeoFields} slot (M4). Core owns this state
	 * but never renders the fields; when no plugin is registered it stays
	 * at the page's original value and the diff omits it.
	 */
	readonly seo: StudioPageSeo;
}

function initialForm(page: StudioPage): FormState {
	return {
		title: page.title,
		path: page.path ?? "",
		route: page.route === true,
		description: page.description ?? "",
		seo: page.seo ?? {},
	};
}

/**
 * Trim every string field and drop the empties so an empty SEO block
 * collapses to `{}` (lets hosts persist `seo: undefined`). `canonical`
 * is carried through alongside the four legacy fields (M3 follow-up).
 */
function normalizeSeo(seo: StudioPageSeo): StudioPageSeo {
	const out: { -readonly [K in keyof StudioPageSeo]?: StudioPageSeo[K] } = {};
	const metaTitle = (seo.metaTitle ?? "").trim();
	const metaDescription = (seo.metaDescription ?? "").trim();
	const ogImage = (seo.ogImage ?? "").trim();
	const canonical = (seo.canonical ?? "").trim();
	if (metaTitle.length > 0) out.metaTitle = metaTitle;
	if (metaDescription.length > 0) out.metaDescription = metaDescription;
	if (ogImage.length > 0) out.ogImage = ogImage;
	if (canonical.length > 0) out.canonical = canonical;
	if (seo.noindex === true) out.noindex = true;
	return out;
}

/** Structural equality over the normalized SEO shape. */
function seoEqual(a: StudioPageSeo, b: StudioPageSeo): boolean {
	return (
		(a.metaTitle ?? "") === (b.metaTitle ?? "") &&
		(a.metaDescription ?? "") === (b.metaDescription ?? "") &&
		(a.ogImage ?? "") === (b.ogImage ?? "") &&
		(a.canonical ?? "") === (b.canonical ?? "") &&
		(a.noindex === true) === (b.noindex === true)
	);
}

/**
 * Build the `onUpdateSettings` payload, omitting fields whose
 * trimmed value matches the original. The `seo` block is included only
 * when the user actually changed it; otherwise it (incl. any `canonical`
 * the dialog never edits) passes through untouched.
 */
function diffSettings(
	page: StudioPage,
	form: FormState,
): StudioPageSettingsInput {
	const trimmed = {
		title: form.title.trim(),
		path: form.path.trim(),
		description: form.description.trim(),
	};
	const out: { -readonly [K in keyof StudioPageSettingsInput]?: unknown } = {
		id: page.id,
	};
	if (trimmed.title !== page.title) out.title = trimmed.title;
	if (trimmed.path !== (page.path ?? "")) out.path = trimmed.path;
	if (form.route !== (page.route === true)) out.route = form.route;
	if (trimmed.description !== (page.description ?? ""))
		out.description = trimmed.description;
	const nextSeo = normalizeSeo(form.seo);
	if (!seoEqual(nextSeo, normalizeSeo(page.seo ?? {}))) {
		out.seo = nextSeo;
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
	const seoFields = useSidebarRegistry((state) => state.pageSettingsSeoFields);
	const [form, setForm] = useState<FormState>(() => initialForm(page));
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const handleSeoChange = useCallback((next: StudioPageSeo) => {
		setForm((prev) => ({ ...prev, seo: next }));
	}, []);

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
								<span aria-hidden="true" className="text-[var(--destructive)]">
									{" "}
									*
								</span>
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
								aria-invalid={error !== null}
								data-testid={`${pathId}-input`}
							/>
						</Field>
						<Field orientation="horizontal" className="justify-between">
							<FieldLabel htmlFor={routeId}>
								{msg("studio.module.layer.pages.settings.field.route")}
							</FieldLabel>
							<Switch
								id={routeId}
								checked={form.route}
								onCheckedChange={(checked) =>
									setForm((prev) => ({ ...prev, route: checked === true }))
								}
								data-testid={`${routeId}-input`}
							/>
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
					{seoFields !== null ? (
						<div
							className="mt-2 flex flex-col gap-3 border-t border-[var(--ak-pages-border,var(--ak-studio-border))] pt-3"
							data-testid={`ak-layer-page-settings-${page.id}-seo`}
						>
							<h4 className="text-xs font-medium text-[var(--ak-pages-muted-fg,var(--ak-studio-muted-fg))]">
								{msg("studio.module.layer.pages.settings.seo.heading")}
							</h4>
							{seoFields.render({ value: form.seo, onChange: handleSeoChange })}
						</div>
					) : null}
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
