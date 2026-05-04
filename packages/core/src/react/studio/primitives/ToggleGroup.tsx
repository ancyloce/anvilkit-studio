/**
 * @file Internal `<ToggleGroup>` primitive — segmented control.
 *
 * Wraps Base UI's `ToggleGroup` (single-element root) and pairs it
 * with `Toggle` items. Used for view mode (`grid`/`list`) and the
 * filter strips in the `image`/`text` modules.
 *
 * Single-select is the only mode v1 needs (`multiple` is left at the
 * Base UI default of `false`). Items render as small pill segments
 * with token-aware active styling.
 */

import { Toggle as BaseToggle } from "@base-ui/react/toggle";
import { ToggleGroup as BaseToggleGroup } from "@base-ui/react/toggle-group";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, type ReactNode, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const rootVariants = cva([
	"inline-flex items-center gap-1 rounded-md border border-[var(--ak-studio-border)]",
	"bg-[var(--ak-studio-muted)] p-0.5",
]);

interface ToggleGroupRootProps<Value extends string>
	extends ComponentProps<typeof BaseToggleGroup<Value>> {
	readonly children: ReactNode;
}

function Root<Value extends string>({
	className,
	...rest
}: ToggleGroupRootProps<Value>): ReactNode {
	return (
		<BaseToggleGroup
			className={cn(rootVariants(), className)}
			{...(rest as ComponentProps<typeof BaseToggleGroup<Value>>)}
		/>
	);
}

const itemVariants = cva(
	[
		"inline-flex items-center justify-center gap-1.5 rounded-sm font-medium transition-colors",
		"text-[var(--ak-studio-muted-fg)] outline-none",
		"hover:text-[var(--ak-studio-fg)]",
		"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
		"data-[pressed]:bg-[var(--ak-studio-panel)] data-[pressed]:text-[var(--ak-studio-fg)] data-[pressed]:shadow-sm",
		"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
	],
	{
		variants: {
			size: {
				sm: "h-6 px-2 text-xs",
				md: "h-7 px-2.5 text-xs",
				lg: "h-8 px-3 text-sm",
			},
		},
		defaultVariants: {
			size: "md",
		},
	},
);

export type ToggleGroupItemVariants = VariantProps<typeof itemVariants>;

interface ToggleGroupItemProps<Value extends string>
	extends ComponentProps<typeof BaseToggle<Value>>,
		ToggleGroupItemVariants {}

const Item = forwardRef(function ToggleGroupItem<Value extends string>(
	{ className, size, ...rest }: ToggleGroupItemProps<Value>,
	ref: Ref<HTMLButtonElement>,
) {
	return (
		<BaseToggle
			ref={ref}
			className={cn(itemVariants({ size }), className)}
			{...(rest as ComponentProps<typeof BaseToggle<Value>>)}
		/>
	);
}) as <Value extends string>(
	props: ToggleGroupItemProps<Value> & { readonly ref?: Ref<HTMLButtonElement> },
) => ReactNode;

export const ToggleGroup = {
	Root,
	Item,
} as const;
