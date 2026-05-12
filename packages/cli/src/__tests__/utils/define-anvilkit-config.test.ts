import { describe, expect, it } from "vitest";

import { defineConfig } from "../../utils/define-anvilkit-config.js";

describe("defineConfig", () => {
	it("returns the original config object", () => {
		const config = defineConfig({});

		expect(defineConfig(config)).toBe(config);
	});
});
