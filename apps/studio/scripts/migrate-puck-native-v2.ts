/**
 * @file P5-02 — the migration CLI entry (PLAN-0025 §10.3).
 *
 * ```bash
 * pnpm --filter studio migrate:puck-native-v2 --all            # dry-run (default)
 * pnpm --filter studio migrate:puck-native-v2 --all --write
 * pnpm --filter studio migrate:puck-native-v2 --page <id> --write
 * pnpm --filter studio migrate:puck-native-v2 --slug <slug>
 * pnpm --filter studio migrate:puck-native-v2 --all --report ./artifacts/migration.json
 * pnpm --filter studio migrate:puck-native-v2 --restore <manifest.json>
 * ```
 *
 * Thin by design: arg parsing, environment wiring (storage backend
 * from `ANVILKIT_PAGE_STORAGE`, exactly like the app; NO demo
 * seeding), the §10.4 write-freeze guard (refuses `--write` while the
 * dev server holds :3000), and filesystem snapshots under
 * `.anvilkit/migration-backups/<runId>/`. All migration behavior
 * lives in `lib/migration/cli-core.ts` (vitest-covered, §14.5 drill
 * included).
 *
 * Runs under `tsx`. The `registerHooks` CSS no-op exists because
 * `lib/puck-demo.ts` resolves component packages from SOURCE via
 * tsconfig paths, and component sources side-effect-import their
 * stylesheets — irrelevant to migration, unloadable by Node.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { connect } from "node:net";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith(".css")) {
			return { format: "module", source: "", shortCircuit: true };
		}
		return nextLoad(url, context);
	},
});

const { values } = parseArgs({
	options: {
		write: { type: "boolean", default: false },
		all: { type: "boolean", default: false },
		page: { type: "string" },
		slug: { type: "string" },
		concurrency: { type: "string", default: "4" },
		report: { type: "string" },
		"token-mode": { type: "string" },
		restore: { type: "string" },
	},
});

/** §10.4 freeze guard: a live dev server means writes are NOT frozen. */
function devServerHoldsPort(port: number): Promise<boolean> {
	return new Promise((resolvePort) => {
		const socket = connect({ port, host: "127.0.0.1" });
		const done = (result: boolean) => {
			socket.destroy();
			resolvePort(result);
		};
		socket.once("connect", () => done(true));
		socket.once("error", () => done(false));
		socket.setTimeout(1_500, () => done(false));
	});
}

async function main(): Promise<number> {
	// Deferred imports: cli-core pulls @anvilkit/core (fine), and
	// puck-demo pulls component sources (needs the CSS hook above).
	const [{ demoConfig }, cliCore, storageModules] = await Promise.all([
		import("../lib/puck-demo"),
		import("../lib/migration/cli-core"),
		Promise.all([
			import("../lib/page-storage/sqlite-page-storage-adapter"),
			import("../lib/page-storage/filesystem-page-storage-adapter"),
			import("../lib/page-storage/memory-page-storage-adapter"),
		]),
	]);
	const [sqlite, filesystem, memory] = storageModules;

	// The app's backend selection, WITHOUT the demo seeding — the CLI
	// operates on existing stores only.
	const backend = process.env.ANVILKIT_PAGE_STORAGE ?? "sqlite";
	const storage =
		backend === "memory"
			? new memory.MemoryPageStorageAdapter()
			: backend === "filesystem"
				? new filesystem.FileSystemPageStorageAdapter({
						dir: resolve(
							process.cwd(),
							process.env.ANVILKIT_PAGE_STORAGE_DIR ?? ".anvilkit/pages",
						),
					})
				: new sqlite.SqlitePageStorageAdapter();

	const backupRoot = resolve(process.cwd(), ".anvilkit/migration-backups");
	const snapshots: import("../lib/migration/cli-core").SnapshotStore = {
		write: async (name, content) => {
			const path = resolve(backupRoot, name);
			await mkdir(resolve(path, ".."), { recursive: true });
			await writeFile(path, content, { flag: "wx" }); // immutable: never overwrite
			return path;
		},
		read: (address) => readFile(address, "utf8"),
	};

	const deps = {
		storage,
		config: demoConfig as unknown as import("@puckeditor/core").Config,
		snapshots,
		nowIso: () => new Date().toISOString(),
		...(values["token-mode"] !== undefined
			? { defaultTokenMode: values["token-mode"] }
			: {}),
	};

	if (values.restore !== undefined) {
		const manifest = JSON.parse(await readFile(values.restore, "utf8"));
		const outcome = await cliCore.restoreFromManifest(deps, manifest);
		console.log(
			`restore: ${outcome.restored} restored, ${outcome.missing} missing snapshots`,
		);
		return outcome.missing > 0 ? 1 : 0;
	}

	if (!values.all && values.page === undefined && values.slug === undefined) {
		console.error(
			"Select records: --all, --page <id>, or --slug <slug> (dry-run is the default; add --write to persist).",
		);
		return 1;
	}

	if (values.write === true && (await devServerHoldsPort(3000))) {
		console.error(
			"REFUSED: the dev server is live on :3000 — writes are not frozen (§10.4). Stop the server and re-run.",
		);
		return 1;
	}

	const report = await cliCore.migrateStore(deps, {
		write: values.write === true,
		selection: {
			...(values.all ? { all: true as const } : {}),
			...(values.page !== undefined ? { id: values.page } : {}),
			...(values.slug !== undefined ? { slug: values.slug } : {}),
		},
		concurrency: Number.parseInt(values.concurrency ?? "4", 10) || 4,
	});

	console.log(cliCore.formatRunSummary(report));
	if (values.report !== undefined) {
		const reportPath = resolve(values.report);
		await mkdir(resolve(reportPath, ".."), { recursive: true });
		await writeFile(reportPath, JSON.stringify(report, null, "\t"));
		console.log(`report written: ${reportPath}`);
	}
	if (report.mode === "write" && report.written > 0) {
		console.log(
			`backup manifest = the report above; snapshots under ${backupRoot}/${report.runId}/`,
		);
	}
	return report.errorCount > 0 ? 1 : 0;
}

main().then(
	(code) => {
		process.exitCode = code;
	},
	(error) => {
		console.error("migrate-puck-native-v2 crashed:", error);
		process.exitCode = 1;
	},
);
