/**
 * @file `image` module body — Assets (PRD §7).
 *
 * Reads the registered `StudioAssetSource` from the per-instance
 * sidebar registry, renders the filter strip + search + asset grid,
 * owns the upload pipeline (header button + drag-drop overlay), and
 * dispatches Puck `setData` actions when the user clicks a tile to
 * insert into the canvas.
 *
 * State shape:
 * - `assets` — local snapshot kept in sync with `source.list()`
 *   via `source.subscribe(refresh)`.
 * - `query`  — debounced search string (PRD §9.3 transient).
 * - `uploadingTiles` — optimistic placeholders rendered while uploads
 *   are in flight (per-file).
 * - `renaming` / `replacing` — the asset currently driving a dialog
 *   or hidden file picker.
 */

import { useGetPuck } from "@puckeditor/core";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

import type {
	StudioAsset,
	StudioAssetUploadEvent,
} from "../../../../../types/sidebar.js";
import { toast } from "sonner";
import { useMsg } from "../../../state/editor-i18n-store.js";
import { useAssetCategoryFilter } from "../../../state/hooks.js";
import { useSidebarRegistry } from "../../../state/sidebar-registry-store-react.js";
import { useSetSidebarHeaderActions } from "../SidebarHeaderActionsContext.js";
import { EmptyState } from "../shared/EmptyState.js";
import { AssetGrid, type UploadingTile } from "./image/AssetGrid.js";
import { ImageFilterStrip } from "./image/ImageFilterStrip.js";
import { ImageSearchBar } from "./image/ImageSearchBar.js";
import { ImageUploadButton } from "./image/ImageUploadButton.js";
import { RenameAssetDialog } from "./image/RenameAssetDialog.js";
import { UploadDropZone } from "./image/UploadDropZone.js";
import {
	kindToComponentName,
	kindToPropsForInsert,
} from "./image/infer-asset-kind.js";

const PROGRESS_INITIAL = 0.05;

