/**
 * @file `mergeStudioUi()` — compose consumer `ui` overrides with the
 * AnvilKit chrome defaults (PRD §6.1).
 *
 * `<Studio chrome="anvilkit">` ships a default `viewports` block
 * that includes the responsive presets plus a 100%-width entry, so
 * the canvas fills the surrounding container by default. Consumer-
 * supplied `ui` props are merged on top, giving the host the final
 * word on any field they choose to override.
 */

import type { UiState, Viewports } from "@puckeditor/core";

import { FULL_WIDTH_VIEWPORTS } from "./full-width-viewports.js";

/**
 * Subset of `UiState` `<Studio>` accepts as a partial override. Kept
 * narrow on purpose: the slots the chrome actually needs to seed
 * (viewports, sidebar visibility) plus an escape hatch for any other
 * Puck `UiState` field a consumer might want to preset.
 */
export type StudioUiPartial = Partial<UiState>;

const DEFAULT_VIEWPORTS_BLOCK: UiState["viewports"] = {
	current: { width: "100%", height: "auto" },
	controlsVisible: true,
	options: [...FULL_WIDTH_VIEWPORTS] as Viewports,
};

/**
 * Returns the merged `UiState` partial passed to `<Puck ui={...}>`
 * when `chrome="anvilkit"`. Consumer values win on any field they
 * specify; `viewports` is replaced wholesale rather than deep-merged
 * because its `options` array is order-sensitive and Puck rejects a
 * `current` that is not also present in `options`.
 */
export function mergeStudioUi(
	consumer: StudioUiPartial | undefined,
): StudioUiPartial {
	if (consumer === undefined) {
		return { viewports: DEFAULT_VIEWPORTS_BLOCK };
	}
	return {
		...consumer,
		viewports: consumer.viewports ?? DEFAULT_VIEWPORTS_BLOCK,
	};
}
