import type { PageIR } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { jsonFormat } from "../json-format.js";

const FIXED_CLOCK_ISO = "2026-04-11T00:00:00.000Z";

function makeFixture(): PageIR {
	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "hero-1",
					type: "Hero",
					props: {
						headline: "Ship updates without friction.",
						description: "Deterministic JSON exports for IR snapshots.",
					},
				},
			],
		},
		assets: [],
		metadata: { createdAt: FIXED_CLOCK_ISO },
	};
}

describe("jsonFormat", () => {
	it("declares the format descriptor every host app dispatches on", () => {
		expect(jsonFormat.id).toBe("json");
		expect(jsonFormat.label).toBe("JSON");
		expect(jsonFormat.extension).toBe("json");
		expect(jsonFormat.mimeType).toBe("application/json");
	});

	it("round-trips a PageIR through JSON without losing any field", async () => {
		const ir = makeFixture();

		const { content, filename } = await jsonFormat.run(ir, {});

		expect(filename).toBe("page.json");
		const parsed = JSON.parse(content as string);
		expect(parsed).toEqual(ir);
	});

	it("honors indent=0 for compact, single-line output", async () => {
		const { content } = await jsonFormat.run(makeFixture(), { indent: 0 });

		expect((content as string).includes("\n")).toBe(false);
	});

	it("uses two-space indentation by default", async () => {
		const { content } = await jsonFormat.run(makeFixture(), {});

		expect((content as string).startsWith("{\n  ")).toBe(true);
	});

	it("strips metadata timestamps when stripTimestamps=true", async () => {
		const { content } = await jsonFormat.run(makeFixture(), {
			stripTimestamps: true,
		});

		const parsed = JSON.parse(content as string) as PageIR;
		expect(parsed.metadata.createdAt).toBeUndefined();
		expect(parsed.metadata.updatedAt).toBeUndefined();
	});

	it("respects a caller-supplied filename override", async () => {
		const { filename } = await jsonFormat.run(makeFixture(), {
			filename: "snapshot-2026-04.json",
		});

		expect(filename).toBe("snapshot-2026-04.json");
	});
});
