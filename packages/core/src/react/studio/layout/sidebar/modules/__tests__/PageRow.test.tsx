/**
 * @file Tests for `PageRow` (plan 0004 P2).
 *
 * Locks the capability gating matrix (overflow trigger + per-item
 * visibility), the rename input state machine (Enter / Esc / blur /
 * pending / error / empty), the delete confirm round-trip, and the
 * duplicate pre-select exception (`Promise<StudioPage | void>`).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PageRow } from "@/layout/sidebar/modules/layer/PageRow";
import { EditorI18nStoreProvider } from "@/state/index";
import type { StudioPage } from "@/types/pages";

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactNode }): ReactElement {
	return <EditorI18nStoreProvider>{children}</EditorI18nStoreProvider>;
}

const BASE_PAGE: StudioPage = {
	id: "about",
	title: "About",
};

interface RenderOptions {
	readonly page?: Partial<StudioPage>;
	readonly onSelect?: (id: string) => void;
	readonly onRename?: (input: {
		readonly id: string;
		readonly title: string;
	}) => void | Promise<void>;
	readonly onDelete?: (id: string) => void | Promise<void>;
	readonly onDuplicate?: (id: string) => void | Promise<StudioPage | void>;
	readonly onUpdateSettings?: (input: {
		readonly id: string;
	}) => void | Promise<void>;
}

function renderRow(opts: RenderOptions = {}): {
	page: StudioPage;
	onSelect: ReturnType<typeof vi.fn>;
} {
	const page: StudioPage = { ...BASE_PAGE, ...opts.page };
	const onSelect = vi.fn(opts.onSelect ?? (() => undefined));
	render(
		<Setup>
			<ul>
				<PageRow
					page={page}
					onSelect={onSelect}
					routeBadgeLabel="Route page"
					onRename={opts.onRename}
					onDelete={opts.onDelete}
					onDuplicate={opts.onDuplicate}
					onUpdateSettings={opts.onUpdateSettings}
				/>
			</ul>
		</Setup>,
	);
	return { page, onSelect };
}

const trigger = (id: string): HTMLElement | null =>
	screen.queryByTestId(`ak-layer-page-row-${id}-menu`);

const menuItem = (
	id: string,
	name: "rename" | "duplicate" | "settings" | "delete",
): HTMLElement | null =>
	screen.queryByTestId(`ak-layer-page-row-${id}-menu-${name}`);

describe("PageRow — capability gating", () => {
	it("hides the overflow trigger when no callbacks are provided", () => {
		renderRow();
		expect(trigger("about")).toBeNull();
	});

	it("hides the trigger when only onSelect is wired (read-only)", () => {
		renderRow({ onSelect: vi.fn() });
		expect(trigger("about")).toBeNull();
	});

	it("shows only Rename when only onRename is provided", () => {
		renderRow({ onRename: vi.fn() });
		fireEvent.click(trigger("about") as HTMLElement);
		expect(menuItem("about", "rename")).not.toBeNull();
		expect(menuItem("about", "duplicate")).toBeNull();
		expect(menuItem("about", "settings")).toBeNull();
		expect(menuItem("about", "delete")).toBeNull();
	});

	it("shows only Duplicate when only onDuplicate is provided", () => {
		renderRow({ onDuplicate: vi.fn() });
		fireEvent.click(trigger("about") as HTMLElement);
		expect(menuItem("about", "rename")).toBeNull();
		expect(menuItem("about", "duplicate")).not.toBeNull();
		expect(menuItem("about", "delete")).toBeNull();
	});

	it("shows only Delete when only onDelete is provided", () => {
		renderRow({ onDelete: vi.fn() });
		fireEvent.click(trigger("about") as HTMLElement);
		expect(menuItem("about", "delete")).not.toBeNull();
		expect(menuItem("about", "rename")).toBeNull();
	});

	it("shows only Settings stub when only onUpdateSettings is provided", () => {
		renderRow({ onUpdateSettings: vi.fn() });
		fireEvent.click(trigger("about") as HTMLElement);
		expect(menuItem("about", "settings")).not.toBeNull();
	});

	it("shows Rename + Duplicate + Settings + Delete when all four are provided", () => {
		renderRow({
			onRename: vi.fn(),
			onDuplicate: vi.fn(),
			onDelete: vi.fn(),
			onUpdateSettings: vi.fn(),
		});
		fireEvent.click(trigger("about") as HTMLElement);
		expect(menuItem("about", "rename")).not.toBeNull();
		expect(menuItem("about", "duplicate")).not.toBeNull();
		expect(menuItem("about", "settings")).not.toBeNull();
		expect(menuItem("about", "delete")).not.toBeNull();
	});

	it("suppresses Rename and Delete when page.locked === true, but keeps Duplicate", () => {
		renderRow({
			page: { id: "home", title: "Home", locked: true },
			onRename: vi.fn(),
			onDelete: vi.fn(),
			onDuplicate: vi.fn(),
		});
		fireEvent.click(trigger("home") as HTMLElement);
		expect(menuItem("home", "rename")).toBeNull();
		expect(menuItem("home", "delete")).toBeNull();
		expect(menuItem("home", "duplicate")).not.toBeNull();
	});

	it("hides the trigger entirely when locked and only rename/delete are wired", () => {
		renderRow({
			page: { id: "home", title: "Home", locked: true },
			onRename: vi.fn(),
			onDelete: vi.fn(),
		});
		expect(trigger("home")).toBeNull();
	});
});

describe("PageRow — rename", () => {
	function openRename(): HTMLInputElement {
		fireEvent.click(trigger("about") as HTMLElement);
		fireEvent.click(menuItem("about", "rename") as HTMLElement);
		return screen.getByTestId(
			"ak-layer-page-row-about-rename-input",
		) as HTMLInputElement;
	}

	it("commits on Enter and calls onRename with { id, title }", async () => {
		const onRename = vi.fn().mockResolvedValue(undefined);
		renderRow({ onRename });
		const input = openRename();
		fireEvent.change(input, { target: { value: "About us" } });
		fireEvent.keyDown(input, { key: "Enter" });
		await vi.waitFor(() => {
			expect(onRename).toHaveBeenCalledWith({
				id: "about",
				title: "About us",
			});
		});
	});

	it("cancels on Esc and never calls onRename", () => {
		const onRename = vi.fn();
		renderRow({ onRename });
		const input = openRename();
		fireEvent.change(input, { target: { value: "changed" } });
		fireEvent.keyDown(input, { key: "Escape" });
		expect(onRename).not.toHaveBeenCalled();
		expect(
			screen.queryByTestId("ak-layer-page-row-about-rename-input"),
		).toBeNull();
	});

	it("commits on blur with the trimmed value", async () => {
		const onRename = vi.fn().mockResolvedValue(undefined);
		renderRow({ onRename });
		const input = openRename();
		fireEvent.change(input, { target: { value: "  Trimmed  " } });
		fireEvent.blur(input);
		await vi.waitFor(() => {
			expect(onRename).toHaveBeenCalledWith({
				id: "about",
				title: "Trimmed",
			});
		});
	});

	it("disables the input while onRename is pending", async () => {
		let resolve!: () => void;
		const pending = new Promise<void>((r) => {
			resolve = r;
		});
		const onRename = vi.fn().mockReturnValue(pending);
		renderRow({ onRename });
		const input = openRename();
		fireEvent.change(input, { target: { value: "Wait" } });
		fireEvent.keyDown(input, { key: "Enter" });
		await vi.waitFor(() => {
			expect(
				(
					screen.getByTestId(
						"ak-layer-page-row-about-rename-input",
					) as HTMLInputElement
				).disabled,
			).toBe(true);
		});
		resolve();
		await vi.waitFor(() => {
			expect(
				screen.queryByTestId("ak-layer-page-row-about-rename-input"),
			).toBeNull();
		});
	});

	it("echoes a host error inline and keeps the row in rename mode", async () => {
		const onRename = vi.fn().mockRejectedValue(new Error("title taken"));
		renderRow({ onRename });
		const input = openRename();
		fireEvent.change(input, { target: { value: "duplicate" } });
		fireEvent.keyDown(input, { key: "Enter" });
		const err = await screen.findByTestId(
			"ak-layer-page-row-about-rename-error",
		);
		expect(err.textContent).toBe("title taken");
		expect(
			screen.getByTestId("ak-layer-page-row-about-rename-input"),
		).toBeTruthy();
	});

	it("rejects an empty title with the i18n empty error and never calls onRename", () => {
		const onRename = vi.fn();
		renderRow({ onRename });
		const input = openRename();
		fireEvent.change(input, { target: { value: "   " } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onRename).not.toHaveBeenCalled();
		const err = screen.getByTestId("ak-layer-page-row-about-rename-error");
		expect(err.textContent).toBe("Title cannot be empty.");
	});
});

describe("PageRow — delete", () => {
	it("opens the confirm dialog, fires onDelete on confirm, and closes", async () => {
		const onDelete = vi.fn().mockResolvedValue(undefined);
		renderRow({ onDelete });
		fireEvent.click(trigger("about") as HTMLElement);
		fireEvent.click(menuItem("about", "delete") as HTMLElement);
		const confirm = await screen.findByTestId(
			"ak-layer-page-delete-dialog-about-confirm",
		);
		fireEvent.click(confirm);
		await vi.waitFor(() => {
			expect(onDelete).toHaveBeenCalledWith("about");
		});
	});

	it("does not fire onDelete when the dialog is dismissed", () => {
		const onDelete = vi.fn();
		renderRow({ onDelete });
		fireEvent.click(trigger("about") as HTMLElement);
		fireEvent.click(menuItem("about", "delete") as HTMLElement);
		// Dialog rendered but never confirmed.
		expect(onDelete).not.toHaveBeenCalled();
	});
});

describe("PageRow — duplicate", () => {
	it("pre-selects the returned page id when onDuplicate resolves to a StudioPage", async () => {
		const created: StudioPage = { id: "about-copy", title: "About (copy)" };
		const onDuplicate = vi.fn().mockResolvedValue(created);
		const onSelect = vi.fn();
		renderRow({ onDuplicate, onSelect });
		fireEvent.click(trigger("about") as HTMLElement);
		fireEvent.click(menuItem("about", "duplicate") as HTMLElement);
		await vi.waitFor(() => {
			expect(onDuplicate).toHaveBeenCalledWith("about");
			expect(onSelect).toHaveBeenCalledWith("about-copy");
		});
	});

	it("does not pre-select when onDuplicate resolves to void", async () => {
		const onDuplicate = vi.fn().mockResolvedValue(undefined);
		const onSelect = vi.fn();
		renderRow({ onDuplicate, onSelect });
		fireEvent.click(trigger("about") as HTMLElement);
		fireEvent.click(menuItem("about", "duplicate") as HTMLElement);
		await vi.waitFor(() => {
			expect(onDuplicate).toHaveBeenCalledWith("about");
		});
		expect(onSelect).not.toHaveBeenCalled();
	});
});
