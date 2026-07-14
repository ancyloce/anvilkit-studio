// Pure, non-React test harness for the `?e2e=asset-manager` route flag.
// Extracted out of `app/puck/editor/page.tsx` (react-doctor `no-giant-component`)
// so the editor page's own state/handlers stay in `use-asset-manager-e2e.ts`
// and this module only holds the headless plugin-runtime plumbing.
import { compilePlugins, StudioConfigSchema } from "@anvilkit/core";
import type {
	ExportWarning,
	PageIR,
	StudioPluginContext,
} from "@anvilkit/core/types";
import type { UploadResult } from "@anvilkit/plugin-asset-manager";
import type { Data } from "@puckeditor/core";
import {
	loadAssetManager,
	loadExportHtml,
	loadExportReact,
} from "@/lib/lazy-plugins";

// Minimal `StudioConfig` for the headless harness — the asset-manager E2E
// route never mounts a real `<Studio>`, so this only needs to satisfy the
// `StudioPluginContext.studioConfig` shape.
const assetManagerTestStudioConfig = StudioConfigSchema.parse({});

export interface AssetManagerTestHarness {
	readonly ctx: StudioPluginContext;
	readonly runtime: Awaited<ReturnType<typeof compilePlugins>>;
	asset: UploadResult | null;
}

function createHeadlessStudioContext(): StudioPluginContext {
	let currentData: Data = { root: { props: {} }, content: [], zones: {} };

	return {
		getData: () => currentData,
		getPuckApi: (() => ({
			dispatch(action: unknown) {
				if (
					action &&
					typeof action === "object" &&
					"type" in action &&
					action.type === "setData" &&
					"data" in action
				) {
					currentData = action.data as Data;
				}
			},
		})) as StudioPluginContext["getPuckApi"],
		studioConfig: assetManagerTestStudioConfig,
		log: () => undefined,
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: (_resolver) => undefined,
	};
}

export async function createAssetManagerTestHarness(): Promise<AssetManagerTestHarness> {
	const ctx = createHeadlessStudioContext();
	// Load the plugin factories on demand (the harness only runs under
	// `?e2e=asset-manager`), reusing the same memoized chunks as the live
	// lazy plugin entries so no second copy is fetched.
	const [assetManagerMod, htmlMod, reactMod] = await Promise.all([
		loadAssetManager(),
		loadExportHtml(),
		loadExportReact(),
	]);
	const runtime = await compilePlugins(
		[
			assetManagerMod.createAssetManagerPlugin({
				uploader: assetManagerMod.dataUrlUploader(),
				dataUrlAllowlistOptIn: true,
			}),
			htmlMod.createHtmlExportPlugin(),
			reactMod.createReactExportPlugin({
				syntax: "tsx",
				assetStrategy: "url-prop",
			}),
		],
		ctx,
	);

	await runtime.lifecycle.emit("onInit", ctx);

	return {
		ctx,
		runtime,
		asset: null,
	};
}

function createAssetReference(id: string): string {
	return `asset://${id}`;
}

export function createAssetManagerHtmlIr(assetId: string): PageIR {
	const assetUrl = createAssetReference(assetId);

	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "blog-1",
					type: "BlogList",
					props: {
						posts: [
							{
								title: "Resolver smoke test",
								description: "The HTML exporter should resolve asset URLs.",
								imageSrc: assetUrl,
								imageAlt: "Uploaded asset",
							},
						],
					},
				},
			],
		},
		assets: [{ id: assetId, kind: "image", url: assetUrl }],
		metadata: {},
	};
}

export function createAssetManagerReactIr(assetId: string): PageIR {
	const assetUrl = createAssetReference(assetId);

	return {
		version: "1",
		root: {
			id: "root",
			type: "__root__",
			props: {},
			children: [
				{
					id: "hero-1",
					type: "Hero",
					props: {
						headline: "Resolver smoke test",
						description: "The React exporter should resolve asset URLs.",
						backgroundSrc: assetUrl,
					},
				},
			],
		},
		assets: [{ id: assetId, kind: "image", url: assetUrl }],
		metadata: {},
	};
}

export function formatWarnings(
	warnings: readonly ExportWarning[] | undefined,
): string {
	if (!warnings || warnings.length === 0) {
		return "none";
	}

	return warnings
		.map(
			(warning) =>
				`${warning.code}: ${warning.message}${warning.nodeId ? ` (${warning.nodeId})` : ""}`,
		)
		.join("\n");
}
