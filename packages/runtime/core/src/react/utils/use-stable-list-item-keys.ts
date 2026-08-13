"use client";

/**
 * Stable React keys for object-valued editor lists.
 *
 * Keys live only in this hook's registry. They are never attached to the
 * values that Puck persists. A unique Puck `_arrayId` is honored when one is
 * present; otherwise object identity distinguishes even structurally equal
 * rows. Callers use `inheritKey` when an edit replaces one logical item with
 * a new object.
 */

import { useCallback, useState } from "react";

interface KeyOwner {
	readonly item: object;
	readonly key: string;
}

interface StableKeyRegistry {
	readonly objectKeys: WeakMap<object, string>;
	readonly puckIdOwners: Map<string, KeyOwner>;
	nextKey: number;
}

interface StableListItemKeys<T extends object> {
	readonly keys: readonly string[];
	readonly inheritKey: (previous: T, replacement: T) => void;
}

function createRegistry(): StableKeyRegistry {
	return {
		objectKeys: new WeakMap(),
		puckIdOwners: new Map(),
		nextKey: 0,
	};
}

function puckArrayId(item: object): string | null {
	const value = (item as { readonly _arrayId?: unknown })._arrayId;
	return typeof value === "string" && value.length > 0 ? value : null;
}

function generatedKey(registry: StableKeyRegistry): string {
	const key = `item:${registry.nextKey}`;
	registry.nextKey += 1;
	return key;
}

function keyFor(registry: StableKeyRegistry, item: object): string {
	const existing = registry.objectKeys.get(item);
	if (existing !== undefined) return existing;

	const puckId = puckArrayId(item);
	const owner = puckId === null ? undefined : registry.puckIdOwners.get(puckId);
	const key =
		puckId !== null && owner === undefined
			? `puck-array:${puckId}`
			: generatedKey(registry);
	registry.objectKeys.set(item, key);
	if (puckId !== null && owner === undefined) {
		registry.puckIdOwners.set(puckId, { item, key });
	}
	return key;
}

/**
 * Resolve stable keys for a list and provide lineage for object replacements.
 */
export function useStableListItemKeys<T extends object>(
	items: readonly T[],
): StableListItemKeys<T> {
	const [registry] = useState(createRegistry);
	const currentItems = new Set<object>(items);
	for (const [puckId, owner] of registry.puckIdOwners) {
		if (!currentItems.has(owner.item)) {
			registry.puckIdOwners.delete(puckId);
		}
	}
	const keys = items.map((item) => keyFor(registry, item));

	const inheritKey = useCallback(
		(previous: T, replacement: T): void => {
			const key = keyFor(registry, previous);
			registry.objectKeys.set(replacement, key);
			const previousPuckId = puckArrayId(previous);
			const replacementPuckId = puckArrayId(replacement);
			if (
				previousPuckId !== null &&
				previousPuckId === replacementPuckId &&
				registry.puckIdOwners.get(previousPuckId)?.item === previous
			) {
				registry.puckIdOwners.set(previousPuckId, {
					item: replacement,
					key,
				});
			}
		},
		[registry],
	);

	return { keys, inheritKey };
}
