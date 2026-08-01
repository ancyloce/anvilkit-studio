import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import * as React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ColorRow } from "../color-picker";

afterEach(() => {
	cleanup();
});

const DISC_RADIUS = 84;

/** Pointer-drags the hue/saturation disc from its centre out to `(x, y)`. */
function dragDisc(points: Array<[number, number]>) {
	const disc = screen.getByLabelText("Hue and saturation");
	fireEvent.pointerDown(disc, {
		pointerId: 1,
		clientX: DISC_RADIUS,
		clientY: DISC_RADIUS,
		buttons: 1,
	});
	for (const [clientX, clientY] of points) {
		fireEvent.pointerMove(disc, {
			pointerId: 1,
			clientX,
			clientY,
			buttons: 1,
			pointerType: "mouse",
		});
	}
}

describe("ColorRow live drag", () => {
	it("updates the popover's own hex readout on every pointer move when the host only previews", async () => {
		// A preview-only host: it records changes but never feeds `value` back,
		// which is exactly what the canvas inspector's ColorField does.
		const onValueChange = vi.fn();
		render(
			<ColorRow
				label="Fill"
				value="#3366ff"
				onValueChange={onValueChange}
				data-testid="fill"
			/>,
		);
		fireEvent.click(screen.getByTestId("fill"));
		const hex = (await screen.findByTestId("fill-hex")) as HTMLInputElement;

		dragDisc([
			[DISC_RADIUS + 40, DISC_RADIUS],
			[DISC_RADIUS + 60, DISC_RADIUS + 20],
		]);

		expect(onValueChange.mock.calls.length).toBeGreaterThanOrEqual(2);
		const emitted = onValueChange.mock.calls.map((c) => c[0] as string);
		const last = emitted.at(-1) as string;
		expect(last).not.toBe("#3366ff");
		// Successive moves must keep producing NEW colors, not re-emit the
		// value the picker was reset back to.
		expect(new Set(emitted).size).toBeGreaterThan(1);
		// The picker must show what it just emitted — not snap back to the
		// stale `value` prop the previewing host never updated.
		expect(hex.value).toBe(last);
	});

	it("keeps advancing when the host echoes each emitted value straight back", async () => {
		// The other host shape: fully controlled, `value` follows every change.
		// The echo must not re-derive HSV from hex, or the lossy round-trip
		// drags the thumb back toward where it started.
		const emitted: string[] = [];
		function Controlled() {
			const [color, setColor] = React.useState("#3366ff");
			return (
				<ColorRow
					label="Fill"
					value={color}
					onValueChange={(next) => {
						emitted.push(next);
						setColor(next);
					}}
					data-testid="fill"
				/>
			);
		}
		render(<Controlled />);
		fireEvent.click(screen.getByTestId("fill"));
		const hex = (await screen.findByTestId("fill-hex")) as HTMLInputElement;

		dragDisc([
			[DISC_RADIUS + 40, DISC_RADIUS],
			[DISC_RADIUS + 60, DISC_RADIUS + 20],
			[DISC_RADIUS + 70, DISC_RADIUS + 30],
		]);

		expect(new Set(emitted).size).toBeGreaterThan(1);
		expect(hex.value).toBe(emitted.at(-1));
	});

	it("still tracks an externally changed value prop", async () => {
		const { rerender } = render(
			<ColorRow
				label="Fill"
				value="#000000"
				onValueChange={vi.fn()}
				data-testid="fill"
			/>,
		);
		fireEvent.click(screen.getByTestId("fill"));
		const hex = (await screen.findByTestId("fill-hex")) as HTMLInputElement;
		expect(hex.value).toBe("#000000");

		rerender(
			<ColorRow
				label="Fill"
				value="#ff0000"
				onValueChange={vi.fn()}
				data-testid="fill"
			/>,
		);
		expect(hex.value).toBe("#ff0000");
	});
});
