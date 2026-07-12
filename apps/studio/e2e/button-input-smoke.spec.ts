import { expect, test } from "@playwright/test";

test("render route shows Button and Input from the shared demo payload", async ({
	page,
}) => {
	await page.goto("/puck/render");

	await expect(
		page.getByRole("button", { name: /save changes/i }),
	).toBeVisible();

	await expect(page.getByLabel(/email address/i)).toBeVisible();
});

test("editor route hydrates with Button and Input registered in demoConfig", async ({
	page,
}) => {
	const consoleMessages: string[] = [];
	const pageErrors: string[] = [];
	page.on("console", (msg) => {
		consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
	});
	page.on("pageerror", (err) => {
		pageErrors.push(err.stack ?? err.message);
	});

	await page.goto("/puck/editor");

	await expect
		.poll(
			() => consoleMessages.some((line) => line.includes("[smoke] onInit")),
			{ timeout: 15_000 },
		)
		.toBe(true);

	const unknownComponentErrors = consoleMessages
		.concat(pageErrors)
		.filter(
			(line) =>
				/unknown component/i.test(line) ||
				/no config for component/i.test(line) ||
				/Component ".*" not found/i.test(line),
		);

	expect(unknownComponentErrors).toEqual([]);
});
