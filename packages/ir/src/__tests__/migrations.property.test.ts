/**
 * @file Property-based tests for `migratePageIR` / `downgradePageIR`.
 *
 * Generates 500 random `meta`-bearing IR shapes and asserts:
 *
 * 1. `migratePageIR(ir, { from: "0.21", to: "0.22" })` preserves
 *    every node's `meta` field byte-for-byte (deep-equal).
 * 2. `downgradePageIR(migratePageIR(ir))` strips `meta` from every
 *    node, recursively.
 * 3. Repeated migration is a fixed-point operation: migrating an
 *    already-migrated document never mutates it further.
 *
 * Fixed seed `20_260_428` keeps the run deterministic; bump only
 * with a documented changeset.
 */

import type { PageIR, PageIRNode, PageIRNodeMeta } from "@anvilkit/core/types";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import { downgradePageIR, migratePageIR } from "../migrations/index.js";

const SEED = 20_260_428;
const NUM_RUNS = 500;

const semverArb = fc
	.tuple(fc.nat({ max: 99 }), fc.nat({ max: 99 }), fc.nat({ max: 99 }))
	.map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

const metaArb: fc.Arbitrary<PageIRNodeMeta> = fc.record(
	{
		locked: fc.option(fc.boolean(), { nil: undefined }),
		owner: fc.option(fc.string({ maxLength: 32 }), { nil: undefined }),
		version: fc.option(semverArb, { nil: undefined }),
		notes: fc.option(fc.string({ maxLength: 64 }), { nil: undefined }),
	},
	{ requiredKeys: [] },
);

const optionalMetaArb: fc.Arbitrary<PageIRNodeMeta | undefined> = fc.option(
	metaArb,
	{ nil: undefined, freq: 2 },
);

const idArb = fc
	.tuple(fc.nat({ max: 999_999 }), fc.nat({ max: 999_999 }))
	.map(([a, b]) => `id-${a}-${b}`);

const nodeArb: fc.Arbitrary<PageIRNode> = fc.letrec((tie) => ({
	node: fc.record(
		{
			id: idArb,
			type: fc.constantFrom("Block0", "Block1", "Block2"),
			props: fc.dictionary(fc.string({ maxLength: 8 }), fc.anything(), {
				maxKeys: 3,
			}),
			children: fc.option(fc.array(tie("node"), { maxLength: 3 }), {
				nil: undefined,
			}),
			meta: optionalMetaArb,
		},
		{ requiredKeys: ["id", "type", "props"] },
	) as fc.Arbitrary<PageIRNode>,
})).node;

const irArb: fc.Arbitrary<PageIR> = fc.record({
	version: fc.constant("1" as const),
	root: nodeArb,
	assets: fc.constant([] as const),
	metadata: fc.constant({} as const),
});

function collectMeta(node: PageIRNode): ReadonlyArray<PageIRNodeMeta | undefined> {
	const here = node.meta;
	const childMetas =
		node.children?.flatMap((child) => collectMeta(child)) ?? [];
	return [here, ...childMetas];
}

describe("migratePageIR — property suite (500 runs, seed 20_260_428)", () => {
	it("preserves every node's meta byte-for-byte", () => {
		fc.assert(
			fc.property(irArb, (ir) => {
				const migrated = migratePageIR(ir, { from: "0.21", to: "0.22" });
				expect(collectMeta(migrated.root)).toEqual(collectMeta(ir.root));
			}),
			{ numRuns: NUM_RUNS, seed: SEED },
		);
	});

	it("downgrade(migrate(ir)) strips meta from every node", () => {
		fc.assert(
			fc.property(irArb, (ir) => {
				const downgraded = downgradePageIR(
					migratePageIR(ir, { from: "0.21", to: "0.22" }),
				);
				for (const meta of collectMeta(downgraded.root)) {
					expect(meta).toBeUndefined();
				}
			}),
			{ numRuns: NUM_RUNS, seed: SEED },
		);
	});

	it("is a fixed point: migrate(migrate(ir)) ≡ migrate(ir)", () => {
		fc.assert(
			fc.property(irArb, (ir) => {
				const once = migratePageIR(ir, { from: "0.21", to: "0.22" });
				const twice = migratePageIR(once, { from: "0.22", to: "0.22" });
				expect(twice).toEqual(once);
			}),
			{ numRuns: NUM_RUNS, seed: SEED },
		);
	});

	it("downgrade is a fixed point on already-downgraded docs", () => {
		fc.assert(
			fc.property(irArb, (ir) => {
				const once = downgradePageIR(ir);
				const twice = downgradePageIR(once);
				expect(twice).toEqual(once);
			}),
			{ numRuns: NUM_RUNS, seed: SEED },
		);
	});
});
