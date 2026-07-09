/**
 * @file `Button` — the Studio's shadcn-style button primitive.
 *
 * Wraps Base UI's `Button` with `class-variance-authority` `variant` × `size`
 * variants over the shared `--ak-studio-*` tokens. Accepts every Base UI
 * `Button` prop plus `variant` / `size`. `buttonVariants` is exported so other
 * primitives can borrow the same class recipe.
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/cn";
import { buttonVariants } from "./button.variants";

function Button({
	className,
	variant = "default",
	size = "default",
	...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
	return (
		<ButtonPrimitive
			data-ak-studio-theme
			data-slot="button"
			data-variant={variant}
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button };
