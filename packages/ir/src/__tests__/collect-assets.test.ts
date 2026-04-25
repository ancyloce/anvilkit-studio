import type { PageIRNode } from "@anvilkit/core/types";
import { describe, expect, it } from "vitest";
import { collectAssets } from "../collect-assets.js";

/** Helper to build a minimal node for testing. */
function node(
	props: Record<string, unknown>,
	children?: PageIRNode[],
): PageIRNode {
	return {
		id: "test-1",
		type: "Test",
		props,
		...(children ? { children } : {}),
	};
}

describe("collectAssets", () => {
	// ----- Kind detection branches -----

	it("detects image assets by extension (png, jpg, jpeg, webp, avif, gif, svg)", () => {
		const extensions = [
			"photo.png",
			"photo.jpg",
			"photo.jpeg",
			"photo.webp",
			"photo.avif",
			"photo.gif",
			"icon.svg",
		];
		for (const filename of extensions) {
			const assets = collectAssets(
				node({ src: `https://cdn.example.com/${filename}` }),
			);
			expect(assets).toHaveLength(1);
			expect(assets[0]!.kind).toBe("image");
		}
	});

	it("detects video assets by extension (mp4, webm)", () => {
		for (const ext of ["mp4", "webm"]) {
			const assets = collectAssets(
				node({ src: `https://cdn.example.com/video.${ext}` }),
			);
			expect(assets).toHaveLength(1);
			expect(assets[0]!.kind).toBe("video");
		}
	});

	it("detects font assets by extension (woff, woff2, ttf, otf, eot)", () => {
		for (const ext of ["woff", "woff2", "ttf", "otf", "eot"]) {
			const assets = collectAssets(
				node({ fontUrl: `https://cdn.example.com/font.${ext}` }),
			);
			expect(assets).toHaveLength(1);
			expect(assets[0]!.kind).toBe("font");
		}
	});

	it("detects script assets (.js)", () => {
		const assets = collectAssets(
			node({ scriptUrl: "https://cdn.example.com/bundle.js" }),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.kind).toBe("script");
	});

	it("detects style assets (.css)", () => {
		const assets = collectAssets(
			node({ styleUrl: "https://cdn.example.com/style.css" }),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.kind).toBe("style");
	});

	it('classifies unknown extensions as "other"', () => {
		const assets = collectAssets(
			node({ src: "https://cdn.example.com/file.bin" }),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.kind).toBe("other");
	});

	it("handles URLs with query parameters", () => {
		const assets = collectAssets(
			node({
				imageUrl: "https://images.unsplash.com/photo-123.jpg?w=500&auto=format",
			}),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.kind).toBe("image");
	});

	// ----- Prop key patterns -----

	it("collects from src, imageUrl, imageSrc, url, videoUrl, videoSrc keys", () => {
		const keys = ["src", "imageUrl", "imageSrc", "url", "videoUrl", "videoSrc"];
		for (const key of keys) {
			const assets = collectAssets(
				node({ [key]: "https://cdn.example.com/photo.png" }),
			);
			expect(
				assets.length,
				`expected asset from key "${key}"`,
			).toBeGreaterThanOrEqual(1);
		}
	});

	it("ignores href keys (navigation, not assets)", () => {
		const assets = collectAssets(node({ href: "https://example.com/page" }));
		expect(assets).toHaveLength(0);
	});

	// ----- Deduplication -----

	it("deduplicates identical URLs across props", () => {
		const url = "https://cdn.example.com/shared.png";
		const assets = collectAssets(
			node({
				src: url,
				imageUrl: url,
			}),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.url).toBe(url);
	});

	it("deduplicates across parent and children", () => {
		const url = "https://cdn.example.com/shared.png";
		const assets = collectAssets(node({ src: url }, [node({ src: url })]));
		expect(assets).toHaveLength(1);
	});

	it("finds assets on grandchildren", () => {
		const assets = collectAssets(
			node({}, [
				node({}, [
					node({
						src: "https://cdn.example.com/grandchild.png",
					}),
				]),
			]),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.url).toBe("https://cdn.example.com/grandchild.png");
	});

	// ----- Determinism -----

	it("produces the same ids for the same input across two calls", () => {
		const n = node({ src: "https://cdn.example.com/photo.png" });
		const a1 = collectAssets(n);
		const a2 = collectAssets(n);
		expect(a1[0]!.id).toBe(a2[0]!.id);
	});

	it("produces different ids for different URLs", () => {
		const a1 = collectAssets(node({ src: "https://cdn.example.com/a.png" }));
		const a2 = collectAssets(node({ src: "https://cdn.example.com/b.png" }));
		expect(a1[0]!.id).not.toBe(a2[0]!.id);
	});

	// ----- Recursive walking -----

	it("finds assets in nested arrays (e.g. avatars[].imageUrl)", () => {
		const assets = collectAssets(
			node({
				avatars: [
					{
						name: "Alice",
						imageUrl: "https://cdn.example.com/alice.jpg",
					},
					{
						name: "Bob",
						imageUrl: "https://cdn.example.com/bob.jpg",
					},
				],
			}),
		);
		expect(assets).toHaveLength(2);
		expect(assets.map((a) => a.kind)).toEqual(["image", "image"]);
	});

	it("finds assets in deeply nested objects", () => {
		const assets = collectAssets(
			node({
				section: {
					hero: {
						background: {
							src: "https://cdn.example.com/bg.webp",
						},
					},
				},
			}),
		);
		expect(assets).toHaveLength(1);
		expect(assets[0]!.kind).toBe("image");
	});

	// ----- Defensive behavior -----

	it("silently skips non-string values for asset keys", () => {
		const assets = collectAssets(
			node({ src: 42, imageUrl: null, imageSrc: undefined }),
		);
		expect(assets).toHaveLength(0);
	});

	it("silently skips empty string values", () => {
		const assets = collectAssets(node({ src: "", imageUrl: "" }));
		expect(assets).toHaveLength(0);
	});

	it("returns empty array for a node with no asset references", () => {
		const assets = collectAssets(
			node({ title: "Hello", description: "World" }),
		);
		expect(assets).toHaveLength(0);
	});

	// ----- Custom id derivation -----

	it("accepts a custom deriveId function", () => {
		let counter = 0;
		const assets = collectAssets(
			node({ src: "https://cdn.example.com/photo.png" }),
			{ deriveId: () => `custom-${++counter}` },
		);
		expect(assets[0]!.id).toBe("custom-1");
	});
});
