/**
 * Plan 0005 Phase 3 browser acceptance of the component-generation progress
 * views (§6 rows B1–B5).
 *
 * Two suites, both skipped without their environment:
 *
 * - "Agent API double": `ANVILKIT_E2E_AGENT_DOUBLE=<url>` names a running
 *   `e2e/fixtures/agent-api-double.mjs`, and this Studio dev server was
 *   started with `ANVILKIT_AGENT_API_URL=<url>` and its token. The double
 *   replays recorded streams and injects disconnects, resets, 429, 403 and
 *   a lost create response: synthetic acceptance of the client rules (B2
 *   display, B3 reconnect/reset/errors, B4 linkage/locale, B5 strings). It
 *   proves nothing about the platform.
 * - "real platform" (B1): `ANVILKIT_E2E_AGENT_REAL=1` with the Studio
 *   configured against a deployed Agent API; spends model budget and needs
 *   its own authorization. It records a summary under
 *   `ANVILKIT_E2E_EVIDENCE_DIR` when set.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
	type APIRequestContext,
	expect,
	type Page,
	test,
} from "@playwright/test";

const DOUBLE = process.env.ANVILKIT_E2E_AGENT_DOUBLE ?? "";
const REAL = process.env.ANVILKIT_E2E_AGENT_REAL === "1";
const EVIDENCE = process.env.ANVILKIT_E2E_EVIDENCE_DIR ?? "";

/** The seven stages of plan 0005 §1 as message keys, in execution order (the first is the preparation's). */
const SEVEN_STAGES = [
	"progress.stage.planningDone",
	"progress.stage.coding",
	"progress.stage.reviewDone",
	"progress.stage.validating",
	"progress.stage.validationPassed",
	"progress.stage.generationDone",
];

const PROMPT =
	"A notice strip for the top of a page: one line of text, a dismiss button and an accent colour chosen from the theme.";

async function controlDouble(
	request: APIRequestContext,
	body: Record<string, unknown>,
): Promise<void> {
	const r = await request.post(`${DOUBLE}/__double/control`, { data: body });
	expect(r.ok()).toBe(true);
}

type DoubleOperation = {
	operationId: string;
	kind: string;
	commandId: string;
	briefId: string;
	frames: number;
	available: number;
	sourceDigest: string;
	eventRequests: number;
};

async function doubleState(
	request: APIRequestContext,
): Promise<{ operations: DoubleOperation[] }> {
	const r = await request.get(`${DOUBLE}/__double/state`);
	expect(r.ok()).toBe(true);
	return (await r.json()) as { operations: DoubleOperation[] };
}

/** Submits a preparation and waits for its brief; returns the preparation operation id. */
async function prepare(page: Page, timeout = 60_000): Promise<string> {
	await page.goto("/agent/prepare");
	await page.getByTestId("prepare-form").waitFor();
	await page.locator("#prepare-prompt").fill(PROMPT);
	await page.getByTestId("prepare-submit").click();
	await page.waitForURL(/operationId=op_/);
	const id = new URL(page.url()).searchParams.get("operationId") ?? "";
	expect(id).toMatch(/^op_/);
	await answerClarifications(page, timeout);
	await waitCompleted(page, 5_000, "preparation-timeline", "preparation");
	await expect(page.getByTestId("prepare-done")).toBeVisible();
	return id;
}

/** How long a waiting preparation may go without showing its question form. */
const QUESTION_FORM_GRACE = 30_000;

/**
 * Drives the preparation to a terminal outcome, answering every posed
 * clarification round with a neutral answer (the real platform may ask; the
 * double never does). Each pass reads the page once and acts on one state, so
 * no single locator wait can end the pass early: the earlier race of three
 * `waitFor`s settled on whichever settled first, a rejection included, and
 * returned without answering. A preparation that waits for answers without
 * showing the form fails within QUESTION_FORM_GRACE with that reason (the
 * real-platform run of 2026-10-28 never rendered the posed questions and
 * failed 20 minutes later on the completed outcome instead).
 */
async function answerClarifications(
	page: Page,
	timeout: number,
): Promise<void> {
	const deadline = Date.now() + timeout;
	const questions = page.getByTestId("prepare-questions");
	const terminal = page
		.locator(
			'[data-testid="preparation-timeline"] [data-testid="progress-outcome"]:is([data-outcome="completed"], [data-outcome="failed"], [data-outcome="canceled"])',
		)
		.first();
	const waiting = page.locator(
		'[data-testid="operation-panel"][data-lifecycle="waiting"]',
	);
	let formless: number | null = null;
	for (;;) {
		if (await terminal.isVisible()) return;
		if (await questions.isVisible()) {
			formless = null;
			for (const input of await questions.locator("input").all()) {
				await input.fill("Use a sensible default.");
			}
			await page.getByTestId("prepare-answers-submit").click();
			await expect(questions).toBeHidden({ timeout: 60_000 });
			continue;
		}
		if (await waiting.isVisible()) {
			formless ??= Date.now();
			expect(
				Date.now() - formless,
				"the preparation waits for answers but shows no question form",
			).toBeLessThan(QUESTION_FORM_GRACE);
		} else {
			formless = null;
		}
		expect(
			Date.now(),
			"the preparation reached no terminal outcome in time",
		).toBeLessThan(deadline);
		await page.waitForTimeout(1_000);
	}
}

