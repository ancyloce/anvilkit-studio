import type { PageIR } from "@anvilkit/core/types";
import type { Data } from "@puckeditor/core";

type PuckContentItem = Data["content"][number];
type SlotKind = "slot" | "zone";
type PageIRNodeWithSlots = PageIR["root"] & {
	readonly slot?: string;
	readonly slotKind?: SlotKind;
	readonly children?: readonly PageIRNodeWithSlots[];
};

const DEFAULT_NESTED_SLOT = "children";

function appendSlotContent(
	props: Record<string, unknown>,
	slotName: string,
	content: PuckContentItem,
): void {
	const existing = props[slotName];
	props[slotName] = [
		...(Array.isArray(existing) ? (existing as PuckContentItem[]) : []),
		content,
	];
}

/**
 * Reverse of {@link puckDataToIR}: rebuild a Puck `Data` document
 * from a {@link PageIR}.
 *
 * This function proves the round-trip guarantee — the invariant
 * `irToPuckData(puckDataToIR(d)) ≡ d` is what lets us snapshot
 * test IR shapes without drift. It is also the entry point the AI
 * copilot plugin uses to turn a validated LLM `PageIR` response
 * back into a `setData` payload.
 *
 * Returns a plain (un-frozen) Puck `Data` so Puck can mutate it.
 *
 * @param ir - The page IR document to rehydrate.
 * @returns A Puck `Data` equivalent to the IR input.
 */
export function irToPuckData(ir: PageIR): Data {
	const zones: Record<string, PuckContentItem[]> = {};

	function nodeToContent(node: PageIRNodeWithSlots): PuckContentItem {
		const props: Record<string, unknown> = {
			id: node.id,
			...(node.props as Record<string, unknown>),
		};

		for (const child of node.children ?? []) {
			const childContent = nodeToContent(child);
			const slotName = child.slot ?? DEFAULT_NESTED_SLOT;

			if (child.slotKind === "zone") {
				const zoneKey = `${node.id}:${slotName}`;
				zones[zoneKey] = [...(zones[zoneKey] ?? []), childContent];
				continue;
			}

			appendSlotContent(props, slotName, childContent);
		}

		return {
			type: node.type,
			props,
		} as PuckContentItem;
	}

	const content: PuckContentItem[] = [];

	// Rebuild root — only include `props` if the IR root carried
	// non-empty props (preserves round-trip for `root: {}`).
	const rootProps: Record<string, unknown> = {
		...(ir.root.props as Record<string, unknown>),
	};

	const rootNode = ir.root as PageIRNodeWithSlots;

	for (const child of rootNode.children ?? []) {
		const childContent = nodeToContent(child);

		if (child.slotKind === "zone" && child.slot) {
			const zoneKey = `root:${child.slot}`;
			zones[zoneKey] = [...(zones[zoneKey] ?? []), childContent];
			continue;
		}

		if (child.slot) {
			appendSlotContent(rootProps, child.slot, childContent);
			continue;
		}

		content.push(childContent);
	}

	const hasRootProps = Object.keys(rootProps).length > 0;

	const root: Record<string, unknown> = {};
	if (hasRootProps) {
		root.props = rootProps;
	}

	return {
		root,
		content,
		...(Object.keys(zones).length > 0 ? { zones } : {}),
	} as Data;
}
