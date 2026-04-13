import { expect, test } from "@playwright/test";

test("HTML export downloads a document containing the Hero title", async ({
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
		page.getByRole("button", { name: /download html/i }).click(),
	]);

	expect(download.suggestedFilename().endsWith(".html")).toBe(true);

	const path = await download.path();
	expect(path).not.toBeNull();

	const fs = await import("node:fs/promises");
	const content = await fs.readFile(path, "utf8");

	expect(content.toLowerCase()).toContain("<!doctype html>");
	expect(content).not.toContain("<script");
	expect(content).toContain("Write fast with");
	expect(content.length).toBeGreaterThan(500);
});
