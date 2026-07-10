/**
 * @file Tests for the `hasHeaderActionCapability` predicate that gates
 * the header-action surface in `<StudioHeader>`. The predicate is
 * exported so the detection logic can be exercised in isolation without
 * mounting the full chrome (which would require i18n / runtime /
 * plugin-context providers).
 *
 * Covers: a plugin self-declaring `capabilities.header === true` opens
 * the gate; an absent flag, an explicit `false`, a missing
 * `capabilities` block, and an empty list all keep it shut.
 */

import { describe, expect, it } from "vitest";
import { hasHeaderActionCapability } from "@/layout/StudioHeader.logic";
import type { StudioPluginMeta } from "@/types/plugin";

function meta(
	id: string,
	capabilities?: StudioPluginMeta["capabilities"],
): StudioPluginMeta {
	return {
		id,
		name: id,
		version: "1.0.0",
		coreVersion: "^0.1.0",
		...(capabilities !== undefined ? { capabilities } : {}),
	};
}

describe("hasHeaderActionCapability", () => {
	it("is false for an empty plugin list", () => {
		expect(hasHeaderActionCapability([])).toBe(false);
	});

	it("is true when a plugin declares capabilities.header === true", () => {
		expect(hasHeaderActionCapability([meta("a", { header: true })])).toBe(true);
	});

	it("detects a header-capable plugin among non-header plugins", () => {
		expect(
			hasHeaderActionCapability([
				meta("a", { sidebar: true }),
				meta("b"),
				meta("c", { header: true }),
			]),
		).toBe(true);
	});

	it("is false when header is explicitly false", () => {
		expect(hasHeaderActionCapability([meta("a", { header: false })])).toBe(
			false,
		);
	});

	it("is false when only the sidebar capability is declared", () => {
		expect(hasHeaderActionCapability([meta("a", { sidebar: true })])).toBe(
			false,
		);
	});

	it("is false when the capabilities block is absent", () => {
		expect(hasHeaderActionCapability([meta("a")])).toBe(false);
	});
});
