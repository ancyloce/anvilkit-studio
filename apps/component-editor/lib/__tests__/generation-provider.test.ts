/**
 * P0-19 acceptance (plan 0036): a provider swap touches nothing outside the
 * port — the app imports the INTERFACE, never a concrete provider — and the
 * mock is a real provider whose output still has to pass the gate.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	createGenerationProvider,
	createMockProvider,
	resolveProviderId,
} from "../generation/index";

describe("generation provider port (P0-19)", () => {
	it("defaults to mock and only accepts the declared ids", () => {
		expect(resolveProviderId(undefined)).toBe("mock");
		expect(resolveProviderId("")).toBe("mock");
		expect(resolveProviderId("nonsense")).toBe("mock");
		expect(resolveProviderId("agent-service")).toBe("agent-service");
		expect(resolveProviderId("puck-cloud")).toBe("puck-cloud");
	});

	it("fails loudly for a provider that is not implemented yet", () => {
		// Silently falling back to mock would look like a working cloud
		// integration — the worst possible failure mode for P3-02.
		expect(() => createGenerationProvider("agent-service")).toThrow(
			/not implemented yet/,
		);
		expect(createGenerationProvider("mock").id).toBe("mock");
	});

	it("generates an outline constrained to the whitelist", async () => {
		const provider = createMockProvider();
		const result = await provider.generateOutline({
			prompt: "a pricing page",
			whitelist: ["Badge", "Button", "Card"],
		});
		expect(result.runId).toMatch(/^outline-/);
		const artifact = result.artifact as {
			sections: { componentType: string }[];
		};
		expect(artifact.sections.length).toBeGreaterThan(0);
		for (const section of artifact.sections) {
			expect(["Badge", "Button", "Card"]).toContain(section.componentType);
		}
	});

	it("returns an artifact for a page and a section", async () => {
		const provider = createMockProvider();
		const page = await provider.generatePage?.({
			prompt: "a landing page",
			whitelist: ["Card"],
		});
		expect(page?.artifact).toBeDefined();

		const section = await provider.generateSection({
			prompt: "a hero",
			whitelist: ["Card"],
			sectionId: "section-1",
		});
		expect((section.artifact as { sectionId: string }).sectionId).toBe(
			"section-1",
		);
	});

	it("streams progress events that never carry the payload", async () => {
		const provider = createMockProvider();
		const seen: string[] = [];
		for await (const event of provider.events?.("run-1") ?? []) {
			seen.push(event.kind);
			expect(Object.keys(event)).not.toContain("artifact");
			expect(Object.keys(event)).not.toContain("puckData");
		}
		expect(seen).toEqual(["queued", "running", "done"]);
	});
});

describe("provider port isolation (P0-19 acceptance)", () => {
	it("app code imports the port, never a concrete provider", () => {
		const appFiles = [
			"lib/editor-config.ts",
			"lib/plugins.ts",
			"app/editor/[pageId]/EditorMount.tsx",
		];
		for (const file of appFiles) {
			const source = readFileSync(
				join(import.meta.dirname, "..", "..", file),
				"utf8",
			);
			expect(
				source,
				`${file} imports a concrete provider instead of the port`,
			).not.toMatch(/mock-provider/);
		}
	});
});
