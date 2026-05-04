/**
 * @file Sidebar shell — vertical icon rail + module panel (PRD §4).
 *
 * Phase B refactor: replaces the legacy 2-tab horizontal layout with
 * the four-module switcher in the PRD. The rail is always visible;
 * the panel is rendered to the side when not collapsed and hosts one
 * of four module bodies (`insert | layer | image | text`). Module
 * bodies are placeholders here — D3–D7 replace them with their real
 * implementations.
 */

import { type ReactNode, useCallback, useRef } from "react";

import { useMsg } from "../state/editor-i18n-store.js";
import {
	useActiveTab,
	useEditorUiStore,
} from "../state/hooks.js";
import type { EditorTab } from "../state/editor-ui-store.js";
import { ImageModule } from "./sidebar/modules/ImageModule.js";
import { InsertModule } from "./sidebar/modules/InsertModule.js";
import { LayerModule } from "./sidebar/modules/LayerModule.js";
import { TextModule } from "./sidebar/modules/TextModule.js";
import {
	SidebarRail,
	type SidebarRailHandle,
	railTabId,
} from "./sidebar/SidebarRail.js";
import { SidebarPanel } from "./sidebar/SidebarPanel.js";

const MODULE_TITLE_KEYS: Readonly<Record<EditorTab, string>> = {
	insert: "studio.module.insert.name",
	layer: "studio.module.layer.name",
	image: "studio.module.image.name",
	text: "studio.module.text.name",
};

function renderModuleBody(tab: EditorTab): ReactNode {
	switch (tab) {
		case "insert":
			return <InsertModule />;
		case "layer":
			return <LayerModule />;
		case "image":
			return <ImageModule />;
		case "text":
			return <TextModule />;
	}
}

export function StudioSidebar(): ReactNode {
	const msg = useMsg();
	const [activeTab] = useActiveTab();
	const drawerCollapsed = useEditorUiStore((s) => s.drawerCollapsed);
	const setDrawerCollapsed = useEditorUiStore((s) => s.setDrawerCollapsed);
	const railRef = useRef<SidebarRailHandle | null>(null);

	const handleClose = useCallback(() => {
		setDrawerCollapsed(true);
	}, [setDrawerCollapsed]);

	const handleEscape = useCallback(() => {
		setDrawerCollapsed(true);
		// Defer focus restoration until after the panel unmounts.
		queueMicrotask(() => {
			railRef.current?.focusActive();
		});
	}, [setDrawerCollapsed]);

	return (
		<aside className="flex h-full shrink-0 flex-row">
			<SidebarRail ref={railRef} />
			{drawerCollapsed ? null : (
				<SidebarPanel
					title={msg(MODULE_TITLE_KEYS[activeTab])}
					activeTabId={railTabId(activeTab)}
					onClose={handleClose}
					onEscape={handleEscape}
				>
					{renderModuleBody(activeTab)}
				</SidebarPanel>
			)}
		</aside>
	);
}
