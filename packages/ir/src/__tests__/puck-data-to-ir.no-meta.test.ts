/**
 * @file Lock the M10 invariant: `puckDataToIR()` MUST NOT synthesize
 * `meta` on any node, ever.
 *
 * `meta` is an authoring-time concept owned by the host or by
 * `version-history`. The IR transform layer is non-opinionated about
 * authoring metadata — it only reads structural Puck `Data` and
 * produces a `PageIR` that round-trips losslessly back to it.
 *
 * If a future change ever introduced auto-`meta` synthesis (e.g. a
 * "createdAt" timestamp, an "owner" sourced from an env var) it
 * would silently break the round-trip contract for every 1.0
 * consumer that pins against the pre-`meta` shape.
 */

import type { PageIR, PageIRNode } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";

import { puckDataToIR } from "../puck-data-to-ir.js";

import { allDemoFixtures } from "./fixtures/demo-fixtures.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");

function collectMeta(node: PageIRNode): unknown[] {
	const here = "meta" in node ? [node.meta] : [];
	const fromChildren =
		node.children?.flatMap((child) => collectMeta(child)) ?? [];
	return [...here, ...fromChildren];
}

function flattenMeta(ir: PageIR): unknown[] {
	return collectMeta(ir.root);
}

describe("puckDataToIR — no-synthesis invariant on PageIRNode.meta", () => {
	for (const { name, data, config } of allDemoFixtures) {
		it(`never synthesizes meta on any node of ${name}`, () => {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
			for (const meta of flattenMeta(ir)) {
				expect(meta).toBeUndefined();
			}
		});
	}
});
