import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Single-table store for the demo's page records. The whole {@link PageRecord}
 * (draft + published payloads + metadata) is serialized into `data` as JSON —
 * exactly how {@link ../page-storage/filesystem-page-storage-adapter} persists
 * one JSON file per record. Storing the serialized record (rather than
 * decomposing every field into columns) lets the SQLite adapter reuse the
 * shared `record-ops` helpers and stay byte-for-byte compatible with the
 * memory/filesystem adapters, so one parity spec covers all three. `slug` and
 * `status` are mirrored into indexed columns so `getBySlug`/`list(status)`
 * filter in SQL without deserializing every row; `updated_at` backs the
 * default newest-first ordering.
 */
export const pages = sqliteTable(
	"pages",
	{
		id: text("id").primaryKey(),
		slug: text("slug").notNull(),
		status: text("status").notNull(),
		updatedAt: text("updated_at").notNull(),
		data: text("data").notNull(),
	},
	(table) => [
		index("pages_slug_idx").on(table.slug),
		index("pages_status_idx").on(table.status),
	],
);
