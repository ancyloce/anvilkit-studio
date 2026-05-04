/**
 * @file Tests for `InsertSearchBar` — verifies the 150 ms debounce
 * before the input value is committed to `drawerSearch` (PRD §5.4).
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	useEditorUiStore,
} from "../../../../../state/index.js";
import { InsertSearchBar } from "../InsertSearchBar.js";

afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

function Probe({ onValue }: { readonly onValue: (v: string) => void }): null {
	const value = useEditorUiStore((s) => s.drawerSearch);
	onValue(value);
	return null;
}

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return (
		<EditorI18nStoreProvider>
			<EditorUiStoreProvider
				storeId={`search-${Math.random().toString(36).slice(2)}`}
			>
				{children}
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

describe("InsertSearchBar", () => {
	it("does not write to drawerSearch until the 150 ms debounce flushes", () => {
		vi.useFakeTimers();
		let latest = "";
		render(
			<Setup>
				<Probe onValue={(v) => (latest = v)} />
				<InsertSearchBar />
			</Setup>,
		);
		const input = screen.getByRole("searchbox");
		act(() => {
			fireEvent.change(input, { target: { value: "but" } });
		});

		// Debounce window not flushed → store value still empty.
		expect(latest).toBe("");

		act(() => {
			vi.advanceTimersByTime(149);
		});
		expect(latest).toBe("");

		act(() => {
			vi.advanceTimersByTime(1); // 150ms total
		});
		expect(latest).toBe("but");
	});

	it("only commits the latest value when the user keeps typing within the debounce window", () => {
		vi.useFakeTimers();
		let latest = "";
		render(
			<Setup>
				<Probe onValue={(v) => (latest = v)} />
				<InsertSearchBar />
			</Setup>,
		);
		const input = screen.getByRole("searchbox");
		act(() => {
			fireEvent.change(input, { target: { value: "b" } });
		});
		act(() => {
			vi.advanceTimersByTime(50);
		});
		act(() => {
			fireEvent.change(input, { target: { value: "bu" } });
		});
		act(() => {
			vi.advanceTimersByTime(50);
		});
		act(() => {
			fireEvent.change(input, { target: { value: "but" } });
		});
		act(() => {
			vi.advanceTimersByTime(149);
		});
		expect(latest).toBe(""); // still in flight
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(latest).toBe("but");
	});
});
