/**
 * @file Alias resolution for deprecated i18n keys (PRD §10.2).
 *
 * Phase B renamed `studio.tab.{insert,outline}` →
 * `studio.module.{insert,layer}.name`. This suite locks the
 * resolution order documented at the top of `editor-i18n-store.tsx`:
 *
 *   1. catalog override of requested key
 *   2. catalog override of legacy alias mapped to requested key
 *   3. default for requested key
 *   4. caller `fallback`
 *   5. the key itself
 */

import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { EditorI18nStoreProvider, useMsg } from "@/state/editor-i18n-store";

function wrap(messages?: Readonly<Record<string, string>>) {
	return ({ children }: { children: ReactNode }) => (
		<EditorI18nStoreProvider messages={messages}>
			{children}
		</EditorI18nStoreProvider>
	);
}

describe("useMsg — alias resolution", () => {
	it("returns the default when no override is supplied", () => {
		const { result } = renderHook(() => useMsg(), { wrapper: wrap() });
		expect(result.current("studio.tab.insert")).toBe("Insert");
		expect(result.current("studio.module.insert.name")).toBe("Insert");
	});

	it("override of the new key wins for both old and new lookups", () => {
		const { result } = renderHook(() => useMsg(), {
			wrapper: wrap({ "studio.module.insert.name": "Components" }),
		});
		expect(result.current("studio.module.insert.name")).toBe("Components");
		// Old key still reads its default — alias does not back-fill the
		// reverse direction. Consumers asking the old key get the legacy
		// default until they migrate.
		expect(result.current("studio.tab.insert")).toBe("Insert");
	});

	it("override of the legacy key is honored when caller asks for the new key", () => {
		const { result } = renderHook(() => useMsg(), {
			wrapper: wrap({ "studio.tab.outline": "Outline (legacy)" }),
		});
		expect(result.current("studio.module.layer.name")).toBe("Outline (legacy)");
		// Old key still reads the explicit override.
		expect(result.current("studio.tab.outline")).toBe("Outline (legacy)");
	});

	it("override of the new key wins over override of the legacy alias", () => {
		const { result } = renderHook(() => useMsg(), {
			wrapper: wrap({
				"studio.tab.outline": "Outline (legacy)",
				"studio.module.layer.name": "Pages & Layers (custom)",
			}),
		});
		expect(result.current("studio.module.layer.name")).toBe(
			"Pages & Layers (custom)",
		);
	});

	it("falls through to fallback then to the key itself for unknown keys", () => {
		const { result } = renderHook(() => useMsg(), { wrapper: wrap() });
		expect(result.current("studio.unknown.key", "fallback")).toBe("fallback");
		expect(result.current("studio.unknown.key")).toBe("studio.unknown.key");
	});

	it("works without a provider via DEFAULT_MESSAGES", () => {
		const { result } = renderHook(() => useMsg());
		expect(result.current("studio.tab.insert")).toBe("Insert");
		expect(result.current("studio.module.layer.name")).toBe("Pages & Layers");
	});
});
