/**
 * @file Internal `<DropdownMenu>` primitive — context/overflow menu.
 *
 * Wraps Base UI's compound `Menu` parts. Used by the sidebar asset
 * tile's `…` overflow and any future "more actions" affordances.
 *
 * Re-exports the parts under a namespace const so call sites read
 * `<DropdownMenu.Root>` / `<DropdownMenu.Item>` consistently with
 * other primitives. Item variants (`destructive`) live in `cva` so
 * Delete / Remove actions can highlight without duplicated class
 * strings at every call site.
 */

import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const Root = BaseMenu.Root;
const Trigger = BaseMenu.Trigger;
const Portal = BaseMenu.Portal;
const Positioner = BaseMenu.Positioner;
const Group = BaseMenu.Group;
const GroupLabel = BaseMenu.GroupLabel;
const RadioGroup = BaseMenu.RadioGroup;
const Arrow = BaseMenu.Arrow;
const SubmenuRoot = BaseMenu.SubmenuRoot;
const SubmenuTrigger = BaseMenu.SubmenuTrigger;

const popupVariants = cva([
	"z-50 min-w-[180px] rounded-md border border-[var(--ak-studio-border)]",
	"bg-[var(--ak-studio-panel)] p-1 text-[var(--ak-studio-panel-fg)]",
	"shadow-md outline-none",
	"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
]);

const Popup = forwardRef(function DropdownMenuPopup(
	{ className, ...rest }: ComponentProps<typeof BaseMenu.Popup>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseMenu.Popup
			ref={ref}
			className={cn(popupVariants(), className)}
			{...rest}
		/>
	);
});

const itemVariants = cva(
	[
		"flex w-full cursor-pointer select-none items-center gap-2 rounded-sm",
		"px-2 py-1.5 text-sm outline-none",
		"data-[highlighted]:bg-[var(--ak-studio-muted)]",
		"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
	],
	{
		variants: {
			tone: {
				default: "",
				destructive:
					"text-red-600 data-[highlighted]:bg-red-600/10 dark:text-red-400",
			},
		},
		defaultVariants: {
			tone: "default",
		},
	},
);

export type DropdownMenuItemVariants = VariantProps<typeof itemVariants>;

export interface DropdownMenuItemProps
	extends ComponentProps<typeof BaseMenu.Item>,
		DropdownMenuItemVariants {}

const Item = forwardRef(function DropdownMenuItem(
	{ className, tone, ...rest }: DropdownMenuItemProps,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseMenu.Item
			ref={ref}
			className={cn(itemVariants({ tone }), className)}
			{...rest}
		/>
	);
});

const Separator = forwardRef(function DropdownMenuSeparator(
	{ className, ...rest }: ComponentProps<"div">,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<div
			ref={ref}
			role="separator"
			aria-orientation="horizontal"
			className={cn("my-1 h-px bg-[var(--ak-studio-border)]", className)}
			{...rest}
		/>
	);
});

export const DropdownMenu = {
	Root,
	Trigger,
	Portal,
	Positioner,
	Popup,
	Item,
	Separator,
	Group,
	GroupLabel,
	RadioGroup,
	Arrow,
	SubmenuRoot,
	SubmenuTrigger,
} as const;
