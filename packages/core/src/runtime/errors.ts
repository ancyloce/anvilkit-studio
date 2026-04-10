/**
 * @file The typed error taxonomy surfaced by the Studio runtime.
 *
 * Three concrete subclasses cover every operation that can fail in
 * `@anvilkit/core`:
 *
 * - {@link StudioPluginError} — plugin compilation, lifecycle hook
 *   invocation, or `coreVersion` mismatch.
 * - {@link StudioConfigError} — Zod validation failure when merging
 *   the Studio config.
 * - {@link StudioExportError} — a registered export format's `run()`
 *   implementation throws.
 *
 * Every subclass carries a stable `code` string, inherits `cause`
 * from the ES2022 {@link Error} constructor, and sets its own `name`
 * so stack traces remain readable in host dev tools.
 *
 * ### Why an abstract base?
 *
 * Host apps frequently want a single `catch (err) { if (err
 * instanceof StudioError) … }` branch to surface every runtime failure
 * in a unified error boundary. The abstract base class gives them one
 * `instanceof` check while still letting targeted branches discriminate
 * on `err.code` or the concrete subclass.
 *
 * ### Runtime-only file
 *
 * Zero React imports, zero Puck imports — this file ships as pure,
 * environment-agnostic JavaScript and may be imported from any layer
 * of the runtime (including server-only code paths).
 *
 * @see {@link https://github.com/anvilkit/studio/blob/main/docs/tasks/core-008-runtime-plugin-engine.md | core-008}
 */

/**
 * Abstract base class for every `@anvilkit/core` runtime error.
 *
 * Never thrown directly — subclass instead. The abstract `code` field
 * forces every concrete subclass to declare a stable, machine-readable
 * identifier, which host apps use to branch on specific failure modes
 * without string-matching on the message.
 *
 * The `Object.setPrototypeOf(this, new.target.prototype)` call in the
 * constructor guarantees `instanceof` works correctly across the
 * prototype chain even when the runtime is transpiled to older ES
 * targets or consumed via CJS interop. With `target: ES2022` it is
 * a harmless no-op — kept so the code remains portable.
 */
export abstract class StudioError extends Error {
	/**
	 * Stable, machine-readable failure identifier.
	 *
	 * Subclasses must override this with a constant literal so host
	 * apps can branch on `err.code` without string-matching on the
	 * human-readable message.
	 */
	abstract readonly code: string;

	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Thrown when plugin compilation or lifecycle invocation fails.
 *
 * Raised by `compilePlugins()` for:
 *
 * - Structurally invalid plugin objects (fails both `isStudioPlugin`
 *   and `isPuckPlugin`).
 * - `StudioPluginMeta.coreVersion` mismatch against the running
 *   Core version.
 * - `plugin.register()` throwing synchronously or rejecting.
 * - Duplicate export format ids across plugins.
 *
 * Also raised by `createLifecycleManager().emit("onBeforePublish",
 * …)` when a hook throws — `onBeforePublish` is the only hook whose
 * errors abort the publish and propagate to the host.
 *
 * The `pluginId` field pinpoints the offending plugin so host apps
 * can surface a precise error message even if several plugins are
 * loaded.
 */
export class StudioPluginError extends StudioError {
	/**
	 * Stable failure code for plugin errors. See {@link StudioError.code}.
	 */
	readonly code = "StudioPluginError";

	/**
	 * The `meta.id` of the plugin that caused the failure.
	 *
	 * For errors that involve two plugins (e.g. a duplicate export
	 * format id) this field holds the second plugin's id, and both
	 * ids appear in the error message.
	 */
	readonly pluginId: string;

	constructor(
		pluginId: string,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "StudioPluginError";
		this.pluginId = pluginId;
	}
}

/**
 * Thrown when Studio configuration validation fails.
 *
 * Raised by `createStudioConfig()` (`core-011`) when the Zod schema
 * rejects the merged configuration. The underlying `ZodError` is
 * attached via the standard ES2022 `cause` field so host apps can
 * drill into the per-field issues.
 *
 * Kept here (not in `src/config/`) so every runtime error ships as
 * a single, tree-shakeable module under `@anvilkit/core/runtime`.
 */
export class StudioConfigError extends StudioError {
	/**
	 * Stable failure code for config errors. See {@link StudioError.code}.
	 */
	readonly code = "StudioConfigError";

	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "StudioConfigError";
	}
}

/**
 * Thrown when a registered export format's `run()` implementation
 * fails.
 *
 * Raised by the export pipeline (`core-009`) when a format throws or
 * returns a rejected promise. The `formatId` field identifies which
 * format failed so host apps can surface a targeted message
 * ("HTML export failed: …") without introspecting the cause.
 *
 * Advisory diagnostics should flow through `ExportResult.warnings`
 * instead — this error is reserved for hard failures where no
 * content could be produced at all.
 */
export class StudioExportError extends StudioError {
	/**
	 * Stable failure code for export errors. See {@link StudioError.code}.
	 */
	readonly code = "StudioExportError";

	/**
	 * The `id` of the {@link ExportFormatDefinition} whose `run()`
	 * method threw.
	 */
	readonly formatId: string;

	constructor(
		formatId: string,
		message: string,
		options?: ErrorOptions,
	) {
		super(message, options);
		this.name = "StudioExportError";
		this.formatId = formatId;
	}
}
