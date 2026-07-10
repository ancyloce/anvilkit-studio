/**
 * @file Regression tests for review finding H2: render-time Puck reads
 * must use a reactive `createUsePuck()` selector, not a non-subscribing
 * `useGetPuck()` snapshot. Asserts `EditorOutline`, `useBreadcrumbs`,
 * and `ComponentOverlay` re-render when the relevant Puck state slice
 * changes.
 *
 * The `@puckeditor/core` mock backs `createUsePuck()` with a real
 * `useSyncExternalStore` subscription so mutating the shared state and
 * notifying listeners actually re-renders subscribed components — the
 * behavior the old snapshot reads lacked.
 */

import {
	act,
	cleanup,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { type ReactNode, useSyncExternalStore } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface MockPuckState {
	selectedItem: { type: string; props: Record<string, unknown> } | null;
	appState: {
		ui: { itemSelector: { index: number; zone?: string } | null };
		data: { content: { type: string; props: { id: string } }[] };
	};
	getSelectorForId: (id: string) => { index: number; zone: string } | undefined;
}

let puckState: MockPuckState;
const listeners = new Set<() => void>();

function setPuckState(next: MockPuckState): void {
	puckState = next;
	for (const l of listeners) l();
}

vi.mock("@puckeditor/core", () => ({
	Puck: { Outline: () => <div data-testid="outline-mock" /> },
	createUsePuck:
		() =>
		<T,>(selector: (s: MockPuckState) => T): T =>
			useSyncExternalStore(
				(cb) => {
					listeners.add(cb);
					return () => listeners.delete(cb);
				},
				() => selector(puckState),
				() => selector(puckState),
			),
}));

import { ComponentOverlay } from "@/overrides/canvas/ComponentOverlay";
import { EditorOutline } from "@/overrides/layout/EditorOutline";
import { useBreadcrumbs } from "@/overrides/utils/breadcrumbs";
import { EditorI18nProvider } from "@/state/index";

function freshState(): MockPuckState {
	return {
		selectedItem: null,
		appState: { ui: { itemSelector: null }, data: { content: [] } },
		getSelectorForId: () => undefined,
	};
}

beforeEach(() => {
	puckState = freshState();
});

afterEach(() => {
	cleanup();
	listeners.clear();
});

function I18n({ children }: { children: ReactNode }): ReactNode {
	return <EditorI18nProvider>{children}</EditorI18nProvider>;
}

describe("EditorOutline reacts to selection changes", () => {
	it("updates the selection summary when selectedItem changes", () => {
		render(
			<I18n>
				<EditorOutline />
			</I18n>,
		);
		// Nothing selected yet.
		expect(screen.queryByText("Hero")).toBeNull();

		act(() => {
			setPuckState({
				...freshState(),
				selectedItem: { type: "Hero", props: { id: "h-1" } },
			});
		});
		expect(screen.getByText("Hero")).toBeTruthy();
	});
});

describe("useBreadcrumbs reacts to selection changes", () => {
	it("recomputes the chain when itemSelector changes", () => {
		const { result } = renderHook(() => useBreadcrumbs());
		expect(result.current).toEqual([]);

		act(() => {
			setPuckState({
				selectedItem: null,
				appState: {
					ui: { itemSelector: { index: 0, zone: "default-zone" } },
					data: { content: [{ type: "Hero", props: { id: "h-1" } }] },
				},
				getSelectorForId: () => undefined,
			});
		});

		expect(result.current.map((e) => e.label)).toEqual(["Root", "Hero"]);
	});
});

describe("ComponentOverlay reacts to tree position changes", () => {
	it("flips label placement when the component becomes/stops being topmost in root", () => {
		const { container } = render(
			<ComponentOverlay
				hover={false}
				isSelected
				componentId="c-1"
				componentType="Hero"
			>
				<div />
			</ComponentOverlay>,
		);
		const overlay = () =>
			container.querySelector("[data-ak-overlay]") as HTMLElement;
		// Not topmost initially (getSelectorForId → undefined).
		expect(overlay().getAttribute("data-label-position")).toBe("above");

		act(() => {
			setPuckState({
				...freshState(),
				getSelectorForId: () => ({
					index: 0,
					zone: "root:default-zone",
				}),
			});
		});
		expect(overlay().getAttribute("data-label-position")).toBe("inside");
	});
});
