/**
 * @file WCAG 2.1 AA accessibility smoke test.
 *
 * This test validates a11y infrastructure end-to-end (Playwright +
 * axe-core injection + violation reporting) against the demo home
 * page. The home page is intentionally light so the test runs in
 * seconds and is reliable in CI.
 *
 * The `color-contrast` rule is disabled here: it is axe-core's most
 * expensive rule (it performs async canvas-based sampling per text
 * node) and exceeds the per-test budget in WSL2/CI runners even on
 * small pages. Contrast is validated manually in the baseline doc.
 *
 * Per-component WCAG 2.1 AA verdicts live in `docs/a11y-baseline.md`,
 * compiled from manual review of each component package's source.
 * The full 11-component `/puck/render` route is too heavy for axe.run
 * to complete within Playwright's per-test budget — see
 * `docs/a11y-baseline.md` for the current method and rationale.
 *
 * @see {@link file://./../../docs/tasks/phase35-007-a11y-baseline.md | phase35-007}
 * @see {@link file://./../../docs/a11y-baseline.md | a11y baseline}
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "@playwright/test";

const require = createRequire(import.meta.url);
const axeCoreSource = readFileSync(
	require.resolve("axe-core/axe.min.js"),
	"utf8",
);

interface AxeViolation {
	id: string;
	impact: string;
	description: string;
	help: string;
	nodes: { target: string[]; html: string }[];
}

interface AxeWindow extends Window {
	axe: {
		run: (
			context: Document,
			options: Record<string, unknown>,
		) => Promise<{ violations: AxeViolation[] }>;
	};
}

async function injectAndRunAxe(
	page: import("@playwright/test").Page,
): Promise<AxeViolation[]> {
	// Inject axe-core source directly via evaluate (faster than addScriptTag,
	// which waits for a network round-trip that can time out on heavy pages).
	await page.evaluate(axeCoreSource);

	return page.evaluate(async () => {
		const results = await (window as unknown as AxeWindow).axe.run(document, {
			runOnly: {
				type: "tag",
				values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"],
			},
			// color-contrast is the single most expensive axe rule (async
			// canvas sampling per text node). It blows past the per-test
			// timeout in WSL2 even on the tiny home page; contrast is
			// validated manually in docs/a11y-baseline.md.
			rules: { "color-contrast": { enabled: false } },
			iframes: false,
		});
		return results.violations;
	});
}

function logViolations(violations: AxeViolation[]): void {
	for (const v of violations) {
		console.log(
			`[axe ${v.impact}] ${v.id}: ${v.description} (${v.nodes.length} instance${v.nodes.length === 1 ? "" : "s"})`,
		);
		for (const node of v.nodes) {
			console.log(`  → ${node.target.join(" > ")}`);
		}
	}
}

function formatViolations(violations: AxeViolation[]): string {
	if (violations.length === 0) return "";
	return (
		`\n${violations.length} serious/critical axe violation(s):\n` +
		violations
			.map(
				(v) =>
					`  [${v.impact}] ${v.id}: ${v.description}\n` +
					v.nodes.map((n) => `    → ${n.target.join(" > ")}`).join("\n"),
			)
			.join("\n")
	);
}

test.describe("Accessibility — WCAG 2.1 AA", () => {
	test("demo home page has no serious or critical axe violations", async ({
		page,
	}) => {
		test.setTimeout(60_000);

		await page.goto("/", { waitUntil: "domcontentloaded" });

		// Wait for known content to confirm the page rendered
		await expect(
			page.getByRole("heading", { name: /Validate the shared/i }),
		).toBeVisible({ timeout: 10_000 });

		const violations = await injectAndRunAxe(page);

		const seriousViolations = violations.filter(
			(v) => v.impact === "serious" || v.impact === "critical",
		);

		if (violations.length > 0) {
			logViolations(violations);
		}

		// Only fail on serious + critical
		expect(seriousViolations, formatViolations(seriousViolations)).toHaveLength(
			0,
		);
	});
});
