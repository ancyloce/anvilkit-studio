/**
 * @file Tests for `<StudioErrorBoundary>` (report 0003, P1-3).
 *
 * Covers the four contract points: pass-through when nothing throws,
 * catch + `onError` reporting (with React's component-stack info), reset
 * recovery once the child stops throwing, and latching even on a falsy
 * thrown value (the reason for the separate `hasError` flag).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioErrorBoundary } from "@/components/StudioErrorBoundary";

// react-library preset has RTL auto-cleanup OFF; these tests render
// repeatedly, so unmount between cases to avoid duplicate-DOM matches.
afterEach(cleanup);

function Boom({ message }: { message: string }): never {
	throw new Error(message);
}

describe("<StudioErrorBoundary>", () => {
	// React logs every caught render error to console.error; silence the
	// expected noise so the suite output stays readable.
	let errorSpy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {
			// Swallow React's expected boundary error logging.
		});
	});
	afterEach(() => {
		errorSpy.mockRestore();
	});

	it("renders children when nothing throws", () => {
		render(
			<StudioErrorBoundary fallback={() => <div>fallback</div>}>
				<div data-testid="ok">all good</div>
			</StudioErrorBoundary>,
		);
		expect(screen.getByTestId("ok")).toBeInTheDocument();
		expect(screen.queryByText("fallback")).not.toBeInTheDocument();
	});

	it("renders the fallback and reports the error + component stack", () => {
		const onError = vi.fn();
		render(
			<StudioErrorBoundary
				onError={onError}
				fallback={(error) => (
					<div data-testid="fallback">{(error as Error).message}</div>
				)}
			>
				<Boom message="plugin exploded" />
			</StudioErrorBoundary>,
		);
		expect(screen.getByTestId("fallback")).toHaveTextContent("plugin exploded");
		expect(onError).toHaveBeenCalledTimes(1);
		const call = onError.mock.calls[0];
		expect(call).toBeDefined();
		const err = call?.[0];
		const info = call?.[1];
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe("plugin exploded");
		expect(info).toHaveProperty("componentStack");
	});

	it("recovers via reset once the child stops throwing", () => {
		let shouldThrow = true;
		function Flaky(): ReactElement {
			if (shouldThrow) {
				throw new Error("transient");
			}
			return <div data-testid="recovered">recovered</div>;
		}
		render(
			<StudioErrorBoundary
				fallback={(_error, reset) => (
					<button
						type="button"
						data-testid="retry"
						onClick={() => {
							shouldThrow = false;
							reset();
						}}
					>
						retry
					</button>
				)}
			>
				<Flaky />
			</StudioErrorBoundary>,
		);
		expect(screen.getByTestId("retry")).toBeInTheDocument();
		fireEvent.click(screen.getByTestId("retry"));
		expect(screen.getByTestId("recovered")).toBeInTheDocument();
	});

	it("latches the fallback even when the thrown value is falsy", () => {
		function ThrowFalsy(): never {
			// `throw null` is legal; the boundary must still latch via its
			// `hasError` flag rather than an `error != null` check. Thrown via a
			// variable so the value is genuinely falsy at runtime.
			const thrown: unknown = null;
			throw thrown;
		}
		render(
			<StudioErrorBoundary
				fallback={(error) => <div data-testid="caught">{String(error)}</div>}
			>
				<ThrowFalsy />
			</StudioErrorBoundary>,
		);
		expect(screen.getByTestId("caught")).toHaveTextContent("null");
	});

	it("still renders the fallback when onError itself throws", () => {
		// componentDidCatch swallows a throwing handler so logging/notification
		// can never remount-loop or break recovery.
		const onError = vi.fn(() => {
			throw new Error("logger blew up");
		});
		expect(() =>
			render(
				<StudioErrorBoundary
					onError={onError}
					fallback={() => <div data-testid="fallback">fallback</div>}
				>
					<Boom message="boom" />
				</StudioErrorBoundary>,
			),
		).not.toThrow();
		expect(screen.getByTestId("fallback")).toBeInTheDocument();
		expect(onError).toHaveBeenCalledTimes(1);
	});
});
