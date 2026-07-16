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
import { toast } from "sonner";
import {
	appendComponentToRoot,
	generateNodeId,
} from "@/layout/sidebar/commands/insert-component-node";
import { useSetSidebarHeaderActions } from "@/layout/sidebar/SidebarHeaderActionsContext";
import { EmptyState } from "@/layout/sidebar/shared/EmptyState";
import { Button } from "@/primitives/button";
import { Input } from "@/primitives/input";
import { useMsg } from "@/state/editor-i18n-context";
import { useSidebarRegistry } from "@/state/sidebar-registry/use-sidebar-registry";
import { useAssetCategoryFilter } from "@/state/slices/editor-ui-selectors";
import type {
	StudioAsset,
	StudioAssetFolder,
	StudioAssetKind,
	StudioAssetTheme,
	StudioAssetUploadEvent,
} from "@/types/sidebar";
import { AssetGrid, type UploadingTile } from "./image/AssetGrid";
import {
	assetsInDisplayOrder,
	type SelectModifiers,
} from "./image/asset-selection";
import { BulkDeleteAssetsDialog } from "./image/BulkDeleteAssetsDialog";
import { FolderNav } from "./image/FolderNav";
import { ImageActionsMenu } from "./image/ImageActionsMenu";
import { ImageFilterStrip } from "./image/ImageFilterStrip";
import { ImageSearchBar } from "./image/ImageSearchBar";
import { ImageSourceTabs, type SourceTab } from "./image/ImageSourceTabs";
import { ImageThemeChips } from "./image/ImageThemeChips";
import {
	kindToComponentName,
	kindToPropsForInsert,
} from "./image/infer-asset-kind";
import { NewFolderDialog } from "./image/NewFolderDialog";
import { RenameAssetDialog } from "./image/RenameAssetDialog";
import { UploadDropZone } from "./image/UploadDropZone";

const ASSET_PAGE_LIMIT = 50;
const PROGRESS_INITIAL = 0.05;
const IMAGE_FILTER_KINDS: readonly StudioAssetKind[] = ["image", "other"];
const VIDEO_FILTER_KINDS: readonly StudioAssetKind[] = ["video"];
const AUDIO_FILTER_KINDS: readonly StudioAssetKind[] = ["audio"];

function filterToKinds(filter: string): readonly StudioAssetKind[] | undefined {
	if (filter === "images") return IMAGE_FILTER_KINDS;
	if (filter === "videos") return VIDEO_FILTER_KINDS;
	if (filter === "audio") return AUDIO_FILTER_KINDS;
	return undefined;
}

