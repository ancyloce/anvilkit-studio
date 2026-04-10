/**
 * @file Tests for `<StudioConfigProvider>` — the React context wiring
 * produced by `core-012`.
 *
 * Coverage targets:
 *
 * - Children render normally when the provider is mounted.
 * - The config object reaches descendants via `useStudioConfig()`.
 * - The provider surface is the minimum needed: a `config` prop and
 *   `children`, both required.
 *
 * Hook-level behavior (selector overload, missing-provider throw,
 * memo stability) is covered in `hooks.test.tsx` to keep the two
 * files focused on their respective module boundaries.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createStudioConfig } from "../create-config.js";
import { useStudioConfig } from "../hooks.js";
import { StudioConfigProvider } from "../provider.js";

describe("StudioConfigProvider — rendering", () => {
	it("renders its children unchanged", () => {
		const config = createStudioConfig(undefined, { env: {} });
		render(
			<StudioConfigProvider config={config}>
				<span data-testid="child">hello</span>
			</StudioConfigProvider>,
		);
		expect(screen.getByTestId("child")).toHaveTextContent("hello");
	});

	it("exposes the config to descendants via useStudioConfig()", () => {
		const config = createStudioConfig(
			{ branding: { appName: "My Studio" } },
			{ env: {} },
		);

		function Probe() {
			const received = useStudioConfig();
			return <span data-testid="probe">{received.branding.appName}</span>;
		}

		render(
			<StudioConfigProvider config={config}>
				<Probe />
			</StudioConfigProvider>,
		);
		expect(screen.getByTestId("probe")).toHaveTextContent("My Studio");
	});

	it("passes the exact config reference through — no cloning", () => {
		const config = createStudioConfig(undefined, { env: {} });
		let seen: unknown;

		function Probe() {
			seen = useStudioConfig();
			return null;
		}

		render(
			<StudioConfigProvider config={config}>
				<Probe />
			</StudioConfigProvider>,
		);
		// Reference equality — the provider must not deep-clone the
		// config object, otherwise consumers lose the ability to use
		// `===` as a fast "unchanged config" check.
		expect(seen).toBe(config);
	});

	it("renders deeply nested descendants that consume the hook", () => {
		const config = createStudioConfig(
			{ theme: { defaultMode: "dark" } },
			{ env: {} },
		);

		function Leaf() {
			const mode = useStudioConfig((c) => c.theme.defaultMode);
			return <span data-testid="leaf">{mode}</span>;
		}

		function Branch() {
			return (
				<div>
					<Leaf />
				</div>
			);
		}

		render(
			<StudioConfigProvider config={config}>
				<section>
					<Branch />
				</section>
			</StudioConfigProvider>,
		);
		expect(screen.getByTestId("leaf")).toHaveTextContent("dark");
	});
});
