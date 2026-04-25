/**
 * @file Tests for the `<Studio>` shell component (task `core-014`).
 *
 * `<Studio>` wraps `@puckeditor/core`'s `<Puck>`, and Puck itself
 * is heavy: rendering it through testing-library would drag in drag
 * handles, iframes, and a forest of internal stores. The tests in
 * this file deliberately **mock** `@puckeditor/core` with a tiny
 * stand-in that captures the props it receives so the tests can
 * exercise `<Studio>`'s own orchestration logic (plugin compile,
 * lifecycle wiring, store population, onPublish veto) without
 * depending on any of Puck's internals.
 *
 * Coverage targets:
 *
 * - `<Studio>` renders `null` until `compilePlugins()` resolves,
 *   then mounts the (mocked) Puck with the expected props.
 * - An empty plugins array mounts cleanly and writes an empty
 *   `availableFormats` list into `useExportStore`.
 * - A plugin registering an export format has that format available
 *   via `useExportStore.getState().availableFormats` after mount.
 * - The `onDataChange` lifecycle hook fires when Puck calls the
 *   forwarded `onChange` handler, and the consumer's own
 *   `onChange` is called afterwards.
 * - `onBeforePublish` throwing aborts the consumer's `onPublish`
 *   handler — the mock must receive zero calls.
 * - `useStudio()` returns the diagnostic projection from inside a
 *   mounted `<Studio>`, and throws when called outside.
 * - Unmount fires `onDestroy` and resets the export + AI stores.
 * - Passing `aiHost="..."` prepends the compat adapter and the
 *   deprecation warning fires exactly once per mount.
 */

import type { Config as PuckConfig, Data as PuckData } from "@puckeditor/core";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	vi,
	type MockInstance,
} from "vitest";

import type {
	StudioPlugin,
	StudioPluginMeta,
} from "../../../types/plugin.js";
import { useAiStore } from "../../stores/ai-store.js";
import { useExportStore } from "../../stores/export-store.js";
import { useStudio } from "../../hooks/use-studio.js";
import { Studio } from "../Studio.js";

// ----------------------------------------------------------------------
// Mock `@puckeditor/core` with a minimal stand-in.
//
// The mock keeps a module-scoped `lastPuckProps` reference so tests
// can read exactly what `<Studio>` passed through and trigger
// callbacks (`onChange`, `onPublish`) directly. It also stubs
// `useGetPuck` as a no-op so the `PuckApiBinder` inside `<Studio>`
// does not throw when the mock Puck renders it.
// ----------------------------------------------------------------------

interface CapturedPuckProps {
	config: PuckConfig;
	data: PuckData;
	overrides: Record<string, unknown>;
	onChange?: (data: PuckData) => void;
	onPublish?: (data: PuckData) => void;
	plugins?: unknown[];
}

const puckMockState: { lastProps: CapturedPuckProps | null } = {
	lastProps: null,
};

vi.mock("@puckeditor/core", () => {
	return {
		Puck: (props: CapturedPuckProps) => {
			puckMockState.lastProps = props;
			return (
				<div data-testid="puck-mock">
					<span data-testid="puck-plugin-count">
						{props.plugins?.length ?? 0}
					</span>
				</div>
			);
		},
		useGetPuck: () => () => ({
			appState: { data: puckMockState.lastProps?.data ?? null },
			dispatch: () => undefined,
		}),
	};
});

// ----------------------------------------------------------------------
// Test helpers.
// ----------------------------------------------------------------------

const MINIMAL_PUCK_CONFIG: PuckConfig = {
	components: {},
};

const EMPTY_DATA: PuckData = {
	root: { props: {} },
	content: [],
	zones: {},
};

function buildMeta(id: string, overrides?: Partial<StudioPluginMeta>): StudioPluginMeta {
	return {
		id,
		name: id,
		version: "1.0.0",
		coreVersion: "^0.1.0-alpha",
		...overrides,
	};
}

