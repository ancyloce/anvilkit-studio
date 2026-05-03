/**
 * @file Internal `<Input>` primitive — Tailwind-styled `<input>`.
 */

import { Input as InputPrimitive } from "@base-ui/react/input";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

export type InputProps = ComponentProps<typeof InputPrimitive>;

export const Input = forwardRef(function Input(
	{ className, ...rest }: InputProps,
	ref: Ref<HTMLInputElement>,
) {
	return (
		<InputPrimitive
			ref={ref}
			className={cn(
				"flex h-8 w-full rounded-md border border-[var(--ak-studio-border)] bg-transparent px-2.5 text-sm",
				"placeholder:text-[var(--ak-studio-muted-fg)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
				"disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...rest}
		/>
	);
});
