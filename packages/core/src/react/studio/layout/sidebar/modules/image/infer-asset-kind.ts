/**
 * @file Map a `StudioAssetKind` to the Puck component type the
 * sidebar dispatches when the user clicks a tile.
 *
 * Insertion uses these names directly; `LayerModule` and the
 * `image` module both treat them as opaque string keys that may or
 * may not exist in the host's `puckConfig.components` map. The
 * sidebar guards against missing keys before dispatching.
 */

import type { StudioAssetKind } from "@/types/sidebar";

export function kindToComponentName(kind: StudioAssetKind): string | null {
	switch (kind) {
		case "image":
			return "Image";
		case "video":
			return "Video";
		case "audio":
			return "Audio";
		default:
			return null;
	}
}

export function kindToPropsForInsert(
	kind: StudioAssetKind,
	url: string,
	name: string,
): Readonly<Record<string, unknown>> {
	switch (kind) {
		case "image":
			return { src: url, alt: name };
		case "video":
			return { src: url, title: name };
		case "audio":
			return { src: url, title: name };
		default:
			return {};
	}
}
