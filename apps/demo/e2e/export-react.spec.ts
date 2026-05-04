import { expect, test } from "@playwright/test";

test("React export downloads a .tsx file with the Hero import", async ({
	page,
}) => {
	const consoleMessages: string[] = [];
	page.on("console", (msg) => {
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
	});

	await page.goto("/puck/editor");

	await expect
		.poll(
			() => consoleMessages.some((line) => line.includes("[smoke] onInit")),
			{ timeout: 15_000 },
		)
		.toBe(true);

	// Scope to the demo's AI-copilot panel: the AnvilKit chrome's
	// header now also contributes an "Export React" button via the
	// `@anvilkit/plugin-export-react` plugin, so the bare regex
	// matches twice. The demo's panel button drives the file-download
	// path this test exercises.
	const [download] = await Promise.all([
		page.waitForEvent("download"),
		page
			.getByLabel("AI copilot + HTML export")
			.getByRole("button", { name: /export react/i })
			.click({ force: true }),
	]);

	expect(download.suggestedFilename()).toMatch(/\.tsx$/);

	const path = await download.path();
	expect(path).not.toBeNull();

	const fs = await import("node:fs/promises");
	const content = await fs.readFile(path, "utf8");

	expect(content).toContain("import { Hero } from \"@anvilkit/hero\"");
	expect(content).toContain("export default function Page()");
	expect(content).toContain("Write fast with");
	expect(content.length).toBeGreaterThan(100);
});
