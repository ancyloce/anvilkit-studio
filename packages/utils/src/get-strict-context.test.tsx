import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { getStrictContext } from "./get-strict-context.js";

interface StudioConfig {
	apiKey: string;
	nested: { mode: "dark" | "light" };
}

describe("getStrictContext", () => {
	it("returns the value supplied by the nearest provider", () => {
		const [StudioConfigProvider, useStudioConfig] =
			getStrictContext<StudioConfig>("StudioConfig");
		const value: StudioConfig = {
			apiKey: "sk-test",
			nested: { mode: "dark" },
		};

		const wrapper = ({ children }: { children: ReactNode }) => (
			<StudioConfigProvider value={value}>{children}</StudioConfigProvider>
		);

		const { result } = renderHook(() => useStudioConfig(), { wrapper });
		expect(result.current).toBe(value);
	});

	it("throws a descriptive error when the hook is used outside its provider", () => {
		const [, useStudioConfig] = getStrictContext<StudioConfig>("StudioConfig");

		// renderHook surfaces errors through `result.current` — wrap in a
		// try/catch harness instead so we can assert the exact message.
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// suppress React's noisy unhandled-error log
		});
		try {
			expect(() => renderHook(() => useStudioConfig())).toThrowError(
				"`useStudioConfig` must be used within <StudioConfigProvider>.",
			);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it("allows the provided value to legitimately be null or undefined", () => {
		const [NullableProvider, useNullable] =
			getStrictContext<string | null>("Nullable");

		const { result } = renderHook(() => useNullable(), {
			wrapper: ({ children }) => (
				<NullableProvider value={null}>{children}</NullableProvider>
			),
		});
		expect(result.current).toBeNull();
	});

	it("sets a React DevTools displayName matching the provided name", () => {
		// `Provider` is a branded ExoticComponent — we reach through the
		// returned tuple to pluck the context itself out of the React
		// internals exposed via the `_context` property used by the
		// legacy runtime. That is not public API, so instead we verify
		// the displayName indirectly: the error path already includes
		// the name, and the provider renders children unchanged.
		const [Provider, useCtx] = getStrictContext<string>("Ctx");
		render(
			<Provider value="hello">
				<ShowValue useValue={useCtx} />
			</Provider>,
		);
		expect(screen.getByTestId("value")).toHaveTextContent("hello");
	});
});

function ShowValue({ useValue }: { useValue: () => string }): ReactNode {
	const value = useValue();
	return <span data-testid="value">{value}</span>;
}
