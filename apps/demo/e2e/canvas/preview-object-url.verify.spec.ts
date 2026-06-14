import { expect, test } from "@playwright/test";
import {
	gotoEditor,
	insertDesignBlockAndCommitPreview,
} from "./design-block-preview.helpers";

/**
 * Runtime verification of the "previews → object-URL store" change: after a
 * canvas commit, the DesignBlock in the Puck editor renders its preview from the
 * plugin's object-URL store — i.e. the `<img src>` is a `blob:` URL, NOT an
 * inlined data URL in the node props and NOT the raw `design://` reference.
 */
test.describe.configure({ timeout: 240_000 });

const SHOT = process.env.SHOT_PATH ?? "preview-verify.png";

test("DesignBlock preview renders from the object-URL store after a canvas commit", async ({
	page,
}) => {
	await gotoEditor(page);
	const frame = await insertDesignBlockAndCommitPreview(page);

	// The empty state is replaced by the preview figure...
	await expect(frame.getByTestId("design-block")).toBeVisible({
		timeout: 20_000,
	});
	const img = frame.getByTestId("design-block").locator("img");
	await expect(img).toBeVisible();

	// ...and its src is a blob: object URL from the store (the change under test).
	const src = await img.getAttribute("src");
	console.log(`[verify] design-block <img> src prefix: ${src?.slice(0, 48)}`);
	expect(src, "preview <img> must have a src").toBeTruthy();
	expect(
		src?.startsWith("blob:"),
		`expected a blob: object URL, got: ${src?.slice(0, 64)}`,
	).toBe(true);

	await page.screenshot({ path: SHOT, fullPage: true });
});
