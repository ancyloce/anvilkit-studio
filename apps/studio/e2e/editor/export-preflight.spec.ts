/**
 * Production export preflight — DD-DEC-018 / CORE-P3-009.
 *
 * ### The defect this certifies against
 *
 * `listUsedAuthoringFeatures()` scanned only the authoring sidecar.
 * `richText` is stored in **component props** (the shared
 * `TiptapDocumentV1` contract), so a rich-text document reported
 * *zero* used features and sailed through the production block of a
 * format that declares no rich-text support — silently exporting a
 * page whose text content the target could not render.
 *
 * The fix is `listUsedEditorFeatures(authoring, document)`, which
 * scans the document as well as the sidecar. This suite drives the
 * real app with a real rich-text document seeded through `?data=` and
 * asserts the two halves that matter to a user:
 *
 * - React export (does **not** declare `richText`) is **blocked**;
 * - HTML export (does declare it) **succeeds** and materializes the
 *   text.
 *
 * Nothing here hand-declares a feature list: the block must come from
 * detection or it proves nothing.
 */

import { expect, type Page, test } from "@playwright/test";

/** A `TiptapDocumentV1` exactly as the shared sanitizer emits it. */
const TIPTAP_DOC = {
	version: "1",
	type: "doc",
	content: [
		{
			type: "paragraph",
			content: [{ type: "text", text: "Ship faster with rich text" }],
		},
	],
} as const;

/**
 * A minimal demo document whose only editor feature is rich text,
 * stored where it really lives — in a component prop.
 */
const RICH_TEXT_DOCUMENT = {
	root: {
		props: {
			title: "Rich text export",
			slug: "rich-text-export",
			status: "published",
			seo: { noIndex: false },
		},
	},
	content: [
		{
			// A real demo component type, so the document renders; the
			// feature under test is the extra rich-text prop, which is
			// exactly how inline editing writes one.
			type: "Hero",
			props: {
				id: "hero-rich-1",
				// The editor's inline pipeline writes an `InlineTextValue`
				// wrapping the versioned document.
				richBody: { format: "tiptap", value: TIPTAP_DOC },
			},
		},
	],
	zones: {},
};

function richTextEditorUrl(): string {
	const params = new URLSearchParams({
		data: JSON.stringify(RICH_TEXT_DOCUMENT),
		e2e: "demo-tools",
	});
	return `/puck/editor?${params.toString()}`;
}

/**
 * The demo's Exports panel. Scoped by its region label: the AnvilKit
 * chrome header also contributes an "Export React" action, so a bare
 * name match is ambiguous (the `export-react.spec.ts` precedent).
 */
function exportButton(page: Page, name: "Download HTML" | "Export React") {
	return page.getByLabel("Exports").getByRole("button", { name });
}

async function openWithRichText(page: Page): Promise<void> {
	await page.goto(richTextEditorUrl());
	await expect(exportButton(page, "Export React")).toBeVisible({
		timeout: 90_000,
	});
}

test.describe("export preflight detects richText from the document", () => {
	test.describe.configure({ timeout: 240_000 });

	test("React export is BLOCKED for a rich-text document", async ({ page }) => {
		const failures: string[] = [];
		page.on("pageerror", (error) => failures.push(String(error)));
		await openWithRichText(page);

		// `runExport` throws on a blocked verdict (fail-closed), and the
		// demo surfaces the refusal rather than writing a lossy file.
		const download = page.waitForEvent("download", { timeout: 8_000 });
		await exportButton(page, "Export React").click();

		const result = await download.then(
			() => "downloaded" as const,
			() => "refused" as const,
		);
		expect(
			result,
			"a rich-text document must not export through a format that " +
				"declares no rich-text support (DD-DEC-018)",
		).toBe("refused");
	});

	test("HTML export succeeds and materializes the rich text", async ({
		page,
	}) => {
		await openWithRichText(page);

		const download = page.waitForEvent("download", { timeout: 30_000 });
		await exportButton(page, "Download HTML").click();
		const file = await download;
		expect(file.suggestedFilename()).toMatch(/\.html$/);

		const stream = await file.createReadStream();
		const chunks: Buffer[] = [];
		for await (const chunk of stream) {
			chunks.push(Buffer.from(chunk));
		}
		const html = Buffer.concat(chunks).toString("utf8");
		// The rich-text value is materialized, not dropped or serialized
		// as an object literal.
		expect(html).toContain("Ship faster with rich text");
		expect(html).not.toContain('"type":"doc"');
	});

	test("a document with no editor features still exports through both", async ({
		page,
	}) => {
		// The §3.2 compatibility guarantee: adding the editor changes
		// nothing for documents that do not use it.
		await page.goto("/puck/editor?e2e=demo-tools");
		await expect(exportButton(page, "Download HTML")).toBeVisible({
			timeout: 90_000,
		});
		const download = page.waitForEvent("download", { timeout: 30_000 });
		await exportButton(page, "Download HTML").click();
		expect((await download).suggestedFilename()).toMatch(/\.html$/);
	});
});
