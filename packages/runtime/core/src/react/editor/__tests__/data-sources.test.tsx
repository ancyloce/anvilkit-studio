/**
 * Regression coverage for lazy `editorConfig` installation. Both data-source
 * hooks can mount before `EditorRoot`; the bridge notification must make the
 * newly installed host adapter visible without an unrelated React render.
 */

import type {
	DataSourceDescriptor,
	EditorDataSourceAdapter,
} from "@anvilkit/contracts/editor";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	useDataSources,
	usePreviewData,
} from "../bindings/use-data-sources.js";
import { createStudioEditorBridge } from "../bridge.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

const SOURCES: readonly DataSourceDescriptor[] = [
	{ id: "products", name: "Products" },
];

function wrapperFor(
	adapter: EditorDataSourceAdapter,
): (props: { children: ReactNode }) => ReactNode {
	const bridge = createStudioEditorBridge();
	return function LazyEditorConfig({ children }) {
		useEffect(() => {
			bridge.editorConfig = { dataSourceAdapter: adapter };
			bridge.notifyStyles();
			return () => {
				bridge.editorConfig = null;
				bridge.notifyStyles();
			};
		}, []);
		return (
			<StudioEditorBridgeContext value={bridge}>
				{children}
			</StudioEditorBridgeContext>
		);
	};
}

function createAdapter(): EditorDataSourceAdapter {
	return {
		listSources: vi.fn(async () => SOURCES),
		getSchema: vi.fn(async () => ({ type: "object" as const })),
		getPreviewData: vi.fn(async () => ({ title: "Anvil" })),
	};
}

afterEach(cleanup);

describe("data-source hooks", () => {
	it("lists sources when the adapter is installed after mount", async () => {
		const adapter = createAdapter();
		const { result } = renderHook(() => useDataSources(), {
			wrapper: wrapperFor(adapter),
		});

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(result.current).toEqual({ status: "ready", sources: SOURCES });
		expect(adapter.listSources).toHaveBeenCalledTimes(1);
	});

	it("fetches preview data when the adapter is installed after mount", async () => {
		const adapter = createAdapter();
		const { result } = renderHook(
			() => usePreviewData({ sourceId: "products" }),
			{ wrapper: wrapperFor(adapter) },
		);

		await waitFor(() => expect(result.current?.status).toBe("data"));
		expect(result.current).toMatchObject({
			status: "data",
			value: { title: "Anvil" },
		});
		expect(adapter.getPreviewData).toHaveBeenCalledTimes(1);
	});
});
