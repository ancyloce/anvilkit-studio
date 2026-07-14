"use client";

// Owns the state + handlers for the `?e2e=asset-manager` route flag's
// resolver/export coverage harness. Extracted out of `page.tsx`
// (react-doctor `no-giant-component`) — the pure, non-React plumbing lives
// in `@/lib/asset-manager-test-harness`; this hook only holds the React
// state and the handlers `<AssetManagerE2EPanel>` wires to its controls.
import type { ChangeEvent } from "react";
import { useRef, useState } from "react";
import {
	type AssetManagerTestHarness,
	createAssetManagerHtmlIr,
	createAssetManagerReactIr,
	createAssetManagerTestHarness,
	formatWarnings,
} from "@/lib/asset-manager-test-harness";
import { loadAssetManager } from "@/lib/lazy-plugins";

export interface UseAssetManagerE2EResult {
	assetManagerUploadMode: "safe" | "rogue";
	setAssetManagerUploadMode: (mode: "safe" | "rogue") => void;
	assetManagerRogueUrl: string;
	setAssetManagerRogueUrl: (url: string) => void;
	assetManagerStatus: string;
	assetManagerHtmlOutput: string;
	assetManagerHtmlWarnings: string;
	assetManagerReactOutput: string;
	assetManagerReactWarnings: string;
	handleAssetManagerFileChange: (
		event: ChangeEvent<HTMLInputElement>,
	) => Promise<void>;
	handleAssetManagerHtmlExport: () => Promise<void>;
	handleAssetManagerReactExport: () => Promise<void>;
}

export function useAssetManagerE2E(): UseAssetManagerE2EResult {
	const assetManagerHarnessRef = useRef<AssetManagerTestHarness | null>(null);
	const [assetManagerUploadMode, setAssetManagerUploadMode] = useState<
		"safe" | "rogue"
	>("safe");
	// Phase 4 hardening fixtures: the spec drives different rogue payloads
	// through the same registry-bypass code path via `?rogueUrl=...`.
	// Defaults to the legacy `javascript:` URL so the existing test
	// continues to pass without a query param.
	const [assetManagerRogueUrl, setAssetManagerRogueUrl] = useState(
		"javascript:alert(1)",
	);
	const [assetManagerStatus, setAssetManagerStatus] = useState("Idle.");
	const [assetManagerHtmlOutput, setAssetManagerHtmlOutput] = useState("");
	const [assetManagerHtmlWarnings, setAssetManagerHtmlWarnings] =
		useState("none");
	const [assetManagerReactOutput, setAssetManagerReactOutput] = useState("");
	const [assetManagerReactWarnings, setAssetManagerReactWarnings] =
		useState("none");

	async function ensureAssetManagerHarness(): Promise<AssetManagerTestHarness> {
		const harness = await createAssetManagerTestHarness();
		assetManagerHarnessRef.current = harness;
		return harness;
	}

	async function handleAssetManagerFileChange(
		event: ChangeEvent<HTMLInputElement>,
	) {
		const file = event.currentTarget.files?.[0];
		if (!file) {
			return;
		}

		setAssetManagerHtmlOutput("");
		setAssetManagerHtmlWarnings("none");
		setAssetManagerReactOutput("");
		setAssetManagerReactWarnings("none");

		try {
			const harness = await ensureAssetManagerHarness();
			const { getAssetRegistry, uploadAsset } = await loadAssetManager();

			if (assetManagerUploadMode === "safe") {
				harness.asset = await uploadAsset(harness.ctx, file);
				setAssetManagerStatus(
					`Uploaded ${harness.asset.id} through dataUrlUploader.`,
				);
			} else {
				const registry = getAssetRegistry(harness.ctx);
				if (!registry) {
					throw new Error("Asset registry unavailable in test harness.");
				}

				harness.asset = registry.register({
					id: "asset-rogue",
					url: assetManagerRogueUrl,
					meta: {
						size: file.size,
						...(file.type ? { mimeType: file.type } : {}),
					},
				});
				setAssetManagerStatus(
					`Seeded asset-rogue (${assetManagerRogueUrl}) to simulate a rogue uploader bypassing upload validation.`,
				);
			}
		} catch (error) {
			setAssetManagerStatus(
				error instanceof Error ? error.message : String(error),
			);
		} finally {
			event.currentTarget.value = "";
		}
	}

	async function handleAssetManagerHtmlExport() {
		const harness = assetManagerHarnessRef.current;
		if (!harness?.asset) {
			setAssetManagerStatus("Upload or seed an asset before exporting.");
			return;
		}

		const format = harness.runtime.exportFormats.get("html");
		if (!format) {
			setAssetManagerStatus("HTML export format not registered.");
			return;
		}

		const result = await format.run(
			createAssetManagerHtmlIr(harness.asset.id),
			{ title: "Asset manager test page" },
			{ assetResolvers: harness.runtime.assetResolvers },
		);

		setAssetManagerHtmlOutput(String(result.content));
		setAssetManagerHtmlWarnings(formatWarnings(result.warnings));
	}

	async function handleAssetManagerReactExport() {
		const harness = assetManagerHarnessRef.current;
		if (!harness?.asset) {
			setAssetManagerStatus("Upload or seed an asset before exporting.");
			return;
		}

		const format = harness.runtime.exportFormats.get("react");
		if (!format) {
			setAssetManagerStatus("React export format not registered.");
			return;
		}

		const result = await format.run(
			createAssetManagerReactIr(harness.asset.id),
			{ syntax: "tsx", assetStrategy: "url-prop" },
			{ assetResolvers: harness.runtime.assetResolvers },
		);

		setAssetManagerReactOutput(String(result.content));
		setAssetManagerReactWarnings(formatWarnings(result.warnings));
	}

	return {
		assetManagerUploadMode,
		setAssetManagerUploadMode,
		assetManagerRogueUrl,
		setAssetManagerRogueUrl,
		assetManagerStatus,
		assetManagerHtmlOutput,
		assetManagerHtmlWarnings,
		assetManagerReactOutput,
		assetManagerReactWarnings,
		handleAssetManagerFileChange,
		handleAssetManagerHtmlExport,
		handleAssetManagerReactExport,
	};
}