/** Clicks "Generate component" on the preparation and waits for the generation view; returns its id. */
async function generate(page: Page): Promise<string> {
	await page.getByTestId("generate-component").click();
	await page.waitForURL(/\/agent\/operations\/op_[A-Za-z0-9]+\?from=op_/);
	const url = new URL(page.url());
	return url.pathname.split("/").at(-1) ?? "";
}

const entrySelector = (timeline: string) =>
	`[data-testid="${timeline}"] [data-testid="progress-entry"]`;

async function messageKeys(
	page: Page,
	timeline = "progress-timeline",
): Promise<string[]> {
	return page
		.locator(entrySelector(timeline))
		.evaluateAll((els) =>
			els.map((e) => (e as HTMLElement).dataset.messageKey ?? ""),
		);
}

async function eventSeqs(
	page: Page,
	timeline = "progress-timeline",
): Promise<string[]> {
	return page
		.locator(entrySelector(timeline))
		.evaluateAll((els) =>
			els.map((e) => (e as HTMLElement).dataset.eventSeq ?? ""),
		);
}

function inOrder(keys: string[], expected: string[]): boolean {
	let at = 0;
	for (const k of keys) if (k === expected[at]) at += 1;
	return at === expected.length;
}

/**
 * Waits for an operation's terminal outcome on its timeline and requires the
 * completed one: a failed or canceled run ends the wait at once with the
 * reason the timeline shows (the real-platform run of 2026-10-27 waited 15
 * minutes past a failure). An unresolved (reconciling) run is not terminal;
 * the wait goes on.
 */
async function waitCompleted(
	page: Page,
	timeout: number,
	timeline = "progress-timeline",
	what = "generation",
): Promise<void> {
	const terminal = page
		.locator(
			`[data-testid="${timeline}"] [data-testid="progress-outcome"]:is([data-outcome="completed"], [data-outcome="failed"], [data-outcome="canceled"])`,
		)
		.first();
	await terminal.waitFor({ timeout });
	const outcome = await terminal.getAttribute("data-outcome");
	const shown = (await terminal.innerText()).trim();
	expect(outcome, `the ${what} ended ${outcome}: ${shown}`).toBe("completed");
}

async function download(
	page: Page,
): Promise<{ digest: string; revision: string }> {
	await page.getByTestId("generation-download").click();
	const state = page.getByTestId("generation-download-state");
	await expect(state).toHaveAttribute("data-state", "verified", {
		timeout: 60_000,
	});
	return {
		digest: (await state.getAttribute("data-digest")) ?? "",
		revision: (await state.getAttribute("data-revision")) ?? "",
	};
}

