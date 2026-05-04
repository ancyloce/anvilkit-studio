/**
 * @file Internal `<Accordion>` primitive — collapsible section group.
 *
 * Wraps Base UI's compound accordion parts. Used by the sidebar's
 * `insert` sections and the `text` module's category groups. Multi-
 * select is the default — `Accordion.Root` accepts an array `value`
 * prop matching the persisted `Record<string, boolean>` shape.
 *
 * The trigger renders a chevron that rotates 90° on `data-panel-open`,
 * matching the pattern Puck's outline tree uses.
 */

import { Accordion as BaseAccordion } from "@base-ui/react/accordion";
import { cva, type VariantProps } from "class-variance-authority";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const Root = BaseAccordion.Root;
const Header = BaseAccordion.Header;

const itemVariants = cva([
	"border-b border-[var(--ak-studio-border)] last:border-b-0",
]);

const Item = forwardRef(function AccordionItem(
	{ className, ...rest }: ComponentProps<typeof BaseAccordion.Item>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseAccordion.Item
			ref={ref}
			className={cn(itemVariants(), className)}
			{...rest}
		/>
	);
});

const triggerVariants = cva(
	[
		"group flex w-full items-center gap-2 px-2 py-2 text-left text-sm font-medium",
		"text-[var(--ak-studio-fg)] outline-none transition-colors",
		"hover:bg-[var(--ak-studio-muted)]",
		"focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
		"data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
	],
	{
		variants: {
			density: {
				default: "h-9",
				compact: "h-8 text-xs",
			},
		},
		defaultVariants: {
			density: "default",
		},
	},
);

export type AccordionTriggerVariants = VariantProps<typeof triggerVariants>;

export interface AccordionTriggerProps
	extends ComponentProps<typeof BaseAccordion.Trigger>,
		AccordionTriggerVariants {}

const Trigger = forwardRef(function AccordionTrigger(
	{ className, density, ...rest }: AccordionTriggerProps,
	ref: Ref<HTMLButtonElement>,
) {
	return (
		<BaseAccordion.Trigger
			ref={ref}
			className={cn(triggerVariants({ density }), className)}
			{...rest}
		/>
	);
});

const Panel = forwardRef(function AccordionPanel(
	{ className, ...rest }: ComponentProps<typeof BaseAccordion.Panel>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseAccordion.Panel
			ref={ref}
			className={cn(
				"overflow-hidden text-sm",
				"data-[ending-style]:animate-accordion-up data-[starting-style]:animate-accordion-down",
				className,
			)}
			{...rest}
		/>
	);
});

export const Accordion = {
	Root,
	Item,
	Header,
	Trigger,
	Panel,
} as const;
