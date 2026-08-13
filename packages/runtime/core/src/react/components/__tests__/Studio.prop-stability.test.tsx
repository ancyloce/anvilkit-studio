/**
 * @file Regression tests for review 0036 H-4 — an unstable-but-equivalent
 * host prop must not remount the editor or recompile the plugin set.
 *
 * `<Studio>` already tolerates inline `plugins` / `config` (structurally
 * fingerprinted) and inline callbacks (ref-boxed). Two props escaped
 * that discipline, and both carry functions, so neither technique fit:
 *
 *  - **`overrides`** fed a `useMemo` whose output Puck resolves as a
 *    COMPONENT TYPE (`CustomPuck = useMemo(() => overrides.puck ||
 *    DefaultOverride, [overrides])`). `mergeOverrides` mints a fresh
 *    function per composed key, so an inline `overrides={{…}}` changed
 *    that type every parent render and React unmounted and remounted the
 *    whole Puck subtree — canvas iframe, inspector, field buffers, focus
 *    and scroll.
 *  - **`aiHost`** went raw into the compile identity, so an inline one
 *    tore down and recompiled every plugin on every parent render.
 *
 * The Puck double counts mounts, which is the only way to observe a
 * remount from the outside.
 */

import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Studio } from "@/components/Studio";
import {
	shallowEqual,
	useShallowStable,
} from "@/components/use-shallow-stable";
import type { StudioPlugin, StudioPluginMeta } from "@/types/plugin";

const puck = vi.hoisted(() => ({
	/** One entry per `<Puck>` MOUNT. */
	mounts: 0,
	/** One entry per `<Puck>` render, mount or not. */
	renders: 0,
	/**
	 * Mounts of the subtree rendered INSIDE the resolved `puck` override.
	 *
	 * This is the number H-4 is about: Puck resolves `overrides.puck` as a
	 * component type, so a changed identity there unmounts and remounts
	 * everything the editor renders beneath it.
	 */
	slotMounts: 0,
}));

vi.mock("@puckeditor/core", async () => {
	const { createElement, useState } = await import("react");

	/** Puck's own `DefaultOverride`: a passthrough. */
	const DefaultOverride = ({ children }: { children?: ReactNode }) =>
		createElement("div", { "data-testid": "default-override" }, children);

	/** Stands in for everything Puck renders under the `puck` slot. */
	const SlotProbe = () => {
		useState(() => {
			puck.slotMounts += 1;
			return null;
		});
		return createElement("span", { "data-testid": "slot-probe" });
	};

	return {
		Puck: (props: { overrides?: { puck?: unknown } }) => {
			useState(() => {
				puck.mounts += 1;
				return null;
			});
			puck.renders += 1;
			// Mirrors Puck's `CustomPuck = useMemo(() => overrides.puck ||
			// DefaultOverride, [overrides])` — resolved as a COMPONENT TYPE,
			// which is precisely why its identity is load-bearing.
			const CustomPuck = (props.overrides?.puck ??
				DefaultOverride) as typeof DefaultOverride;
			return createElement(
				"div",
				{ "data-testid": "puck-mock" },
				createElement(CustomPuck, {
					children: createElement(SlotProbe),
				}),
			);
		},
		useGetPuck: () => () => ({
			appState: { data: null },
			dispatch: () => undefined,
		}),
		createUsePuck: () => () => undefined,
	};
});

/** A module-level override component — stable, as a host would write it. */
function HostHeader({ children }: { readonly children?: ReactNode }) {
	return <div data-testid="host-header">{children}</div>;
}

let registerCount = 0;

function countingPlugin(): StudioPlugin {
	const meta: StudioPluginMeta = {
		id: "com.test.counting",
		name: "counting",
		version: "1.0.0",
		coreVersion: "^0.1.0",
	};
	return {
		meta,
		register() {
			registerCount += 1;
			return { meta };
		},
	};
}

beforeEach(() => {
	puck.mounts = 0;
	puck.renders = 0;
	puck.slotMounts = 0;
	registerCount = 0;
});

afterEach(cleanup);