test.describe("component generation progress (Agent API double)", () => {
	test.describe.configure({ mode: "serial" });
	test.skip(!DOUBLE, "ANVILKIT_E2E_AGENT_DOUBLE names no running double");

	test("preparation, generation, the seven stages in order, one operation per intent, verified download", async ({
		page,
		request,
	}) => {
		const before = (await doubleState(request)).operations.length;
		const prep = await prepare(page);
		expect(await messageKeys(page, "preparation-timeline")).toContain(
			"progress.stage.analysisDone",
		);
		const gen = await generate(page);
		expect(new URL(page.url()).searchParams.get("from")).toBe(prep);
		await expect(page.getByTestId("preparation-timeline")).toBeVisible();
		await waitCompleted(page, 60_000);
		const keys = await messageKeys(page);
		expect(inOrder(keys, SEVEN_STAGES), keys.join(",")).toBe(true);
		const seqs = await eventSeqs(page);
		expect(new Set(seqs).size).toBe(seqs.length);
		const ops = (await doubleState(request)).operations;
		expect(ops.length).toBe(before + 2);
		const op = ops.find((o) => o.operationId === gen);
		expect(op?.kind).toBe("generation");
		const { digest, revision } = await download(page);
		expect(digest).toBe(op?.sourceDigest);
		expect(revision).toBe("1");
		// The intent is accepted: the preparation now offers the link and "Generate again", never a silent second post.
		await page.goto(`/agent/prepare?operationId=${prep}`);
		await expect(page.getByTestId("open-generation")).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("generate-again")).toBeVisible();
		expect((await doubleState(request)).operations.length).toBe(before + 2);
	});

	test("a forced disconnect resumes from the last processed id: no duplicate entries, no second operation", async ({
		page,
		request,
	}) => {
		await prepare(page);
		const gen = await generate(page);
		await expect
			.poll(async () => (await eventSeqs(page)).length)
			.toBeGreaterThanOrEqual(4);
		await controlDouble(request, { operationId: gen, action: "disconnect" });
		await expect
			.poll(
				async () =>
					(await doubleState(request)).operations.find(
						(o) => o.operationId === gen,
					)?.eventRequests ?? 0,
				{ timeout: 15_000 },
			)
			.toBeGreaterThanOrEqual(2);
		await waitCompleted(page, 60_000);
		const seqs = await eventSeqs(page);
		expect(new Set(seqs).size).toBe(seqs.length);
		expect(inOrder(await messageKeys(page), SEVEN_STAGES)).toBe(true);
		expect(
			(await doubleState(request)).operations.filter(
				(o) => o.kind === "generation" && o.operationId === gen,
			),
		).toHaveLength(1);
	});

	test("reset_required takes the snapshot baseline and marks the missing history; completion still comes from the snapshot", async ({
		page,
		request,
	}) => {
		await prepare(page);
		const gen = await generate(page);
		await expect
			.poll(async () => (await eventSeqs(page)).length)
			.toBeGreaterThanOrEqual(3);
		await controlDouble(request, {
			operationId: gen,
			action: "reset",
			historyFrom: 24,
		});
		await expect(page.getByTestId("progress-history-gap")).toBeVisible({
			timeout: 30_000,
		});
		await waitCompleted(page, 60_000);
		const seqs = await eventSeqs(page);
		expect(new Set(seqs).size).toBe(seqs.length);
		await expect(page.getByTestId("progress-timeline")).toHaveAttribute(
			"data-stream",
			"closed",
			{ timeout: 15_000 },
		);
	});

	test("a retryable 429 waits Retry-After and continues; a 403 stops the stream without retrying", async ({
		page,
		request,
	}) => {
		await prepare(page);
		const gen = await generate(page);
		await expect
			.poll(async () => (await eventSeqs(page)).length)
			.toBeGreaterThanOrEqual(2);
		await controlDouble(request, {
			operationId: gen,
			action: "busy",
			count: 2,
		});
		await expect(page.getByTestId("progress-timeline-busy")).toBeVisible({
			timeout: 10_000,
		});
		await waitCompleted(page, 60_000);

		await prepare(page);
		const forbidden = await generate(page);
		await expect
			.poll(async () => (await eventSeqs(page)).length)
			.toBeGreaterThanOrEqual(1);
		await controlDouble(request, { operationId: forbidden, action: "forbid" });
		await expect(page.getByTestId("progress-timeline-error")).toContainText(
			"Not permitted",
			{ timeout: 15_000 },
		);
		await expect(page.getByTestId("progress-timeline")).toHaveAttribute(
			"data-stream",
			"closed",
		);
		const requests =
			(await doubleState(request)).operations.find(
				(o) => o.operationId === forbidden,
			)?.eventRequests ?? 0;
		await page.waitForTimeout(2_500);
		expect(
			(await doubleState(request)).operations.find(
				(o) => o.operationId === forbidden,
			)?.eventRequests,
		).toBe(requests);
	});

	test("a lost create response is retried with the identical command id: the API returns the original operation", async ({
		page,
		request,
	}) => {
		const prep = await prepare(page);
		const before = (await doubleState(request)).operations.filter(
			(o) => o.kind === "generation",
		).length;
		await controlDouble(request, { action: "lose-next-create" });
		await page.getByTestId("generate-component").click();
		await expect(page.getByTestId("prepare-notice")).toBeVisible({
			timeout: 15_000,
		});
		expect(page.url()).toContain(`operationId=${prep}`);
		await page.getByTestId("generate-component").click();
		await page.waitForURL(/\/agent\/operations\/op_/);
		const after = (await doubleState(request)).operations.filter(
			(o) => o.kind === "generation",
		);
		expect(after.length).toBe(before + 1);
		await waitCompleted(page, 60_000);
	});

	test("refresh keeps the linkage, a direct link shows the generation alone, a locale switch re-renders every entry without duplicates or requests", async ({
		page,
		request,
	}) => {
		const prep = await prepare(page);
		const gen = await generate(page);
		await waitCompleted(page, 60_000);
		const count = (await eventSeqs(page)).length;
		await page.reload();
		await expect(page.getByTestId("preparation-timeline")).toBeVisible({
			timeout: 30_000,
		});
		await waitCompleted(page, 60_000);
		expect((await eventSeqs(page)).length).toBe(count);
		await page.goto(`/agent/operations/${gen}`);
		await expect(page.getByTestId("preparation-link-missing")).toBeVisible({
			timeout: 30_000,
		});
		await expect(page.getByTestId("preparation-timeline")).toHaveCount(0);
		await page.goto(`/agent/operations/${gen}?from=${prep}`);
		await waitCompleted(page, 60_000);
		const ops = (await doubleState(request)).operations.length;
		// Switch to Chinese through the shared switcher: the outcome and the
		// entries retranslate; the entry set and the operations do not change.
		await page
			.getByRole("combobox", { name: /Language|语言|言語|언어/ })
			.click();
		await page.getByRole("option", { name: "中文" }).click();
		await expect(
			page.locator(
				'[data-testid="progress-timeline"] [data-testid="progress-outcome"]',
			),
		).toContainText("组件生成完成", { timeout: 15_000 });
		await expect(page.getByTestId("progress-timeline-current")).toContainText(
			"组件生成完成",
		);
		expect((await eventSeqs(page)).length).toBe(count);
		expect((await doubleState(request)).operations.length).toBe(ops);
		await page
			.getByRole("combobox", { name: /Language|语言|言語|언어/ })
			.click();
		await page.getByRole("option", { name: "English" }).click();
		await expect(
			page.locator(
				'[data-testid="progress-timeline"] [data-testid="progress-outcome"]',
			),
		).toContainText("Component generation completed", { timeout: 15_000 });
	});

	test("a node the model's own output failed renders the localized model-output summary with the code as metadata; the run fails on the observer's code", async ({
		page,
		request,
	}) => {
		await controlDouble(request, {
			action: "fixture",
			fixture: "generation-model-error",
		});
		try {
			await prepare(page);
			await generate(page);
			await expect(
				page.locator(
					'[data-testid="progress-timeline"] [data-testid="progress-outcome"][data-outcome="failed"]',
				),
			).toBeVisible({ timeout: 60_000 });
			const failed = page.locator(
				'[data-testid="progress-entry"][data-message-key="progress.error.modelOutput"]',
			);
			await expect(failed).toHaveCount(1);
			await expect(failed.getByTestId("progress-code")).toHaveText(
				"UPSTREAM_TOOL_ARGUMENTS_INVALID",
			);
			await expect(failed).toContainText("invalid tool output");
			await expect(
				page.locator(
					'[data-testid="progress-timeline"] [data-testid="progress-outcome"]',
				),
			).toContainText("OBSERVER_FAILED");
			await expect(page.getByTestId("generation-download")).toHaveCount(0);
		} finally {
			await controlDouble(request, {
				action: "fixture",
				fixture: "generation-success",
			});
		}
	});
});

