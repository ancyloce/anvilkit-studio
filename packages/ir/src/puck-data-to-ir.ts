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

	// --- Slot detection (delegates to identifySlots) ---
	const _slotMap = identifySlots(_config);

	// --- Build child nodes from data.content ---
	const children: PageIRNode[] = [];

	for (const item of data.content) {
		const rawProps = item.props as Record<string, unknown> & { id: string };
		const { id, ...restProps } = rawProps;

		const { props: canonical, droppedFunctions } = canonicalizeProps(restProps);

		for (const key of droppedFunctions) {
			onWarning?.({
				level: "warn",
				code: "FUNCTION_PROP_DROPPED",
				message: `Dropped function prop "${key}" from component "${item.type}" (id: ${id}). IR props must be serializable.`,
				nodeId: id,
			});
		}

		const node: PageIRNode = {
			id,
			type: item.type as string,
			props: canonical,
		};

		// Collect node-scoped assets
		const nodeAssets = collectAssets(node);
		if (nodeAssets.length > 0) {
			(node as { assets?: typeof nodeAssets }).assets = nodeAssets;
		}

		children.push(node);
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

	const { props: rootCanonical } = canonicalizeProps(rootRawProps);

	const root: PageIRNode = {
		id: "root",
		type: "__root__",
		props: rootCanonical,
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
