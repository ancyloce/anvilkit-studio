/**
 * @file P2-06 — appearance bridge contract tests, locked to
 * `@puckeditor/core@0.22.4`.
 *
 * Verified against the installed 0.22.4 source: `overrides.iframe`
 * renders ONLY inside the enabled-iframe `AutoFrame` branch, and
 * AutoFrame never reaches ready under jsdom — so the override's
 * runtime invocation belongs to the true-browser (Playwright) pass.
 * What jsdom CAN lock, and this file does: the bridge component
 * contract through the host-document wiring (`iframe.enabled: false`,
 * bridge mounted around `Puck.Preview`) — exactly one
 * `data-anvilkit-appearance` style element, compiled CSS for the live
 * document, stylesheet updates after a `setData` commit (through the
 * deferred compile feed), CSP nonce propagation, and an import-graph
 * assertion that the composition path never touches the legacy live
 * stylesheet resolver.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Config, Data, PuckApi } from "@puckeditor/core";
import { Puck, useGetPuck } from "@puckeditor/core";
import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { commitAppearanceUpdate } from "../../../../puck/update-appearance.js";
import { AppearanceIframeOverride } from "../AppearanceIframeOverride.js";

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
						root: { style: { base: { layout: { display: "flex" } } } },
					},
				},
			},
		},
	],
	root: { props: {} },
	zones: {},
} as unknown as Data;

let getPuck: (() => PuckApi) | null = null;

function ApiProbe(): React.ReactElement {
	getPuck = useGetPuck();
	return <span hidden />;
}

/** The host-document wiring (see file doc): bridge around Preview. */
function mountHostWiring(nonce?: string) {
	return render(
		<Puck config={config} data={data} iframe={{ enabled: false }}>
			<ApiProbe />
			<AppearanceIframeOverride nonce={nonce}>
				<Puck.Preview />
			</AppearanceIframeOverride>
		</Puck>,
	);
}

function appearanceStyles(container: HTMLElement): HTMLStyleElement[] {
	return [
		...container.ownerDocument.querySelectorAll<HTMLStyleElement>(
			"style[data-anvilkit-appearance]",
		),
	];
}

afterEach(() => {
	cleanup();
	getPuck = null;
});

describe("appearance bridge (P2-06, Puck 0.22.4 contract)", () => {
	it("renders exactly one appearance stylesheet carrying compiled CSS ahead of the canvas", () => {
		const { container } = mountHostWiring();
		const styles = appearanceStyles(container);
		expect(styles).toHaveLength(1);
		expect(styles[0]?.textContent).toContain('[data-ak-style-node="box-1"]');
		expect(styles[0]?.textContent).toContain("display: flex;");
		// The bridge wraps, never replaces, the canvas content.
		expect(
			container.ownerDocument.querySelector('[data-testid="box-render"]'),
		).not.toBeNull();
	});

	it("updates the stylesheet after a setData appearance commit", async () => {
		const { container } = mountHostWiring();
		if (getPuck === null) throw new Error("ApiProbe never mounted");
		const freshApi = getPuck;
		act(() => {
			commitAppearanceUpdate(
				{ getPuckApi: freshApi },
				{
					config,
					nodeIds: ["box-1"],
					targetId: "root",
					layer: "base",
					patch: { kind: "set-property", property: "display", value: "grid" },
				},
			);
		});
		// The compile feed reads through useDeferredValue (the P2-00
		// async fallback) — flush the deferred render before asserting.
		await act(async () => {
			await Promise.resolve();
		});
		const styles = appearanceStyles(container);
		expect(styles).toHaveLength(1);
		expect(styles[0]?.textContent).toContain("display: grid;");
		expect(styles[0]?.textContent).not.toContain("display: flex;");
	});

	it("propagates the CSP nonce onto the style element", () => {
		const { container } = mountHostWiring("test-nonce-123");
		const styles = appearanceStyles(container);
		expect(
			styles[0]?.nonce === "test-nonce-123" ||
				styles[0]?.getAttribute("nonce") === "test-nonce-123",
		).toBe(true);
	});

	it("the composition path never imports the legacy live stylesheet resolver", () => {
		const compositionDir = join(__dirname, "..");
		const offenders: string[] = [];
		const scan = (dir: string): void => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) {
					scan(path);
					continue;
				}
				if (!/\.(ts|tsx)$/.test(entry.name)) continue;
				const source = readFileSync(path, "utf8");
				if (/from\s+"[^"]*responsive\/stylesheet/.test(source)) {
					offenders.push(path);
				}
			}
		};
		scan(compositionDir);
		expect(offenders).toEqual([]);
	});
});
