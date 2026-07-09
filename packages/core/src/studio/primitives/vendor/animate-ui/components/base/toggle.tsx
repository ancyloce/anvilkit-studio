import { type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
	ToggleHighlight as ToggleHighlightPrimitive,
	ToggleItem as ToggleItemPrimitive,
	type ToggleItemProps as ToggleItemPrimitiveProps,
	Toggle as TogglePrimitive,
	type ToggleProps as TogglePrimitiveProps,
} from "@/primitives/vendor/animate-ui/primitives/base/toggle";
import { cn } from "@/shared/cn";
import { toggleVariants } from "./toggle.variants";

type ToggleProps = TogglePrimitiveProps &
	ToggleItemPrimitiveProps &
	VariantProps<typeof toggleVariants>;

function Toggle({
	className,
	variant,
	size,
	pressed,
	defaultPressed,
	onPressedChange,
	disabled,
	...props
}: ToggleProps) {
	return (
		<TogglePrimitive
			pressed={pressed}
			defaultPressed={defaultPressed}
			onPressedChange={onPressedChange}
			disabled={disabled}
			className="relative"
		>
			<ToggleHighlightPrimitive className="bg-accent rounded-md" />
			<ToggleItemPrimitive
				className={cn(toggleVariants({ variant, size, className }))}
				{...props}
			/>
		</TogglePrimitive>
	);
}

export { Toggle, type ToggleProps };