test.describe("component generation progress (real platform, B1)", () => {
	test.skip(
		!REAL,
		"ANVILKIT_E2E_AGENT_REAL=1 is not set (an authorized real-model run)",
	);
	test.setTimeout(20 * 60_000);

	test("prepare in the browser, generate, survive a disconnect, complete, download the verified source", async ({
		page,
		context,
	}) => {
		const prep = await prepare(page, 10 * 60_000);
		const gen = await generate(page);
		await expect
			.poll(async () => (await eventSeqs(page)).length, { timeout: 5 * 60_000 })
			.toBeGreaterThanOrEqual(8);
		// One forced disconnect: the browser goes offline for a moment; the
		// reader resumes from its last processed id without a second intent.
		await context.setOffline(true);
		await page.waitForTimeout(3_000);
		await context.setOffline(false);
		await waitCompleted(page, 15 * 60_000);
		const keys = await messageKeys(page);
		expect(inOrder(keys, SEVEN_STAGES), keys.join(",")).toBe(true);
		const seqs = await eventSeqs(page);
		expect(new Set(seqs).size).toBe(seqs.length);
		expect(new URL(page.url()).pathname.endsWith(gen)).toBe(true);
		const first = await download(page);
		expect(first.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
		// A second read answers the same digest and revision.
		const second = await page.request.get(
			`/api/agent/v1/operations/${gen}/source`,
		);
		expect(second.ok()).toBe(true);
		expect(second.headers()["anvilkit-source-digest"]).toBe(first.digest);
		expect(second.headers()["anvilkit-source-revision"]).toBe(first.revision);
		if (EVIDENCE) {
			mkdirSync(EVIDENCE, { recursive: true });
			writeFileSync(
				path.join(EVIDENCE, "browser-b1.json"),
				JSON.stringify(
					{
						preparation: prep,
						generation: gen,
						messageKeys: keys,
						eventSeqs: seqs,
						source: first,
						recordedAt: new Date().toISOString(),
					},
					null,
					2,
				),
			);
		}
	});
});
