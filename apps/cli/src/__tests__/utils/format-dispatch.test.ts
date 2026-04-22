import type { PageIR } from "@anvilkit/core/types";
import { htmlFormat } from "@anvilkit/plugin-export-html";
import { reactFormat } from "@anvilkit/plugin-export-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { dispatchFormat } from "../../utils/format-dispatch.js";

const fixtureIr: PageIR = {
	version: "1",
	root: {
		id: "root",
		type: "__root__",
		props: {},
	},
	assets: [],
	metadata: {},
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("dispatchFormat", () => {
	it("dispatches html exports and maps --inline-assets", async () => {
		const run = vi.spyOn(htmlFormat, "run").mockResolvedValue({
			content: "<!doctype html>\n",
			filename: "page.html",
			warnings: [],
		});

		const result = await dispatchFormat(fixtureIr, {
			format: "html",
			inlineAssets: true,
		});

		expect(run).toHaveBeenCalledWith(fixtureIr, {
			inlineAssetThresholdBytes: Number.POSITIVE_INFINITY,
		});
		expect(result.filename).toBe("page.html");
	});

	it("dispatches react exports and forwards syntax and asset strategy", async () => {
		const run = vi.spyOn(reactFormat, "run").mockResolvedValue({
			content: "export default function Page() {}\n",
			filename: "page.jsx",
			warnings: [],
		});

		const result = await dispatchFormat(fixtureIr, {
			format: "react",
			syntax: "jsx",
			assetStrategy: "inline",
		});

		expect(run).toHaveBeenCalledWith(fixtureIr, {
			syntax: "jsx",
			assetStrategy: "inline",
		});
		expect(result.filename).toBe("page.jsx");
	});

	it("throws INVALID_FORMAT for unsupported formats", async () => {
		await expect(
			dispatchFormat(fixtureIr, {
				format: "xml",
			}),
		).rejects.toMatchObject({
			code: "INVALID_FORMAT",
			exitCode: 2,
		});
	});
});
