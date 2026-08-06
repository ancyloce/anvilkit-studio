/**
 * @file PLAN-0025 §7 — compiler diagnostic helpers.
 *
 * Thin layer over the existing editor error envelope: the compiler
 * never invents a new error shape, it reuses `EditorError` and the
 * shared `makeEditorError` factory, adding only the dedupe sink the
 * emission loop needs (same key rule as the export pipeline).
 */

import type { EditorError } from "@anvilkit/contracts/editor";

/** Deduplicating diagnostic sink (code|message|nodeIds key). */
export interface DiagnosticSink {
	readonly all: readonly EditorError[];
	add(entries: readonly EditorError[]): void;
}

export function createDiagnosticSink(): DiagnosticSink {
	const collected: EditorError[] = [];
	const seen = new Set<string>();
	return {
		get all(): readonly EditorError[] {
			return collected;
		},
		add(entries: readonly EditorError[]): void {
			for (const entry of entries) {
				const key = `${entry.code}|${entry.message}|${(entry.nodeIds ?? []).join(",")}`;
				if (seen.has(key)) continue;
				seen.add(key);
				collected.push(entry);
			}
		},
	};
}

/**
 * FNV-1a 32-bit hash, hex-encoded. Pure string math — identical in
 * Node, SSR, and browsers, which is exactly what the cross-surface
 * fingerprint contract needs (no `node:crypto`).
 */
export function fingerprintOf(text: string): string {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index += 1) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
