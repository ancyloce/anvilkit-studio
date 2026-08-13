/**
 * @file P4-01 — `AnvilKitRender` contract tests (PLAN-0025 §9.1).
 *
 * Locks the ONE-wrapper guarantees: the appearance `<style>` carries
 * byte-identical CSS to a direct `compileDocumentAppearance` call on
 * the same `Data` + `Config` (§9.2 step 5 — compiler and `<Render>`
 * can never see different documents), the CSP nonce propagates
 * (§7.4), the wrapper exposes the stable `data-ak-document` /
 * `data-ak-token-mode` page root, and diagnostics remain available to
 * callers that compile outside render (§9.2 step 6).
 */

import type { Config, Data } from "@puckeditor/core";
import { cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
			render: (props: { title?: string }) => (
				<div data-testid="box-render">{props.title ?? "box"}</div>
			),
		},
	},
} as unknown as Config;

const data = {
	content: [
		{
			type: "Box",
			props: {
				id: "box-1",
				title: "rendered-through-wrapper",
				appearance: {
					version: "1",
					targets: {
						root: {
							style: {
								base: { layout: { display: "flex" }, visual: { opacity: 0.5 } },
							},
						},
					},
				},
			},
		},
	],
	root: { props: {} },
	zones: {},
} as unknown as Data;

/** Same document, but addressing a target `Box` never declared. */
const dataWithUnknownTarget = {
	content: [
		{
			type: "Box",
			props: {
				id: "box-1",
				appearance: {
					version: "1",
					targets: {
						bogus: { style: { base: { layout: { display: "flex" } } } },
					},
				},
			},
		},
	],
	root: { props: {} },
	zones: {},
} as unknown as Data;

function appearanceStyles(container: HTMLElement): HTMLStyleElement[] {
	return [
		...container.querySelectorAll<HTMLStyleElement>(
			"style[data-anvilkit-appearance]",
		),
	];
}

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe("AnvilKitRender (P4-01, §9.1)", () => {
	it("renders the document through Puck <Render> inside the stable page root", () => {
		const { container } = render(
			<AnvilKitRender config={config} data={data} />,
		);
		const root = container.querySelector("[data-ak-document]");
		expect(root).not.toBeNull();
		expect(root?.getAttribute("data-ak-token-mode")).toBe("default");
		expect(
			container.querySelector('[data-testid="box-render"]')?.textContent,
		).toBe("rendered-through-wrapper");
	});

	it("emits exactly one appearance stylesheet, byte-identical to a direct compile of the same Data", () => {
		const { container } = render(
			<AnvilKitRender config={config} data={data} />,
		);
		const styles = appearanceStyles(container);
		expect(styles).toHaveLength(1);
		const direct = compileDocumentAppearance({ data, config });
		expect(styles[0]?.textContent).toBe(direct.css);
		expect(direct.css).toContain('[data-ak-style-node="box-1"]');
		expect(direct.css).toContain("display: flex;");
	});

	it("propagates the CSP nonce onto the style element and reflects an explicit token mode", () => {
		const { container } = render(
			<AnvilKitRender
				config={config}
				data={data}
				nonce="test-nonce"
				tokenMode="dark"
			/>,
		);
		expect(appearanceStyles(container)[0]?.getAttribute("nonce")).toBe(
			"test-nonce",
		);
		expect(
			container
				.querySelector("[data-ak-document]")
				?.getAttribute("data-ak-token-mode"),
		).toBe("dark");
	});

	it("retains onCompiled as a source-compatible no-op", () => {
		const onCompiled = vi.fn();
		render(
			<React.StrictMode>
				<AnvilKitRender config={config} data={data} onCompiled={onCompiled} />
			</React.StrictMode>,
		);
		expect(onCompiled).not.toHaveBeenCalled();
	});

	it("leaves diagnostic reporting to the caller, outside render", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
		render(<AnvilKitRender config={config} data={dataWithUnknownTarget} />);
		expect(warn).not.toHaveBeenCalled();
		const direct = compileDocumentAppearance({
			data: dataWithUnknownTarget,
			config,
		});
		expect(direct.diagnostics.length).toBeGreaterThan(0);
	});
});
