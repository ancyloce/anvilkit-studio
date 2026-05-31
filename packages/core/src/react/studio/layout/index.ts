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
	HeaderActionPlaceholderButton,
	type HeaderActionPlaceholderButtonProps,
} from "./HeaderActionButton";
export { HeaderActions, type HeaderActionsProps } from "./HeaderActions";
export { StudioHeader, type StudioHeaderProps } from "./StudioHeader";
export { StudioLayout, type StudioLayoutProps } from "./StudioLayout";
export { StudioToolbar } from "./StudioToolbar";
export {
	StudioViewportPreview,
	type StudioViewportPreviewProps,
} from "./StudioViewportPreview";
