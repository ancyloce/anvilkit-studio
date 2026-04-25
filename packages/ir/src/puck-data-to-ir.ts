import type {
	ExportWarning,
	PageIR,
	PageIRMetadata,
	PageIRNode,
} from "@anvilkit/core/types";
import type { Config, Data } from "@puckeditor/core";
import { collectAssets } from "./collect-assets.js";
import { identifySlots } from "./identify-slots.js";
import { canonicalizeProps, deepFreeze } from "./internal/canonicalize.js";

type PuckContentItem = Data["content"][number];
type SlotKind = "slot" | "zone";

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
	const zones = data.zones as Record<string, readonly PuckContentItem[]> | undefined;

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
 * @param _config - Puck `Config` matching `data` (used by phase3-004
 *   helpers; lightly used in the base transform).
 * @param opts   - See {@link PuckDataToIROptions}.
 * @returns The normalized, frozen page IR document.
 */
export function puckDataToIR(
	data: Data,
	_config: Config,
	opts?: PuckDataToIROptions,
): PageIR {
	const now = opts?.now ?? (() => new Date());
	const onWarning = opts?.onWarning;
	const slotMap = identifySlots(_config);
	const zonesByParent = groupZonesByParent(data);

	function mapContent(
		content: readonly PuckContentItem[],
		parentSlot?: ParentSlot,
	): PageIRNode[] {
		return content.map((item) => mapItem(item, parentSlot));
	}

	function mapItem(item: PuckContentItem, parentSlot?: ParentSlot): PageIRNode {
		const rawProps = item.props as Record<string, unknown> & { id: string };
		const { id, ...restProps } = rawProps;
		const type = item.type as string;
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
					...mapContent(slotValue as readonly PuckContentItem[], {
						name: slotKey,
						kind: "slot",
					}),
				);
			}
		}

		for (const zone of zonesByParent.get(id) ?? []) {
			if (populatedSlotProps.has(zone.name)) continue;

			children.push(
				...mapContent(zone.content, {
					name: zone.name,
					kind: "zone",
				}),
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

		const nodeAssets = collectAssets(node);
		if (nodeAssets.length > 0) {
			(node as { assets?: typeof nodeAssets }).assets = nodeAssets;
		}

		return node;
	}

	// --- Build child nodes from data.content and root-level legacy zones ---
	const children = mapContent(data.content);
	for (const zone of zonesByParent.get("root") ?? []) {
		children.push(
			...mapContent(zone.content, {
				name: zone.name,
				kind: "zone",
			}),
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

	// --- Collect all assets across the tree (delegates to collectAssets) ---
	const assets = collectAssets(root);

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
