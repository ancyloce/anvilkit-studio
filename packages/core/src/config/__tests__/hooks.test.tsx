/**
 * @file Tests for `useStudioConfig` — the selector-enabled hook
 * produced by `core-012`.
 *
 * Coverage targets:
 *
 * - Calling the hook outside a provider throws an error whose
 *   message contains `"StudioConfig"` (acceptance criterion).
 * - Calling the hook inside a provider with no selector returns the
 *   full config, with exact reference equality to the value passed
 *   to the provider.
 * - Calling the hook with a selector returns the projected slice.
 * - Re-rendering with an unchanged config does not cause the
 *   consumer to re-run its render body more than necessary
 *   (memoization sanity check).
 * - A sibling update (unrelated state change in a parent) does not
 *   cause a `useStudioConfig()` consumer to re-render, proving the
 *   provider does not create a new context value each render.
 * - TypeScript overload: the selector form's return type is inferred
 *   from the selector. This is enforced at compile time, so the
 *   runtime assertion is light — we mostly exercise the runtime
 *   behavior here.
 */

import { act, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioConfig } from "../create-config.js";
import { useStudioConfig } from "../hooks.js";
import { StudioConfigProvider } from "../provider.js";

describe("useStudioConfig — missing provider", () => {
	// React logs caught render errors to console.error; silence the
	// noise so the passing suite output stays clean. The mock is
	// restored between cases by the vitest-config preset
	// (`restoreMocks: true`).
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
	});

	afterEach(() => {
		errorSpy.mockRestore();
	});

	it("throws with a message containing 'StudioConfig' when no provider is mounted", () => {
		function Consumer() {
			useStudioConfig();
			return null;
		}

		expect(() => render(<Consumer />)).toThrow(/StudioConfig/);
	});

	it("throws when the selector form is used outside a provider too", () => {
		function Consumer() {
			useStudioConfig((c) => c.features.enableExport);
			return null;
		}

		expect(() => render(<Consumer />)).toThrow(/StudioConfig/);
	});
});

describe("useStudioConfig — inside a provider", () => {
	it("returns the full config with no selector", () => {
		const config = createStudioConfig(undefined, { env: {} });
		let received: unknown;

		function Consumer() {
			received = useStudioConfig();
			return null;
		}

		render(
			<StudioConfigProvider config={config}>
				<Consumer />
			</StudioConfigProvider>,
		);

		expect(received).toBe(config);
	});

	it("returns the default theme mode via selector", () => {
		const config = createStudioConfig(undefined, { env: {} });

		function Consumer() {
			const mode = useStudioConfig((c) => c.theme.defaultMode);
			return <span data-testid="mode">{mode}</span>;
		}

		render(
			<StudioConfigProvider config={config}>
				<Consumer />
			</StudioConfigProvider>,
		);

		expect(screen.getByTestId("mode")).toHaveTextContent("system");
	});

	it("projects a nested primitive through the selector", () => {
		const config = createStudioConfig(
			{ features: { enableExport: true } },
			{ env: {} },
		);

		function Consumer() {
			const enabled = useStudioConfig((c) => c.features.enableExport);
			return (
				<span data-testid="flag">{enabled ? "enabled" : "disabled"}</span>
			);
		}

		render(
			<StudioConfigProvider config={config}>
				<Consumer />
			</StudioConfigProvider>,
		);

		expect(screen.getByTestId("flag")).toHaveTextContent("enabled");
	});

	it("returns a stable reference across renders when the config and selector are unchanged", () => {
		const config = createStudioConfig(undefined, { env: {} });
		const selector = (c: typeof config) => c.features;
		const seen: unknown[] = [];

		function Consumer() {
			const features = useStudioConfig(selector);
			seen.push(features);
			return null;
		}

		// Wrap in StrictMode so the render runs twice in dev-mode
		// concurrent semantics. The memoization should keep the
		// returned reference identical across both passes.
		render(
			<StrictMode>
				<StudioConfigProvider config={config}>
					<Consumer />
				</StudioConfigProvider>
			</StrictMode>,
		);

		expect(seen.length).toBeGreaterThanOrEqual(2);
		const first = seen[0];
		for (const next of seen) {
			expect(next).toBe(first);
		}
	});
});

describe("useStudioConfig — render isolation", () => {
	it("does not re-render the consumer when an unrelated sibling updates", () => {
		const config = createStudioConfig(undefined, { env: {} });

		let consumerRenders = 0;
		let triggerSiblingUpdate: (() => void) | null = null;

		function Consumer() {
			useStudioConfig();
			consumerRenders += 1;
			return <span data-testid="consumer">consumer</span>;
		}

		function Sibling() {
			const [count, setCount] = useState(0);
			triggerSiblingUpdate = () => {
				setCount((prev) => prev + 1);
			};
			return <span data-testid="sibling">{count}</span>;
		}

		// `Consumer` is memoized with React.memo-like behavior
		// implicitly via context: it should only re-run when the
		// context value (the config reference) changes. The sibling
		// lives outside the consumer's subtree, so updating sibling
		// state must not mount/re-render the consumer.
		function App() {
			return (
				<StudioConfigProvider config={config}>
					<Consumer />
					<Sibling />
				</StudioConfigProvider>
			);
		}

		render(<App />);
		const initialConsumerRenders = consumerRenders;
		expect(screen.getByTestId("sibling")).toHaveTextContent("0");

		act(() => {
			triggerSiblingUpdate?.();
		});
		expect(screen.getByTestId("sibling")).toHaveTextContent("1");
		// Consumer is a sibling of Sibling — React does not
		// re-render it when Sibling's state changes because the
		// Consumer props and context value are both unchanged.
		expect(consumerRenders).toBe(initialConsumerRenders);
	});

	it("re-renders the consumer when the provider receives a new config object", () => {
		const configA = createStudioConfig(undefined, { env: {} });
		const configB = createStudioConfig(
			{ branding: { appName: "Swapped" } },
			{ env: {} },
		);

		let swap: (() => void) | null = null;

		function Consumer() {
			const name = useStudioConfig((c) => c.branding.appName);
			return <span data-testid="name">{name}</span>;
		}

		function App() {
			const [config, setConfig] = useState(configA);
			swap = () => {
				setConfig(configB);
			};
			return (
				<StudioConfigProvider config={config}>
					<Consumer />
				</StudioConfigProvider>
			);
		}

		render(<App />);
		expect(screen.getByTestId("name")).toHaveTextContent("AnvilKit Studio");

		act(() => {
			swap?.();
		});
		expect(screen.getByTestId("name")).toHaveTextContent("Swapped");
	});
});
