/**
 * @file Tests for the layer-module `Splitter`.
 *
 * Drives keyboard nudges and verifies the ARIA separator semantics.
 * Pointer-drag math is environmental (depends on layout rectangles)
 * and is exercised by the demo manual pass + future Playwright spec.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { Splitter } from "@/layout/sidebar/shared/Splitter";
import {
	EditorI18nStoreProvider,
	EditorUiStoreProvider,
	useEditorUiStore,
} from "@/state/index";

afterEach(cleanup);

function Setup({
	children,
}: {
	readonly children: ReactElement;
}): ReactElement {
	return (
		<EditorI18nStoreProvider>
			<EditorUiStoreProvider
				storeId={`splitter-${Math.random().toString(36).slice(2)}`}
			>
				{children}
			</EditorUiStoreProvider>
		</EditorI18nStoreProvider>
	);
}

function RatioProbe(): ReactElement {
	const ratio = useEditorUiStore((s) => s.layerSplitRatio);
	return <span data-testid="ratio-probe">{ratio.toFixed(4)}</span>;
}

describe("Splitter", () => {
	it("renders an ARIA horizontal separator with the live ratio", () => {
		render(
			<Setup>
				<Splitter />
			</Setup>,
		);
		const splitter = screen.getByTestId("ak-layer-splitter");
		expect(splitter.getAttribute("role")).toBe("separator");
		expect(splitter.getAttribute("aria-orientation")).toBe("horizontal");
		expect(splitter.getAttribute("aria-valuemin")).toBe("0.15");
		expect(splitter.getAttribute("aria-valuemax")).toBe("0.85");
		expect(splitter.getAttribute("aria-valuenow")).toBe("0.4");
	});

	it("nudges the ratio down on ArrowUp and up on ArrowDown", () => {
		render(
			<Setup>
				<>
					<RatioProbe />
					<Splitter />
				</>
			</Setup>,
		);
		const splitter = screen.getByTestId("ak-layer-splitter");
		expect(screen.getByTestId("ratio-probe").textContent).toBe("0.4000");

		fireEvent.keyDown(splitter, { key: "ArrowDown" });
		expect(screen.getByTestId("ratio-probe").textContent).toBe("0.4200");

		fireEvent.keyDown(splitter, { key: "ArrowUp" });
		expect(screen.getByTestId("ratio-probe").textContent).toBe("0.4000");
	});

	it("resolves the localized aria-label by default", () => {
		render(
			<Setup>
				<Splitter />
			</Setup>,
		);
		const splitter = screen.getByTestId("ak-layer-splitter");
		expect(splitter.getAttribute("aria-label")).toBe(
			"Resize Pages and Layers panels",
		);
	});

	it("respects an explicit ariaLabel prop override", () => {
		render(
			<Setup>
				<Splitter ariaLabel="Custom label" />
			</Setup>,
		);
		expect(
			screen.getByTestId("ak-layer-splitter").getAttribute("aria-label"),
		).toBe("Custom label");
	});

	it("flips data-dragging on pointer drag and clears it on release", () => {
		render(
			<Setup>
				<Splitter />
			</Setup>,
		);
		const splitter = screen.getByTestId("ak-layer-splitter");
		expect(splitter.getAttribute("data-dragging")).toBeNull();

		fireEvent.pointerDown(splitter, { pointerId: 1, clientY: 100 });
		expect(splitter.getAttribute("data-dragging")).toBe("true");

		fireEvent.pointerUp(splitter, { pointerId: 1, clientY: 120 });
		expect(splitter.getAttribute("data-dragging")).toBeNull();
	});

	it("suppresses Puck preview iframe pointer-events during drag", () => {
		const iframe = document.createElement("iframe");
		iframe.id = "preview-frame-test";
		iframe.style.pointerEvents = "auto";
		document.body.appendChild(iframe);
		try {
			render(
				<Setup>
					<Splitter />
				</Setup>,
			);
			const splitter = screen.getByTestId("ak-layer-splitter");
			fireEvent.pointerDown(splitter, { pointerId: 1, clientY: 100 });
			expect(iframe.style.pointerEvents).toBe("none");
			fireEvent.pointerUp(splitter, { pointerId: 1, clientY: 120 });
			expect(iframe.style.pointerEvents).toBe("auto");
		} finally {
			iframe.remove();
		}
	});

	it("clamps to 0.15 on Home and 0.85 on End", () => {
		render(
			<Setup>
				<>
					<RatioProbe />
					<Splitter />
				</>
			</Setup>,
		);
		const splitter = screen.getByTestId("ak-layer-splitter");
		fireEvent.keyDown(splitter, { key: "End" });
		expect(screen.getByTestId("ratio-probe").textContent).toBe("0.8500");
		fireEvent.keyDown(splitter, { key: "Home" });
		expect(screen.getByTestId("ratio-probe").textContent).toBe("0.1500");
	});
});
