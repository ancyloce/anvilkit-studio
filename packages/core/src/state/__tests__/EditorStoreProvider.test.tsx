/**
 * @file Tests for `<EditorStoreProvider>` (provider-consolidation Phase 2).
 *
 * Verifies the single-gate bundle provider:
 *  - supplies all four editor-store contexts (theme / export / ai / ui)
 *    behind ONE hydration gate, and
 *  - adopts an injected bundle (`store`) so the controller-owned per-instance
 *    stores are the exact ones consumers read.
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useEditorUiStoreApi } from "@/state/slices/EditorUiStoreProvider";
import { useAiStoreApi } from "@/state/slices/AiStoreProvider";
import { EditorStoreProvider } from "@/state/EditorStoreProvider";
import { useExportStoreApi } from "@/state/slices/ExportStoreProvider";
import { createEditorStore } from "@/state/editor-store-bundle";
import { useThemeStoreApi } from "@/state/slices/ThemeStoreProvider";

interface Captured {
	theme: unknown;
	export: unknown;
	ai: unknown;
	ui: unknown;
}

let captured: Captured | null = null;

function Probe(): ReactNode {
	// Reads all four contexts the consolidated provider supplies. Each
	// `use*StoreApi` throws if its context is missing, so a successful render
	// proves every context is present behind the single gate.
	captured = {
		theme: useThemeStoreApi(),
		export: useExportStoreApi(),
		ai: useAiStoreApi(),
		ui: useEditorUiStoreApi(),
	};
	return <div data-testid="probe-ready" />;
}

beforeEach(() => {
	localStorage.clear();
	captured = null;
});

afterEach(cleanup);

describe("<EditorStoreProvider> — single-gate editor store bundle", () => {
	it("supplies all four store contexts behind one gate", async () => {
		const { container } = render(
			<EditorStoreProvider storeId="A">
				<Probe />
			</EditorStoreProvider>,
		);
		await waitFor(() => {
			expect(
				container.querySelector("[data-testid=probe-ready]"),
			).not.toBeNull();
		});
		// `captured` is set only if `Probe` actually rendered (i.e. the gate
		// opened); assert it directly so the field checks can't pass vacuously.
		expect(captured).not.toBeNull();
		expect(captured?.theme).toBeTruthy();
		expect(captured?.export).toBeTruthy();
		expect(captured?.ai).toBeTruthy();
		expect(captured?.ui).toBeTruthy();
	});

	it("adopts an injected bundle so consumers read the same store instances", async () => {
		const bundle = createEditorStore({ storeId: "B" });
		const { container } = render(
			<EditorStoreProvider storeId="B" store={bundle}>
				<Probe />
			</EditorStoreProvider>,
		);
		await waitFor(() => {
			expect(
				container.querySelector("[data-testid=probe-ready]"),
			).not.toBeNull();
		});
		expect(captured?.theme).toBe(bundle.theme);
		expect(captured?.export).toBe(bundle.export);
		expect(captured?.ai).toBe(bundle.ai);
		expect(captured?.ui).toBe(bundle.ui);
	});
});
