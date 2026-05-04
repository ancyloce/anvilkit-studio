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

import {
	EditorUiStoreProvider,
	useEditorUiStore,
} from "../../../../state/index.js";
import { Splitter } from "../Splitter.js";

afterEach(cleanup);

function Setup({ children }: { readonly children: ReactElement }): ReactElement {
	return (
		<EditorUiStoreProvider
			storeId={`splitter-${Math.random().toString(36).slice(2)}`}
		>
			{children}
		</EditorUiStoreProvider>
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
