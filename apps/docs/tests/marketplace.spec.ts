/**
 * Marketplace catalog smoke spec — ported from apps/docs for the Fumadocs/
 * TanStack Start app. Drives the /marketplace route, asserts the registry
 * feed renders, filters narrow the set, and every entry exposes a copyable
 * install command. Counts track the current feed (24 entries: 12 plugins +
 * 12 components, all verified — templates are workspace-only, not in the feed).
 */
import { expect, test } from "@playwright/test";

test.describe("marketplace", () => {
	test("renders the registry feed and supports kind/verified filters", async ({
		page,
	}) => {
		const pageErrors: string[] = [];
		page.on("pageerror", (err) => pageErrors.push(err.stack ?? err.message));

		await page.goto("/marketplace");

		await expect(page.getByTestId("marketplace-root")).toBeVisible();
		await expect(page.getByTestId("marketplace-card")).toHaveCount(24);
		await expect(page.getByTestId("card-badge-verified")).toHaveCount(24);

		// Filtering is React state — verified by clicking the chips. Use
		// dispatchEvent("click") (fires directly on the element) because the
		// dev-mode page jitters layout, which trips Playwright's mouse-click
		// "stable" actionability check and makes coordinate-based clicks flaky.
		// The first interaction is retried to absorb the hydration race (cards
		// are server-rendered before the onClick handlers attach).
		await expect(async () => {
			await page.getByTestId("filter-kind-template").dispatchEvent("click");
			await expect(page.getByTestId("marketplace-card")).toHaveCount(0, {
				timeout: 1500,
			});
		}).toPass({ timeout: 30_000 });

		await page.getByTestId("filter-kind-plugin").dispatchEvent("click");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(12);

		await page.getByTestId("filter-kind-component").dispatchEvent("click");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(12);

		await page.getByTestId("filter-kind-all").dispatchEvent("click");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(24);

		const search = page.getByTestId("filter-search");
		await search.fill("hero");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(1);
		await expect(page.getByTestId("marketplace-card").first()).toHaveAttribute(
			"data-slug",
			"hero",
		);

		await search.fill("");
		await expect(page.getByTestId("marketplace-card")).toHaveCount(24);

		const installCommands = await page
			.getByTestId("card-install-command")
			.allInnerTexts();
		expect(installCommands).toHaveLength(24);
		for (const command of installCommands) {
			expect(command.startsWith("npx anvilkit add ")).toBe(true);
		}

		expect(pageErrors).toEqual([]);
	});

	test("the /marketplace route loads directly", async ({ page }) => {
		await page.goto("/marketplace");
		await expect(page).toHaveURL(/\/marketplace$/);
		await expect(page.getByTestId("marketplace-root")).toBeVisible();
	});
});
