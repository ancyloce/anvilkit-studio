/**
 * @file Standalone lookup store for plugin-contributed export
 * formats.
 *
 * `compilePlugins()` (`core-008`) already aggregates registered
 * formats into a `Map` while building the {@link StudioRuntime}, but
 * format consumers — the future export UI button, CLI exporters,
 * test fixtures — want a richer interface than a bare map: stable
 * insertion order, conflict detection, and a small read-only
 * surface that hides the underlying storage.
 *
 * `createExportRegistry()` is a **factory**, not a class. The
 * returned object is a frozen interface implementation:
 *
 * - `list()` → formats in insertion order
 * - `get(id)` → format or `undefined`
 * - `has(id)` → boolean
 * - `size()` → count
 *
 * No subclassing, no `instanceof` gotchas, fully tree-shakable.
 *
 * ### Why a second duplicate-detection layer?
 *
 * `compilePlugins()` already rejects duplicate format ids at compile
 * time, naming both contributing plugins. This factory adds a second,
 * standalone check so consumers that build registries from anywhere
 * other than the compile pipeline (e.g. the CLI exporter walking a
 * static plugin manifest) still fail loud on conflicts. The errors
 * here are slightly less rich — only the format id is known at this
 * level — but they thrown the same {@link StudioPluginError} class
 * so callers can handle both layers with a single `catch`.
 *
 * ### Zero React, zero Puck
 *
 * This file imports only the `ExportFormatDefinition` type and the
 * `StudioPluginError` class. Both are React-free, so the registry
 * ships as pure JS suitable for server-only and CLI environments.
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-009-runtime-export-header.md | core-009}
 */

import type { ExportFormatDefinition } from "../types/export.js";
import { StudioPluginError } from "./errors.js";

/**
 * Read-only lookup interface returned by {@link createExportRegistry}.
 *
 * Methods are documented on the factory's return statement — see
 * `createExportRegistry` below for the exact semantics of each one.
 */
export interface ExportRegistry {
	/**
	 * Return every registered format, in the order they were passed
	 * to {@link createExportRegistry}.
	 *
	 * The returned array is a fresh snapshot — mutating it does not
	 * affect the registry.
	 */
	readonly list: () => ExportFormatDefinition[];

	/**
	 * Return the format registered under `id`, or `undefined` if no
	 * such format exists.
	 */
	readonly get: (id: string) => ExportFormatDefinition | undefined;

	/**
	 * Return `true` if a format with the given `id` is registered.
	 */
	readonly has: (id: string) => boolean;

	/**
	 * Return the number of registered formats.
	 */
	readonly size: () => number;
}

/**
 * Build an {@link ExportRegistry} from a flat array of
 * {@link ExportFormatDefinition} objects.
 *
 * The factory walks the array exactly once, validates that every
 * `id` is unique, and folds the formats into an insertion-ordered
 * `Map`. Subsequent calls to `list()` return the formats in the
 * same order they appeared in the input — host apps can rely on
 * this for stable export-menu ordering.
 *
 * @param formats - The flat array of export formats. Typically
 * built by walking the `exportFormats` field of every
 * {@link StudioPluginRegistration} the host app is loading.
 *
 * @throws {@link StudioPluginError} if two formats share the same
 * `id`. The error's `pluginId` field is set to the conflicting
 * format id (the registry layer does not know which plugin
 * contributed the format — `compilePlugins()` provides that
 * attribution at the layer above).
 */
export function createExportRegistry(
	formats: readonly ExportFormatDefinition[],
): ExportRegistry {
	// `Map` preserves insertion order per the ECMAScript spec, so the
	// iteration in `list()` matches the order callers passed in.
	const store = new Map<string, ExportFormatDefinition>();

	for (const format of formats) {
		if (store.has(format.id)) {
			throw new StudioPluginError(
				format.id,
				`Duplicate export format id "${format.id}" — every format registered with createExportRegistry must have a unique id`,
			);
		}
		store.set(format.id, format);
	}

	return {
		list: () => Array.from(store.values()),
		get: (id) => store.get(id),
		has: (id) => store.has(id),
		size: () => store.size,
	};
}
