#!/usr/bin/env node
/**
 * PLAN-0035 `cp5-R02` — assert the server-only AI key never reaches the client.
 *
 * WHY THIS GREPS THE BUILD ARTIFACT AND NOT THE SOURCE.
 *
 * `apps/studio/app/api/canvas/ai/_lib/replicate.ts` reads
 * `process.env.REPLICATE_API_TOKEN` server-side only, and the client gate is a
 * separate *public* flag (`NEXT_PUBLIC_AI_IMAGE_REAL`, read in
 * `lib/ai-image/provider-selection.ts`). That separation is a *design*: nothing
 * enforced it. The failure mode this guards against is a bundler inlining the
 * secret — renaming the flag to `NEXT_PUBLIC_REPLICATE_API_TOKEN`, reading the
 * token from a `"use client"` module, or hard-coding a literal. **A source grep
 * would pass forever in every one of those cases**, because the source would
 * still say `process.env.…`; only the emitted client chunk shows the inlined
 * value. So this scans what actually ships.
 *
 * WHAT IS SCANNED, AND WHY EACH DIRECTORY GETS A DIFFERENT RULE.
 *
 *   `.next/static/**`      — every byte Next serves to the browser (JS chunks,
 *                            CSS, media). Scanned for BOTH the server-only env
 *                            var *names* and for key-shaped literal values.
 *                            Neither may ever appear here.
 *   `.next/server/app/**`  — prerendered HTML and RSC payloads. These are also
 *     (`*.html`, `*.rsc`)   sent to the browser, so a key-shaped *value* here
 *                           is a leak too. Names are NOT checked here: the
 *                           route's own 503 remediation message legitimately
 *                           contains the string "REPLICATE_API_TOKEN", and a
 *                           name check would fire on the fix rather than the bug.
 *   `.next/server/**` (JS) — NOT scanned. Server bundles legitimately reference
 *                            `process.env.REPLICATE_API_TOKEN`; that is the
 *                            correct design, not a leak.
 *
 * WHAT "KEY-SHAPED" MEANS.
 *
 * Replicate API tokens carry the prefix `r8_` — established from Replicate's
 * own HTTP API reference (https://replicate.com/docs/reference/http), whose
 * authentication example reads `Authorization: Bearer r8_Hw***…`. The repo's
 * own `.env.example` ships the variable blank, so it supplies no shape. The
 * pattern below therefore anchors on that prefix plus a run of at least 20
 * alphanumerics (a real token is ~40).
 *
 *   CATCHES:      a literal Replicate token pasted or inlined anywhere in the
 *                 client output, at any realistic token length.
 *   DOES NOT CATCH: tokens from other providers (no `r8_` prefix); a token
 *                 split across concatenated string literals; a base64/encoded
 *                 token. It is a tripwire for the realistic accident, not a
 *                 proof of absence — the env-var-name check above is what
 *                 catches the realistic *mechanism* (a `NEXT_PUBLIC_` rename).
 *
 * The leading lookbehind is load-bearing: without it the pattern fires on any
 * base64url-encoded blob that happens to contain `r8_` mid-string, which a
 * 22 MB bundle full of inlined fonts and source maps guarantees. A gate that
 * fails on every build gets deleted; requiring `r8_` to start at a token
 * boundary keeps it quiet until it matters.
 *
 * SELF-TEST. Because "a grep that cannot fail is worse than none", the
 * detectors are exercised against synthetic inputs before the scan runs: an
 * obviously-fake constructed token must match, and a base64url control must
 * not. If either expectation breaks, this exits non-zero without scanning —
 * a broken detector reports as a failure, never as a clean build.
 *
 * Exit codes: 0 clean · 1 leak (or broken detector / missing artifact).
 * No dependencies; runs on bare node.
 *
 * Run it as: `pnpm --filter studio check:client-secret-leak` (after a build).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_ROOT = fileURLToPath(new URL("..", import.meta.url));

/**
 * Optional artifact root, for pointing the scan at a build output that is not
 * the app's live `.next` — a restored CI artifact, or a copy taken while a dev
 * server owns `.next` (Next 16's `next dev` replaces the production output with
 * `.next/dev`, which this check deliberately ignores: dev output never ships).
 * Purely a diagnostic convenience; the default and the "no artifact is a
 * FAILURE" rule below are unchanged.
 */
const NEXT_DIR = process.argv[2]
	? resolve(process.cwd(), process.argv[2])
	: resolve(APP_ROOT, ".next");
