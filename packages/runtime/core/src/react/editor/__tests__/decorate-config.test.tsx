/**
 * `decoratePuckConfig` + mount-gate suite (PLAN-0020 CORE-P0-011/
 * -012): legacy configs untouched, identity stability (Puck
 * store-reset guard), invariant-11 fail-fast, root/wrapper
 * decoration inertness without a provider, flag-gated mount.
 */

import type { Config as PuckConfig } from "@puckeditor/core";
import { cleanup, render, screen } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthoringStyleContext } from "../authoring-style-context.js";
import { createStudioEditorBridge } from "../bridge.js";
import { decoratePuckConfig } from "../decorate-config.js";
import { StudioEditorMount } from "../StudioEditorMount.js";

afterEach(cleanup);

function makeConfig(): PuckConfig {
	return {
		components: {
			Legacy: {
				render: () => <div data-testid="legacy">legacy</div>,
			},
			Rooted: {
				metadata: {
					editor: {
						version: "1",
						styleTarget: "root",
						capabilities: { visualStyle: true },
					},
				},
				render: (props: Record<string, unknown>) => (
					<div
						data-testid="rooted"
						className={props.editorClassName as string | undefined}
						style={props.editorStyle as never}
						{...((props.editorDataAttributes as object | undefined) ?? {})}
					>
						rooted
					</div>
				),
			},
			Wrapped: {
				metadata: {
					editor: {
						version: "1",
						styleTarget: "wrapper",
						capabilities: { layoutItem: true },
					},
				},
				render: () => <div data-testid="wrapped">wrapped</div>,
			},
			OptedOut: {
				metadata: {
					editor: { version: "1", styleTarget: "none", capabilities: {} },
				},
				render: () => <div data-testid="opted-out">none</div>,
			},
		},
	} as unknown as PuckConfig;
}

describe("decoratePuckConfig", () => {
	it("returns the input by reference when authoring is disabled", () => {
		const config = makeConfig();
		expect(decoratePuckConfig(config, { enableAuthoring: false })).toBe(config);
	});

	it("leaves legacy and opted-out components untouched by reference", () => {
		const config = makeConfig();
		const decorated = decoratePuckConfig(config, { enableAuthoring: true });
		expect(decorated).not.toBe(config);
		const components = (
			decorated as unknown as { components: Record<string, unknown> }
		).components;
		const inputComponents = (
			config as unknown as { components: Record<string, unknown> }
		).components;
		expect(components.Legacy).toBe(inputComponents.Legacy);
		expect(components.OptedOut).toBe(inputComponents.OptedOut);
		expect(components.Rooted).not.toBe(inputComponents.Rooted);
		expect(components.Wrapped).not.toBe(inputComponents.Wrapped);
	});

	it("is identity-stable for the same config object across calls", () => {
		const config = makeConfig();
		const first = decoratePuckConfig(config, { enableAuthoring: true });
		const second = decoratePuckConfig(config, { enableAuthoring: true });
		expect(second).toBe(first);
	});

	it("reuses the decorated identity for content-identical recreated configs", () => {
		// Function-bearing configs fall back to identity fingerprints, so
		// build JSON-only content twins the fingerprinter can equate is not
		// possible here — instead assert the WeakMap path: same object in,
		// same decorated object out, across interleaved other configs.
		const configA = makeConfig();
		const decoratedA = decoratePuckConfig(configA, { enableAuthoring: true });
		const configB = makeConfig();
		decoratePuckConfig(configB, { enableAuthoring: true });
		expect(decoratePuckConfig(configA, { enableAuthoring: true })).toBe(
			decoratedA,
		);
	});

	it("fails fast on a root slot field named __anvilkit (invariant 11)", () => {
		const config = {
			...makeConfig(),
			root: {
				fields: {
					content: { type: "slot" },
					__anvilkit: { type: "slot" },
				},
			},
		} as unknown as PuckConfig;
		expect(() => decoratePuckConfig(config, { enableAuthoring: true })).toThrow(
			/invariant 11/,
		);
	});

	it("tolerates root configs with other slot fields", () => {
		const config = {
			...makeConfig(),
			root: {
				fields: {
					content: { type: "slot" },
					__anvilkit: { type: "text" },
				},
			},
		} as unknown as PuckConfig;
		expect(() =>
			decoratePuckConfig(config, { enableAuthoring: true }),
		).not.toThrow();
	});

	it("renders decorated components identically without a provider", () => {
		const decorated = decoratePuckConfig(makeConfig(), {
			enableAuthoring: true,
		});
		const components = (
			decorated as unknown as {
				components: Record<string, { render: (p: object) => ReactNode }>;
			}
		).components;
		const RootedRender = components.Rooted?.render as unknown as (props: {
			id: string;
		}) => ReactNode;
		render(<>{createElement(RootedRender, { id: "n1" })}</>);
		const rooted = screen.getByTestId("rooted");
		expect(rooted.className).toBe("");
		expect(rooted.getAttribute("style")).toBeNull();
	});

	it("applies resolved styles through the provider (root + wrapper)", () => {
		const decorated = decoratePuckConfig(makeConfig(), {
			enableAuthoring: true,
		});
		const components = (
			decorated as unknown as {
				components: Record<string, { render: (p: object) => ReactNode }>;
			}
		).components;
		const lookup = (nodeId: string) => ({
			classNames: ["ak-authored"],
			inlineStyle: { display: "flex", "padding-top": "8px" },
			dataAttributes: { "data-ak-node": nodeId },
			diagnostics: [],
		});
		render(
			<AuthoringStyleContext.Provider value={lookup}>
				{createElement(
					components.Rooted?.render as unknown as (props: {
						id: string;
					}) => ReactNode,
					{ id: "n1" },
				)}
				{createElement(
					components.Wrapped?.render as unknown as (props: {
						id: string;
					}) => ReactNode,
					{ id: "n2" },
				)}
			</AuthoringStyleContext.Provider>,
		);
		const rooted = screen.getByTestId("rooted");
		expect(rooted.className).toBe("ak-authored");
		expect(rooted.getAttribute("data-ak-node")).toBe("n1");
		const wrapped = screen.getByTestId("wrapped");
		const boundary = wrapped.parentElement;
		expect(boundary?.getAttribute("data-ak-node")).toBe("n2");
		expect(boundary?.style.boxSizing).toBe("border-box");
		expect(boundary?.style.display).toBe("flex");
		expect(boundary?.style.paddingTop).toBe("8px");
	});
});

describe("StudioEditorMount", () => {
	it("passes children through untouched when the flag is off or absent", () => {
		const { container: absent } = render(
			<StudioEditorMount editor={undefined} bridge={createStudioEditorBridge()}>
				<span data-testid="child">child</span>
			</StudioEditorMount>,
		);
		expect(absent.textContent).toBe("child");
		cleanup();
		const bridge = createStudioEditorBridge();
		const { container: off } = render(
			<StudioEditorMount
				editor={{ features: { enabled: false } }}
				bridge={bridge}
			>
				<span data-testid="child">child</span>
			</StudioEditorMount>,
		);
		expect(off.textContent).toBe("child");
		expect(bridge.port).toBeNull();
	});

	// The enabled path (lazy editor root installing the command port)
	// is covered by studio-editor-mount.test.tsx, which supplies the
	// plugin context the Phase 1A root requires.
});
