/** Regression coverage for the bridge's external-store notification fanout. */

import type { Data as PuckData } from "@puckeditor/core";
import { describe, expect, it, vi } from "vitest";
import { createStudioEditorBridge } from "../bridge.js";

const DATA = {
	root: { props: {} },
	content: [],
	zones: {},
} satisfies PuckData;

describe("createStudioEditorBridge", () => {
	it("publishes one subscriber notification for each Puck data change", () => {
		const bridge = createStudioEditorBridge();
		const listener = vi.fn();
		const onDataChange = vi.fn();
		bridge.onDataChange = onDataChange;
		bridge.subscribe(listener);

		bridge.notifyDataChange(DATA);

		expect(onDataChange).toHaveBeenCalledOnce();
		expect(onDataChange).toHaveBeenCalledWith(DATA);
		expect(listener).toHaveBeenCalledOnce();
		expect(bridge.getDataVersion()).toBe(1);
		expect(bridge.getStyleVersion()).toBe(1);
		expect(bridge.getVersion()).toBe(1);
	});
});
