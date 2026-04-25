/**
 * `--import` entry used by `pnpm bench`. Registers the CSS shim
 * loader before `bench/index.ts` runs, so real component packages
 * (which each import `./styles.css` at their module top) can load
 * under Node's native ESM runtime.
 *
 * Also initializes happy-dom-less jsdom so
 * `@testing-library/react`'s `render()` has a DOM to mount into.
 * jsdom is set up once per process; tests that need a clean DOM
 * between iterations call `cleanup()` inside the bench task body.
 */

import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./css-shim.loader.mjs", pathToFileURL(`${import.meta.dirname}/`));

// jsdom's global install needs `globalThis.window` before React /
// RTL bootstraps. Done lazily so headless Playwright benches (which
// do not need a jsdom) skip the cost.
const WANTS_DOM =
	process.env.BENCH_FILTER === undefined ||
	/component-render|editor-load|all/i.test(process.env.BENCH_FILTER ?? "");

if (WANTS_DOM && !globalThis.window) {
	const { JSDOM } = await import("jsdom");
	const dom = new JSDOM("<!doctype html><html><body></body></html>", {
		url: "http://localhost/",
		pretendToBeVisual: true,
	});
	const w = dom.window;
	// Pin a minimal subset of jsdom globals onto globalThis so React
	// DOM + RTL find them. Matches the set @testing-library/react's
	// jest-dom bootstrap pins when it is imported. Node 24+ exposes
	// some of these as read-only getters, so we fall back to
	// `Object.defineProperty` where plain assignment is rejected.
	const assign = (key, value) => {
		try {
			globalThis[key] = value;
		} catch {
			Object.defineProperty(globalThis, key, {
				value,
				writable: true,
				configurable: true,
			});
		}
	};
	assign("window", w);
	assign("document", w.document);
	assign("navigator", w.navigator);
	assign("HTMLElement", w.HTMLElement);
	assign("Element", w.Element);
	assign("Node", w.Node);
	assign("getComputedStyle", w.getComputedStyle.bind(w));
	assign("requestAnimationFrame", (cb) =>
		setTimeout(() => cb(Date.now()), 16),
	);
	assign("cancelAnimationFrame", (id) => clearTimeout(id));

	// jsdom ships without a canvas implementation; any component that
	// touches `<canvas>` (motion / color helpers do) hits a "Not
	// implemented: HTMLCanvasElement's getContext()" error path on
	// every render. That floods bench logs and inflates recorded means
	// with error-reporting overhead. Stub a minimal 2D context so the
	// caller gets a no-op object instead of the not-implemented branch.
	// We deliberately do NOT take a runtime dep on `canvas` — bench
	// mode only needs renders to not crash, not actual pixels.
	const noop = () => {
		/* canvas stub — no-op */
	};
	const stub2dContext = {
		canvas: null,
		fillRect: noop,
		clearRect: noop,
		getImageData: (_x, _y, w, h) => ({
			data: new Uint8ClampedArray(w * h * 4),
			width: w,
			height: h,
		}),
		putImageData: noop,
		createImageData: (w, h) => ({
			data: new Uint8ClampedArray(w * h * 4),
			width: w,
			height: h,
		}),
		setTransform: noop,
		drawImage: noop,
		save: noop,
		restore: noop,
		beginPath: noop,
		moveTo: noop,
		lineTo: noop,
		closePath: noop,
		stroke: noop,
		fill: noop,
		translate: noop,
		scale: noop,
		rotate: noop,
		arc: noop,
		measureText: () => ({ width: 0 }),
		transform: noop,
		rect: noop,
		clip: noop,
	};
	w.HTMLCanvasElement.prototype.getContext = function getContext(type) {
		return type === "2d" ? stub2dContext : null;
	};
	w.HTMLCanvasElement.prototype.toDataURL = () => "";
	w.HTMLCanvasElement.prototype.toBlob = (cb) => {
		cb(null);
	};

	// React 19 checks for `IS_REACT_ACT_ENVIRONMENT` to emit/suppress
	// warnings. Silence in bench mode — we render, we don't assert.
	globalThis.IS_REACT_ACT_ENVIRONMENT = false;
}
