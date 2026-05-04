/**
 * @file Vitest setup — runs before every test module loads.
 *
 * jsdom omits two Web APIs the chrome (and Puck's drag-kit) rely
 * on. We polyfill the minimum shape they need so test mounts don't
 * crash on import or during effect commit.
 */

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

if (typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
	(globalThis as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
		ResizeObserverStub;
}

if (
	typeof window !== "undefined" &&
	typeof (window as { matchMedia?: unknown }).matchMedia !== "function"
) {
	Object.defineProperty(window, "matchMedia", {
		writable: true,
		configurable: true,
		value: (query: string) => ({
			matches: false,
			media: query,
			addEventListener: () => undefined,
			removeEventListener: () => undefined,
			addListener: () => undefined,
			removeListener: () => undefined,
			onchange: null,
			dispatchEvent: () => false,
		}),
	});
}