export function ImageModule(): ReactNode {
	const msg = useMsg();
	const source = useSidebarRegistry((state) => state.assetSource);
	const pluginActionMap = useSidebarRegistry((state) => state.assetActions);
	const [filter] = useAssetCategoryFilter();
	const [assets, setAssets] = useState<readonly StudioAsset[]>([]);
	const [query, setQuery] = useState("");
	const [uploadingTiles, setUploadingTiles] = useState<readonly UploadingTile[]>(
		[],
	);
	const [renaming, setRenaming] = useState<StudioAsset | null>(null);
	const replacingIdRef = useRef<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const replaceInputRef = useRef<HTMLInputElement | null>(null);
	const getPuck = useGetPuck();

	// Refresh the asset list whenever the source notifies. Mirrors
	// `LayersPanel`'s pages-source effect.
	useEffect(() => {
		if (source === null) {
			setAssets([]);
			return;
		}
		let cancelled = false;
		const refresh = (): void => {
			const result = source.list();
			if (result instanceof Promise) {
				void result.then((next) => {
					if (!cancelled) setAssets(next);
				});
			} else {
				setAssets(result);
			}
		};
		refresh();
		const unsubscribe = source.subscribe?.(refresh);
		return () => {
			cancelled = true;
			unsubscribe?.();
		};
	}, [source]);

	const pluginActions = useMemo(
		() => [...pluginActionMap.values()],
		[pluginActionMap],
	);

	const filteredAssets = useMemo(() => {
		const trimmed = query.trim().toLowerCase();
		if (trimmed === "") return assets;
		return assets.filter((asset) => {
			const haystack = [
				asset.name,
				asset.mimeType ?? "",
				...(asset.tags ?? []),
			]
				.join("\n")
				.toLowerCase();
			return haystack.includes(trimmed);
		});
	}, [assets, query]);

	const handleUpload = useCallback(
		async (files: readonly File[]): Promise<void> => {
			if (source === null || files.length === 0) return;
			const tickets: UploadingTile[] = files.map((file, index) => ({
				id: `${Date.now()}-${index}-${file.name}`,
				name: file.name,
				progress: PROGRESS_INITIAL,
			}));
			setUploadingTiles((prev) => [...prev, ...tickets]);
			try {
				let bytesSeen = 0;
				const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
				await source.upload(files, (event: StudioAssetUploadEvent) => {
					if (event.type === "progress") {
						bytesSeen = event.bytesUploaded;
						const ratio = totalBytes === 0 ? 1 : bytesSeen / totalBytes;
						setUploadingTiles((prev) =>
							prev.map((tile) =>
								tickets.some((ticket) => ticket.id === tile.id)
									? { ...tile, progress: Math.max(tile.progress, ratio) }
									: tile,
							),
						);
					} else if (event.type === "error") {
						toast.error(msg("studio.module.image.upload.error"));
					}
				});
			} catch {
				toast.error(msg("studio.module.image.upload.error"));
			} finally {
				setUploadingTiles((prev) =>
					prev.filter(
						(tile) => !tickets.some((ticket) => ticket.id === tile.id),
					),
				);
			}
		},
		[msg, source],
	);

	const handlePickFiles = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	const headerActions = useMemo(
		() => (
			<ImageUploadButton
				onClick={handlePickFiles}
				disabled={source === null}
			/>
		),
		[handlePickFiles, source],
	);
	useSetSidebarHeaderActions(headerActions);

	const handleAssetClick = useCallback(
		(asset: StudioAsset): void => {
			const componentName = kindToComponentName(asset.kind);
			if (componentName === null) return;
			const snapshot = getPuck();
			const components = snapshot.config.components ?? {};
			if (!Object.hasOwn(components, componentName)) {
				return;
			}
			const id =
				typeof crypto !== "undefined" && "randomUUID" in crypto
					? `${componentName}-${crypto.randomUUID().slice(0, 8)}`
					: `${componentName}-${Date.now().toString(36)}`;
			const newNode = {
				type: componentName,
				props: {
					id,
					...kindToPropsForInsert(asset.kind, asset.url, asset.name),
				},
			};
			const currentData = snapshot.appState.data;
			const nextData = {
				...currentData,
				content: [...(currentData.content ?? []), newNode],
			};
			snapshot.dispatch({
				type: "setData",
				data: nextData as unknown as typeof currentData,
			});
		},
		[getPuck],
	);

	const handleRenameSubmit = useCallback(
		async (asset: StudioAsset, nextName: string): Promise<void> => {
			if (source === null) return;
			await source.rename?.(asset.id, nextName);
		},
		[source],
	);

	const handleStartReplace = useCallback((asset: StudioAsset): void => {
		replacingIdRef.current = asset.id;
		replaceInputRef.current?.click();
	}, []);

	const handleReplaceFile = useCallback(
		async (file: File): Promise<void> => {
			const targetId = replacingIdRef.current;
			replacingIdRef.current = null;
			if (source === null || targetId === null) return;
			try {
				await source.replace?.(targetId, file);
			} catch {
				toast.error(msg("studio.module.image.upload.error"));
			}
		},
		[msg, source],
	);

	if (source === null) {
		return (
			<div data-testid="ak-module-image" className="flex h-full flex-col">
				<EmptyState
					message={msg("studio.module.image.pluginMissing")}
					testId="ak-image-plugin-missing"
				/>
			</div>
		);
	}

	const isLibraryEmpty = assets.length === 0;
	const isFilterEmpty = !isLibraryEmpty && filteredAssets.length === 0;

	return (
		<div data-testid="ak-module-image" className="flex h-full flex-col">
			<div className="shrink-0 space-y-2 border-b border-[var(--ak-studio-border)] p-2">
				<ImageFilterStrip />
				<ImageSearchBar onChange={setQuery} />
			</div>
			<div className="min-h-0 flex-1 overflow-auto">
				<UploadDropZone onDrop={handleUpload}>
					{isLibraryEmpty && uploadingTiles.length === 0 ? (
						<EmptyState
							message={msg("studio.module.image.empty")}
							testId="ak-image-library-empty"
						/>
					) : isFilterEmpty && uploadingTiles.length === 0 ? (
						<EmptyState
							message={msg("studio.module.image.empty")}
							testId="ak-image-filter-empty"
						/>
					) : (
						<AssetGrid
							assets={filteredAssets}
							uploadingTiles={uploadingTiles}
							filter={filter}
							source={source}
							pluginActions={pluginActions}
							onAssetClick={handleAssetClick}
							onRename={setRenaming}
							onReplace={handleStartReplace}
						/>
					)}
				</UploadDropZone>
			</div>
			<input
				ref={fileInputRef}
				type="file"
				multiple
				className="hidden"
				data-testid="ak-image-upload-input"
				onChange={(event) => {
					const files = Array.from(event.currentTarget.files ?? []);
					event.currentTarget.value = "";
					if (files.length > 0) void handleUpload(files);
				}}
			/>
			<input
				ref={replaceInputRef}
				type="file"
				className="hidden"
				data-testid="ak-image-replace-input"
				onChange={(event) => {
					const file = event.currentTarget.files?.[0];
					event.currentTarget.value = "";
					if (file !== undefined) void handleReplaceFile(file);
				}}
			/>
			<RenameAssetDialog
				asset={renaming}
				onOpenChange={(open) => {
					if (!open) setRenaming(null);
				}}
				onSubmit={handleRenameSubmit}
			/>
		</div>
	);
}
