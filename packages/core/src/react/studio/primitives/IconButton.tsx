/**
 * @file Internal `<IconButton>` primitive — icon-only square button.
 *
 * Two sizes cover every Phase B–F call site:
 *   - `rail` (44×44 px) — sidebar icon rail (PRD §4.1 hit target).
 *   - `panel` (32×32 px) — panel-header `×` close, action slots.
 *
 * Style variants reuse the chrome's accent / muted tokens. The
 * `pressed` data-attribute drives the active-tab visual treatment
 * (left-edge accent indicator) on rail buttons.
 */

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const iconButtonVariants = cva(
	[
		"relative inline-flex shrink-0 items-center justify-center",
		"rounded-md transition-colors outline-none",
		"text-[var(--ak-studio-muted-fg)]",
		"hover:bg-[var(--ak-studio-muted)] hover:text-[var(--ak-studio-fg)]",
		"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
		"disabled:pointer-events-none disabled:opacity-50",
		// Rail-style active indicator (2px left edge bar) when [data-pressed]
		// is set — kept on the base so `variant="rail"` can opt in via
		// the rail-only marker class.
		"data-[pressed=true]:bg-[var(--ak-studio-muted)] data-[pressed=true]:text-[var(--ak-studio-fg)]",
		"aria-[selected=true]:bg-[var(--ak-studio-muted)] aria-[selected=true]:text-[var(--ak-studio-fg)]",
	],
	{
		variants: {
			size: {
				rail: "size-11",
				panel: "size-8",
				sm: "size-7",
			},
			variant: {
				ghost: "",
				solid:
					"bg-[var(--ak-studio-muted)] text-[var(--ak-studio-fg)] hover:opacity-90",
				rail: cn(
					// Vertical accent bar on the inline-start edge for the
					// active rail tab.
					"before:absolute before:inline-start-0 before:start-0 before:top-1.5 before:bottom-1.5",
					"before:w-0.5 before:rounded-full before:bg-[var(--ak-studio-accent)]",
					"before:scale-y-0 before:transition-transform",
					"data-[pressed=true]:before:scale-y-100 aria-[selected=true]:before:scale-y-100",
				),
			},
		},
		defaultVariants: {
			size: "panel",
			variant: "ghost",
		},
	},
);

export type IconButtonVariants = VariantProps<typeof iconButtonVariants>;

export interface IconButtonProps
	extends ComponentProps<typeof ButtonPrimitive>,
		IconButtonVariants {}

export const IconButton = forwardRef(function IconButton(
	{ className, size, variant, ...rest }: IconButtonProps,
	ref: Ref<HTMLButtonElement>,
) {
	return (
		<ButtonPrimitive
			ref={ref}
			className={cn(iconButtonVariants({ size, variant }), className)}
			{...rest}
		/>
	);
});
