/**
 * @file CORE-P3-008 — the persistent editor surface slot (DD-0019
 * §21.2).
 *
 * What is under test is the *property* that made the AI review flow
 * unreachable before: every other host seam is torn down by ordinary
 * chrome interaction (a popover closing, a rail tab losing focus), so
 * a multi-step flow cannot survive in one. These tests assert the
 * slot stays mounted with its state intact across re-renders and
 * sibling churn, that host and plugin contributions both land in it,
 * and that a crashing surface cannot take the editor down.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { type ReactNode, useContext, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import { SidebarRegistryProvider } from "@/state/sidebar-registry/SidebarRegistryProvider";
import {
	createSidebarRegistryStore,
	type SidebarRegistryStoreApi,
} from "@/state/sidebar-registry/sidebar-registry-store";
import type { StudioPluginContext } from "@/types/plugin";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { StudioEditorMount } from "../StudioEditorMount.js";
import { StudioEditorBridgeContext } from "../use-studio-editor.js";

afterEach(cleanup);

function createCtx(): StudioPluginContext {
	const dispatch = vi.fn();
	const data = buildLegacyPuckData();
	return {
		getData: () => data,
		getPuckApi: () =>
			({ appState: { data }, dispatch }) as unknown as ReturnType<
				StudioPluginContext["getPuckApi"]
			>,
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: () => undefined,
	};
}

/** A surface that both counts its mounts and holds internal state. */
let mountCount = 0;
function StatefulSurface(): ReactNode {
	const [clicks, setClicks] = useState(0);
	// Increment on first render of each mount instance.
	const [, setSeen] = useState(() => {
		mountCount += 1;
		return true;
	});
	void setSeen;
	return (
		<button
			type="button"
			data-testid="surface"
			onClick={() => setClicks((value) => value + 1)}
		>
			{clicks}
		</button>
	);
}

/** Proves the slot's children sit inside the editor provider tree. */
function BridgeProbe(): ReactNode {
	const bridge = useContext(StudioEditorBridgeContext);
	return (
		<span data-testid="bridge-visible">{bridge === null ? "no" : "yes"}</span>
	);
}

function renderSlot(options: {
	readonly hostSlot?: ReactNode;
	readonly store?: SidebarRegistryStoreApi;
	readonly siblingKey?: string;
}) {
	const bridge = createStudioEditorBridge();
	const store = options.store ?? createSidebarRegistryStore();
	return {
		store,
		bridge,
		...render(
			<StudioPluginContextProvider value={createCtx()}>
				<SidebarRegistryProvider value={store}>
					<StudioEditorMount
						editor={{ features: { enabled: true } }}
						bridge={bridge}
						{...(options.hostSlot === undefined
							? {}
							: { editorSlot: options.hostSlot })}
					>
						<span key={options.siblingKey}>puck</span>
					</StudioEditorMount>
				</SidebarRegistryProvider>
			</StudioPluginContextProvider>,
		),
	};
}

