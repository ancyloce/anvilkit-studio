import type { ValidationIssue, ValidationResult } from "@anvilkit/validator";
import pc from "picocolors";

export function formatPretty(result: ValidationResult): string {
	const issueLines = result.issues.map((issue) => formatIssue(issue));
	const errorCount = result.issues.filter(
		(issue) => issue.level === "error",
	).length;
	const warningCount = result.issues.filter(
		(issue) => issue.level === "warning",
	).length;

	return [...issueLines, `${errorCount} errors, ${warningCount} warnings`].join(
		"\n",
	);
}

export function formatJson(result: ValidationResult): string {
	return JSON.stringify(result, null, 2);
}

function formatIssue(issue: ValidationIssue): string {
	const symbol = issue.level === "error" ? pc.red("×") : pc.yellow("!");
	const target = issue.componentName ?? issue.path.join(".");
	return `${symbol} [${issue.code}] ${target} — ${issue.message}`;
}
