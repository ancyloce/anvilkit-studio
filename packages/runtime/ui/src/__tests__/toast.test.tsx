import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
	createToastManager,
	ToastProvider,
	Toasts,
	ToastViewport,
} from "../toast";

afterEach(() => {
	cleanup();
});

function mountToasts() {
	const manager = createToastManager();
	render(
		<ToastProvider toastManager={manager}>
			<ToastViewport>
				<Toasts />
			</ToastViewport>
		</ToastProvider>,
	);
	return manager;
}

describe("Toast", () => {
	it("renders a toast added through the imperative manager", async () => {
		const manager = mountToasts();
		act(() => {
			manager.add({ title: "Saved", description: "All changes stored." });
		});
		await waitFor(() => {
			expect(screen.getByText("Saved")).toBeTruthy();
		});
		expect(screen.getByText("All changes stored.")).toBeTruthy();
	});

	it("stamps the toast type as a data attribute for styling", async () => {
		const manager = mountToasts();
		act(() => {
			manager.add({ title: "Nope", type: "error" });
		});
		await waitFor(() => {
			expect(screen.getByText("Nope")).toBeTruthy();
		});
		const root = document.querySelector('[data-slot="toast"]');
		expect(root?.getAttribute("data-type")).toBe("error");
	});

	it("closes a toast via manager.close", async () => {
		const manager = mountToasts();
		let id = "";
		act(() => {
			id = manager.add({ title: "Ephemeral" });
		});
		await waitFor(() => {
			expect(screen.getByText("Ephemeral")).toBeTruthy();
		});
		act(() => {
			manager.close(id);
		});
		await waitFor(() => {
			expect(screen.queryByText("Ephemeral")).toBeNull();
		});
	});
});
