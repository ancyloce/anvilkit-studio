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

	const [download] = await Promise.all([
		page.waitForEvent("download"),
		page
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
