/**
 * P0-04 acceptance (plan 0036): the `<Studio>` mount enables the visual
 * editor, so `ctx.editor` is present for plugins — the feature signal the
 * code-editor plugin's whole surface depends on (P0-13).
 */

import type { StudioPlugin } from "@anvilkit/core";
import { Studio } from "@anvilkit/core";
import type { Config, Data } from "@puckeditor/core";
import { render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { createComponentEditorConfig } from "../editor-config";
import { emptyDocument } from "../empty-document";
import { componentEditorPlugins } from "../plugins";

describe("component-editor plugin roster (P0-04)", () => {
	it("keeps the design §1.4 order and a stable array identity", () => {
		expect(componentEditorPlugins.map((plugin) => plugin.meta.id)).toEqual([
			"anvilkit-plugin-export-html",
			"anvilkit-plugin-export-react",
			"anvilkit-plugin-design-system",
		]);
		// Module-scope roster: <Studio> memoizes compilation on identity.
		expect(componentEditorPlugins).toBe(componentEditorPlugins);
	});

	it("exposes ctx.editor to plugins when the mount enables the editor", async () => {
		let sawEditorApi: boolean | null = null;

		const probeMeta = {
			id: "p0-04-editor-probe",
			name: "Editor probe",
			version: "0.0.0",
			coreVersion: "^0.1.0-alpha",
			description: "Records whether ctx.editor is present at register().",
		} as const;

		const probe: StudioPlugin = {
			meta: probeMeta,
			register(ctx) {
				sawEditorApi = ctx.editor !== undefined;
				// A registration echoes its plugin's meta so the runtime can
				// attribute every registered artifact to its source plugin.
				return { meta: probeMeta };
			},
		};

		render(
			createElement(Studio, {
				storeId: "component-editor-test",
				puckConfig: createComponentEditorConfig() as unknown as Config,
				data: emptyDocument() as unknown as Data,
				plugins: [probe],
				editor: { features: { enabled: true } },
			}),
		);

		await waitFor(() => expect(sawEditorApi).not.toBeNull());
		expect(sawEditorApi).toBe(true);
	});
});
