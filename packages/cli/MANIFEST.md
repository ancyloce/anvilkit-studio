# MANIFEST

- `package.json` - Package metadata, CLI scripts, prompt/runtime deps, and the packed scaffold asset path.
- `biome.json` - Local Biome configuration extending the shared Anvilkit workspace defaults.
- `rslib.config.ts` - Bundled ESM Node build that emits `dist/bin/anvilkit.mjs` with a shebang banner.
- `vitest.config.ts` - Node-oriented Vitest configuration wired to the repo-local shared preset for this docs artifact.
- `tsconfig.json` - TypeScript compiler settings for the CLI artifact, including JSX support for embedded scaffold files.
- `README.md` - Short usage and development overview for the phase5-007 CLI artifact.
- `scripts/postbuild.mjs` - Post-build chmod hook that makes the emitted bin executable.
- `src/anvilkit-ir.d.ts` - Local type shim for `@anvilkit/ir` so this docs artifact typechecks cleanly against the workspace package layout.
- `src/bin/anvilkit.ts` - CLI entrypoint that wires `cac`, registers all commands, reads runtime version, and centralizes exit handling.
- `src/bin/anvilkit.test.ts` - Subprocess tests for root `--help` and `--version`.
- `src/commands/init.ts` - Full `anvilkit init` implementation for prompt gating, scaffold hydration, package-manager selection, and install execution.
- `src/commands/init.test.ts` - Subprocess coverage for successful init, non-empty-dir rejection, non-TTY dir failure, and template hydration.
- `src/commands/validate.ts` - Full `anvilkit validate` implementation that resolves user Puck configs, runs the validator, formats output, and sets the command exit code.
- `src/commands/validate.test.ts` - Subprocess coverage for passing configs, validator failures, missing files, and JSON output mode.
- `src/commands/export.ts` - Full `anvilkit export` implementation that loads IR or Puck snapshot inputs, dispatches to HTML or React exporters, and writes the output directory atomically.
- `src/commands/export.test.ts` - Coverage for `runExport()` across HTML, React TSX/JSX, Puck snapshot conversion, overwrite behavior, and invalid/missing input handling, with one guarded subprocess smoke case.
- `src/commands/generate.ts` - Full `anvilkit generate` implementation that loads `anvilkit.config.ts`, derives AI context from the user Puck config, runs `generatePage()`, validates the returned PageIR, and writes JSON to a file or stdout.
- `src/commands/generate.test.ts` - In-process coverage for mock generation success, stdout streaming, missing config, missing `generatePage`, and validator-failure stderr output.
- `__fixtures__/export/page.ir.json` - Minimal PageIR fixture used for direct JSON export tests.
- `__fixtures__/export/page.ir.ts` - Module-exported PageIR fixture used for `jiti`-loaded IR input coverage.
- `__fixtures__/export/puck-data.json` - Minimal Puck `Data` snapshot fixture used for `--from puck` export coverage.
- `__fixtures__/export/puck-config.ts` - Matching Puck config fixture used to convert the snapshot fixture into PageIR.
- `__fixtures__/validate/good-basic.ts` - Minimal passing Puck config fixture exported from TypeScript.
- `__fixtures__/validate/good-multi.ts` - Passing multi-component Puck config fixture used by JSON-mode validation coverage.
- `__fixtures__/validate/good-mjs.mjs` - Passing `.mjs` Puck config fixture to exercise non-TypeScript loading.
- `__fixtures__/validate/bad-missing-render.ts` - Invalid fixture missing a component render function.
- `__fixtures__/validate/bad-async-render.ts` - Invalid fixture with an async component render function.
- `__fixtures__/validate/bad-non-serializable-default.ts` - Invalid fixture with a non-serializable `defaultProps` value.
- `__fixtures__/generate/puck-config.ts` - Minimal Puck config fixture with a `Hero.headline` field for AI-context derivation and validator coverage.
- `__fixtures__/generate/anvilkit.config.ts` - Happy-path Anvilkit config fixture exporting `createMockGeneratePage()` through `defineConfig()`.
- `__fixtures__/generate/anvilkit.config.bad.ts` - Anvilkit config fixture whose `generatePage()` returns validator-rejected IR.
- `__fixtures__/generate/anvilkit.config.no-generate.ts` - Anvilkit config fixture that intentionally omits `generatePage`.
- `src/scaffolds/nextjs/package.json` - Embedded Next.js app manifest with `__NAME__` placeholder replacement and seed dependencies.
- `src/scaffolds/nextjs/tsconfig.json` - TypeScript settings for the generated Next.js scaffold.
- `src/scaffolds/nextjs/next.config.js` - Next.js config that transpiles the Anvilkit runtime packages inside generated apps.
- `src/scaffolds/nextjs/puck-config.ts` - Minimal generated Puck config with a single editable heading block.
- `src/scaffolds/nextjs/app/layout.tsx` - Root layout for the generated app shell.
- `src/scaffolds/nextjs/app/page.tsx` - Landing page that links into the generated Puck editor and preview routes.
- `src/scaffolds/nextjs/app/puck/[...puck]/page.tsx` - Generated editor route with a template-hydration marker for `pageIR` imports.
- `src/scaffolds/nextjs/app/puck/preview/page.tsx` - Minimal preview route placeholder for generated projects.
- `src/scaffolds/nextjs/README.md` - Starter README shipped into generated Next.js apps.
- `src/scaffolds/nextjs/.gitignore` - Generated-app ignore rules for Next.js build output and package-manager logs.
- `src/utils/detect-pm.ts` - Package-manager detection from env user agent or ancestor lockfiles.
- `src/utils/detect-pm.test.ts` - Unit tests covering user-agent detection, lockfile detection, and npm fallback.
- `src/utils/copy-scaffold.ts` - Recursive scaffold copier with `__NAME__` placeholder replacement for filenames and file contents.
- `src/utils/copy-scaffold.test.ts` - Temp-directory tests for recursive scaffold copying and placeholder replacement.
- `src/utils/prompt.ts` - Lazy `@clack/prompts` wrapper with `CI` and `--no-input` fast-fail behavior.
- `src/utils/prompt.test.ts` - Non-interactive prompt coverage for `CliError` fast-fail behavior.
- `src/utils/load-anvilkit-config.ts` - `jiti`-based config discovery and loading helper for `anvilkit.config.*`.
- `src/utils/load-anvilkit-config.test.ts` - Temp-directory tests for config discovery, success, and wrapped loader failures.
- `src/utils/define-anvilkit-config.ts` - Thin `defineConfig()` helper plus the `GeneratePageFn` / `AnvilkitUserConfig` types used by `anvilkit.config.ts`.
- `src/utils/define-anvilkit-config.test.ts` - Identity test coverage for `defineConfig()`.
- `src/utils/resolve-puck-config.ts` - `jiti`-based config loader for explicit Puck config file paths with structured CLI errors.
- `src/utils/resolve-puck-config.test.ts` - Coverage for default export loading, named `config` loading, and loader error cases.
- `src/utils/atomic-write.ts` - Output-directory staging helper that writes into a sibling `.tmp` directory and renames it into place on success.
- `src/utils/atomic-write.test.ts` - Coverage for tmp staging, force overwrite behavior, and cleanup after write failures.
- `src/utils/format-dispatch.ts` - HTML/React exporter dispatch and CLI-flag-to-plugin-option mapping helpers.
- `src/utils/format-dispatch.test.ts` - Dispatch coverage for HTML and React option mapping plus invalid format handling.
- `src/utils/format-validation.ts` - Pretty and JSON formatting helpers for validator results.
- `src/utils/format-validation.test.ts` - Structural tests for pretty and JSON validation formatting.
- `src/utils/logger.ts` - Colored stderr logger helpers for info, warn, error, and success output.
- `src/utils/errors.ts` - Shared `CliError` type with `code`, `message`, and `exitCode`.
- `src/utils/read-ir-input.ts` - Loader for PageIR JSON/modules and Puck snapshots converted through `puckDataToIR()`.
- `src/utils/read-ir-input.test.ts` - Coverage for IR JSON, IR module, Puck snapshot, and invalid input error paths.
- `MANIFEST.md` - Generated file inventory for this artifact version.

