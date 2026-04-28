/**
 * Marketplace catalog smoke spec (`phase6-012`).
 *
 * Drives the `/marketplace/` route end-to-end against the production
 * `astro preview` bundle. Asserts the route hydrates, the registry
 * feed renders 26 entries (10 templates + 5 plugins + 11 components),
 * filters narrow the visible set, the verified badge appears on every
 * first-party card, and every entry exposes a copyable
 * `npx anvilkit add <slug>` install command.
 */

import { expect, test } from "@playwright/test";

test.describe("marketplace", () => {
	test("renders the registry feed and supports kind/verified filters", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (err) => {
			pageErrors.push(err.stack ?? err.message);
		});

		await page.goto("/marketplace/");

		const root = page.getByTestId("marketplace-root");
		await expect(root).toBeVisible();

		const cards = page.getByTestId("marketplace-card");
		await expect(cards).toHaveCount(26);

		const verifiedBadges = page.getByTestId("card-badge-verified");
		await expect(verifiedBadges).toHaveCount(26);

		await page.getByTestId("filter-kind-template").click();
		await expect(page.getByTestId("marketplace-card")).toHaveCount(10);

		await page.getByTestId("filter-kind-plugin").click();
		await expect(page.getByTestId("marketplace-card")).toHaveCount(5);

		await page.getByTestId("filter-kind-component").click();
		await expect(page.getByTestId("marketplace-card")).toHaveCount(11);

		await page.getByTestId("filter-kind-all").click();
		await expect(page.getByTestId("marketplace-card")).toHaveCount(26);

		const search = page.getByTestId("filter-search");
		await search.fill("hero");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(1);
		await expect(page.getByTestId("marketplace-card").first()).toHaveAttribute(
			"data-slug",
			"hero",
		);

		await search.fill("");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(26);

		const installCommands = await page
			.getByTestId("card-install-command")
			.allInnerTexts();
		expect(installCommands).toHaveLength(26);
		for (const command of installCommands) {
			expect(command.startsWith("npx anvilkit add ")).toBe(true);
		}

		expect(pageErrors).toEqual([]);
	});

	test("sidebar exposes a Marketplace link from the docs root", async ({
		page,
	}) => {
		await page.goto("/");
		const sidebarLink = page.getByTestId("sidebar-marketplace-link");
		await expect(sidebarLink).toBeVisible();
		await sidebarLink.click();
		await expect(page).toHaveURL(/\/marketplace\/?$/);
		await expect(page.getByTestId("marketplace-root")).toBeVisible();
	});
});
