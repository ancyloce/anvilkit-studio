import type { CanvasAssetUploader } from "@anvilkit/canvas-editor";
import {
	type DataUrlUploaderOptions,
	dataUrlUploader,
} from "@anvilkit/plugin-asset-manager";

/**
 * PRD 0012 FR-091/§15.16: bridge the asset manager's data-URL upload adapter
 * to the canvas editor's `CanvasAssetUploader` contract, powering
 * drag-and-drop and the Uploads dock panel on both canvas mounts (the
 * standalone `/studio/canvas/[pageId]` route and the Puck overlay via
 * `plugin-canvas-studio`).
 *
 * Ids are re-minted as UUIDs: the adapter's per-instance `asset-N` counter
 * restarts every mount while documents persist, so colliding ids would
 * silently clobber earlier uploads in `ir.assets`.
 *
 * The default 1 MB raw-file cap is deliberate — both mounts persist the IR
 * (data URLs inline) to `localStorage`, whose ~5 MB quota a larger cap would
 * blow through on a single upload. Oversized files surface as failed upload
 * tasks with retry, not silent drops.
 */
export function createDataUrlCanvasUploader(
	options: DataUrlUploaderOptions = {},
): CanvasAssetUploader {
	const adapt = dataUrlUploader(options);
	return {
		upload: (files) =>
			Promise.all(
				files.map(async (file) => {
					const uploaded = await adapt(file);
					return {
						id: crypto.randomUUID(),
						uri: uploaded.url,
						...(uploaded.meta?.mimeType
							? { mimeType: uploaded.meta.mimeType }
							: {}),
						...(uploaded.meta?.width !== undefined &&
						uploaded.meta?.height !== undefined
							? { width: uploaded.meta.width, height: uploaded.meta.height }
							: {}),
					};
				}),
			),
	};
}
