import type {
	ExportWarning,
	PageIR,
	PageIRAsset,
	PageIRMetadata,
	PageIRNode,
} from "@anvilkit/contracts";
import type { Config, Data } from "@puckeditor/core";
import { identifySlots } from "./identify-slots.js";
import { collectNodeOwnAssets } from "./internal/asset-walker.js";
import { canonicalizeProps, deepFreeze } from "./internal/canonicalize.js";
import { deriveAssetId } from "./internal/derive-asset-id.js";
import { MAX_TREE_DEPTH, type Mutable } from "./internal/types.js";

type PuckContentItem = Data["content"][number];
type SlotKind = "slot" | "zone";
type PuckDataWithAssets = Data & { readonly assets?: readonly unknown[] };

interface ParentSlot {
	readonly name: string;
	readonly kind: SlotKind;
}

interface ZoneEntry {
	readonly name: string;
	readonly content: readonly PuckContentItem[];
}

/**
 * Options accepted by {@link puckDataToIR}.
 */
export interface PuckDataToIROptions {
	/**
	 * Injectable clock — defaults to `() => new Date()`.
	 * Pass a fixed value in tests so `metadata.createdAt` is stable.
	 */
	now?: () => Date;
	/**
	 * Optional callback that receives non-fatal warnings during the
	 * transform (e.g. function-valued props being dropped).
	 */
	onWarning?: (warning: ExportWarning) => void;
}

function splitZoneKey(zoneKey: string): readonly [string, string] | null {
	const separator = zoneKey.indexOf(":");
	if (separator <= 0 || separator === zoneKey.length - 1) return null;
	return [zoneKey.slice(0, separator), zoneKey.slice(separator + 1)];
}

function groupZonesByParent(data: Data): Map<string, readonly ZoneEntry[]> {
	const zonesByParent = new Map<string, ZoneEntry[]>();
	const zones = data.zones as
		| Record<string, readonly PuckContentItem[]>
		| undefined;

	if (!zones) return zonesByParent;

	for (const [zoneKey, content] of Object.entries(zones)) {
		if (!Array.isArray(content)) continue;

		const parts = splitZoneKey(zoneKey);
		if (!parts) continue;

		const [parentId, zoneName] = parts;
		if (parentId === "root" && zoneName === "default-zone") continue;

		const entries = zonesByParent.get(parentId) ?? [];
		entries.push({ name: zoneName, content });
		zonesByParent.set(parentId, entries);
	}

	for (const [parentId, entries] of zonesByParent) {
		zonesByParent.set(
			parentId,
			entries.sort((a, b) => a.name.localeCompare(b.name)),
		);
	}

	return zonesByParent;
}

function isAssetKind(value: unknown): value is PageIRAsset["kind"] {
	return (
		value === "image" ||
		value === "video" ||
		value === "font" ||
		value === "script" ||
		value === "style" ||
		value === "other"
	);
}

function collectExplicitAssets(data: Data): readonly PageIRAsset[] {
	const assets = (data as PuckDataWithAssets).assets;
	if (!Array.isArray(assets)) {
		return [];
	}

	const explicitAssets: PageIRAsset[] = [];
	for (const asset of assets) {
		if (asset === null || typeof asset !== "object") {
			continue;
		}

		const record = asset as Record<string, unknown>;
		if (
			typeof record.id !== "string" ||
			record.id.trim() === "" ||
			typeof record.url !== "string" ||
			record.url.trim() === "" ||
			!isAssetKind(record.kind)
		) {
			continue;
		}

		const meta = record.meta;
		explicitAssets.push({
			id: record.id.trim(),
			kind: record.kind,
			url: record.url.trim(),
			...(meta !== null && typeof meta === "object" && !Array.isArray(meta)
				? { meta: { ...(meta as Record<string, unknown>) } }
				: {}),
		});
	}

	return explicitAssets;
}

function mergeAssetsByUrl(
	explicitAssets: readonly PageIRAsset[],
	collectedAssets: readonly PageIRAsset[],
): readonly PageIRAsset[] {
	const assetsByUrl = new Map<string, PageIRAsset>();

	for (const asset of [...explicitAssets, ...collectedAssets]) {
		if (!assetsByUrl.has(asset.url)) {
			assetsByUrl.set(asset.url, asset);
		}
	}

	return [...assetsByUrl.values()];
}

