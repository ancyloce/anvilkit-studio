/** Grid-track row identity must survive deletion, including equal values. */

import type { GridTrack, GridTrackList } from "@anvilkit/contracts/editor";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { EditorI18nProvider } from "@/state/editor-i18n-context";
import type { StyleFieldHandle } from "../handle.js";
import { GridTracksControl } from "../tracks.js";

afterEach(cleanup);

const EQUAL_TRACKS: GridTrackList = [
	{ kind: "fr", value: 1 },
	{ kind: "fr", value: 1 },
];

function Harness(): React.ReactNode {
	const [tracks, setTracks] = useState<readonly GridTrack[]>(EQUAL_TRACKS);
	const field: StyleFieldHandle<GridTrackList> = {
		state: {
			kind: "value",
			value: tracks,
			resolved: { value: tracks, source: "base", inherited: false },
			writtenAtLayer: true,
		},
		commit: setTracks,
		reset: () => setTracks([]),
		layer: "base",
	};
	return (
		<EditorI18nProvider>
			<GridTracksControl label="Columns" field={field} />
		</EditorI18nProvider>
	);
}

describe("GridTracksControl row identity", () => {
	it("keeps an equal later track's draft when the first track is removed", () => {
		render(<Harness />);
		const inputs = screen.getAllByLabelText("Track size");
		fireEvent.change(inputs[1] as HTMLInputElement, {
			target: { value: "draft" },
		});
		expect(inputs[1]).toHaveValue("draft");

		fireEvent.click(screen.getAllByLabelText("Remove track")[0] as HTMLElement);

		const remaining = screen.getByLabelText("Track size");
		expect(remaining).toHaveValue("draft");
	});
});