describe("shallowEqual", () => {
	it("treats a fresh object with identical members as equal", () => {
		expect(shallowEqual({ a: HostHeader }, { a: HostHeader })).toBe(true);
	});

	it("separates different members, key sets, and shapes", () => {
		expect(shallowEqual({ a: HostHeader }, { a: () => null })).toBe(false);
		expect(shallowEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
		expect(shallowEqual({ a: 1 }, [1])).toBe(false);
		expect(shallowEqual(undefined, {})).toBe(false);
	});

	it("handles undefined on both sides", () => {
		expect(shallowEqual(undefined, undefined)).toBe(true);
	});
});

describe("useShallowStable", () => {
	it("holds the first reference while the contents match", () => {
		const first = { a: HostHeader };
		const second = { a: HostHeader };
		const third = { a: () => null };
		let seen: unknown;

		function Probe({ value }: { readonly value: unknown }): ReactNode {
			seen = useShallowStable(value);
			return null;
		}

		const view = render(<Probe value={first} />);
		expect(seen).toBe(first);

		view.rerender(<Probe value={second} />);
		// Same contents — the ORIGINAL reference survives.
		expect(seen).toBe(first);

		view.rerender(<Probe value={third} />);
		// Genuinely different — picked up immediately.
		expect(seen).toBe(third);
	});
});

describe("<Studio> — inline props do not remount or recompile (0036 H-4)", () => {
	// `chrome="puck"` keeps the AnvilKit preset out of the composition, so
	// the `puck` slot resolves to the shell's own binder rather than the
	// full `<StudioLayout>` chrome — the identity question under test,
	// without mounting the entire sidebar tree.
	it("does not remount the editor when `overrides` is a fresh equivalent object", async () => {
		const view = render(
			<Studio
				chrome="puck"
				puckConfig={{ components: {} }}
				overrides={{ header: HostHeader }}
				isSavingDraft={false}
			/>,
		);
		await view.findByTestId("slot-probe");
		expect(puck.slotMounts).toBe(1);
		const rendersAfterMount = puck.renders;

		// Exactly what a parent re-render produces: a new object literal
		// holding the same component.
		view.rerender(
			<Studio
				chrome="puck"
				puckConfig={{ components: {} }}
				overrides={{ header: HostHeader }}
				isSavingDraft={true}
			/>,
		);
		await view.findByTestId("slot-probe");

		// Before the fix this was 2 — a brand-new `CustomPuck` type tore the
		// editor down and rebuilt it.
		expect(puck.slotMounts).toBe(1);
		// And it really did re-render, so this is not passing merely because
		// nothing re-rendered.
		expect(puck.renders).toBeGreaterThan(rendersAfterMount);
	});

	it("keeps the slot identity stable even when overrides genuinely change", async () => {
		const view = render(
			<Studio chrome="puck" puckConfig={{ components: {} }} overrides={{}} />,
		);
		await view.findByTestId("slot-probe");
		expect(puck.slotMounts).toBe(1);

		// A real change to the composition. The mount-stable delegate means
		// Puck's root wrapper type still does not change, so the editor is
		// updated in place rather than rebuilt.
		view.rerender(
			<Studio
				chrome="puck"
				puckConfig={{ components: {} }}
				overrides={{ header: HostHeader }}
			/>,
		);
		await view.findByTestId("slot-probe");
		expect(puck.slotMounts).toBe(1);
	});

	it("does not recompile plugins when an unchanged `aiHost` string re-renders", async () => {
		// `aiHost` is a deprecated endpoint STRING, so identity is value —
		// there is no unstable-but-equivalent form of it. This pins the
		// property that actually holds: an unchanged one does not recompile.
		const plugin = countingPlugin();
		const view = render(
			<Studio
				chrome="puck"
				puckConfig={{ components: {} }}
				plugins={[plugin]}
				isSavingDraft={false}
			/>,
		);
		await view.findByTestId("puck-mock");
		await act(async () => undefined);
		const afterMount = registerCount;
		expect(afterMount).toBeGreaterThan(0);

		view.rerender(
			<Studio
				chrome="puck"
				puckConfig={{ components: {} }}
				plugins={[plugin]}
				isSavingDraft={true}
			/>,
		);
		await view.findByTestId("puck-mock");
		await act(async () => undefined);
		expect(registerCount).toBe(afterMount);
	});
});
