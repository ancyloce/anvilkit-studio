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

import { memo, type ReactNode, type RefObject, useCallback } from "react";

import { useMsg } from "@/state/editor-i18n-context";
import {
	useActiveTab,
	useDrawerCollapsed,
} from "@/state/slices/editor-ui-selectors";
import type { EditorTab } from "@/state/slices/editor-ui-store";
import { CopilotModule } from "./sidebar/modules/CopilotModule";
import { DesignSystemModule } from "./sidebar/modules/DesignSystemModule";
import { HistoryModule } from "./sidebar/modules/HistoryModule";
import { ImageModule } from "./sidebar/modules/ImageModule";
import { InsertModule } from "./sidebar/modules/InsertModule";
import { LayerModule } from "./sidebar/modules/LayerModule";
import { SeoModule } from "./sidebar/modules/SeoModule";
import { TextModule } from "./sidebar/modules/TextModule";
import {
	SidebarHeaderActionsProvider,
	useSidebarHeaderActions,
} from "./sidebar/SidebarHeaderActionsContext";
import { SidebarPanel } from "./sidebar/SidebarPanel";
import { SidebarRail, type SidebarRailHandle } from "./sidebar/SidebarRail";
import { railTabId } from "./sidebar/SidebarRail.ids";

const MODULE_TITLE_KEYS: Readonly<Record<EditorTab, string>> = {
	insert: "studio.module.insert.name",
	layer: "studio.module.layer.name",
	image: "studio.module.image.name",
	text: "studio.module.text.name",
	copilot: "studio.module.copilot.name",
	history: "studio.module.history.name",
	"design-system": "studio.module.designSystem.name",
	seo: "studio.module.seo.name",
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
		case "copilot":
			return <CopilotModule />;
		case "history":
			return <HistoryModule />;
		case "design-system":
			return <DesignSystemModule />;
		case "seo":
			return <SeoModule />;
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
	const [drawerCollapsed, setDrawerCollapsed] = useDrawerCollapsed();
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
			hideHeader={activeTab === "layer"}
			onClose={handleClose}
			onEscape={handleEscape}
		>
			{renderModuleBody(activeTab)}
		</SidebarPanel>
	);
}

interface StudioSidebarSlotProps {
	readonly railRef: RefObject<SidebarRailHandle | null>;
}

function StudioSidebarRailImpl({ railRef }: StudioSidebarSlotProps): ReactNode {
	return <SidebarRail ref={railRef} />;
}

// `railRef` is a stable ref from `StudioLayout`, so memoizing keeps the
// rail off the `StudioLayout` re-render path (selection changes).
export const StudioSidebarRail = memo(StudioSidebarRailImpl);

function StudioSidebarPanelImpl({
	railRef,
}: StudioSidebarSlotProps): ReactNode {
	return (
		<SidebarHeaderActionsProvider>
			<StudioSidebarPanelHost railRef={railRef} />
		</SidebarHeaderActionsProvider>
	);
}

export const StudioSidebarPanel = memo(StudioSidebarPanelImpl);

// N-f: the `StudioSidebar` combined wrapper was deleted — it had no
// mounts (the layout composes `StudioSidebarRail` + `StudioSidebarPanel`
// directly) and was not part of the public API.