function emitCanonicalWarnings(
	componentType: string,
	nodeId: string,
	result: ReturnType<typeof canonicalizeProps>,
	onWarning: PuckDataToIROptions["onWarning"],
): void {
	for (const path of result.droppedFunctions) {
		onWarning?.({
			level: "warn",
			code: "FUNCTION_PROP_DROPPED",
			message: `Dropped function prop "${path}" from component "${componentType}" (id: ${nodeId}). IR props must be serializable.`,
			nodeId,
		});
	}

	for (const path of result.droppedCircularRefs) {
		onWarning?.({
			level: "warn",
			code: "CIRCULAR_PROP_DROPPED",
			message: `Dropped circular prop "${path}" from component "${componentType}" (id: ${nodeId}). IR props must be serializable.`,
			nodeId,
		});
	}

	for (const path of result.droppedUnsupportedValues) {
		onWarning?.({
			level: "warn",
			code: "NON_SERIALIZABLE_PROP_DROPPED",
			message: `Dropped non-serializable prop "${path}" from component "${componentType}" (id: ${nodeId}). IR props must be serializable.`,
			nodeId,
		});
	}
}

/**
 * Transform a Puck `Data` document into a normalized {@link PageIR}.
 *
 * This is the primary entry point every Anvilkit export format
 * consumes. Given a Puck `Data` and its matching `Config`, the
 * result is a pure, JSON-serializable, deeply-frozen `PageIR` with
 * stable node ids, canonicalized (sorted) props, and a flat asset
 * manifest.
 *
 * @param data   - Puck editor document to normalize.
 * @param config - Puck `Config` matching `data`. **Required** — used
 *   by {@link identifySlots} to tell slot fields (descended into as
 *   `children`) apart from plain serializable props.
 * @param opts   - See {@link PuckDataToIROptions}.
 * @returns The normalized, frozen page IR document.
 */
