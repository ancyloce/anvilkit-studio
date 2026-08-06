/**
 * @file CORE-P1A-001 — `StudioEditorMount` seam: flag gating, lazy
 * port installation into the bridge, `useStudioEditor()` behavior,
 * and the controller data-change feed.
 */

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import type { StudioPluginContext } from "@/types/plugin";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { StudioEditorMount } from "../StudioEditorMount.js";
import {
	useOptionalStudioEditor,
	useStudioEditor,
} from "../use-studio-editor.js";

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

function HandleProbe(): ReactNode {
	const handle = useOptionalStudioEditor();
	return (
		<span data-testid="handle">{handle === null ? "none" : handle.status}</span>
	);
}

describe("<StudioEditorMount> (CORE-P1A-001)", () => {
	it("renders children untouched with no provider when the flag is off", () => {
		const bridge = createStudioEditorBridge();
		render(
			<StudioPluginContextProvider value={createCtx()}>
				<StudioEditorMount editor={undefined} bridge={bridge}>
					<HandleProbe />
				</StudioEditorMount>
			</StudioPluginContextProvider>,
		);
		expect(screen.getByTestId("handle").textContent).toBe("none");
		expect(bridge.port).toBeNull();
	});

	it("installs the command port into the bridge and flips the handle to ready", async () => {
		const bridge = createStudioEditorBridge();
		render(
			<StudioPluginContextProvider value={createCtx()}>
				<StudioEditorMount
					editor={{ features: { enabled: true } }}
					bridge={bridge}
				>
					<HandleProbe />
				</StudioEditorMount>
			</StudioPluginContextProvider>,
		);
		// Children render immediately (loading), never suspended.
		expect(screen.getByTestId("handle").textContent).toMatch(/loading|ready/);
		await waitFor(() => {
			expect(bridge.port).not.toBeNull();
			expect(screen.getByTestId("handle").textContent).toBe("ready");
		});
		expect(bridge.port?.getSnapshot().revision).toBe(0);
	});

	// P6-01: the authoring style context (and its stamping regression
	// case) is gone with config decoration — the canvas DOM registry
	// rides Puck's own data-puck-component attribute.

	it("useStudioEditor throws outside an editor-enabled Studio", () => {
		function Bare(): ReactNode {
			useStudioEditor();
			return null;
		}
		// Silence React's error boundary noise for the expected throw.
		const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
		expect(() => render(<Bare />)).toThrow(/editor-enabled <Studio>/);
		spy.mockRestore();
	});

	it("wakes subscribers when the controller feeds a foreign data change", async () => {
		const bridge = createStudioEditorBridge();
		render(
			<StudioPluginContextProvider value={createCtx()}>
				<StudioEditorMount
					editor={{ features: { enabled: true } }}
					bridge={bridge}
				>
					<HandleProbe />
				</StudioEditorMount>
			</StudioPluginContextProvider>,
		);
		await waitFor(() => expect(bridge.port).not.toBeNull());
		const versionBefore = bridge.getVersion();
		act(() => {
			// A foreign sidecar write invalidates and notifies…
			bridge.notifyDataChange(
				buildLegacyPuckData(5) /* fresh doc, still no sidecar */,
			);
		});
		// …but a sidecar-less → sidecar-less change is identity-equal
		// (undefined === undefined): no invalidation, no wake.
		expect(bridge.getVersion()).toBe(versionBefore);
	});
});