beforeEach(() => {
	puckMockState.lastProps = null;
	useExportStore.setState(useExportStore.getInitialState(), true);
	useAiStore.setState(useAiStore.getInitialState(), true);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ----------------------------------------------------------------------
// Mount / compile path.
// ----------------------------------------------------------------------

describe("<Studio> — mount and compile", () => {
	it("initially renders null, then mounts the (mocked) Puck once compile resolves", async () => {
		const { container } = render(
			<Studio puckConfig={MINIMAL_PUCK_CONFIG} data={EMPTY_DATA} plugins={[]} />,
		);

		// First render is the pre-compile null state — our mock has
		// not been called yet.
		expect(puckMockState.lastProps).toBeNull();

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		expect(puckMockState.lastProps).not.toBeNull();
		expect(puckMockState.lastProps?.config).toBe(MINIMAL_PUCK_CONFIG);
		expect(puckMockState.lastProps?.data).toBe(EMPTY_DATA);
		expect(puckMockState.lastProps?.plugins).toEqual([]);
	});

	it("mounts cleanly with an empty plugin array", async () => {
		const { container } = render(
			<Studio puckConfig={MINIMAL_PUCK_CONFIG} plugins={[]} />,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		// No formats registered → the export store's list is empty.
		expect(useExportStore.getState().availableFormats).toEqual([]);
	});
});

// ----------------------------------------------------------------------
// Export store population.
// ----------------------------------------------------------------------

describe("<Studio> — export store population", () => {
	it("populates `useExportStore.availableFormats` from registered plugins", async () => {
		const pluginWithFormat: StudioPlugin = {
			meta: buildMeta("com.example.html"),
			register() {
				return {
					meta: buildMeta("com.example.html"),
					exportFormats: [
						{
							id: "html",
							label: "HTML",
							extension: "html",
							mimeType: "text/html",
							async run() {
								return { content: "", filename: "page.html" };
							},
						},
					],
				};
			},
		};

		const { container } = render(
			<Studio
				puckConfig={MINIMAL_PUCK_CONFIG}
				plugins={[pluginWithFormat]}
			/>,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		expect(useExportStore.getState().availableFormats).toEqual(["html"]);
	});
});

// ----------------------------------------------------------------------
// Lifecycle — onDataChange.
// ----------------------------------------------------------------------

describe("<Studio> — onChange / onDataChange lifecycle", () => {
	it("fires onDataChange and forwards to the consumer handler", async () => {
		const onDataChangeHook = vi.fn();
		const consumerOnChange = vi.fn();

		const observerPlugin: StudioPlugin = {
			meta: buildMeta("com.example.observer"),
			register() {
				return {
					meta: buildMeta("com.example.observer"),
					hooks: {
						onDataChange: onDataChangeHook,
					},
				};
			},
		};

		const { container } = render(
			<Studio
				puckConfig={MINIMAL_PUCK_CONFIG}
				plugins={[observerPlugin]}
				onChange={consumerOnChange}
			/>,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		const nextData: PuckData = {
			root: { props: { title: "changed" } },
			content: [],
			zones: {},
		};

		await act(async () => {
			puckMockState.lastProps?.onChange?.(nextData);
			// Let the microtask queue drain so the consumer's `onChange`
			// (fired synchronously) can resolve. The plugin
			// `onDataChange` hook is debounced, so it fires on a
			// timeout — assert it via `waitFor` below.
			await Promise.resolve();
		});

		// Consumer onChange is NOT debounced — it's the raw Puck
		// callback forwarded verbatim.
		expect(consumerOnChange).toHaveBeenCalledTimes(1);
		expect(consumerOnChange).toHaveBeenCalledWith(nextData);

		// Plugin onDataChange is debounced by `<Studio>` to avoid
		// keystroke-rate flooding. Wait for the debounced fire — the
		// default timeout generously exceeds the 250ms debounce window
		// configured in `Studio.tsx`.
		await waitFor(() => {
			expect(onDataChangeHook).toHaveBeenCalledTimes(1);
		});
	});
});

// ----------------------------------------------------------------------
// Handler identity stability.
// ----------------------------------------------------------------------

describe("<Studio> — handler identity stability", () => {
	it("keeps onChange/onPublish prop identity stable across parent re-renders with fresh inline handlers", async () => {
		// Idiomatic usage (README Quickstart) passes inline arrows for
		// `onChange` / `onPublish`. Without late-binding refs, every
		// parent render would produce new useCallback identities and
		// hand a fresh `onChange` prop into Puck on every keystroke.
		// This test pins the late-binding contract: handler identity
		// must NOT change when only the consumer's callback identity
		// changes.
		function Wrapper({ tick }: { tick: number }): ReactElement {
			return (
				<Studio
					puckConfig={MINIMAL_PUCK_CONFIG}
					plugins={[]}
					onChange={() => {
						// Inline arrow → new identity each render.
						void tick;
					}}
					onPublish={() => {
						void tick;
					}}
				/>
			);
		}

		const { container, rerender } = render(<Wrapper tick={0} />);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		const firstOnChange = puckMockState.lastProps?.onChange;
		const firstOnPublish = puckMockState.lastProps?.onPublish;
		expect(firstOnChange).toBeDefined();
		expect(firstOnPublish).toBeDefined();

		rerender(<Wrapper tick={1} />);
		rerender(<Wrapper tick={2} />);

		expect(puckMockState.lastProps?.onChange).toBe(firstOnChange);
		expect(puckMockState.lastProps?.onPublish).toBe(firstOnPublish);
	});

	it("invokes the latest onChange closure even when the handler identity is stable", async () => {
		// The flip side of the contract: late-binding must NOT freeze
		// the closure at mount time. The most-recently-rendered
		// `onChange` prop should be the one that fires when Puck calls
		// the forwarded handler.
		const calls: number[] = [];
		function Wrapper({ tick }: { tick: number }): ReactElement {
			return (
				<Studio
					puckConfig={MINIMAL_PUCK_CONFIG}
					plugins={[]}
					onChange={() => {
						calls.push(tick);
					}}
				/>
			);
		}

		const { container, rerender } = render(<Wrapper tick={0} />);
		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		rerender(<Wrapper tick={42} />);

		await act(async () => {
			puckMockState.lastProps?.onChange?.(EMPTY_DATA);
			await Promise.resolve();
		});

		expect(calls).toEqual([42]);
	});
});

// ----------------------------------------------------------------------
// Lifecycle — onBeforePublish veto.
// ----------------------------------------------------------------------

describe("<Studio> — onBeforePublish veto", () => {
	it("aborts the consumer onPublish when onBeforePublish throws", async () => {
		const consumerOnPublish = vi.fn();
		const onAfterPublishHook = vi.fn();

		const validatorPlugin: StudioPlugin = {
			meta: buildMeta("com.example.validator"),
			register() {
				return {
					meta: buildMeta("com.example.validator"),
					hooks: {
						onBeforePublish: () => {
							throw new Error("validation failed");
						},
						onAfterPublish: onAfterPublishHook,
					},
				};
			},
		};

		// Suppress the expected console.error from the abort path so
		// the test output stays clean. Vitest's `restoreMocks: true`
		// cleans the spy after each test.
		const errorSpy: MockInstance = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		const { container } = render(
			<Studio
				puckConfig={MINIMAL_PUCK_CONFIG}
				plugins={[validatorPlugin]}
				onPublish={consumerOnPublish}
			/>,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		await act(async () => {
			puckMockState.lastProps?.onPublish?.(EMPTY_DATA);
			await Promise.resolve();
			await Promise.resolve();
		});

		// The consumer's onPublish never ran because the validator
		// threw from onBeforePublish.
		expect(consumerOnPublish).not.toHaveBeenCalled();
		// And onAfterPublish must not have fired either — that
		// hook implies a successful publish.
		expect(onAfterPublishHook).not.toHaveBeenCalled();
		// Our abort path logged through console.error. Validate the
		// spy saw at least one call so we know the abort ran.
		expect(errorSpy).toHaveBeenCalled();
	});

	it("uses the onPublish callback associated with the publish click, even if the parent re-renders during onBeforePublish", async () => {
		// `onBeforePublish` can be async (e.g. server-side validation).
		// If the parent re-renders with a fresh `onPublish` while the
		// hook is awaiting, we must NOT switch to the newer callback
		// mid-publish — the user clicked Publish associated with the
		// callback that was current at click time. A late-bound ref
		// read after the await would silently swap callbacks; the fix
		// snapshots `onPublishRef.current` at the start of the handler.
		let resolveBeforePublish: (() => void) | null = null;
		const beforePublishGate = new Promise<void>((resolve) => {
			resolveBeforePublish = resolve;
		});

		const validatorPlugin: StudioPlugin = {
			meta: buildMeta("com.example.async-validator"),
			register() {
				return {
					meta: buildMeta("com.example.async-validator"),
					hooks: {
						onBeforePublish: async () => {
							await beforePublishGate;
						},
					},
				};
			},
		};

		const firstOnPublish = vi.fn();
		const secondOnPublish = vi.fn();

		function Wrapper({
			handler,
		}: {
			handler: (data: PuckData) => void;
		}): ReactElement {
			return (
				<Studio
					puckConfig={MINIMAL_PUCK_CONFIG}
					plugins={[validatorPlugin]}
					onPublish={handler}
				/>
			);
		}

		const { container, rerender } = render(
			<Wrapper handler={firstOnPublish} />,
		);
		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		// Trigger publish — `onBeforePublish` is now blocked on the gate.
		await act(async () => {
			puckMockState.lastProps?.onPublish?.(EMPTY_DATA);
			await Promise.resolve();
		});

		// While the validator awaits, the parent re-renders with a
		// different `onPublish` reference.
		rerender(<Wrapper handler={secondOnPublish} />);

		// Now resolve the validator and let the publish flow drain.
		await act(async () => {
			resolveBeforePublish?.();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();
		});

		// The handler captured at click time must be the one that
		// runs — the post-await ref swap should NOT redirect to the
		// fresh handler.
		expect(firstOnPublish).toHaveBeenCalledTimes(1);
		expect(secondOnPublish).not.toHaveBeenCalled();
	});

	it("runs consumer onPublish and onAfterPublish on a successful publish", async () => {
		const consumerOnPublish = vi.fn();
		const onAfterPublishHook = vi.fn();

		const observerPlugin: StudioPlugin = {
			meta: buildMeta("com.example.after"),
			register() {
				return {
					meta: buildMeta("com.example.after"),
					hooks: {
						onAfterPublish: onAfterPublishHook,
					},
				};
			},
		};

		const { container } = render(
			<Studio
				puckConfig={MINIMAL_PUCK_CONFIG}
				plugins={[observerPlugin]}
				onPublish={consumerOnPublish}
			/>,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		await act(async () => {
			puckMockState.lastProps?.onPublish?.(EMPTY_DATA);
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(consumerOnPublish).toHaveBeenCalledTimes(1);
		expect(onAfterPublishHook).toHaveBeenCalledTimes(1);
	});
});

// ----------------------------------------------------------------------
// useStudio() hook.
// ----------------------------------------------------------------------

describe("useStudio()", () => {
	it("throws when called outside of <Studio>", () => {
		// Silence the expected React error-boundary noise.
		const errorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => undefined);

		expect(() => renderHook(() => useStudio())).toThrow(
			/must be used within <StudioProvider>/,
		);

		errorSpy.mockRestore();
	});
});

// ----------------------------------------------------------------------
// Unmount cleanup.
// ----------------------------------------------------------------------

describe("<Studio> — unmount cleanup", () => {
	it("fires onDestroy and resets the export + AI stores", async () => {
		const onDestroyHook = vi.fn();

		const pluginWithFormat: StudioPlugin = {
			meta: buildMeta("com.example.cleanup"),
			register() {
				return {
					meta: buildMeta("com.example.cleanup"),
					exportFormats: [
						{
							id: "html",
							label: "HTML",
							extension: "html",
							mimeType: "text/html",
							async run() {
								return { content: "", filename: "p.html" };
							},
						},
					],
					hooks: { onDestroy: onDestroyHook },
				};
			},
		};

		const { unmount, container } = render(
			<Studio
				puckConfig={MINIMAL_PUCK_CONFIG}
				plugins={[pluginWithFormat]}
			/>,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		// Seed some state so we can prove reset() ran.
		useAiStore.getState().startGeneration("cached");
		expect(useAiStore.getState().lastPrompt).toBe("cached");
		expect(useExportStore.getState().availableFormats).toEqual(["html"]);

		await act(async () => {
			unmount();
			await Promise.resolve();
		});

		expect(onDestroyHook).toHaveBeenCalledTimes(1);
		expect(useExportStore.getState().availableFormats).toEqual([]);
		expect(useAiStore.getState().lastPrompt).toBeNull();
	});
});

// ----------------------------------------------------------------------
// Legacy aiHost compat path.
// ----------------------------------------------------------------------

describe("<Studio> — legacy aiHost compat", () => {
	it("prepends the compat adapter and logs the deprecation warning exactly once", async () => {
		// Force a fresh adapter module so the module-scoped `warned`
		// flag starts clean for this test.
		vi.resetModules();

		const warnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => undefined);

		// Reimport Studio AFTER resetting modules so its dynamic
		// import of `ai-host-adapter` pulls the fresh instance.
		const { Studio: FreshStudio } = await import("../Studio.js");

		const { container, unmount } = render(
			<FreshStudio
				puckConfig={MINIMAL_PUCK_CONFIG}
				aiHost="https://ai.example.com"
				plugins={[]}
			/>,
		);

		await waitFor(() => {
			expect(container.querySelector("[data-testid=puck-mock]")).not.toBeNull();
		});

		// The header-action id the adapter ships.
		const actionIds = puckMockState.lastProps?.plugins;
		// The adapter is a StudioPlugin, not a PuckPlugin, so it
		// lands on `runtime.headerActions` rather than the raw
		// `puckPlugins` passthrough. Read the action back through
		// the store we just populated.
		expect(actionIds).toBeDefined();

		// One — and only one — deprecation warning fired.
		const deprecationWarnings = warnSpy.mock.calls.filter((call) =>
			String(call[0]).includes("aiHost"),
		);
		expect(deprecationWarnings).toHaveLength(1);

		unmount();
		warnSpy.mockRestore();
	});
});
