import { describe, expect, it, vi } from "vitest";

import { createSingleOccupancyRegistry } from "../single-occupancy-registry.js";

describe("createSingleOccupancyRegistry", () => {
	it("stores a fresh claim and exposes get/ownerOf/has/size/entries", () => {
		const reg = createSingleOccupancyRegistry<number>({ conflict: "first" });

		expect(reg.claim("a", "owner-a", 1)).toBe(true);
		expect(reg.get("a")).toBe(1);
		expect(reg.ownerOf("a")).toBe("owner-a");
		expect(reg.has("a")).toBe(true);
		expect(reg.has("missing")).toBe(false);
		expect(reg.size).toBe(1);
		expect([...reg.entries()]).toEqual([["a", 1]]);
	});

	it('"first" keeps the original, drops the late claim, fires onConflict', () => {
		const onConflict = vi.fn();
		const reg = createSingleOccupancyRegistry<string>({
			conflict: "first",
			onConflict,
		});

		expect(reg.claim("slot", "first-owner", "A")).toBe(true);
		expect(reg.claim("slot", "second-owner", "B")).toBe(false);

		expect(reg.get("slot")).toBe("A");
		expect(reg.ownerOf("slot")).toBe("first-owner");
		expect(reg.size).toBe(1);
		expect(onConflict).toHaveBeenCalledTimes(1);
		expect(onConflict).toHaveBeenCalledWith({
			id: "slot",
			currentOwner: "first-owner",
			incomingOwner: "second-owner",
		});
	});

	it('"last" overrides the original and fires onConflict', () => {
		const onConflict = vi.fn();
		const reg = createSingleOccupancyRegistry<string>({
			conflict: "last",
			onConflict,
		});

		expect(reg.claim("k", "first-owner", "A")).toBe(true);
		expect(reg.claim("k", "second-owner", "B")).toBe(true);

		expect(reg.get("k")).toBe("B");
		expect(reg.ownerOf("k")).toBe("second-owner");
		expect(reg.size).toBe(1);
		expect(onConflict).toHaveBeenCalledWith({
			id: "k",
			currentOwner: "first-owner",
			incomingOwner: "second-owner",
		});
	});

	it('"error" lets onConflict throw a caller-typed error', () => {
		const reg = createSingleOccupancyRegistry<string>({
			conflict: "error",
			onConflict: (info) => {
				throw new Error(
					`dup ${info.id}: ${info.incomingOwner} vs ${info.currentOwner}`,
				);
			},
		});

		reg.claim("id", "owner-1", "A");
		expect(() => reg.claim("id", "owner-2", "B")).toThrow(
			"dup id: owner-2 vs owner-1",
		);
		// Original retained — the throw happened before any mutation.
		expect(reg.get("id")).toBe("A");
		expect(reg.ownerOf("id")).toBe("owner-1");
	});

	it('"error" safety-net throws even if onConflict does not', () => {
		const reg = createSingleOccupancyRegistry<string>({
			conflict: "error",
			// onConflict deliberately omitted — a misuse, but the
			// registry must still fail loud rather than silently drop.
		});

		reg.claim("x", "owner-1", "A");
		expect(() => reg.claim("x", "owner-2", "B")).toThrow(
			/single-occupancy id "x"/,
		);
	});

	it("preserves insertion order in entries()", () => {
		const reg = createSingleOccupancyRegistry<number>({ conflict: "first" });
		reg.claim("z", "o", 1);
		reg.claim("a", "o", 2);
		reg.claim("m", "o", 3);
		expect([...reg.entries()].map(([k]) => k)).toEqual(["z", "a", "m"]);
	});
});
