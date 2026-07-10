/**
 * @file Public error class for `@anvilkit/ir/migrations` cap
 * violations. Lives outside `internal/` so TypeDoc surfaces it on
 * the public api-snapshot — consumers `instanceof` against this
 * class to recover from invalid `meta` payloads.
 */

export interface NodeMetaValidationIssue {
	readonly code: string;
	readonly message: string;
	readonly path: ReadonlyArray<string | number>;
}

export class PageIRNodeMetaError extends Error {
	readonly issues: readonly NodeMetaValidationIssue[];
	constructor(issues: readonly NodeMetaValidationIssue[]) {
		const summary = issues
			.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
			.join("; ");
		super(`PageIRNodeMeta failed validation: ${summary}`);
		this.name = "PageIRNodeMetaError";
		this.issues = issues;
	}
}
