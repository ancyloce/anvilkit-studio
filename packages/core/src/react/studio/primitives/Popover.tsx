/**
 * @file Internal `<Popover>` primitive — anchored floating panel.
 *
 * Wraps Base UI's compound popover parts. Used by the sidebar's layer
 * quick-add ("+") and the asset overflow `…` menu's positioning. The
 * compound API is preserved (`Popover.Root`, `Popover.Trigger`, …) so
 * call sites read the same way as `Dialog`.
 *
 * `cva` drives the popup's `size` variant — sm/md/lg map to width
 * caps that match the sidebar's panel-width budget.
 */

import { Popover as BasePopover } from "@base-ui/react/popover";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const Root = BasePopover.Root;
const Trigger = BasePopover.Trigger;
const Portal = BasePopover.Portal;
const Positioner = BasePopover.Positioner;
const Close = BasePopover.Close;
const Arrow = BasePopover.Arrow;

const popupVariants = cva(
	[
		"z-50 rounded-md border border-[var(--ak-studio-border)]",
		"bg-[var(--ak-studio-panel)] text-[var(--ak-studio-panel-fg)]",
		"shadow-md outline-none",
		"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
	],
	{
		variants: {
			size: {
				sm: "min-w-[140px] p-1 text-sm",
				md: "min-w-[200px] p-2 text-sm",
				lg: "min-w-[280px] p-3 text-sm",
			},
		},
		defaultVariants: {
			size: "md",
		},
	},
);

export type PopoverPopupVariants = VariantProps<typeof popupVariants>;

export interface PopoverPopupProps
	extends ComponentProps<typeof BasePopover.Popup>,
		PopoverPopupVariants {}

const Popup = forwardRef(function PopoverPopup(
	{ className, size, ...rest }: PopoverPopupProps,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BasePopover.Popup
			ref={ref}
			className={cn(popupVariants({ size }), className)}
			{...rest}
		/>
	);
});

export const Popover = {
	Root,
	Trigger,
	Portal,
	Positioner,
	Popup,
	Close,
	Arrow,
} as const;
