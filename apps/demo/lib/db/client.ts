import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import {
	type BetterSQLite3Database,
	drizzle,
} from "drizzle-orm/better-sqlite3";

/**
 * Composition root for the demo's SQLite page store. The connection +
 * Drizzle instance are created once per process and memoized so every API
 * route and the public render path share one handle (mirrors
 * {@link ../page-store#getPageStorage}).
 *
 * Schema is guaranteed at boot via an idempotent {@link ensureSchema}
 * (`CREATE TABLE IF NOT EXISTS`) rather than runtime drizzle-kit migrations:
 * it needs no generated SQL on disk (so the standalone Docker image and the
 * `:memory:` test path both "just work"), and a demo single-table schema does
 * not need versioned migrations. `drizzle.config.ts` + the `drizzle:generate`
 * script are still provided for teams that want to adopt formal migrations
 * (e.g. to add a column) later.
 */
export type DemoDb = BetterSQLite3Database;

let db: DemoDb | null = null;

const CREATE_PAGES_TABLE = `
CREATE TABLE IF NOT EXISTS pages (
	id TEXT PRIMARY KEY,
	slug TEXT NOT NULL,
	status TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	data TEXT NOT NULL
);`;

const CREATE_SLUG_INDEX =
	"CREATE INDEX IF NOT EXISTS pages_slug_idx ON pages (slug);";
const CREATE_STATUS_INDEX =
	"CREATE INDEX IF NOT EXISTS pages_status_idx ON pages (status);";

/** Idempotent boot-time schema guarantee. Safe to call repeatedly (and in tests). */
export function ensureSchema(connection: Database.Database): void {
	connection.exec(CREATE_PAGES_TABLE);
	connection.exec(CREATE_SLUG_INDEX);
	connection.exec(CREATE_STATUS_INDEX);
}

function resolveDbPath(): string {
	return resolve(
		process.cwd(),
		process.env.ANVILKIT_PAGE_STORAGE_SQLITE_PATH ?? ".anvilkit/pages.sqlite",
	);
}

/** The memoized Drizzle handle over the demo's SQLite file (WAL mode). */
export function getDb(): DemoDb {
	if (db !== null) return db;
	const file = resolveDbPath();
	mkdirSync(dirname(file), { recursive: true });
	const connection = new Database(file);
	// WAL lets readers proceed while a writer holds the file — fine for the
	// demo's single-instance server (see the SQLite single-writer caveat in
	// docs/report/0008…).
	connection.pragma("journal_mode = WAL");
	ensureSchema(connection);
	db = drizzle(connection);
	return db;
}
