/**
 * @file P1 regression: a disposed/unmounted `<Studio>` must not keep
 * serving its Puck API through `getPuckApi()`. The binder clears the
 * shared ref on unmount and the runtime teardown clears it before
 * `onDestroy`/dispose, so a plugin context captured while Puck was
 * mounted throws (the "unbound" contract) once the editor is gone —
 * instead of routing actions into an unmounted editor tree.
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Faithful-enough Puck mock that renders the composed `puck` override
// so <PuckApiBinder> actually mounts/unmounts (mirrors the on-ready
// test). `getPuckApi()` is only callable because this binder runs.
vi.mock("@puckeditor/core", () => ({
	Puck: ({ overrides }: { overrides?: { puck?: PuckSlot } }) => {
		const PuckSlot = overrides?.puck ?? (({ children }) => <>{children}</>);
		return (
			<div data-testid="puck-mock">
				<PuckSlot>
					<div data-testid="puck-inner" />
				</PuckSlot>
			</div>
		);
	},
	useGetPuck: () => () => ({
		appState: { data: { root: { props: {} }, content: [], zones: {} } },
		dispatch: vi.fn(),
	}),
	createUsePuck: () => () => undefined,
}));

type PuckSlot = (props: { children: ReactNode }) => ReactNode;

import { Studio } from "@/components/Studio";
import type { StudioPlugin, StudioPluginContext } from "@/types/plugin";

afterEach(cleanup);

describe("<Studio> — getPuckApi after teardown (P1)", () => {
	it("stops serving the Puck API once the editor unmounts", async () => {
		let captured: StudioPluginContext | null = null;
		let readyGetPuckApiOk = false;

		const plugin: StudioPlugin = {
			meta: {
				id: "test/teardown-puck-api",
				name: "teardown probe",
				version: "1.0.0",
				coreVersion: "^0.1.0",
			},
			register() {
				return {
					meta: {
						id: "test/teardown-puck-api",
						name: "teardown probe",
						version: "1.0.0",
						coreVersion: "^0.1.0",
					},
					hooks: {
						onReady(ctx) {
							captured = ctx;
							// Sanity: the API is live while Puck is mounted.
							readyGetPuckApiOk =
								typeof ctx.getPuckApi().dispatch === "function";
						},
					},
				};
			},
		};

		const { unmount } = render(
			<Studio
				chrome="puck"
				puckConfig={{ components: {} }}
				plugins={[plugin]}
			/>,
		);

		await waitFor(() => {
			expect(captured).not.toBeNull();
		});
		// Settle any trailing re-renders / StrictMode double-invoke.
		await new Promise((r) => setTimeout(r, 20));

		expect(readyGetPuckApiOk).toBe(true);
		const ctx = captured as unknown as StudioPluginContext;
		// Still bound right before teardown.
		expect(() => ctx.getPuckApi()).not.toThrow();

		unmount();

		// After teardown the ref is cleared, so the captured context can no
		// longer resolve the (now unmounted) editor's API.
		expect(() => ctx.getPuckApi()).toThrow();
	});
});
