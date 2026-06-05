/**
 * @file `FieldLabel` — Puck `fieldLabel` override.
 *
 * Replaces the default field label with the Studio icon + label
 * structure. Puck's compound override receives `{ children, icon,
 * label, el, readOnly, className }` — `children` is the rendered field
 * input; we mount it underneath the label row.
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

export type FieldLabelDataType =
	| "array"
	| "external"
	| "number"
	| "object"
	| "radio"
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
}

const fieldTypeIcons = {
	array: List,
	external: Link,
	number: Hash,
	object: Braces,
	radio: Blend,
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
	return (
		<>
			<LabelIcon icon={icon} type={type} />
			<span>{label}</span>
			{readOnly ? (
				<Lock
					aria-label="Read-only"
					className="size-3 text-[var(--ak-studio-muted-fg)]"
				/>
			) : null}
		</>
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
}: FieldLabelOverrideProps): ReactNode {
	if (el === "div") {
		return (
			<Field className={cn(rootClassName, className)}>
				<FieldTitle className={labelClassName}>
					<LabelContent
						icon={icon}
						label={label}
						readOnly={readOnly}
						type={type}
					/>
				</FieldTitle>
				<div className="flex flex-col">{children}</div>
			</Field>
		);
	}

	return (
		<PrimitiveFieldLabel className={cn(rootClassName, className)}>
			<span className={labelClassName}>
				<LabelContent
					icon={icon}
					label={label}
					readOnly={readOnly}
					type={type}
				/>
			</span>
			<div className="flex flex-col">{children}</div>
		</PrimitiveFieldLabel>
	);
}
