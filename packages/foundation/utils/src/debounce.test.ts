import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { debounce } from "./debounce.js";

describe("debounce", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("delays invocation until the wait period elapses", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 200);
		debounced();
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(199);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("resets the timer on subsequent calls within the wait window", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 100);
		debounced("first");
		vi.advanceTimersByTime(50);
		debounced("second");
		vi.advanceTimersByTime(50);
		expect(fn).not.toHaveBeenCalled();
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("second");
	});

	it("forwards the latest arguments to the wrapped function", () => {
		const fn = vi.fn<(a: number, b: string) => void>();
		const debounced = debounce(fn, 10);
		debounced(1, "a");
		debounced(2, "b");
		vi.advanceTimersByTime(10);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith(2, "b");
	});

	it(".cancel() drops a pending invocation", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);
		debounced();
		debounced.cancel();
		vi.advanceTimersByTime(100);
		expect(fn).not.toHaveBeenCalled();
	});

	it(".cancel() is a no-op when no call is pending", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);
		expect(() => debounced.cancel()).not.toThrow();
		debounced();
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(() => debounced.cancel()).not.toThrow();
	});

	it("allows a new invocation after .cancel()", () => {
		const fn = vi.fn();
		const debounced = debounce(fn, 50);
		debounced("a");
		debounced.cancel();
		debounced("b");
		vi.advanceTimersByTime(50);
		expect(fn).toHaveBeenCalledTimes(1);
		expect(fn).toHaveBeenCalledWith("b");
	});
});
