/**
 * @file Vitest setup — runs before every test module loads.
 *
 * jsdom omits two Web APIs the chrome (and Puck's drag-kit) rely
 * on. We polyfill the minimum shape they need so test mounts don't
 * crash on import or during effect commit.
 */

import { configure } from "@testing-library/react";

// `<Studio>` does multiple dynamic `import()` calls during mount
// (the full chrome graph — `@/layout/StudioLayout` + `@/overrides/preset`
// pull in the entire sidebar/primitives tree — plus the Zod-bearing
// config builder and the optional AI compat adapter). Under Vitest's
// module runner each takes longer to resolve than RTL's 1s `waitFor`
// default, so tests that assert post-mount state race the loader.
//
// A *warm* mount settles in ~1.8s, but the binding case is a **cold
// transform under machine-wide contention**: `pnpm test` runs every
// workspace package's Vitest concurrently via Turbo, so on a cold
// cache N worker processes transform that heavy graph at once and
// oversubscribe the CPUs. The first `<Studio>` mount in each file then
// blew the previous 5s ceiling (the Studio/ImageModule mount tests are
// the only ones that pay this cost). 15s gives cold-start mounts ample
// headroom while staying well under the 30s `testTimeout` that still
// catches a genuine hang.
configure({ asyncUtilTimeout: 15000 });

class ResizeObserverStub {
	observe(): void {}
	unobserve(): void {}
	disconnect(): void {}
}

if (
	typeof (globalThis as { ResizeObserver?: unknown }).ResizeObserver ===
	"undefined"
) {
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

// jsdom does not implement `Element.getAnimations()` — Base UI's
// `ScrollArea` calls it from a deferred timeout on mount, which would
// otherwise raise an unhandled rejection mid-test. Returning an empty
// array matches the spec for an element with no animations.
if (
	typeof Element !== "undefined" &&
	typeof (Element.prototype as { getAnimations?: unknown }).getAnimations !==
		"function"
) {
	Object.defineProperty(Element.prototype, "getAnimations", {
		writable: true,
		configurable: true,
		value: () => [],
	});
}
