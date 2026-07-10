/**
 * @file SSR smoke test for `<Studio>` (report 0003, P0-2).
 *
 * `<Studio>` is a `"use client"` component, but in the Next App Router a
 * client component is still rendered once on the server. The hazard the
 * report flagged: chrome assets load via `await import()` *inside an
 * effect*, and effects do not run during SSR — so if any render-time path
 * touched a browser-only API, server rendering would crash at request
 * time rather than degrade gracefully.
 *
 * This test renders `<Studio>` through `react-dom/server` to prove the
 * server pass produces markup without throwing. Because effects never
 * fire, the controller never resolves a compiled runtime, so `<Studio>`
 * returns its standalone loading skeleton — exactly the pre-hydration
 * frame a host would serve.
 *
 * It runs in the **node** environment (no `window`/`document`) on
 * purpose: that is the faithful server simulation, so any accidental
 * browser-API access during render fails loudly here instead of in a
 * consumer's production SSR.
 *
 * @vitest-environment node
 */

import type { Config as PuckConfig } from "@puckeditor/core";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Studio } from "@/components/Studio";

const MINIMAL_PUCK_CONFIG: PuckConfig = {
	components: {},
};

describe("<Studio> server rendering", () => {
	it("degrades to the loading skeleton during SSR without throwing", () => {
		let markup = "";
		expect(() => {
			markup = renderToStaticMarkup(
				<Studio puckConfig={MINIMAL_PUCK_CONFIG} plugins={[]} />,
			);
		}).not.toThrow();
		// Effects don't run on the server, so the runtime never compiles and
		// the shell returns its standalone loading skeleton. Assert that
		// specifically (the skeleton's stable testid + aria-busy) rather than
		// just "non-empty markup", so this locks in the documented
		// degrade-to-skeleton behavior instead of only "didn't crash / not
		// null".
		expect(markup).toContain('data-testid="studio-loading"');
		expect(markup).toContain('aria-busy="true"');
	});

	it("renders via renderToString (hydration path) without throwing", () => {
		// `renderToString` is the lower-level renderer Next's App Router server
		// pass builds on. This is a unit-level smoke test of that renderer — NOT
		// a full App Router run (it does not exercise the bundler's "use client"
		// boundary, prop serialization, or streaming). It covers the
		// hydration-marker codepath alongside the static render above.
		expect(() =>
			renderToString(<Studio puckConfig={MINIMAL_PUCK_CONFIG} plugins={[]} />),
		).not.toThrow();
	});
});
