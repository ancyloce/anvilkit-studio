/**
 * @file Unit tests for `<StudioLoadingScreen>` — the default skeleton
 * `<Studio>` paints while the plugin runtime compiles.
 *
 * The component renders *before* the Studio provider stack mounts, so it
 * must stand alone with no i18n / theme / Puck context. These tests
 * therefore mount it bare and assert the chrome placeholders + the
 * spinner/label status region.
 */

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { StudioLoadingScreen } from "@/layout/StudioLoadingScreen";

// The react-library vitest preset runs with `globals: false`, so RTL's
// auto-cleanup is OFF — clean up explicitly between renders or the
// multiple mounts below leak into each other.
afterEach(cleanup);

describe("<StudioLoadingScreen>", () => {
	it("renders the loading shell with skeleton placeholders and a spinner", () => {
		const { container } = render(<StudioLoadingScreen />);

		const shell = container.querySelector("[data-testid=studio-loading]");
		expect(shell).not.toBeNull();
		// Signals an in-progress region to assistive tech.
		expect(shell?.getAttribute("aria-busy")).toBe("true");

		// Skeleton primitive marks each placeholder with `data-slot=skeleton`;
		// the rail/panel/header all contribute several.
		expect(
			container.querySelectorAll("[data-slot=skeleton]").length,
		).toBeGreaterThan(0);

		// The Spinner primitive renders with role="status".
		expect(container.querySelector("[role=status]")).not.toBeNull();
	});

	it("shows the default English status label", () => {
		const { container } = render(<StudioLoadingScreen />);
		expect(container.textContent).toContain("Loading editor…");
	});

	it("renders a host-supplied label verbatim (pre-provider, no i18n)", () => {
		const { container } = render(
			<StudioLoadingScreen label="Chargement de l’éditeur…" />,
		);
		expect(container.textContent).toContain("Chargement de l’éditeur…");
		expect(container.textContent).not.toContain("Loading editor…");
	});
});
