/**
 * @file `FieldLabel` — Puck `fieldLabel` override.
 *
 * Replaces the default field label with the Studio icon + label
 * structure. Puck's compound override receives `{ children, icon,
 * label, el, readOnly, className }` — `children` is the rendered field
 * input; we mount it underneath the label row.
 *
 * Extensions consumed by the internal field-type renderers (never
 * required by Puck's own override call):
 *
 * - `layout="row"` — compact two-column property row (label column
 *   aligned at 72–88px, control fills the rest) for short controls;
 *   every field type defaults to the unchanged `"stacked"` layout.
 * - `description` / `descriptionId` — muted helper text below the
 *   control; renderers pass the same id via `aria-describedby` on
 *   their input so the association is programmatic, not visual-only.
 * - `action` — a trailing affordance in the label row (e.g. the
 *   property reset button). Interactive content cannot legally sit
 *   inside a `<label>`, so providing an action switches the stacked
 *   layout from the wrapping-label structure to an explicit
 *   `htmlFor` association (renderers pass their input id).
 */

import {
	Blend,
	Braces,
	Hash,
	Link,
	List,
	ListChevronsUpDown,
	Lock,
	type LucideIcon,
	PanelsTopLeft,
	Pilcrow,
	TextInitial,
	Type,
} from "lucide-react";
import { type ReactNode } from "react";

import {
	Field,
	FieldTitle,
	FieldLabel as PrimitiveFieldLabel,
} from "@/primitives/field";
import { cn } from "@/shared/cn";
import { useMsg } from "@/state/editor-i18n-context";

export type FieldLabelDataType =
	| "array"
	| "external"
	| "number"
	| "object"
	| "radio"
	| "richtext"
	| "select"
	| "slot"
	| "text"
	| "textarea";

export interface FieldLabelOverrideProps {
	readonly children?: ReactNode;
	readonly icon?: ReactNode;
	readonly label: string;
	readonly type?: FieldLabelDataType;
	readonly el?: "label" | "div";
	readonly readOnly?: boolean;
	readonly className?: string;
	/**
	 * `"stacked"` (default): label row above the control, used by every
	 * existing field type. `"row"`: compact two-column layout (label
	 * left, control right) for short controls that don't need their own
	 * line. Renderers opt fields in via `metadata.layout =
	 * "property-row"`; arbitrary/complex fields keep `"stacked"`.
	 */
	readonly layout?: "stacked" | "row";
	/** Muted helper text rendered under the control (11px). */
	readonly description?: string;
	/**
	 * DOM id for the description node — renderers put the same value in
	 * `aria-describedby` on their input.
	 */
	readonly descriptionId?: string;
	/**
	 * Trailing label-row affordance (e.g. reset). Presence switches the
	 * stacked layout to `htmlFor` association — pass `htmlFor` too.
	 */
	readonly action?: ReactNode;
	/** Input id for explicit label association in action/row layouts. */
	readonly htmlFor?: string;
}

const fieldTypeIcons = {
	array: List,
	external: Link,
	number: Hash,
	object: Braces,
	radio: Blend,
	richtext: Pilcrow,
	select: ListChevronsUpDown,
	slot: PanelsTopLeft,
	text: Type,
	textarea: TextInitial,
} satisfies Record<FieldLabelDataType, LucideIcon>;

const rootClassName =
	"flex w-full flex-col items-stretch gap-2 text-sm text-[var(--ak-studio-fg)]";
const labelClassName =
	"flex w-fit items-center gap-1.5 text-xs font-medium leading-none text-[var(--ak-studio-muted-fg)]";
const iconClassName =
	"flex size-3.5 shrink-0 items-center justify-center text-[var(--ak-studio-muted-fg)] [&>svg]:size-3.5 [&>svg]:shrink-0";
const descriptionClassName =
	"text-[11px] leading-4 font-normal text-[var(--ak-studio-muted-fg)]";

