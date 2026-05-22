/**
 * @file Tests for the plugin contract additions of task_011:
 *
 * 1. **`composePluginProviders`** — sorted providers fold into a single
 *    wrapped subtree, outermost-first.
 * 2. **`splitOverlaysByPlacement`** — partition by placement, preserve
 *    input order within each bucket.
 * 3. **End-to-end through `<Studio>`** — a plugin contributing a
 *    provider and overlays renders correctly in the AnvilKit chrome
 *    branch.
 *
 * The end-to-end tests use a Puck mock that renders a small marker
 * instead of the real `puck` override slot, so we can assert provider
 * wrapping and overlay placement without mounting the full
 * `<StudioLayout>` (which would pull in sidebar modules that need
 * additional providers we don't care about here).
 */

import { cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	composePluginProviders,
	Studio,
	splitOverlaysByPlacement,
} from "@/components/Studio";
import type {
	StudioPlugin,
	StudioPluginMeta,
	StudioPluginOverlay,
	StudioPluginProvider,
} from "@/types/plugin";

// ---------------------------------------------------------------------------
// Puck mock — minimal stand-in for `<Puck>`.
//
// `<Studio>`'s AnvilKit branch renders `<Puck>` inside its provider
// stack. We render a static marker so the provider-wrapping and
// overlay-placement assertions have a stable anchor, and deliberately
// do NOT invoke `props.overrides?.puck` (which would mount the full
// chrome via `<StudioLayout>` and pull in sidebar modules that need
// additional providers).
// ---------------------------------------------------------------------------

vi.mock("@puckeditor/core", () => ({
	Puck: () => <div data-testid="puck-mock" />,
	useGetPuck: () => () => ({
		appState: { data: null },
		dispatch: () => undefined,
	}),
	createUsePuck: () => () => undefined,
}));

afterEach(cleanup);

// ---------------------------------------------------------------------------
// Helper-level tests (pure functions).
// ---------------------------------------------------------------------------

describe("composePluginProviders", () => {
	function makeWrap(id: string) {
		return ({ children }: { children: ReactNode }) => (
			<div data-testid={`wrap-${id}`}>{children}</div>
		);
	}

	it("returns children verbatim when no providers are contributed", () => {
		const result = composePluginProviders([], <span data-testid="leaf" />);
		const { container } = render(<>{result}</>);
		expect(container.querySelector("[data-testid=leaf]")).not.toBeNull();
	});

	it("composes providers outermost-first per array order", () => {
		const providers: StudioPluginProvider[] = [
			{ id: "outer", component: makeWrap("outer") },
			{ id: "mid", component: makeWrap("mid") },
			{ id: "inner", component: makeWrap("inner") },
		];
		const tree = composePluginProviders(providers, <span data-testid="leaf" />);
		const { container } = render(<>{tree}</>);
		const outer = container.querySelector("[data-testid=wrap-outer]");
		const mid = container.querySelector("[data-testid=wrap-mid]");
		const inner = container.querySelector("[data-testid=wrap-inner]");
		const leaf = container.querySelector("[data-testid=leaf]");
		expect(outer).not.toBeNull();
		expect(outer?.contains(mid)).toBe(true);
		expect(mid?.contains(inner)).toBe(true);
		expect(inner?.contains(leaf)).toBe(true);
	});
});

describe("splitOverlaysByPlacement", () => {
	const A = (() => null) as unknown as StudioPluginOverlay["component"];
	const B = (() => null) as unknown as StudioPluginOverlay["component"];
	const C = (() => null) as unknown as StudioPluginOverlay["component"];

	it("buckets each overlay into its declared placement", () => {
		const result = splitOverlaysByPlacement([
			{ id: "banner", placement: "viewport", component: A },
			{ id: "cursor", placement: "canvas", component: B },
			{ id: "toast", placement: "notifications", component: C },
		]);
		expect(result.viewport.map((o) => o.id)).toEqual(["banner"]);
		expect(result.canvas.map((o) => o.id)).toEqual(["cursor"]);
		expect(result.notifications.map((o) => o.id)).toEqual(["toast"]);
	});

	it("preserves the input order within each bucket", () => {
		const result = splitOverlaysByPlacement([
			{ id: "c1", placement: "canvas", component: A },
			{ id: "c2", placement: "canvas", component: B },
			{ id: "c3", placement: "canvas", component: C },
		]);
		expect(result.canvas.map((o) => o.id)).toEqual(["c1", "c2", "c3"]);
		expect(result.viewport).toEqual([]);
		expect(result.notifications).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// End-to-end through `<Studio>`.
//
// A plugin contributes a provider and several overlays. We assert: the
// provider wraps the puck mock; and viewport/canvas/notification
// overlays land in the right DOM positions around the mock.
// ---------------------------------------------------------------------------

function makeMeta(id: string): StudioPluginMeta {
	return {
		id,
		name: id,
		version: "1.0.0",
		coreVersion: "^0.1.0",
	};
}

function makePluginContributing(opts: {
	provider?: StudioPluginProvider;
	overlays?: readonly StudioPluginOverlay[];
}): StudioPlugin {
	const meta = makeMeta("com.test.plugin");
	return {
		meta,
		register() {
			return {
				meta,
				...(opts.provider ? { providers: [opts.provider] } : {}),
				...(opts.overlays ? { overlays: opts.overlays } : {}),
			};
		},
	};
}

describe("<Studio> — plugin providers and overlays end-to-end", () => {
	it("wraps the puck element with a plugin-contributed provider", async () => {
		const plugin = makePluginContributing({
			provider: {
				id: "wrap",
				component: ({ children }) => (
					<div data-testid="plugin-wrap">{children}</div>
				),
			},
		});
		const { container, findByTestId } = render(
			<Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
		);
		const wrap = await findByTestId("plugin-wrap");
		const puck = container.querySelector("[data-testid=puck-mock]");
		expect(puck).not.toBeNull();
		expect(wrap.contains(puck)).toBe(true);
	});

	it("renders canvas and notification overlays after the puck mock in declared order", async () => {
		const plugin = makePluginContributing({
			overlays: [
				{
					id: "presence",
					placement: "canvas",
					component: () => <span data-testid="overlay-canvas" />,
				},
				{
					id: "toast",
					placement: "notifications",
					component: () => <span data-testid="overlay-toast" />,
				},
			],
		});
		const { findByTestId, container } = render(
			<Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
		);
		await findByTestId("puck-mock");

		const html = container.innerHTML;
		const puckIdx = html.indexOf('data-testid="puck-mock"');
		const canvasIdx = html.indexOf('data-testid="overlay-canvas"');
		const toastIdx = html.indexOf('data-testid="overlay-toast"');
		expect(puckIdx).toBeGreaterThanOrEqual(0);
		expect(canvasIdx).toBeGreaterThan(puckIdx);
		expect(toastIdx).toBeGreaterThan(canvasIdx);
	});

	it("renders viewport overlays before the puck mock", async () => {
		const plugin = makePluginContributing({
			overlays: [
				{
					id: "banner",
					placement: "viewport",
					component: () => <span data-testid="overlay-banner" />,
				},
			],
		});
		const { findByTestId, container } = render(
			<Studio puckConfig={{ components: {} }} plugins={[plugin]} />,
		);
		await findByTestId("puck-mock");

		const html = container.innerHTML;
		const bannerIdx = html.indexOf('data-testid="overlay-banner"');
		const puckIdx = html.indexOf('data-testid="puck-mock"');
		expect(bannerIdx).toBeGreaterThanOrEqual(0);
		expect(bannerIdx).toBeLessThan(puckIdx);
	});
});
