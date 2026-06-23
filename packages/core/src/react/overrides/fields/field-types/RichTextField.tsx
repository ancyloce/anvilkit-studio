"use client";

/**
 * @file Default renderer for Puck `richtext` fields — a TipTap editor.
 *
 * This is the **light** entry: it renders the field label/chrome and lazily
 * loads {@link RichTextEditor} (TipTap + ProseMirror) behind a `Suspense`
 * boundary. The dynamic `import()` keeps TipTap in its own async chunk, out of
 * the `<Studio>` entry and chrome bundle budgets, so the cost is paid only when
 * a `richtext` field is actually edited. Registered in
 * {@link defaultFieldTypes}, it replaces Puck's built-in richtext editor; the
 * field value is a serializable HTML string.
 */

import type { RichtextField as PuckRichtextField } from "@puckeditor/core";
import { lazy, type ReactNode, Suspense, useCallback } from "react";

import { FieldLabel } from "../../layout/FieldLabel";
import type { FieldRendererProps } from "./TextField";

const RichTextEditor = lazy(() => import("./RichTextEditor"));

/** Lightweight placeholder shown while the TipTap chunk loads. */
function RichTextFallback(): ReactNode {
	return (
		<div
			className="ak-richtext ak-richtext-loading"
			data-testid="ak-richtext-loading"
			aria-busy="true"
		/>
	);
}

export function RichTextField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckRichtextField, string | undefined>): ReactNode {
	const handleChange = useCallback(
		(html: string) => onChange(html),
		[onChange],
	);
	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="richtext"
			readOnly={readOnly}
		>
			<Suspense fallback={<RichTextFallback />}>
				<RichTextEditor
					value={value ?? ""}
					onChange={handleChange}
					readOnly={readOnly}
					id={id}
				/>
			</Suspense>
		</FieldLabel>
	);
}
