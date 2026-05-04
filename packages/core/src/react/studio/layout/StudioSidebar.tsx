/**
 * @file Sidebar shell — vertical icon rail + module panel (PRD §4).
 *
 * Phase B refactor: replaces the legacy 2-tab horizontal layout with
 * the four-module switcher in the PRD. The rail is always visible;
 * the panel is rendered to the side when not collapsed and hosts one
 * of four module bodies (`insert | layer | image | text`).
 *
 * Phase C addition: a {@link SidebarHeaderActionsProvider} wraps the
 * panel so the active module body can publish module-specific actions
 * (e.g. the `insert` view toggle) into the panel header `actions`
 * slot via {@link useSetSidebarHeaderActions}.
 */

import { type ReactNode, type RefObject, useCallback, useRef } from "react";

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
	SidebarHeaderActionsProvider,
	useSidebarHeaderActions,
} from "./sidebar/SidebarHeaderActionsContext.js";
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

interface StudioSidebarPanelHostProps {
	readonly railRef: RefObject<SidebarRailHandle | null>;
}

/**
 * Inner panel host. Lives inside the
 * {@link SidebarHeaderActionsProvider} so it can read the actions slot
 * the active module publishes — without it, the InsertModule's view
 * toggle could not surface in the same `<header>` block where the
 * `×` close lives.
 */
function StudioSidebarPanelHost({
	railRef,
}: StudioSidebarPanelHostProps): ReactNode {
	const msg = useMsg();
	const [activeTab] = useActiveTab();
	const drawerCollapsed = useEditorUiStore((s) => s.drawerCollapsed);
	const setDrawerCollapsed = useEditorUiStore((s) => s.setDrawerCollapsed);
	const actions = useSidebarHeaderActions();

	const handleClose = useCallback(() => {
		setDrawerCollapsed(true);
	}, [setDrawerCollapsed]);

	const handleEscape = useCallback(() => {
		setDrawerCollapsed(true);
		// Defer focus restoration until after the panel unmounts.
		queueMicrotask(() => {
			railRef.current?.focusActive();
		});
	}, [railRef, setDrawerCollapsed]);

	if (drawerCollapsed) return null;

	return (
		<SidebarPanel
			title={msg(MODULE_TITLE_KEYS[activeTab])}
			activeTabId={railTabId(activeTab)}
			actions={actions}
			onClose={handleClose}
			onEscape={handleEscape}
		>
			{renderModuleBody(activeTab)}
		</SidebarPanel>
	);
}

export function StudioSidebar(): ReactNode {
	const railRef = useRef<SidebarRailHandle | null>(null);

	return (
		<aside className="flex h-full shrink-0 flex-row">
			<SidebarRail ref={railRef} />
			<SidebarHeaderActionsProvider>
				<StudioSidebarPanelHost railRef={railRef} />
			</SidebarHeaderActionsProvider>
		</aside>
	);
}
