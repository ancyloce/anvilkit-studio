/**
 * @file The JSON form of a source archive the workbench edits (P20): each
 * regular file as UTF-8 text when it decodes as such, otherwise as base64
 * carried unchanged. Paths are the archive's normalized relative paths.
 */

export type WorkbenchFile =
	| { readonly path: string; readonly text: string }
	| { readonly path: string; readonly base64: string };

/** `GET /api/agent/workbench/{operationId}/source` */
export interface WorkbenchSource {
	readonly operationId: string;
	/** The component source lineage a preview build edits (its subjectDigest). */
	readonly lineage: string;
	/** SHA-256 of the exact archive bytes read. */
	readonly digest: string;
	/** The saved revision the archive is, when the source authority names one. */
	readonly revision?: string;
	readonly files: readonly WorkbenchFile[];
}

/** `POST /api/agent/workbench/{operationId}/previews` */
export interface PreviewRequest {
	readonly commandId: string;
	readonly lineage: string;
	readonly baseRevision: string;
	readonly files: readonly WorkbenchFile[];
}

export function isTextFile(
	file: WorkbenchFile,
): file is { path: string; text: string } {
	return "text" in file;
}

/** Whether the file set differs from the base (by path and content). */
export function changedPaths(
	base: readonly WorkbenchFile[],
	edited: readonly WorkbenchFile[],
): string[] {
	const byPath = new Map(base.map((f) => [f.path, f]));
	const out: string[] = [];
	for (const f of edited) {
		const b = byPath.get(f.path);
		byPath.delete(f.path);
		if (!b || JSON.stringify(b) !== JSON.stringify(f)) out.push(f.path);
	}
	for (const p of byPath.keys()) out.push(p);
	return out.sort();
}
