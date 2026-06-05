/**
 * @file Typed keys + `useT` (P5).
 *
 * Type-level assertions pin {@link StudioMessageKey} (the exact core key
 * union derived from `DEFAULT_MESSAGES`) and the {@link AnvilkitMessageKey}
 * escape hatch; the runtime block exercises `useT`'s resolve + interpolate.
 */

import { renderHook } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import type { AnvilkitMessageKey, StudioMessageKey } from "@/i18n/keys";
import { useT } from "@/i18n/use-t";
import { EditorI18nProvider } from "@/state/editor-i18n-context";

describe("StudioMessageKey (type-level)", () => {
	it("includes a known core key and excludes an unknown one", () => {
		expectTypeOf<"studio.publish">().toMatchTypeOf<StudioMessageKey>();
		expectTypeOf<"not.a.real.key">().not.toMatchTypeOf<StudioMessageKey>();
	});
});

describe("AnvilkitMessageKey (type-level)", () => {
	it("accepts a known key and any string via the (string & {}) hatch", () => {
		expectTypeOf<"studio.publish">().toMatchTypeOf<AnvilkitMessageKey>();
		expectTypeOf<string>().toMatchTypeOf<AnvilkitMessageKey>();
	});
});

describe("useT", () => {
	it("resolves a core key and interpolates {tokens}", () => {
		const wrapper = ({ children }: { children: ReactNode }) => (
			<EditorI18nProvider messages={{ "x.greet": "Hi {name}" }}>
				{children}
			</EditorI18nProvider>
		);
		const { result } = renderHook(() => useT(), { wrapper });
		// Core key resolves via the catalog…
		expect(result.current("studio.publish")).toBe("Publish");
		// …and a host-message key interpolates the {name} token.
		expect(result.current("x.greet", { name: "Ada" })).toBe("Hi Ada");
		// An unknown key falls through to itself (5-step resolution).
		expect(result.current("no.such.key")).toBe("no.such.key");
	});
});
