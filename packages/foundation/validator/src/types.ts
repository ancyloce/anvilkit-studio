export interface ValidationIssue {
	readonly level: "error" | "warning";
	readonly code: string;
	readonly message: string;
	readonly path: readonly (string | number)[];
	readonly componentName?: string;
}

export interface ValidationResult {
	readonly valid: boolean;
	readonly issues: readonly ValidationIssue[];
}
