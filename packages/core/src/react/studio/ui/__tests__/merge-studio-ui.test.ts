/**
 * @file Tests for `mergeStudioUi()` — verifies AnvilKit chrome's
 * full-width viewport defaults are applied when no consumer override
 * is present, and consumer values win when supplied.
 */

import { describe, expect, it } from "vitest";

import { FULL_WIDTH_VIEWPORTS, mergeStudioUi } from "@/studio/ui/index";

describe("mergeStudioUi", () => {
	it("returns the full-width viewport defaults when consumer is undefined", () => {
		const result = mergeStudioUi(undefined);
		expect(result.viewports?.options).toHaveLength(FULL_WIDTH_VIEWPORTS.length);
		expect(result.viewports?.current.width).toBe("100%");
		expect(result.viewports?.controlsVisible).toBe(true);
	});

	it("preserves consumer-supplied viewports", () => {
		const consumerViewports = {
			current: { width: 1024, height: "auto" as const },
			controlsVisible: false,
			options: [{ label: "custom", width: 1024, height: "auto" as const }],
		};
		const result = mergeStudioUi({ viewports: consumerViewports });
		expect(result.viewports).toBe(consumerViewports);
	});

	it("merges other UiState slices alongside the default viewports", () => {
		const result = mergeStudioUi({ leftSideBarVisible: false });
		expect(result.leftSideBarVisible).toBe(false);
		expect(result.viewports?.options).toHaveLength(FULL_WIDTH_VIEWPORTS.length);
	});
});
