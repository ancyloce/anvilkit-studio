/**
 * @file P4-03 — preview draft route unification lock (PLAN-0025 §9.3).
 *
 * The editor's header Preview action persists the live document into
 * the durable `__preview__` scratch slot (`POST /api/pages/preview`
 * wraps exactly the `saveDraft` call exercised here), and the render
 * route serves it back through `loadPublishedRender(slug, { preview })`
 * — the SAME function, the same `resolveDataSources` pass, and (after
 * P4-02) the same `<AnvilKitRender>` wrapper the public branch uses.
 * This suite locks that unification at the pipeline level: one
 * document previewed and published must come back byte-equal and
 * compile to ONE fingerprint under the unified compiler — the preview
 * and public-RSC legs of the Phase 4 exit gate.
 *
 * `../puck-demo` is mocked: it value-imports nested-workspace component
 * packages (`@anvilkit/design-block`, …) that only Next's
 * `transpilePackages` pipeline can resolve, and `page-store` needs just
 * `createDemoPagesData` for first-run seeding. Compilation here uses a
 * local config mirroring the real Navbar metadata-v2 allowlist
 * (`display` is allowlisted on its root target — see
 * `components/src/navbar/src/config.ts`); the real-config parity runs
 * with the P4-07 cross-surface suite.
 */

import { compileDocumentAppearance } from "@anvilkit/core/editor";
import type { Config, Data } from "@puckeditor/core";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { PREVIEW_SLOT_SLUG } from "../page-link";
import { publish } from "../page-storage/page-api";
import type { DemoPageData } from "../page-storage/types";
import { getPageStorage } from "../page-store";
import { loadPublishedRender } from "../published-render";
// Resolves to the mock below — the same config `published-render`'s
// `resolveAllData` step consumes, so compile parity here uses exactly
// the production pipeline's config.
import { demoConfig } from "../puck-demo";

vi.mock("../puck-demo", () => {
	const parityConfig = {
		components: {
			Navbar: {
				fields: {},
				metadata: {
					anvilkit: {
						editor: {
							version: "2",
							styleTargets: {
								root: {
									label: "Navbar",
									responsive: true,
									properties: ["display"],
								},
							},
						},
					},
				},
				render: () => null,
			},
		},
	};
	return {
		createDemoPagesData: () => ({}),
		demoConfig: parityConfig,
	};
});

const parityConfig = demoConfig as unknown as Config;

/**
 * One Navbar node with an allowlisted appearance plus fully valid page
 * root props, so `publish` passes validation and the compiler emits
 * real CSS rather than a trivially-empty sheet.
 */
const parityDocument = {
	content: [
		{
			type: "Navbar",
			props: {
				id: "nav-parity",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: { base: { layout: { display: "flex" } } },
						},
					},
				},
			},
		},
	],
	root: {
		props: {
			title: "Parity",
			slug: "parity-page",
			status: "published",
			version: "1.0.0",
			parentFolder: "/",
			seo: { noIndex: true },
		},
	},
	zones: {},
} as unknown as DemoPageData;

beforeAll(() => {
	vi.stubEnv("ANVILKIT_PAGE_STORAGE", "memory");
});

describe("preview draft route parity (P4-03, §9.3)", () => {
	it("serves the preview draft and the published page through one pipeline with one compiler fingerprint", async () => {
		const storage = await getPageStorage();
		// The header Preview action's persistence path.
		await storage.saveDraft({
			id: PREVIEW_SLOT_SLUG,
			slug: PREVIEW_SLOT_SLUG,
			data: parityDocument,
		});
		const published = await publish(storage, {
			slug: "parity-page",
			data: parityDocument,
		});
		expect(published.status).toBe(200);

		const previewModel = await loadPublishedRender([PREVIEW_SLOT_SLUG], {
			preview: true,
		});
		const publicModel = await loadPublishedRender(["parity-page"]);
		expect(previewModel).not.toBeNull();
		expect(publicModel).not.toBeNull();

		// Same document through both branches — the preview draft is not a
		// separate rendering path, only a different payload selection.
		expect(previewModel?.resolved).toEqual(publicModel?.resolved);

		// One compiler, one fingerprint (§9.2 step 5): the preview and
		// public legs of the exit gate can never diverge on CSS.
		const previewCompiled = compileDocumentAppearance({
			data: previewModel?.resolved as unknown as Data,
			config: parityConfig,
		});
		const publicCompiled = compileDocumentAppearance({
			data: publicModel?.resolved as unknown as Data,
			config: parityConfig,
		});
		expect(previewCompiled.diagnostics).toEqual([]);
		expect(previewCompiled.css).toContain('[data-ak-style-node="nav-parity"]');
		expect(previewCompiled.css).toContain("display: flex;");
		expect(previewCompiled.fingerprint).toBe(publicCompiled.fingerprint);
		expect(previewCompiled.css).toBe(publicCompiled.css);
	});

	it("never serves the preview scratch slot on the public branch", async () => {
		// The scratch record is draft-only: the public (non-preview) read
		// must refuse it even after a preview has been stored.
		expect(await loadPublishedRender([PREVIEW_SLOT_SLUG])).toBeNull();
	});
});
