/**
 * @file Default renderer for Puck `text` fields.
 */

import type { FieldProps, TextField as PuckTextField } from "@puckeditor/core";
import { type ReactNode } from "react";

import { Input } from "@/primitives/input";
import { FieldLabel } from "../../layout/FieldLabel";

export interface FieldRendererProps<F, V> extends FieldProps<F, V> {
	readonly name: string;
	readonly children?: ReactNode;
}

export function TextField({
	field,
	value,
	onChange,
	readOnly,
	id,
	name,
}: FieldRendererProps<PuckTextField, string | undefined>): ReactNode {
	return (
		<FieldLabel
			icon={field.labelIcon}
			label={field.label ?? name}
			type="text"
			readOnly={readOnly}
		>
			<Input
				id={id}
				name={name}
				type="text"
				value={value ?? ""}
				placeholder={field.placeholder}
				readOnly={readOnly}
				onChange={(event) => {
					if (readOnly === true) return;
					onChange(event.target.value);
				}}
			/>
		</FieldLabel>
	);
}
