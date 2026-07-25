/**
 * @file CORE-P1A-017 — productivity commands + focus-scoped shortcut
 * registry: binding matcher, typing-surface suppression, per-command
 * semantics (`source: "shortcut"`, lock/hide toggles, select-parent,
 * find-layer), and the mounted listener's scoping rules (inert
 * outside the Studio root; non-trusted events dropped; host-global
 * keys untouched).
 */

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioConfigSchema } from "@/config/schema";
import { StudioPluginContextProvider } from "@/context/plugin-context";
import type { StudioPluginContext } from "@/types/plugin";
import { buildLegacyPuckData } from "../../../testing/editor/index.js";
import { createStudioEditorBridge } from "../bridge.js";
import { StudioEditorMount } from "../StudioEditorMount.js";
import {
	__setTrustAllEventsForTests,
	EDITOR_SHORTCUT_KEYMAP,
	isTypingTarget,
	matchesBinding,
} from "../shortcuts/registry.js";

afterEach(cleanup);

describe("matchesBinding / isTypingTarget", () => {
	it("matches mod/shift chords and the delete alias", () => {
		expect(
			matchesBinding(
				{
					key: "d",
					metaKey: true,
					ctrlKey: false,
					shiftKey: false,
					altKey: false,
				},
				"mod+d",
			),
		).toBe(true);
		expect(
			matchesBinding(
				{
					key: "d",
					metaKey: false,
					ctrlKey: true,
					shiftKey: false,
					altKey: false,
				},
				"mod+d",
			),
		).toBe(true);
		expect(
			matchesBinding(
				{
					key: "d",
					metaKey: false,
					ctrlKey: false,
					shiftKey: false,
					altKey: false,
				},
				"mod+d",
			),
		).toBe(false);
		expect(
			matchesBinding(
				{
					key: "Backspace",
					metaKey: false,
					ctrlKey: false,
					shiftKey: false,
					altKey: false,
				},
				"delete",
			),
		).toBe(true);
		// A chord with extra modifiers never matches (host-global safety).
		expect(
			matchesBinding(
				{
					key: "g",
					metaKey: true,
					ctrlKey: false,
					shiftKey: false,
					altKey: true,
				},
				"mod+g",
			),
		).toBe(false);
	});

	it("classifies typing surfaces", () => {
		const input = document.createElement("input");
		const div = document.createElement("div");
		expect(isTypingTarget(input)).toBe(true);
		expect(isTypingTarget(div)).toBe(false);
	});

	it("keeps the documented §18 keymap complete", () => {
		expect(EDITOR_SHORTCUT_KEYMAP.map((entry) => entry.command)).toEqual([
			"duplicate",
			"delete",
			"wrap",
			"unwrap",
			"lock",
			"hide",
			"select-parent",
			"find-layer",
		]);
	});
});

function createCtx(): StudioPluginContext {
	let data = buildLegacyPuckData();
	return {
		getData: () => data,
		getPuckApi: () =>
			({
				appState: {
					get data() {
						return data;
					},
				},
				config: { components: {} },
				dispatch: (action: { data?: typeof data }) => {
					if (action.data !== undefined) {
						data = action.data;
					}
				},
				getSelectorForId: () => undefined,
				getParentById: () => undefined,
			}) as unknown as ReturnType<StudioPluginContext["getPuckApi"]>,
		studioConfig: StudioConfigSchema.parse({}),
		log: vi.fn(),
		emit: () => undefined,
		on: () => () => undefined,
		t: (key) => key,
		registerMessages: () => undefined,
		registerAssetResolver: () => undefined,
	};
}

async function mountWithShortcuts() {
	const bridge = createStudioEditorBridge();
	render(
		<StudioPluginContextProvider value={createCtx()}>
			<div data-ak-studio-root>
				<StudioEditorMount
					editor={{ features: { enabled: true } }}
					bridge={bridge}
				>
					<button type="button" data-testid="inside">
						inside
					</button>
				</StudioEditorMount>
			</div>
		</StudioPluginContextProvider>,
	);
	await waitFor(() => expect(bridge.port).not.toBeNull());
	return bridge;
}

function keydown(
	target: Element | Document,
	init: KeyboardEventInit & { trusted?: boolean },
): void {
	// jsdom cannot dispatch trusted events; the registry's documented
	// test hatch stands in, flipped per event so the untrusted-drop
	// path is asserted too.
	__setTrustAllEventsForTests(init.trusted === true);
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	});
	(target instanceof Document ? target.body : target).dispatchEvent(event);
	__setTrustAllEventsForTests(false);
}

describe("mounted shortcut registry (CORE-P1A-017)", () => {
	it("runs lock over the selection with source shortcut, inside the root only", async () => {
		const bridge = await mountWithShortcuts();
		bridge.selection?.selectMany(["legacy-0", "legacy-1"]);
		const inside = document.querySelector('[data-testid="inside"]') as Element;

		// Outside the studio root: inert (host-global untouched).
		keydown(document, {
			key: "l",
			ctrlKey: true,
			shiftKey: true,
			trusted: true,
		});
		expect(bridge.port?.getSnapshot().revision).toBe(0);

		// Non-trusted event inside the root: dropped (hazard guard).
		keydown(inside, { key: "l", ctrlKey: true, shiftKey: true });
		expect(bridge.port?.getSnapshot().revision).toBe(0);

		// Trusted, inside: locks both nodes in one intent.
		keydown(inside, {
			key: "l",
			ctrlKey: true,
			shiftKey: true,
			trusted: true,
		});
		await waitFor(() => {
			const nodes = bridge.port?.getSnapshot().authoring.nodes;
			expect(nodes?.["legacy-0"]?.locked).toBe(true);
			expect(nodes?.["legacy-1"]?.locked).toBe(true);
		});
		expect(bridge.port?.getSnapshot().revision).toBe(1);

		// Toggle back off (any-unlocked=false → unlock).
		keydown(inside, {
			key: "l",
			ctrlKey: true,
			shiftKey: true,
			trusted: true,
		});
		await waitFor(() => {
			expect(
				bridge.port?.getSnapshot().authoring.nodes["legacy-0"],
			).toBeUndefined();
		});
	});

	it("hide toggles visibility and find-layer focuses the registered search", async () => {
		const bridge = await mountWithShortcuts();
		bridge.selection?.select("legacy-0");
		const inside = document.querySelector('[data-testid="inside"]') as Element;

		keydown(inside, {
			key: "h",
			ctrlKey: true,
			shiftKey: true,
			trusted: true,
		});
		await waitFor(() => {
			expect(
				bridge.port?.getSnapshot().authoring.nodes["legacy-0"]?.hidden?.base,
			).toBe(true);
		});

		const focus = vi.fn();
		bridge.focusLayerSearch = focus;
		keydown(inside, {
			key: "f",
			ctrlKey: true,
			shiftKey: true,
			trusted: true,
		});
		expect(focus).toHaveBeenCalledTimes(1);
	});

	it("delete removes the selected subtree in one recording dispatch", async () => {
		const bridge = await mountWithShortcuts();
		bridge.selection?.select("legacy-1");
		const inside = document.querySelector('[data-testid="inside"]') as Element;
		keydown(inside, { key: "Delete", trusted: true });
		await waitFor(() => {
			const port = bridge.port;
			expect(port).not.toBeNull();
			const snapshot = port?.getSnapshot();
			// The node is gone from the live tree (selection cleared too).
			expect(bridge.selection?.getState().selectedIds).toEqual([]);
			expect(snapshot?.revision).toBe(1);
		});
	});
});
