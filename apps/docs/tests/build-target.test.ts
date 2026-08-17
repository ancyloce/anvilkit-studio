import { describe, expect, it } from "vitest";
import { resolveDocsBuildTarget } from "../build-target";

describe("resolveDocsBuildTarget", () => {
	it("keeps prerendering for the default static deployment", () => {
		expect(resolveDocsBuildTarget()).toEqual({
			nitroPreset: "vercel",
			prerender: true,
		});
	});

	it("disables prerendering for the Docker node server", () => {
		expect(resolveDocsBuildTarget("node-server")).toEqual({
			nitroPreset: "node-server",
			prerender: false,
		});
	});

	it("preserves prerendering for other explicit presets", () => {
		expect(resolveDocsBuildTarget("cloudflare-module")).toEqual({
			nitroPreset: "cloudflare-module",
			prerender: true,
		});
	});
});