describe("<EditorSurfaceSlot> (CORE-P3-008)", () => {
	it("renders the host slot inside the editor provider tree", async () => {
		renderSlot({ hostSlot: <BridgeProbe /> });
		await waitFor(() => {
			expect(screen.getByTestId("bridge-visible").textContent).toBe("yes");
		});
	});

	it("renders nothing at all when the editor flag is off", () => {
		const bridge = createStudioEditorBridge();
		render(
			<StudioPluginContextProvider value={createCtx()}>
				<SidebarRegistryProvider value={createSidebarRegistryStore()}>
					<StudioEditorMount
						editor={undefined}
						bridge={bridge}
						editorSlot={<span data-testid="surface">host</span>}
					>
						<span>puck</span>
					</StudioEditorMount>
				</SidebarRegistryProvider>
			</StudioPluginContextProvider>,
		);
		// Backward compatibility: the disabled branch returns children
		// verbatim, so the slot cannot change a non-editor host.
		expect(screen.queryByTestId("surface")).toBeNull();
	});

	it("keeps host-slot state across sibling re-renders (the headerEnd defect)", async () => {
		mountCount = 0;
		const { rerender, bridge, store } = renderSlot({
			hostSlot: <StatefulSurface />,
			siblingKey: "a",
		});
		await waitFor(() => expect(screen.getByTestId("surface")).toBeTruthy());
		expect(mountCount).toBe(1);

		screen.getByTestId("surface").click();
		await waitFor(() =>
			expect(screen.getByTestId("surface").textContent).toBe("1"),
		);

		// Re-render with a different sibling identity — the churn that
		// destroys anything living inside a popover or a rail module.
		rerender(
			<StudioPluginContextProvider value={createCtx()}>
				<SidebarRegistryProvider value={store}>
					<StudioEditorMount
						editor={{ features: { enabled: true } }}
						bridge={bridge}
						editorSlot={<StatefulSurface />}
					>
						<span key="b">puck-changed</span>
					</StudioEditorMount>
				</SidebarRegistryProvider>
			</StudioPluginContextProvider>,
		);

		// Same mount instance: state survived, nothing remounted.
		expect(screen.getByTestId("surface").textContent).toBe("1");
		expect(mountCount).toBe(1);
	});

	it("renders plugin-registered surfaces and removes them on unregister", async () => {
		const store = createSidebarRegistryStore();
		renderSlot({ store });

		let unregister: () => void = () => undefined;
		act(() => {
			unregister = store.getState().registerEditorSurface({
				id: "ai-review",
				render: () => <span data-testid="plugin-surface">review</span>,
			});
		});
		await waitFor(() =>
			expect(screen.getByTestId("plugin-surface")).toBeTruthy(),
		);

		act(() => unregister());
		await waitFor(() =>
			expect(screen.queryByTestId("plugin-surface")).toBeNull(),
		);
	});

	it("renders several plugin surfaces at once (keyed, not single-occupancy)", async () => {
		const store = createSidebarRegistryStore();
		renderSlot({ store });
		act(() => {
			store.getState().registerEditorSurface({
				id: "a",
				render: () => <span data-testid="s-a">a</span>,
			});
			store.getState().registerEditorSurface({
				id: "b",
				render: () => <span data-testid="s-b">b</span>,
			});
		});
		await waitFor(() => {
			expect(screen.getByTestId("s-a")).toBeTruthy();
			expect(screen.getByTestId("s-b")).toBeTruthy();
		});
	});

	it("isolates a crashing surface without taking the editor down", async () => {
		// The boundary logs the crash on purpose; silence it so the
		// expected failure does not read as a broken test run.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// intentionally silent
		});
		const store = createSidebarRegistryStore();
		renderSlot({ store, hostSlot: <span data-testid="host-ok">ok</span> });
		act(() => {
			store.getState().registerEditorSurface({
				id: "boom",
				render: () => {
					throw new Error("surface exploded");
				},
			});
		});
		await waitFor(() => expect(screen.getByTestId("host-ok")).toBeTruthy());
		// The crashed surface is gone; everything else still renders.
		expect(screen.getByTestId("host-ok").textContent).toBe("ok");
		errorSpy.mockRestore();
	});

	it("works without a sidebar registry provider (chrome=puck / unit hosts)", async () => {
		const bridge = createStudioEditorBridge();
		render(
			<StudioPluginContextProvider value={createCtx()}>
				<StudioEditorMount
					editor={{ features: { enabled: true } }}
					bridge={bridge}
					editorSlot={<span data-testid="surface">host-only</span>}
				>
					<span>puck</span>
				</StudioEditorMount>
			</StudioPluginContextProvider>,
		);
		await waitFor(() =>
			expect(screen.getByTestId("surface").textContent).toBe("host-only"),
		);
	});
});