const CLIENT_DIR = resolve(NEXT_DIR, "static");
const PRERENDER_DIR = resolve(NEXT_DIR, "server", "app");

/**
 * Env vars that are read server-side only. Their *names* appearing in a client
 * chunk means client code is reading them, which under Next only works if the
 * value was inlined at build time.
 */
const SERVER_ONLY_ENV_VARS = ["REPLICATE_API_TOKEN", "UNSPLASH_ACCESS_KEY"];

/**
 * Literal Replicate token shape — see the header note on what it does/does not
 * catch. The lookbehind excludes the base64/base64url alphabet (`A-Za-z0-9`,
 * `+`, `/`, `_`, `-`) so the pattern cannot fire mid-blob, but deliberately
 * does **not** exclude `=`: base64 padding only ever terminates a blob, whereas
 * `=` immediately preceding a value is how a leak actually looks
 * (`?token=r8_…`, `AUTH=r8_…`). An earlier revision excluded `=` and a real
 * end-to-end leak probe (`baseUrl: "/api/canvas/ai?t=<token>"`) walked straight
 * through it. Keep `=` out of this set.
 */
const KEY_SHAPE = /(?<![A-Za-z0-9_+/-])r8_[A-Za-z0-9]{20,}/;

/** Prerendered payload extensions that reach the browser verbatim. */
const PRERENDER_EXTENSIONS = [".html", ".rsc"];

/**
 * Anchor: the *server* bundle must still read the token. Without this, a build
 * that had dropped the AI routes entirely would pass the leak scan trivially —
 * a vacuous green. Scanned under `.next/server` where the name is expected and
 * correct.
 */
const SERVER_ANCHOR = "REPLICATE_API_TOKEN";
const SERVER_DIR = resolve(NEXT_DIR, "server");

/**
 * Positive control. Obviously fake and deliberately not a valid credential:
 * assembled at runtime from a repeated literal so no key-shaped string is
 * committed to this repository. Never replace this with a real token.
 */
const FAKE_TOKEN = `r8_${"FAKE".repeat(10)}`;

/** Negative control: the same shape embedded mid-blob, as base64url would produce. */
const BASE64URL_CONTROL = `Zm9vYmFy${FAKE_TOKEN}`;

/**
 * Positive controls that a real leak looks like. The `?t=` case is the one an
 * end-to-end probe caught escaping an over-strict lookbehind — it stays here so
 * the same hole cannot be reopened.
 */
const LEAK_CONTROLS = [
	FAKE_TOKEN,
	`"/api/canvas/ai?t=${FAKE_TOKEN}"`,
	`{auth:"${FAKE_TOKEN}"}`,
	`Bearer ${FAKE_TOKEN}`,
];

function fail(message) {
	console.error(`\ncheck:client-secret-leak — FAIL\n\n${message}\n`);
	process.exit(1);
}

function selfTest() {
	for (const control of LEAK_CONTROLS) {
		if (!KEY_SHAPE.test(control)) {
			fail(
				"Detector is broken: the key-shape pattern no longer matches a token of the\n" +
					`documented \`r8_\` shape in the context ${JSON.stringify(
						control.replace(FAKE_TOKEN, "<fake-token>"),
					)}.\n` +
					"It would report a leaking build clean. Fix the pattern.",
			);
		}
	}
	if (KEY_SHAPE.test(BASE64URL_CONTROL)) {
		fail(
			"Detector is too loose: the key-shape pattern matches a base64url blob that\n" +
				"merely contains `r8_` mid-string. It would fail on every build. Restore the\n" +
				"leading token-boundary lookbehind.",
		);
	}
	for (const name of SERVER_ONLY_ENV_VARS) {
		if (!`process.env.${name}`.includes(name)) {
			fail(`Detector is broken: env-var name check for ${name} cannot fire.`);
		}
	}
}

/** Every file under `dir`, recursively. Returns `[]` when `dir` is absent. */
function walk(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		if (err.code === "ENOENT") return [];
		throw err;
	}
	const files = [];
	for (const entry of entries) {
		const abs = resolve(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...walk(abs));
		} else if (entry.isFile()) {
			files.push(abs);
		}
	}
	return files;
}

/**
 * Read as latin1 so every byte maps to a character: patterns still match inside
 * fonts, images, and source maps without a UTF-8 decode reinterpreting bytes.
 */
function readBytesAsText(abs) {
	return readFileSync(abs, "latin1");
}

