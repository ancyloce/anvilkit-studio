/**
 * @file Tests for the React-free runtime sidebar registry's single-slot
 * overwrite warning (report 0002, P2) — mirroring the React store so
 * headless consumers get the same last-write-wins diagnostic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSidebarRegistry } from "@/runtime/sidebar-registry";
import type { StudioAssetSource } from "@/types/sidebar";

const sourceA = { id: "a" } as unknown as StudioAssetSource;
const sourceB = { id: "b" } as unknown as StudioAssetSource;

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("createSidebarRegistry — single-slot overwrite warning", () => {
	it("warns once when a second plugin overwrites assetSource (last-write-wins)", () => {
		const reg = createSidebarRegistry();
		reg.registerAssetSource(sourceA);
		expect(warnSpy).not.toHaveBeenCalled();

		reg.registerAssetSource(sourceB);
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0]?.[0]).toContain('"assetSource"');
		// Still last-write-wins.
		expect(reg.snapshot().assetSource).toBe(sourceB);
	});

	it("does not warn on idempotent re-registration of the same object", () => {
		const reg = createSidebarRegistry();
		reg.registerAssetSource(sourceA);
		reg.registerAssetSource(sourceA);
		expect(warnSpy).not.toHaveBeenCalled();
		expect(reg.snapshot().assetSource).toBe(sourceA);
	});

	it("the overwritten registration's unregister() is a no-op (loser does not clear the winner)", () => {
		const reg = createSidebarRegistry();
		const offA = reg.registerAssetSource(sourceA);
		reg.registerAssetSource(sourceB);

		offA();
		expect(reg.snapshot().assetSource).toBe(sourceB);
	});

	// Every single-slot surface shares the helper, but cover all six by
	// name so a future regression in any one is caught (Codex P2-sidebar).
	const SINGLE_SLOTS = [
		"registerAssetSource",
		"registerCopilotPanel",
		"registerHistoryPanel",
		"registerDesignSystemPanel",
		"registerSeoPanel",
		"registerPageSettingsSeoFields",
	] as const;
	const SLOT_NAME: Record<(typeof SINGLE_SLOTS)[number], string> = {
		registerAssetSource: "assetSource",
		registerCopilotPanel: "copilotPanel",
		registerHistoryPanel: "historyPanel",
		registerDesignSystemPanel: "designSystemPanel",
		registerSeoPanel: "seoPanel",
		registerPageSettingsSeoFields: "pageSettingsSeoFields",
	};

	it.each(SINGLE_SLOTS)("warns naming the slot for %s", (method) => {
		const reg = createSidebarRegistry();
		const register = reg[method] as (value: unknown) => unknown;
		register({ id: "first" });
		expect(warnSpy).not.toHaveBeenCalled();

		register({ id: "second" });
		expect(warnSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy.mock.calls[0]?.[0]).toContain(`"${SLOT_NAME[method]}"`);
	});

	it("is silent in production", () => {
		vi.stubEnv("NODE_ENV", "production");
		const reg = createSidebarRegistry();
		reg.registerAssetSource(sourceA);
		reg.registerAssetSource(sourceB);
		expect(warnSpy).not.toHaveBeenCalled();
		// Behavior (last-write-wins) is unchanged — only the warning is gated.
		expect(reg.snapshot().assetSource).toBe(sourceB);
	});
});
