/**
 * @file Unit tests for `<StudioErrorScreen>` — the default recoverable
 * panel `<Studio>` paints when the plugin runtime fails to compile.
 *
 * Like `<StudioLoadingScreen>`, it renders *before* the Studio provider
 * stack mounts, so it must stand alone with no i18n / theme / Puck
 * context. These tests mount it bare.
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioErrorScreen } from "@/layout/StudioErrorScreen";

// The react-library vitest preset runs with `globals: false`, so RTL's
// auto-cleanup is OFF — clean up explicitly between the multiple renders.
afterEach(cleanup);

describe("<StudioErrorScreen>", () => {
	it("renders an alert region with the error message", () => {
		const { container } = render(
			<StudioErrorScreen error={new Error("plugin X failed to register")} />,
		);

		const shell = container.querySelector("[data-testid=studio-error]");
		expect(shell).not.toBeNull();
		expect(shell?.getAttribute("role")).toBe("alert");
		expect(container.textContent).toContain("plugin X failed to register");
	});

	it("shows a Retry button only when onRetry is provided, and calls it", () => {
		const onRetry = vi.fn();
		const { container } = render(
			<StudioErrorScreen error={new Error("boom")} onRetry={onRetry} />,
		);
		const button = container.querySelector("button");
		expect(button).not.toBeNull();

		fireEvent.click(button as HTMLButtonElement);
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("hides the Retry button when onRetry is omitted", () => {
		const { container } = render(
			<StudioErrorScreen error={new Error("boom")} />,
		);
		expect(container.querySelector("button")).toBeNull();
	});

	it("never throws while stringifying a pathological thrown value", () => {
		// A null-prototype object with a throwing `toString` — `String()` on
		// it throws, which must not break rendering the error screen.
		const hostile = Object.create(null) as Record<string, unknown>;
		Object.defineProperty(hostile, "toString", {
			value: () => {
				throw new Error("nope");
			},
		});

		const { container } = render(<StudioErrorScreen error={hostile} />);
		expect(
			container.querySelector("[data-testid=studio-error]"),
		).not.toBeNull();
		expect(container.textContent).toContain("Unknown error");
	});
});
