import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit config for the demo's SQLite page store. Runtime schema is
 * guaranteed by `ensureSchema()` in `lib/db/client.ts`, so this config is only
 * needed by teams that adopt formal migrations:
 *
 *   pnpm --filter demo drizzle:generate   # emit SQL under ./drizzle
 *
 * (Then switch `getDb()` to `migrate()` against `./drizzle`.)
 */
export default defineConfig({
	dialect: "sqlite",
	schema: "./lib/db/schema.ts",
	out: "./drizzle",
	dbCredentials: {
		url:
			process.env.ANVILKIT_PAGE_STORAGE_SQLITE_PATH ?? ".anvilkit/pages.sqlite",
	},
});
