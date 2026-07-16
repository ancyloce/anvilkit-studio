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
export {
	StudioErrorScreen,
	type StudioErrorScreenProps,
} from "./StudioErrorScreen";
export { StudioHeader, type StudioHeaderProps } from "./StudioHeader";
export { StudioLayout, type StudioLayoutProps } from "./StudioLayout";
export {
	StudioLoadingScreen,
	type StudioLoadingScreenProps,
} from "./StudioLoadingScreen";
export {
	StudioViewportPreview,
	type StudioViewportPreviewProps,
} from "./StudioViewportPreview";
