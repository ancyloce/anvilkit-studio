import type { EditorTab } from "@/state/slices/editor-ui-store";

export const SIDEBAR_PANEL_ID = "ak-sidebar-panel";

export function railTabId(moduleKey: EditorTab): string {
	return `ak-rail-tab-${moduleKey}`;
}
