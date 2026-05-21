import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CopyScaffoldOptions {
	readonly sourceDir: string;
	readonly targetDir: string;
	readonly name: string;
}

export function copyScaffold({
	sourceDir,
	targetDir,
	name,
}: CopyScaffoldOptions): void {
	copyDirectory(sourceDir, targetDir, name);
}

function copyDirectory(
	sourceDir: string,
	targetDir: string,
	name: string,
): void {
	mkdirSync(targetDir, { recursive: true });

	for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
		const sourcePath = join(sourceDir, entry.name);
		const targetPath = join(targetDir, replacePlaceholders(entry.name, name));

		if (entry.isDirectory()) {
			copyDirectory(sourcePath, targetPath, name);
			continue;
		}

		const content = readFileSync(sourcePath, "utf8");
		writeFileSync(targetPath, replacePlaceholders(content, name), "utf8");
	}
}

function replacePlaceholders(input: string, name: string): string {
	return input.replaceAll("__NAME__", name);
}
