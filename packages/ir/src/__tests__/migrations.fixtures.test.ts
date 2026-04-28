/**
 * @file Round-trip the 9 demo fixtures through `migratePageIR` and
 * `downgradePageIR` to lock the no-op contract on the 1.0 surface.
 *
 * Locks the M10 invariant: when no node carries `meta`, the
 * migration helpers MUST be referentially or structurally
 * equivalent to the input. No Phase 5 snapshot golden churns as a
 * side effect of these tests.
 */

import type { Config } from "@puckeditor/core";
import { describe, expect, it } from "vitest";

import {
	downgradePageIR,
	MIGRATION_VERSIONS,
	migratePageIR,
} from "../migrations/index.js";
import { puckDataToIR } from "../puck-data-to-ir.js";

import { allDemoFixtures } from "./fixtures/demo-fixtures.js";

const FIXED_CLOCK = () => new Date("2026-04-11T00:00:00.000Z");
const noop = (() => null) as unknown as Config["components"][string]["render"];

describe("migratePageIR — fixture round-trips", () => {
	for (const { name, data, config } of allDemoFixtures) {
		it(`is a referential no-op on ${name} (no meta)`, () => {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
			const migrated = migratePageIR(ir, { from: "0.21", to: "0.22" });
			expect(migrated).toBe(ir);
		});

		it(`downgradePageIR(${name}) is structurally equal to the original`, () => {
			const ir = puckDataToIR(data, config, { now: FIXED_CLOCK });
			const downgraded = downgradePageIR(ir);
			expect(downgraded).toEqual(ir);
		});
	}

	it("MIGRATION_VERSIONS lists every supported peer-range label", () => {
		expect(MIGRATION_VERSIONS).toEqual(["0.21", "0.22"]);
	});

	it("rejects an unknown `from` version", () => {
		const ir = puckDataToIR(allDemoFixtures[0]!.data, allDemoFixtures[0]!.config, {
			now: FIXED_CLOCK,
		});
		expect(() =>
			// @ts-expect-error — exercising the runtime guard with an invalid label.
			migratePageIR(ir, { from: "0.20", to: "0.22" }),
		).toThrow(RangeError);
	});

	it("clones the tree (not the original ref) when meta is present", () => {
		const ir = puckDataToIR(
			{
				root: {},
				content: [
					{
						type: "Block",
						props: { id: "a" },
					},
				],
			},
			{
				components: {
					Block: { render: noop, fields: {} },
				},
			},
			{ now: FIXED_CLOCK },
		);
		const withMeta = {
			...ir,
			root: {
				...ir.root,
				children: [
					{
						...ir.root.children![0]!,
						meta: { locked: true, owner: "platform" },
					},
				],
			},
		};
		const migrated = migratePageIR(withMeta, { from: "0.21", to: "0.22" });
		expect(migrated).not.toBe(withMeta);
		expect(migrated.root.children![0]!.meta).toEqual({
			locked: true,
			owner: "platform",
		});
	});

	it("downgradePageIR strips meta from every node, recursively", () => {
		const ir = puckDataToIR(
			{
				root: {},
				content: [
					{
						type: "Block",
						props: { id: "outer" },
					},
				],
			},
			{
				components: {
					Block: { render: noop, fields: {} },
				},
			},
			{ now: FIXED_CLOCK },
		);
		const withDeepMeta = {
			...ir,
			root: {
				...ir.root,
				meta: { owner: "root-owner" },
				children: [
					{
						...ir.root.children![0]!,
						meta: { locked: true, version: "1.2.3" },
					},
				],
			},
		};
		const downgraded = downgradePageIR(withDeepMeta);
		expect(downgraded.root.meta).toBeUndefined();
		expect(downgraded.root.children![0]!.meta).toBeUndefined();
	});

	it("rejects oversize notes via the cap", () => {
		const ir = puckDataToIR(
			{
				root: {},
				content: [
					{
						type: "Block",
						props: { id: "a" },
					},
				],
			},
			{
				components: {
					Block: { render: noop, fields: {} },
				},
			},
			{ now: FIXED_CLOCK },
		);
		const oversize = {
			...ir,
			root: {
				...ir.root,
				children: [
					{
						...ir.root.children![0]!,
						meta: { notes: "x".repeat(513) },
					},
				],
			},
		};
		expect(() => migratePageIR(oversize, { from: "0.21", to: "0.22" })).toThrow(
			/notes/,
		);
	});
});
