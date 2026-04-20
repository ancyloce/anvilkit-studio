/**
 * Snapshot test that exercises the full `Puck Data → PageIR → JSON`
 * pipeline against a subset of the data rendered in the demo
 * (`apps/demo/lib/puck-demo.ts`). The `Data` shape is hand-authored
 * here rather than imported so the example plugin stays free of the
 * demo's Next.js dependencies — each prop value is copied verbatim
 * from the corresponding `defaultProps`/fixture so the two sources
 * stay in lockstep.
 */

import { puckDataToIR } from "@anvilkit/ir";
import type { Config, Data } from "@puckeditor/core";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

import { jsonFormat } from "../json-format.js";

const noop = (() => null) as unknown as Config["components"][string]["render"];

const demoData: Data = {
	root: {},
	content: [
		{
			type: "Hero",
			props: {
				id: "hero-primary",
				announcementHref: "",
				announcementLabel: "We raised $69M pre seed",
				announcementOpenInNewTab: false,
				description:
					"Our state of the art tool is a tool that allows you to\nwrite copy instantly.",
				headline: "Write fast with\naccurate precision.",
				linuxHref: "/download/linux",
				linuxLabel: "Download for Linux",
				linuxOpenInNewTab: false,
				windowsHref: "/download/windows",
				windowsLabel: "Download for Windows",
				windowsOpenInNewTab: false,
			},
		},
		{
			type: "Button",
			props: {
				id: "button-primary",
				label: "Get started",
				variant: "primary",
				disabled: false,
				href: "https://example.com/signup",
				openInNewTab: false,
			},
		},
	],
};

const demoConfig: Config = {
	components: {
		Hero: {
			render: noop,
			fields: {
				headline: { type: "textarea" },
				description: { type: "textarea" },
			},
		},
		Button: {
			render: noop,
			fields: {
				label: { type: "text" },
				href: { type: "text" },
			},
		},
	},
};

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");

it("serializes the demo page IR to a byte-stable JSON snapshot", async () => {
	const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });

	const { content, filename, warnings } = await jsonFormat.run(ir, {});

	expect(filename).toBe("page.json");
	expect(warnings).toBeUndefined();
	expect(content).toMatchFileSnapshot(
		fileURLToPath(new URL("./__snapshots__/demo-page.snap.json", import.meta.url)),
	);
});

it("round-trips the serialized JSON back to the same IR", async () => {
	const ir = puckDataToIR(demoData, demoConfig, { now: FIXED_CLOCK });

	const { content } = await jsonFormat.run(ir, {});

	expect(JSON.parse(content as string)).toEqual(ir);
});
