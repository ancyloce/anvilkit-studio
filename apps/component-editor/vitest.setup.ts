/**
 * jsdom polyfills for the Puck render path. Same stubs as
 * `packages/runtime/core/vitest.setup.ts` — jsdom implements neither
 * `ResizeObserver` nor `matchMedia`, and Puck's `<Render>` chain touches
 * both. Only installed when absent, so a real implementation always wins.
 */

import { configure } from "@testing-library/react";

// Mirrors `packages/runtime/core/vitest.setup.ts`: mounting <Studio> runs
// store rehydration and async plugin compilation, which comfortably
// exceeds the 1s default before the first assertion can pass.
configure({ asyncUtilTimeout: 15000 });

const noop = (): void => undefined;

class ResizeObserverStub {
	observe = noop;
	unobserve = noop;
	disconnect = noop;
}

if (
	typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver ===
	"undefined"
) {
	Object.defineProperty(globalThis, "ResizeObserver", {
		writable: true,
		configurable: true,
		value: ResizeObserverStub,
	});
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
			onchange: null,
			addEventListener: noop,
			removeEventListener: noop,
			dispatchEvent: () => false,
		}),
	});
}