/** A leak excerpt that proves the hit without printing the secret into CI logs. */
function redact(match) {
	return `${match.slice(0, 5)}…[${match.length - 5} chars redacted]`;
}

function lineOf(text, index) {
	let line = 1;
	for (let i = 0; i < index; i += 1) {
		if (text.charCodeAt(i) === 10) line += 1;
	}
	return line;
}

function scan() {
	selfTest();

	const clientFiles = walk(CLIENT_DIR);
	if (clientFiles.length === 0) {
		fail(
			`No client build output at ${relative(APP_ROOT, CLIENT_DIR)}.\n` +
				"This check asserts against the BUILT artifact, so an absent build is a\n" +
				"failure, not a pass. Run `pnpm --filter studio build` first.",
		);
	}

	const prerenderFiles = walk(PRERENDER_DIR).filter((abs) =>
		PRERENDER_EXTENSIONS.some((ext) => abs.endsWith(ext)),
	);

	const serverJs = walk(SERVER_DIR).filter((abs) => abs.endsWith(".js"));
	const anchored = serverJs.some((abs) =>
		readBytesAsText(abs).includes(SERVER_ANCHOR),
	);
	if (!anchored) {
		fail(
			`Anchor missing: no server bundle under ${relative(APP_ROOT, SERVER_DIR)}\n` +
				`references \`${SERVER_ANCHOR}\`. Either the AI routes are gone from this\n` +
				"build — in which case this scan proves nothing and would pass vacuously —\n" +
				"or the token is no longer read server-side. If the routes were removed on\n" +
				"purpose, remove this anchor deliberately; do not weaken it to reach green.",
		);
	}

	const findings = [];
	let scannedBytes = 0;

	for (const abs of clientFiles) {
		const text = readBytesAsText(abs);
		scannedBytes += statSync(abs).size;
		for (const name of SERVER_ONLY_ENV_VARS) {
			const at = text.indexOf(name);
			if (at !== -1) {
				findings.push({
					file: relative(APP_ROOT, abs),
					line: lineOf(text, at),
					kind: `server-only env var name \`${name}\``,
					excerpt: name,
				});
			}
		}
		const shaped = KEY_SHAPE.exec(text);
		if (shaped) {
			findings.push({
				file: relative(APP_ROOT, abs),
				line: lineOf(text, shaped.index),
				kind: "literal Replicate-token-shaped string",
				excerpt: redact(shaped[0]),
			});
		}
	}

	for (const abs of prerenderFiles) {
		const text = readBytesAsText(abs);
		scannedBytes += statSync(abs).size;
		const shaped = KEY_SHAPE.exec(text);
		if (shaped) {
			findings.push({
				file: relative(APP_ROOT, abs),
				line: lineOf(text, shaped.index),
				kind: "literal Replicate-token-shaped string (prerendered payload)",
				excerpt: redact(shaped[0]),
			});
		}
	}

	if (findings.length > 0) {
		fail(
			`${findings.length} secret leak(s) in output served to the browser:\n\n` +
				findings
					.map(
						(f) =>
							`  ${f.file}:${f.line}\n    ${f.kind}\n    match: ${f.excerpt}`,
					)
					.join("\n\n") +
				"\n\n" +
				"The AI token is server-only by design (app/api/canvas/ai/_lib/replicate.ts)\n" +
				"and the client gate is the separate public flag NEXT_PUBLIC_AI_IMAGE_REAL\n" +
				"(lib/ai-image/provider-selection.ts). Do not add the secret to a\n" +
				"NEXT_PUBLIC_ variable and do not read it from client code.",
		);
	}

	const mb = (scannedBytes / 1024 / 1024).toFixed(1);
	console.log(
		"check:client-secret-leak — PASS\n" +
			`  detectors self-tested: key-shape (${LEAK_CONTROLS.length} leak contexts + base64url negative), ${SERVER_ONLY_ENV_VARS.length} env-var names\n` +
			`  anchor: \`${SERVER_ANCHOR}\` present in the server bundle (routes are in this build)\n` +
			`  scanned ${clientFiles.length} client file(s) under ${relative(APP_ROOT, CLIENT_DIR)}\n` +
			`  scanned ${prerenderFiles.length} prerendered payload(s) under ${relative(APP_ROOT, PRERENDER_DIR)}\n` +
			`  ${mb} MB of shipped bytes, 0 findings`,
	);
}

scan();
