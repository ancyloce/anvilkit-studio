/**
 * @file Sidebar with insert / outline tabs.
 *
 * Tab content is delegated to Puck's compound exports
 * (`Puck.Components`, `Puck.Outline`) so component listings stay in
 * sync with whatever the host app's `puckConfig` declares.
 */

import { Puck } from "@puckeditor/core";
import { type ReactNode } from "react";

import { useMsg } from "../state/editor-i18n-store.js";
import { useActiveTab } from "../state/hooks.js";
import { ScrollArea } from "../primitives/ScrollArea.js";
import { Tabs } from "../primitives/Tabs.js";

export function StudioSidebar(): ReactNode {
	const msg = useMsg();
	const [tab, setTab] = useActiveTab();

	return (
		<aside className="flex w-64 shrink-0 flex-col border-r border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)]">
			<div className="p-2">
				<Tabs.Root
					value={tab}
					onValueChange={(value) => {
						if (value === "insert" || value === "outline") {
							setTab(value);
						}
					}}
				>
					<Tabs.List>
						<Tabs.Tab value="insert">{msg("studio.tab.insert")}</Tabs.Tab>
						<Tabs.Tab value="outline">{msg("studio.tab.outline")}</Tabs.Tab>
					</Tabs.List>
					<Tabs.Panel value="insert">
						<ScrollArea className="h-[calc(100vh-9rem)]" viewportClassName="px-1 pb-2">
							<Puck.Components />
						</ScrollArea>
					</Tabs.Panel>
					<Tabs.Panel value="outline">
						<ScrollArea className="h-[calc(100vh-9rem)]" viewportClassName="px-1 pb-2">
							<Puck.Outline />
						</ScrollArea>
					</Tabs.Panel>
				</Tabs.Root>
			</div>
		</aside>
	);
}
