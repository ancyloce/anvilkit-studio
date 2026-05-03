/**
 * @file Internal barrel for `react/studio/layout`.
 *
 * Phase 5's `<Studio>` glue dynamically imports `StudioLayout` from
 * here so the layout chunk stays out of the entry bundle when
 * `chrome="puck"`.
 */

export {
	HeaderActionButton,
	type HeaderActionButtonProps,
} from "./HeaderActionButton.js";
export { HeaderActions, type HeaderActionsProps } from "./HeaderActions.js";
export { StudioHeader, type StudioHeaderProps } from "./StudioHeader.js";
export { StudioLayout, type StudioLayoutProps } from "./StudioLayout.js";
export { StudioSidebar } from "./StudioSidebar.js";
export { StudioToolbar } from "./StudioToolbar.js";
export {
	StudioViewportPreview,
	type StudioViewportPreviewProps,
} from "./StudioViewportPreview.js";