function useImageModuleElement(): ReactNode {
	const msg = useMsg();
	const source = useSidebarRegistry((state) => state.assetSource);
	const pluginActionMap = useSidebarRegistry((state) => state.assetActions);
	const [filter] = useAssetCategoryFilter();
	const [assets, setAssets] = useState<readonly StudioAsset[]>([]);
	const [assetsLoading, setAssetsLoading] = useState(false);
	const [assetsLoadError, setAssetsLoadError] = useState(false);
	const [nextCursor, setNextCursor] = useState<string | undefined>(undefined);
	// Source ids that failed for the latest federated page (others succeeded) —
	// drives a non-blocking "degraded" hint instead of dropping the error.
	const [degradedSources, setDegradedSources] = useState<readonly string[]>([]);
	const [query, setQuery] = useState("");
	const [uploadingTiles, setUploadingTiles] = useState<
		readonly UploadingTile[]
	>([]);
	const [renaming, setRenaming] = useState<StudioAsset | null>(null);
	const replacingIdRef = useRef<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const replaceInputRef = useRef<HTMLInputElement | null>(null);
	// Phase-2 folder + source state. `currentFolderId === undefined` ⇒ not yet
	// navigated (resolves to root for a folder-aware source); `null` ⇒ root.
	const [currentFolderId, setCurrentFolderId] = useState<
		string | null | undefined
	>(undefined);
	// Whether the new-folder dialog ({@link NewFolderDialog}) is open. The
	// trigger lives in the header actions menu (`ImageActionsMenu`); the folder
	// is created at the current `currentFolderId` location (report 0003 P2-11).
	const [creatingFolder, setCreatingFolder] = useState(false);
	// Asset multi-selection (report 0003 P2-7b): `selectedAssetIds` are the
	// highlighted tiles, `assetAnchorId` is the shift-range pivot.
	const [selectedAssetIds, setSelectedAssetIds] = useState<ReadonlySet<string>>(
		() => new Set(),
	);
	const [assetAnchorId, setAssetAnchorId] = useState<string | null>(null);
	const [bulkDeleteAssetsOpen, setBulkDeleteAssetsOpen] = useState(false);
	const [activeSource, setActiveSource] = useState<string | undefined>(
		undefined,
	);
	const [folders, setFolders] = useState<readonly StudioAssetFolder[]>([]);
	const [folderPath, setFolderPath] = useState<readonly StudioAssetFolder[]>(
		[],
	);
	const [sourceTabs, setSourceTabs] = useState<readonly SourceTab[]>([]);
	const [themes, setThemes] = useState<readonly StudioAssetTheme[]>([]);
	const [activeTheme, setActiveTheme] = useState<string | undefined>(undefined);
	const getPuck = useGetPuck();
	const usesPaginatedListing = source?.listPaginated !== undefined;
	// Folder navigation, folder scoping, and the media-kind filter strip apply
	// ONLY to the local library. An external browse source (e.g. the Unsplash
	// tab) has no folders and is image-only, so those local-library controls are
	// hidden and never threaded into its query — leaving just the theme chips +
	// search. `activeSource === undefined` is the untabbed local-only source;
	// `"local"` is the explicit Library tab.
	const isLocalSource = activeSource === undefined || activeSource === "local";

	// Monotonic request id: every `loadAssets` call mints a generation;
	// only the latest may write state. This drops stale paginated
	// appends and keeps `assetsLoading` accurate when a refresh and a
	// "Load more" overlap (review §3/§4 — async source races). Effect
	// cleanup bumps it so in-flight requests are invalidated on
	// unmount / source change.
	const requestSeqRef = useRef(0);
	// In-flight upload AbortControllers, aborted on unmount / source change
	// so a cancelled batch stops consuming the host endpoint.
	const [uploadAbortControllers] = useState(() => new Set<AbortController>());

	// Refresh the asset list whenever the source notifies. Mirrors
	// `LayersPanel`'s pages-source effect.
	const loadAssets = useCallback(
		async (cursor?: string): Promise<void> => {
			if (source === null) return;
			const seq = ++requestSeqRef.current;
			const isStale = (): boolean => seq !== requestSeqRef.current;
			setAssetsLoading(true);
			setAssetsLoadError(false);
			try {
				if (source.listPaginated !== undefined) {
					const trimmedQuery = query.trim();
					// Folder scoping applies only to the LOCAL library — never to an
					// external source tab (e.g. Unsplash) that can't satisfy folders.
					// Leaking `folderId` to a folders:false provider makes
					// `providerCanSatisfy` drop it from the federation, so the Unsplash
					// grid would return zero results whenever folders are enabled.
					// Flat sources stay byte-identical (isLocalSource is true when
					// untabbed). The media-kind filter is likewise local-only — an
					// external image source must not be queried with kinds:["video"]
					// (a stale persisted filter) or its grid would return nothing.
					const folderAware = source.createFolder !== undefined;
					const folderScoped = folderAware && isLocalSource;
					const effectiveFolderId = folderScoped
						? (currentFolderId ?? null)
						: undefined;
					const page = await source.listPaginated({
						query: trimmedQuery.length > 0 ? trimmedQuery : undefined,
						kinds: isLocalSource ? filterToKinds(filter) : undefined,
						cursor,
						limit: ASSET_PAGE_LIMIT,
						...(effectiveFolderId !== undefined
							? { folderId: effectiveFolderId }
							: {}),
						...(activeSource !== undefined ? { sources: [activeSource] } : {}),
						...(activeTheme !== undefined
							? { facets: { "unsplash:theme": [activeTheme] } }
							: {}),
					});
					if (isStale()) return;
					setAssets((current) =>
						cursor === undefined ? page.items : [...current, ...page.items],
					);
					setNextCursor(page.nextCursor);
					setDegradedSources(
						page.sourceErrors ? Object.keys(page.sourceErrors) : [],
					);
					if (cursor === undefined) {
						setFolders(page.folders ?? []);
						setFolderPath(page.folderPath ?? []);
					}
					return;
				}
				const next = await Promise.resolve(source.list());
				if (isStale()) return;
				setAssets(next);
				setNextCursor(undefined);
				setDegradedSources([]);
			} catch {
				if (isStale()) return;
				if (cursor === undefined) {
					setAssets([]);
					setNextCursor(undefined);
				}
				setAssetsLoadError(true);
			} finally {
				// Only the latest request owns the spinner — an overlapped
				// earlier call must not clear what a newer one set.
				if (!isStale()) setAssetsLoading(false);
			}
		},
		[
			activeSource,
			activeTheme,
			currentFolderId,
			filter,
			isLocalSource,
			query,
			source,
		],
	);

	// Load the source's themes once to decide whether to show source tabs
	// (a themed source ⇒ Library/Unsplash tabs). Flat sources stay tab-less.
	useEffect(() => {
		if (source?.listThemes === undefined) {
			setSourceTabs([]);
			setThemes([]);
			return;
		}
		let active = true;
		void Promise.resolve(source.listThemes())
			.then((loadedThemes) => {
				if (!active) return;
				setThemes(loadedThemes);
				if (loadedThemes.length > 0) {
					setSourceTabs([
						{ id: "local", label: msg("studio.module.image.source.library") },
						{
							id: "unsplash",
							label: msg("studio.module.image.source.unsplash"),
						},
					]);
					setActiveSource((prev) => prev ?? "local");
				} else {
					setSourceTabs([]);
				}
			})
			.catch(() => {
				if (active) setSourceTabs([]);
			});
		return () => {
			active = false;
		};
	}, [source, msg]);

	const handleCreateFolder = useCallback(
		async (name: string): Promise<void> => {
			if (source?.createFolder === undefined) return;
			try {
				await source.createFolder(currentFolderId ?? null, name);
			} catch {
				toast.error(msg("studio.module.image.upload.error"));
			}
		},
		[currentFolderId, msg, source],
	);

	useEffect(() => {
		if (source === null) {
			setAssets([]);
			setNextCursor(undefined);
			setAssetsLoadError(false);
			setAssetsLoading(false);
			return;
		}
		const refresh = (): void => {
			void loadAssets();
		};
		refresh();
		const unsubscribe = source.subscribe?.(refresh);
		return () => {
			// Invalidate any in-flight request on unmount / source change.
			requestSeqRef.current++;
			unsubscribe?.();
			// Cancel any in-flight uploads so they stop consuming the host.
			for (const controller of uploadAbortControllers) {
				controller.abort();
			}
			uploadAbortControllers.clear();
		};
	}, [loadAssets, source, uploadAbortControllers]);

	const pluginActions = useMemo(
		() => [...pluginActionMap.values()],
		[pluginActionMap],
	);

	const filteredAssets = useMemo(() => {
		if (usesPaginatedListing) return assets;
		const trimmed = query.trim().toLowerCase();
		if (trimmed === "") return assets;
		return assets.filter((asset) => {
			const haystack = [asset.name, asset.mimeType ?? "", ...(asset.tags ?? [])]
				.join("\n")
				.toLowerCase();
			return haystack.includes(trimmed);
		});
	}, [assets, query, usesPaginatedListing]);

	// The media-kind filter is a local-library control, hidden on an external
	// source (e.g. Unsplash) — forcing "all" there avoids a persisted
	// `videos`/`audio` filter partitioning every image-only result out of the
	// grid. `displayedAssets` is exactly what AssetGrid renders, in render order,
	// so a shift-range over it matches the visible layout (report 0003 P2-7b).
	const gridFilter = isLocalSource ? filter : "all";
	const displayedAssets = useMemo(
		() => assetsInDisplayOrder(filteredAssets, gridFilter),
		[filteredAssets, gridFilter],
	);

	const handleUpload = useCallback(
		async (files: readonly File[]): Promise<void> => {
			if (source === null || files.length === 0) return;
			const tickets: UploadingTile[] = files.map((file, index) => ({
				id: `${Date.now()}-${index}-${file.name}`,
				name: file.name,
				progress: PROGRESS_INITIAL,
			}));
			setUploadingTiles((prev) => [...prev, ...tickets]);
			const abortController = new AbortController();
			uploadAbortControllers.add(abortController);
			try {
				let bytesSeen = 0;
				const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
				await source.upload(
					files,
					(event: StudioAssetUploadEvent) => {
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
						} else if (
							event.type === "error" &&
							!abortController.signal.aborted
						) {
							// Suppress error events from a cancelled batch.
							toast.error(msg("studio.module.image.upload.error"));
						}
					},
					abortController.signal,
				);
			} catch {
				// Suppress the error toast for an intentional cancel
				// (unmount / source change) — only surface real failures.
				if (!abortController.signal.aborted) {
					toast.error(msg("studio.module.image.upload.error"));
				}
			} finally {
				uploadAbortControllers.delete(abortController);
				setUploadingTiles((prev) =>
					prev.filter(
						(tile) => !tickets.some((ticket) => ticket.id === tile.id),
					),
				);
			}
		},
		[msg, source, uploadAbortControllers],
	);

	const handlePickFiles = useCallback(() => {
		fileInputRef.current?.click();
	}, []);

	// "New folder" is offered only for a folder-aware LOCAL source (mirrors the
	// FolderNav render gate below).
	const canCreateFolder = isLocalSource && source?.createFolder !== undefined;
	const headerActions = useMemo(
		() => (
			<ImageActionsMenu
				onUpload={handlePickFiles}
				onCreateFolder={
					canCreateFolder ? () => setCreatingFolder(true) : undefined
				}
				disabled={source === null}
			/>
		),
		[canCreateFolder, handlePickFiles, source],
	);
	useSetSidebarHeaderActions(headerActions);

	const handleAssetInsert = useCallback(
		async (asset: StudioAsset): Promise<void> => {
			let insertable = asset;
			// External browse results (Unsplash) must be picked first — this
			// registers the asset + fires the MANDATORY download trigger so its
			// asset://<id> reference resolves on insert.
			if (
				asset.source !== undefined &&
				asset.source !== "local" &&
				source?.pickResult !== undefined
			) {
				try {
					insertable = await source.pickResult(asset);
				} catch {
					toast.error(msg("studio.module.image.upload.error"));
					return;
				}
			}
			const componentName = kindToComponentName(insertable.kind);
			if (componentName === null) return;
			// Centralized, zone-preserving append against the latest
			// snapshot (review finding M2). No-ops if the component is
			// not registered in the live Puck config.
			appendComponentToRoot(getPuck(), componentName, {
				id: generateNodeId(componentName),
				...kindToPropsForInsert(
					insertable.kind,
					insertable.url,
					insertable.name,
				),
			});
		},
		[getPuck, msg, source],
	);

	// A plain tile click clears the selection and inserts; `meta`/`ctrl` toggles
	// a tile and `shift` selects the range — both update the selection only.
	const handleAssetClick = useCallback(
		(asset: StudioAsset, modifiers?: SelectModifiers): void => {
			// Multi-select + bulk delete is a local-library action only. External
			// browse results (e.g. Unsplash) are read-only, and the composite
			// source's `delete` targets the local library — deleting an external
			// id would silently no-op. So on a non-local source every click just
			// inserts (report 0003 P2-7b).
			if (!isLocalSource) {
				void handleAssetInsert(asset);
				return;
			}
			if (modifiers?.metaKey === true || modifiers?.ctrlKey === true) {
				setSelectedAssetIds((prev) => {
					const next = new Set(prev);
					if (next.has(asset.id)) next.delete(asset.id);
					else next.add(asset.id);
					return next;
				});
				setAssetAnchorId(asset.id);
				return;
			}
			if (modifiers?.shiftKey === true) {
				const ids = displayedAssets.map((item) => item.id);
				const to = ids.indexOf(asset.id);
				const from = assetAnchorId !== null ? ids.indexOf(assetAnchorId) : -1;
				if (to !== -1) {
					if (from !== -1) {
						const [lo, hi] = from <= to ? [from, to] : [to, from];
						setSelectedAssetIds(new Set(ids.slice(lo, hi + 1)));
					} else {
						setSelectedAssetIds(new Set([asset.id]));
						setAssetAnchorId(asset.id);
					}
					return;
				}
			}
			setSelectedAssetIds(new Set());
			setAssetAnchorId(asset.id);
			void handleAssetInsert(asset);
		},
		[assetAnchorId, displayedAssets, handleAssetInsert, isLocalSource],
	);
	const clearAssetSelection = useCallback((): void => {
		setSelectedAssetIds(new Set());
		setAssetAnchorId(null);
	}, []);
	// Every selected asset is deletable when the source supports deletion
	// (assets carry no per-item lock, unlike pages).
	const deletableSelectedAssets = useMemo(
		() => displayedAssets.filter((asset) => selectedAssetIds.has(asset.id)),
		[displayedAssets, selectedAssetIds],
	);
	const handleBulkDeleteAssets = useCallback(async (): Promise<void> => {
		const del = source?.delete;
		if (del === undefined) return;
		// Sequential so a host that throws halts the rest + surfaces the error.
		for (const asset of deletableSelectedAssets) {
			await del.call(source, asset.id);
		}
		clearAssetSelection();
	}, [clearAssetSelection, deletableSelectedAssets, source]);
	// Keep the selection scoped to visible tiles as the list filters / reloads.
	useEffect(() => {
		const visible = new Set(displayedAssets.map((asset) => asset.id));
		setSelectedAssetIds((prev) => {
			if (prev.size === 0) return prev;
			const next = new Set([...prev].filter((id) => visible.has(id)));
			return next.size === prev.size ? prev : next;
		});
		setAssetAnchorId((prev) =>
			prev !== null && !visible.has(prev) ? null : prev,
		);
	}, [displayedAssets]);

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

	const isLibraryEmpty =
		assets.length === 0 && uploadingTiles.length === 0 && !assetsLoading;
	const isFilterEmpty = !isLibraryEmpty && filteredAssets.length === 0;

	return (
		<div data-testid="ak-module-image" className="flex h-full flex-col">
			<div className="shrink-0 space-y-2 border-b border-[var(--ak-studio-border)] p-2">
				{sourceTabs.length > 1 ? (
					<ImageSourceTabs
						tabs={sourceTabs}
						active={activeSource ?? sourceTabs[0]?.id ?? "local"}
						onChange={setActiveSource}
						ariaLabel={msg("studio.module.image.name")}
					/>
				) : null}
				{activeSource === "unsplash" && themes.length > 0 ? (
					<ImageThemeChips
						themes={themes}
						active={activeTheme}
						onChange={setActiveTheme}
					/>
				) : null}
				{isLocalSource && source.createFolder !== undefined ? (
					<FolderNav
						folderPath={folderPath}
						folders={folders}
						onNavigate={setCurrentFolderId}
						rootLabel={msg("studio.module.image.folder.root")}
						navLabel={msg("studio.module.image.folder.nav")}
					/>
				) : null}
				{isLocalSource ? <ImageFilterStrip /> : null}
				<ImageSearchBar onChange={setQuery} />
			</div>
			{selectedAssetIds.size > 0 &&
			isLocalSource &&
			source?.delete !== undefined ? (
				<div
					className="flex h-9 shrink-0 items-center gap-2 bg-[var(--ak-studio-muted)] px-2 text-xs"
					data-testid="ak-image-selection-toolbar"
				>
					<span className="grow text-[var(--ak-studio-fg)]">
						{msg("studio.module.image.bulk.selected").replace(
							"{count}",
							String(selectedAssetIds.size),
						)}
					</span>
					<Button
						size="sm"
						variant="ghost"
						onClick={clearAssetSelection}
						data-testid="ak-image-bulk-clear"
					>
						{msg("studio.module.image.bulk.clear")}
					</Button>
					<Button
						size="sm"
						variant="destructive"
						disabled={deletableSelectedAssets.length === 0}
						onClick={() => setBulkDeleteAssetsOpen(true)}
						data-testid="ak-image-bulk-delete"
					>
						{msg("studio.module.image.bulk.delete")}
					</Button>
				</div>
			) : null}
			<div className="min-h-0 flex-1 overflow-auto">
				<UploadDropZone onDrop={handleUpload}>
					{degradedSources.length > 0 ? (
						<div
							role="status"
							className="px-3 py-2 text-xs text-muted-foreground"
							data-testid="ak-image-sources-degraded"
						>
							{msg("studio.module.image.source.degraded")}
						</div>
					) : null}
					{assetsLoadError && assets.length === 0 ? (
						<EmptyState
							message={msg("studio.module.image.loadError")}
							testId="ak-image-load-error"
						/>
					) : assetsLoading && assets.length === 0 ? (
						<EmptyState
							message={msg("studio.module.image.loading")}
							testId="ak-image-loading"
						/>
					) : isLibraryEmpty ? (
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
							filter={gridFilter}
							source={source}
							pluginActions={pluginActions}
							onAssetClick={handleAssetClick}
							selectedIds={selectedAssetIds}
							onRename={setRenaming}
							onReplace={handleStartReplace}
						/>
					)}
					{nextCursor !== undefined ? (
						<div className="flex justify-center p-2">
							<Button
								variant="outline"
								size="sm"
								disabled={assetsLoading}
								onClick={() => {
									void loadAssets(nextCursor);
								}}
							>
								{msg("studio.module.image.loadMore")}
							</Button>
						</div>
					) : null}
				</UploadDropZone>
			</div>
			<Input
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
			<Input
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
			<NewFolderDialog
				open={creatingFolder}
				onOpenChange={setCreatingFolder}
				onSubmit={handleCreateFolder}
			/>
			<BulkDeleteAssetsDialog
				open={bulkDeleteAssetsOpen}
				onOpenChange={setBulkDeleteAssetsOpen}
				count={deletableSelectedAssets.length}
				onConfirm={handleBulkDeleteAssets}
			/>
		</div>
	);
}

export function ImageModule(): ReactNode {
	return useImageModuleElement();
}
