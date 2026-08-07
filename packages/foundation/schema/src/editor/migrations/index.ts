/**
 * @file Authoring-state migration framework skeleton
 * (PLAN-0020 CORE-P0-005F; DD-0019 §26.3).
 *
 * Mirrors the `@anvilkit/ir` migrations layout. v1 is the first
 * version, so **no migrations are registered yet** — the framework
 * exists so the first real migration lands as data, not as new
 * plumbing. Migrations are pure and idempotent; unknown majors never
 * reach this registry (readers classify them read-only upstream via
 * `detectAuthoringVersion`).
 */

import type { AuthoringStateV1 } from "../authoring-state.js";

/** The current authoring contract version. */
export const CURRENT_AUTHORING_VERSION = "1";

/** Error thrown for structurally invalid migration registrations. */
export class AuthoringMigrationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AuthoringMigrationError";
	}
}

/**
 * One pure, idempotent migration step. `from`/`to` are version
 * strings; steps chain until the state reports
 * {@link CURRENT_AUTHORING_VERSION}.
 */
export interface AuthoringMigration {
	readonly from: string;
	readonly to: string;
	migrate(state: Readonly<Record<string, unknown>>): Record<string, unknown>;
}

/** Registry of migration steps keyed by their `from` version. */
export interface AuthoringMigrationRegistry {
	register(migration: AuthoringMigration): void;
	list(): readonly AuthoringMigration[];
	/**
	 * Run the chain from `state.version` to the current version.
	 * Already-current state is returned as-is (idempotency by
	 * construction). Throws {@link AuthoringMigrationError} when a
	 * needed step is missing or a cycle is detected.
	 */
	run(state: Readonly<Record<string, unknown>>): AuthoringStateV1;
}

/** Create an empty migration registry (v1: no steps registered). */
export function createAuthoringMigrationRegistry(): AuthoringMigrationRegistry {
	const byFrom = new Map<string, AuthoringMigration>();
	return {
		register(migration) {
			if (migration.from === migration.to) {
				throw new AuthoringMigrationError(
					`migration from "${migration.from}" to itself is not allowed`,
				);
			}
			if (byFrom.has(migration.from)) {
				throw new AuthoringMigrationError(
					`duplicate migration registered for version "${migration.from}"`,
				);
			}
			byFrom.set(migration.from, migration);
		},
		list() {
			return [...byFrom.values()];
		},
		run(state) {
			let current: Record<string, unknown> = { ...state };
			const seen = new Set<string>();
			for (;;) {
				const version = current.version;
				if (typeof version !== "string") {
					throw new AuthoringMigrationError(
						"state has no string version field",
					);
				}
				if (version === CURRENT_AUTHORING_VERSION) {
					return current as unknown as AuthoringStateV1;
				}
				if (seen.has(version)) {
					throw new AuthoringMigrationError(
						`migration cycle detected at version "${version}"`,
					);
				}
				seen.add(version);
				const step = byFrom.get(version);
				if (step === undefined) {
					throw new AuthoringMigrationError(
						`no migration registered from version "${version}"`,
					);
				}
				current = step.migrate(current);
			}
		},
	};
}