export function puckDataToIR(
	data: Data,
	config: Config,
	opts?: PuckDataToIROptions,
): PageIR {
	const now = opts?.now ?? (() => new Date());
	const onWarning = opts?.onWarning;
	const slotMap = identifySlots(config);
	const zonesByParent = groupZonesByParent(data);
	let synthesizedIdCounter = 0;

	function mapContent(
		content: readonly PuckContentItem[],
		parentSlot: ParentSlot | undefined,
		depth: number,
	): PageIRNode[] {
		if (depth > MAX_TREE_DEPTH) {
			onWarning?.({
				level: "warn",
				code: "MAX_DEPTH_EXCEEDED",
				message: `Page tree exceeded the maximum depth of ${MAX_TREE_DEPTH}; deeper nodes were dropped to avoid a stack overflow.`,
			});
			return [];
		}
		return content.map((item) => mapItem(item, parentSlot, depth));
	}

	function mapItem(
		item: PuckContentItem,
		parentSlot: ParentSlot | undefined,
		depth: number,
	): PageIRNode {
		const rawProps = (
			item.props && typeof item.props === "object" ? item.props : {}
		) as Record<string, unknown>;
		const type = item.type as string;
		const rawId = rawProps.id;
		let id: string;
		if (typeof rawId === "string" && rawId.trim() !== "") {
			id = rawId;
		} else {
			id = `anvilkit-missing-id-${synthesizedIdCounter++}`;
			onWarning?.({
				level: "warn",
				code: "MISSING_NODE_ID",
				message: `Component "${type}" was missing a string \`props.id\`; synthesized "${id}". Round-trip stability is not guaranteed for this node.`,
				nodeId: id,
			});
		}
		const { id: _discardedId, ...restProps } = rawProps;
		const slotKeys = slotMap.get(type) ?? [];
		const propsForIR: Record<string, unknown> = { ...restProps };
		const children: PageIRNode[] = [];
		const populatedSlotProps = new Set<string>();

		for (const slotKey of slotKeys) {
			const slotValue = restProps[slotKey];

			if (Array.isArray(slotValue) && slotValue.length > 0) {
				delete propsForIR[slotKey];
				populatedSlotProps.add(slotKey);
				children.push(
					...mapContent(
						slotValue as readonly PuckContentItem[],
						{ name: slotKey, kind: "slot" },
						depth + 1,
					),
				);
			}
		}

		for (const zone of zonesByParent.get(id) ?? []) {
			if (populatedSlotProps.has(zone.name)) continue;

			children.push(
				...mapContent(
					zone.content,
					{ name: zone.name, kind: "zone" },
					depth + 1,
				),
			);
		}

		const canonicalResult = canonicalizeProps(propsForIR);
		emitCanonicalWarnings(type, id, canonicalResult, onWarning);

		const node: PageIRNode = {
			id,
			type,
			props: canonicalResult.props,
			...(parentSlot
				? { slot: parentSlot.name, slotKind: parentSlot.kind }
				: {}),
			...(children.length > 0 ? { children } : {}),
		};

		return node;
	}

	// --- Build child nodes from data.content and root-level legacy zones ---
	let rootContent: readonly PuckContentItem[];
	if (Array.isArray(data.content)) {
		rootContent = data.content;
	} else {
		rootContent = [];
		if (data.content !== undefined) {
			onWarning?.({
				level: "warn",
				code: "INVALID_CONTENT",
				message: "`data.content` was not an array; treated as empty.",
			});
		}
	}

	const children = mapContent(rootContent, undefined, 0);
	for (const zone of zonesByParent.get("root") ?? []) {
		children.push(
			...mapContent(zone.content, { name: zone.name, kind: "zone" }, 0),
		);
	}

	// --- Root node ---
	const rootRawProps: Record<string, unknown> = {};
	if (data.root && typeof data.root === "object") {
		const root = data.root as Record<string, unknown>;
		if ("props" in root && root.props && typeof root.props === "object") {
			for (const [key, value] of Object.entries(
				root.props as Record<string, unknown>,
			)) {
				if (key === "id") continue;
				rootRawProps[key] = value;
			}
		}
	}

	const rootCanonicalResult = canonicalizeProps(rootRawProps);
	emitCanonicalWarnings("__root__", "root", rootCanonicalResult, onWarning);

	const root: PageIRNode = {
		id: "root",
		type: "__root__",
		props: rootCanonicalResult.props,
		...(children.length > 0 ? { children } : {}),
	};

	// --- Collect all assets in a single post-build pass ---
	// `collectInto` walks the tree exactly once: each node's own
	// prop assets first, then its children in order (dedup by url,
	// keep first). This reproduces the previous per-node + root
	// pre-order/first-encounter ordering while turning the O(N²)
	// repeated-subtree walk into a single O(N) traversal. It attaches
	// each node's `assets` slice as it unwinds — except the synthetic
	// root, which (as before) only feeds the document-level manifest.
	function collectInto(
		node: PageIRNode,
		isRoot: boolean,
	): readonly PageIRAsset[] {
		const local = new Map<string, PageIRAsset>();

		for (const asset of collectNodeOwnAssets(
			node.props as Record<string, unknown>,
			deriveAssetId,
		)) {
			if (!local.has(asset.url)) local.set(asset.url, asset);
		}

		for (const child of node.children ?? []) {
			for (const asset of collectInto(child, false)) {
				if (!local.has(asset.url)) local.set(asset.url, asset);
			}
		}

		const collected = [...local.values()];
		if (!isRoot && collected.length > 0) {
			(node as Mutable<PageIRNode>).assets = collected;
		}
		return collected;
	}

	const collectedAssets = collectInto(root, true);
	const assets = mergeAssetsByUrl(collectExplicitAssets(data), collectedAssets);

	// Unify ids: rewrite every `node.assets` entry to the canonical
	// manifest entry sharing its url, so an explicit asset's id and a
	// collected asset's FNV id never disagree for the same url.
	const assetByUrl = new Map(assets.map((asset) => [asset.url, asset]));
	function unifyAssetIds(node: PageIRNode): void {
		if (node.assets !== undefined) {
			(node as Mutable<PageIRNode>).assets = node.assets.map(
				(asset) => assetByUrl.get(asset.url) ?? asset,
			);
		}
		for (const child of node.children ?? []) {
			unifyAssetIds(child);
		}
	}
	unifyAssetIds(root);

	// --- Metadata ---
	const metadata: PageIRMetadata = {
		createdAt: now().toISOString(),
	};

	const ir: PageIR = {
		version: "1",
		root,
		assets,
		metadata,
	};

	return deepFreeze(ir);
}
