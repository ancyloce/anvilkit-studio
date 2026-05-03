/**
 * @file Internal `<Tabs>` primitive — sidebar tab strip.
 *
 * Re-exports Base UI's compound parts under a thin namespace so the
 * sidebar can write
 *
 * ```tsx
 * <Tabs.Root value={tab} onValueChange={setTab}>
 *   <Tabs.List>…</Tabs.List>
 *   <Tabs.Panel value="insert">…</Tabs.Panel>
 * </Tabs.Root>
 * ```
 *
 * The Tailwind theming is folded into the primitives via wrapper
 * components so layout code stays declarative.
 */

import { Tabs as BaseTabs } from "@base-ui/react/tabs";
import { type ComponentProps, forwardRef, type Ref } from "react";

import { cn } from "../../overrides/utils/cn.js";

const Root = BaseTabs.Root;

const List = forwardRef(function TabsList(
	{ className, ...rest }: ComponentProps<typeof BaseTabs.List>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseTabs.List
			ref={ref}
			className={cn(
				"inline-flex h-9 items-center gap-1 rounded-md bg-[var(--ak-studio-muted)] p-1",
				className,
			)}
			{...rest}
		/>
	);
});

const Tab = forwardRef(function TabsTab(
	{ className, ...rest }: ComponentProps<typeof BaseTabs.Tab>,
	ref: Ref<HTMLButtonElement>,
) {
	return (
		<BaseTabs.Tab
			ref={ref}
			className={cn(
				"inline-flex h-7 flex-1 items-center justify-center rounded-sm px-3 text-sm font-medium",
				"text-[var(--ak-studio-muted-fg)]",
				"data-[selected]:bg-[var(--ak-studio-panel)] data-[selected]:text-[var(--ak-studio-fg)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ak-studio-ring)]",
				className,
			)}
			{...rest}
		/>
	);
});

const Panel = forwardRef(function TabsPanel(
	{ className, ...rest }: ComponentProps<typeof BaseTabs.Panel>,
	ref: Ref<HTMLDivElement>,
) {
	return (
		<BaseTabs.Panel
			ref={ref}
			className={cn(
				"mt-2 focus-visible:outline-none",
				className,
			)}
			{...rest}
		/>
	);
});

export const Tabs = { Root, List, Tab, Panel } as const;
