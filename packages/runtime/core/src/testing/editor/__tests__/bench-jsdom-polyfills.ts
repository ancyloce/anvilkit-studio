/**
 * @file Side-effect polyfills for jsdom bench files. The bench project
 * loads no setup files (`vitest.bench.config.ts` keeps the node-env
 * perf harness setup-free), so a jsdom bench that mounts `<Puck>` must
 * import this module FIRST — `@dnd-kit/dom` reads `ResizeObserver` at
 * module-evaluation time. Mirrors the minimum Web-API stubs from
 * `vitest.setup.ts` without its RTL configuration.
 */

class ResizeObserverStub {
	observe(): void {
		// jsdom stub — never notifies.
	}
	unobserve(): void {
		// jsdom stub.
	}
	disconnect(): void {
		// jsdom stub.
	}
}

if (
	typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver ===
	"undefined"
) {
	(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver =
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
