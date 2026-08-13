/**
 * @file Regression tests for review 0036 M-7 — rendering must be able
 * to be side-effect-free.
 *
 * `AnvilKitRender` compiled the appearance in its render body and then
 * called `onCompiled` (or `console.warn`) from there too. That violates
 * React's purity rule: under StrictMode the callback fires twice per
 * commit, and under concurrent rendering it fires for renders that are
 * thrown away. The compiler cache was mutated during render for the
 * same reason.
 *
 * The component is deliberately hook-free so it stays RSC-safe, so
 * there is no effect to defer any of that into. The resolution is to
 * let the caller compile OUTSIDE React and pass the result: then the
 * render computes nothing, caches nothing and reports to nobody.
 */

import type { Config, Data } from "@puckeditor/core";
import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppearanceCompilerCache } from "../../../style-compiler/cache.js";
import { compileDocumentAppearance } from "../../../style-compiler/compile.js";
import { AnvilKitRender } from "../AnvilKitRender.js";

const config: Config = {
	components: {
		Box: {
			fields: {},
			metadata: {
				anvilkit: {
					editor: {
						version: "2",
						styleTargets: {
							root: { label: "Box", properties: ["display", "opacity"] },
						},
					},
				},
			},
			render: () => <div data-testid="box-render" />,
		},
	},
} as unknown as Config;

const data = {
	content: [
		{
			type: "Box",
			props: {
				id: "box-1",
				appearance: {
					version: "1",
					targets: {
						root: { style: { base: { visual: { opacity: 0.5 } } } },
					},
				},
			},
		},
	],
	root: { props: {} },
	zones: {},
} as unknown as Data;

afterEach(cleanup);

describe("AnvilKitRender — a pre-compiled render is pure (0036 M-7)", () => {
	it("does not compile, cache or report when `compiled` is supplied", () => {
		// Compile ONCE, outside React, exactly as a server route would.
		const cache = createAppearanceCompilerCache();
		const compiled = compileDocumentAppearance({ data, config, cache });
		const sizeAfterCompile = cache.size;
		expect(sizeAfterCompile).toBeGreaterThan(0);

		const onCompiled = vi.fn();
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

		try {
			const view = render(
				<React.StrictMode>
					<AnvilKitRender
						config={config}
						data={data}
						compiled={compiled}
						cache={cache}
						onCompiled={onCompiled}
					/>
				</React.StrictMode>,
			);

			// It rendered...
			expect(
				view.container.querySelector("[data-testid=box-render]"),
			).not.toBeNull();
			// ...and the compiled CSS is the caller's, verbatim.
			const style = view.container.querySelector(
				"style[data-anvilkit-appearance]",
			);
			expect(style?.innerHTML).toBe(compiled.css);
			// Nothing was reported from render — the whole point.
			expect(onCompiled).not.toHaveBeenCalled();
			expect(warn).not.toHaveBeenCalled();
			// And nothing was written to the cache during render.
			expect(cache.size).toBe(sizeAfterCompile);
		} finally {
			warn.mockRestore();
		}
	});

	it("still compiles internally when `compiled` is omitted", () => {
		const onCompiled = vi.fn();
		const view = render(
			<AnvilKitRender config={config} data={data} onCompiled={onCompiled} />,
		);
		expect(
			view.container.querySelector("[data-testid=box-render]"),
		).not.toBeNull();
		// The legacy seam still works for callers that have not migrated.
		expect(onCompiled).toHaveBeenCalled();
	});

	it("produces identical markup either way", () => {
		const compiled = compileDocumentAppearance({ data, config });

		const internal = render(<AnvilKitRender config={config} data={data} />);
		const internalHtml = internal.container.innerHTML;
		cleanup();

		const external = render(
			<AnvilKitRender config={config} data={data} compiled={compiled} />,
		);
		// One pipeline, one output — passing the compilation in must not be
		// a second rendering path (§1 condition 3).
		expect(external.container.innerHTML).toBe(internalHtml);
	});
});
