/**
 * @file Regression test: dragging an asset tile encodes the asset's REAL url
 * into the drag payload (so a hotlinked external/Unsplash asset renders when
 * dropped, instead of an unresolvable `asset://` ref), and fires
 * `onDragStartAsset` so the host can run the source's pick side effects (e.g.
 * Unsplash's MANDATORY download trigger) that the drag path would otherwise
 * skip.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssetImageTile } from "@/layout/sidebar/modules/image/AssetImageTile";
import type { StudioAsset } from "@/types/sidebar";

afterEach(cleanup);

// Mirrors a composite-projected Unsplash asset: a hotlinked, directly-usable
// url (NOT an `asset://<id>` reference) plus external provenance.
const UNSPLASH_ASSET: StudioAsset = {
	id: "unsplash:p1",
	name: "Mountain",
	url: "https://images.unsplash.com/photo-1?ixid=abc",
	kind: "image",
	source: "unsplash",
};

function fireDragStart(el: Element): { setData: ReturnType<typeof vi.fn> } {
	const store: Record<string, string> = {};
	const dataTransfer = {
		setData: vi.fn((type: string, value: string) => {
			store[type] = value;
		}),
		getData: (type: string) => store[type] ?? "",
		setDragImage: vi.fn(),
		effectAllowed: "",
		types: [] as string[],
	};
	fireEvent.dragStart(el, { dataTransfer });
	return dataTransfer;
}

describe("AssetImageTile — drag", () => {
	it("encodes the real hotlink url (never an asset:// ref) into the payload", () => {
		render(
			<AssetImageTile
				asset={UNSPLASH_ASSET}
				onClick={vi.fn()}
				renderMenu={() => null}
			/>,
		);
		const dt = fireDragStart(
			screen.getByRole("button", { name: UNSPLASH_ASSET.name }),
		);
		const encoded = dt.setData.mock.calls.map((c) => String(c[1])).join("\n");
		expect(encoded).toContain("https://images.unsplash.com/photo-1?ixid=abc");
		expect(encoded).not.toContain("asset://");
	});

	it("fires onDragStartAsset so the host can run the Unsplash download trigger", () => {
		const onDragStartAsset = vi.fn();
		render(
			<AssetImageTile
				asset={UNSPLASH_ASSET}
				onClick={vi.fn()}
				onDragStartAsset={onDragStartAsset}
				renderMenu={() => null}
			/>,
		);
		fireDragStart(screen.getByRole("button", { name: UNSPLASH_ASSET.name }));
		expect(onDragStartAsset).toHaveBeenCalledWith(UNSPLASH_ASSET);
	});
});

describe("AssetImageTile — attribution link safety (P1)", () => {
	function withAttribution(
		photographerUrl: string,
		sourceUrl: string,
	): StudioAsset {
		return {
			...UNSPLASH_ASSET,
			attribution: {
				photographerName: "Ansel Adams",
				photographerUrl,
				sourceUrl,
			},
		};
	}

	it("renders safe http(s) attribution URLs as real links", () => {
		render(
			<AssetImageTile
				asset={withAttribution(
					"https://unsplash.com/@ansel",
					"https://unsplash.com/",
				)}
				onClick={vi.fn()}
				renderMenu={() => null}
			/>,
		);
		const attribution = screen.getByTestId("ak-image-attribution");
		const anchors = attribution.querySelectorAll("a");
		expect(anchors).toHaveLength(2);
		expect(anchors[0]?.getAttribute("href")).toBe(
			"https://unsplash.com/@ansel",
		);
		expect(anchors[1]?.getAttribute("href")).toBe("https://unsplash.com/");
	});

	it("does NOT render unsafe-scheme attribution URLs as hrefs (degrades to text)", () => {
		render(
			<AssetImageTile
				asset={withAttribution(
					"javascript:alert(1)",
					"data:text/html,<script>alert(1)</script>",
				)}
				onClick={vi.fn()}
				renderMenu={() => null}
			/>,
		);
		const attribution = screen.getByTestId("ak-image-attribution");
		// No anchors at all — both schemes are rejected.
		expect(attribution.querySelectorAll("a")).toHaveLength(0);
		// The photographer name is still shown, just as inert text.
		expect(attribution.textContent).toContain("Ansel Adams");
	});

	it("vets each link independently (unsafe photographer, safe source)", () => {
		render(
			<AssetImageTile
				asset={withAttribution("javascript:alert(1)", "https://unsplash.com/")}
				onClick={vi.fn()}
				renderMenu={() => null}
			/>,
		);
		const attribution = screen.getByTestId("ak-image-attribution");
		const anchors = attribution.querySelectorAll("a");
		// Only the safe source link survives.
		expect(anchors).toHaveLength(1);
		expect(anchors[0]?.getAttribute("href")).toBe("https://unsplash.com/");
		expect(attribution.textContent).toContain("Ansel Adams");
	});
});
