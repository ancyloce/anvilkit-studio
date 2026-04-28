import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import pc from "picocolors";

/**
 * Captures intended file edits during a dry-run pass so the CLI can
 * print a human-reviewable summary before any disk write happens.
 *
 * Phase 6 / M11 / `phase6-010`.
 */

export interface PendingEdit {
	readonly path: string;
	readonly before: string;
	readonly after: string;
}

export class EditPlan {
	private readonly edits: PendingEdit[] = [];

	constructor(private readonly cwd: string) {}

	read(absolutePath: string): string {
		if (!existsSync(absolutePath)) return "";
		return readFileSync(absolutePath, "utf8");
	}

	stage(absolutePath: string, after: string): void {
		const before = this.read(absolutePath);
		if (before === after) return;
		this.edits.push({ path: absolutePath, before, after });
	}

	get isEmpty(): boolean {
		return this.edits.length === 0;
	}

	get count(): number {
		return this.edits.length;
	}

	commit(): ReadonlyArray<string> {
		const written: string[] = [];
		for (const edit of this.edits) {
			writeFileSync(edit.path, edit.after, "utf8");
			written.push(relative(this.cwd, edit.path));
		}
		return written;
	}

	formatDiff(): string {
		if (this.edits.length === 0) return pc.dim("(no file edits)");
		const blocks: string[] = [];
		for (const edit of this.edits) {
			const rel = relative(this.cwd, edit.path);
			const beforeLines = edit.before.split("\n");
			const afterLines = edit.after.split("\n");
			const header = pc.bold(`--- ${rel}`);
			const diff = unifiedDiff(beforeLines, afterLines);
			blocks.push(`${header}\n${diff}`);
		}
		return blocks.join("\n\n");
	}
}

function unifiedDiff(
	before: ReadonlyArray<string>,
	after: ReadonlyArray<string>,
): string {
	const max = Math.max(before.length, after.length);
	const lines: string[] = [];
	for (let i = 0; i < max; i++) {
		const a = before[i];
		const b = after[i];
		if (a === b) continue;
		if (a !== undefined) lines.push(pc.red(`- ${a}`));
		if (b !== undefined) lines.push(pc.green(`+ ${b}`));
	}
	if (lines.length === 0) return pc.dim("  (whitespace-only change)");
	return lines.join("\n");
}

export function resolveProjectFile(
	cwd: string,
	candidates: ReadonlyArray<string>,
): string | undefined {
	for (const candidate of candidates) {
		const absolute = resolve(cwd, candidate);
		if (existsSync(absolute)) return absolute;
	}
	return undefined;
}
