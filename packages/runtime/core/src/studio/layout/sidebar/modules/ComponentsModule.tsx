/**
 * @file `components` module — the document-local library: components,
 * tokens, and reusable styles (PLAN-0020 CORE-P2-001/-002/-003/-009F;
 * ED-COMP-002/-005/-006, ED-TOKEN-001..003, ED-STYLEDEF-001/002).
 *
 * Two tabs rather than two rail modules: components, tokens and
 * styles are all *document-local reusable definitions*, and splitting
 * them across the rail would imply they are unrelated systems. The
 * rail tab itself is gated on the visual editor being enabled (see
 * `SidebarRail`), so a host without the editor never mounts either.
 *
 * `keepMounted` on both panels: in-progress rename drafts and the
 * token creation form would otherwise reset on every tab switch.
 */

import type { ReactNode } from "react";
import { useState } from "react";
import { ScrollArea } from "@/primitives/scroll-area";
import {
	Tabs,
	TabsList,
	TabsPanel,
	TabsPanels,
	TabsTab,
} from "@/primitives/tabs";
import { useMsg } from "@/state/editor-i18n-context";
import { ComponentsPanel } from "../../../../react/editor/components/ComponentsPanel.js";
import { DesignSystemPanel } from "../../../../react/editor/tokens/DesignSystemPanel.js";

type LibraryTab = "components" | "design-system";

export function ComponentsModule(): ReactNode {
	const msg = useMsg();
	// Local, not persisted: which tab of a rail module was last open is
	// not worth a versioned store migration.
	const [tab, setTab] = useState<LibraryTab>("components");

	return (
		<Tabs
			value={tab}
			onValueChange={(next) => {
				if (next === "components" || next === "design-system") setTab(next);
			}}
			data-testid="ak-module-components"
			className="flex h-full min-h-0 w-full flex-col gap-0 overflow-hidden"
		>
			<TabsList
				aria-label={msg("studio.module.components.name")}
				className="w-full shrink-0 rounded-none border-b border-[var(--ak-studio-border)] bg-transparent px-2"
			>
				<TabsTab value="components" data-testid="ak-components-tab-components">
					{msg("studio.module.components.name")}
				</TabsTab>
				<TabsTab value="design-system" data-testid="ak-components-tab-tokens">
					{msg("studio.editor.token.system")}
				</TabsTab>
			</TabsList>
			<TabsPanels className="min-h-0 flex-1">
				<TabsPanel
					value="components"
					keepMounted
					className="flex h-full min-h-0 flex-col"
				>
					<ScrollArea>
						<ComponentsPanel />
					</ScrollArea>
				</TabsPanel>
				<TabsPanel
					value="design-system"
					keepMounted
					className="flex h-full min-h-0 flex-col"
				>
					<ScrollArea>
						<DesignSystemPanel />
					</ScrollArea>
				</TabsPanel>
			</TabsPanels>
		</Tabs>
	);
}