## Changes from v1

- Renamed the local subprocess helper in `src/commands/validate.test.ts` from `runValidate` to `runCli` to avoid colliding with the imported `runValidate`.

## Changes from phase5-009 final

- Replaced the `generate` placeholder with a working `runGenerate()` flow that loads `anvilkit.config.ts`, resolves either the user `generatePage` or the deterministic mock generator, derives `AiGenerationContext` from the supplied Puck config, validates the returned IR, and writes JSON to a file or stdout.
- Added the `defineConfig()` helper module and its companion config types so user `anvilkit.config.ts` files can be authored against a local contract inside the artifact.
- Added generate-specific fixtures and unit coverage for the happy path, stdout mode, missing config, missing `generatePage`, and validator-failure reporting.
- Kept the local `src/anvilkit-ir.d.ts` shim because removing it still breaks `tsc --noEmit` for the standalone docs artifact's existing `@anvilkit/ir` import.

## Changes from phase5-008 final

- Replaced the `export` placeholder with a working CLI flow that reads PageIR JSON or modules, converts Puck snapshots with `puckDataToIR()`, dispatches to HTML or React exporters, and atomically replaces the output directory.
- Added dedicated export utilities for input loading, format dispatch, and tmp-then-rename directory writes so `runExport()` stays small and testable.
- Added fixture-backed command coverage plus focused unit tests for the new export helpers.
- Added a local `@anvilkit/ir` declaration shim and small command/prompt typing adjustments so the artifact passes `tsc --noEmit`.

## Changes from phase5-007 final

- Replaced the `validate` placeholder with a working CLI flow that resolves user Puck config files through `jiti`, runs `validateComponentConfig`, formats pretty or JSON output, and returns exit code `0`, `1`, or `2` according to the command contract.
- Added dedicated validation utilities for config loading and result formatting so the command stays small and coverage-focused.
- Added fixture-backed subprocess tests for the new `validate` command plus focused unit coverage for the new utilities.

## Changes from phase5-006 final

- Replaced the `init` placeholder with a working scaffold flow that resolves target dirs, guards non-empty folders, selects a package manager, copies the embedded scaffold, hydrates optional templates, and runs installs.
- Added focused helper modules for prompt gating, package-manager detection, and recursive scaffold copying, each with dedicated tests.
- Added the embedded `src/scaffolds/nextjs/` project tree that `anvilkit init` copies into user directories.
- Updated `package.json` with `@clack/prompts`, scaffold packaging, React-safe grep exclusions, and extra dev typings for embedded scaffold files.
- Updated `tsconfig.json`, `vitest.config.ts`, and `README.md` so the docs artifact reflects the phase5-007 implementation and can be exercised from its in-repo location.