function LabelIcon({
	icon,
	type = "text",
}: {
	readonly icon?: ReactNode;
	readonly type?: FieldLabelDataType;
}): ReactNode {
	const DefaultIcon = fieldTypeIcons[type] ?? fieldTypeIcons.text;

	return (
		<span
			aria-hidden="true"
			data-slot="field-label-icon"
			data-field-type={type}
			className={iconClassName}
		>
			{icon === undefined || icon === null || icon === false ? (
				<DefaultIcon strokeWidth={1.75} />
			) : (
				icon
			)}
		</span>
	);
}

function LabelContent({
	icon,
	label,
	readOnly,
	type,
}: Pick<
	FieldLabelOverrideProps,
	"icon" | "label" | "readOnly" | "type"
>): ReactNode {
	const msg = useMsg();
	return (
		<>
			<LabelIcon icon={icon} type={type} />
			<span className="min-w-0 truncate">{label}</span>
			{readOnly ? (
				<Lock
					aria-label={msg("studio.field.readOnly")}
					className="size-3 shrink-0 text-[var(--ak-studio-muted-fg)]"
				/>
			) : null}
		</>
	);
}

function Description({
	description,
	descriptionId,
	className,
}: Pick<FieldLabelOverrideProps, "description" | "descriptionId"> & {
	readonly className?: string;
}): ReactNode {
	if (description === undefined) return null;
	return (
		<p id={descriptionId} className={cn(descriptionClassName, className)}>
			{description}
		</p>
	);
}

export function FieldLabel({
	children,
	icon,
	label,
	type,
	el = "label",
	readOnly = false,
	className,
	layout = "stacked",
	description,
	descriptionId,
	action,
	htmlFor,
}: FieldLabelOverrideProps): ReactNode {
	const labelContent = (
		<LabelContent icon={icon} label={label} readOnly={readOnly} type={type} />
	);

	if (layout === "row") {
		// Compact property row: aligned label column, control fills the
		// remainder; description (when present) spans the full width
		// underneath so it never squeezes the control column.
		return (
			<Field
				className={cn(
					"grid grid-cols-[minmax(72px,88px)_minmax(0,1fr)] items-center gap-x-2 gap-y-1 text-sm text-[var(--ak-studio-fg)]",
					className,
				)}
			>
				{el === "div" && htmlFor === undefined ? (
					<FieldTitle className={labelClassName}>{labelContent}</FieldTitle>
				) : (
					<PrimitiveFieldLabel htmlFor={htmlFor} className={labelClassName}>
						{labelContent}
					</PrimitiveFieldLabel>
				)}
				<div className="flex min-w-0 items-center gap-1">
					{children}
					{action}
				</div>
				<Description
					description={description}
					descriptionId={descriptionId}
					className="col-span-2"
				/>
			</Field>
		);
	}

	if (el === "div" || action !== undefined) {
		// Interactive content (the `action` affordance) may not live
		// inside a `<label>`, so this branch associates explicitly via
		// `htmlFor` instead of wrapping.
		return (
			<Field className={cn(rootClassName, className)}>
				<div className="flex w-full min-w-0 items-center gap-1.5">
					{el === "div" && htmlFor === undefined ? (
						<FieldTitle className={labelClassName}>{labelContent}</FieldTitle>
					) : (
						<PrimitiveFieldLabel htmlFor={htmlFor} className={labelClassName}>
							{labelContent}
						</PrimitiveFieldLabel>
					)}
					{action !== undefined ? (
						<span className="ms-auto flex shrink-0 items-center">{action}</span>
					) : null}
				</div>
				<div className="flex flex-col">{children}</div>
				<Description description={description} descriptionId={descriptionId} />
			</Field>
		);
	}

	return (
		<PrimitiveFieldLabel className={cn(rootClassName, className)}>
			<span className={labelClassName}>{labelContent}</span>
			<div className="flex flex-col">{children}</div>
			<Description description={description} descriptionId={descriptionId} />
		</PrimitiveFieldLabel>
	);
}
