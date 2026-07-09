# CLAUDE.md

Project instructions for Claude Code in this repository. Follow this file over generic habits. Keep it concise; move path-specific rules to `.claude/rules/` and repeatable procedures to `.claude/skills/`.

## Instruction Placement

- Stable project-wide rules live here.
- Package/path-specific rules live in `.claude/rules/*.md` with `paths:` frontmatter.
- Long repeatable workflows live in `.claude/skills/<name>/SKILL.md`.
- Hard enforcement belongs in hooks/settings, not only in `CLAUDE.md`.
- Use `/memory` to verify which instruction files are loaded when behavior looks wrong.

## Working Directory / Environment

- Always operate in the authoritative checkout (`/root/Rhett/anvilkit-studio`), not staging or worktree directories, unless explicitly told otherwise.
- Confirm the current working directory before building or editing.

## Hard Rules

- **Git is read-only for Claude.** Never stage, commit, amend, rebase, merge, cherry-pick, reset, clean, tag, push, switch branches, or open PRs unless the user explicitly requests that exact action in the current conversation. Never force-push and never push to `main`.
- **Reuse before writing.** No new utility, wrapper, hook, component, abstraction, or dependency without passing the Reuse-First Engineering check.
- **Formatting is Biome with TAB indentation.** Never run Prettier. The root `pnpm format` script invokes Prettier, so do not use it. Never introduce CRLF line endings.
- **UI work uses `@anvilkit/ui` primitives.** Do not hand-roll native controls (e.g., a native `<select>` language switcher), bespoke CSS, or custom components when a shared primitive exists.
- **Every new module is a git submodule.** Plugins and standalone packages must not be created as ordinary in-tree packages.
- Use `typecheck`, never `check-types`.
- Never overwrite existing plan/report files. Check for an existing file and back it up before writing.
- Never weaken tests, gates, lint rules, type checks, or size budgets just to get green. Report pre-existing failures clearly.

## Reuse-First Engineering

New code is a last resort. Before implementing anything, prove that reuse is not enough.

### Mandatory pre-code check

Check these in order:

1. JavaScript built-ins: `Array`, `Object`, `Map`, `Set`, `Intl`, `URL`, `URLSearchParams`, `structuredClone`, `AbortController`, `crypto.randomUUID`, etc.
2. TypeScript features: utility types, `satisfies`, template literal types, discriminated unions, const assertions, narrowing, and inference.
3. React APIs: built-in hooks, context, Suspense, `useId`, `useSyncExternalStore`, `useDeferredValue`, `useTransition`.
4. Node.js built-ins: `node:path`, `node:fs`, `node:crypto`, `node:util`, `node:events`, etc.
5. Existing repository code: search `@anvilkit/utils`, `@anvilkit/ui`, `@anvilkit/contracts`, `@anvilkit/core`, `packages/configs/*`, and the package being edited.
6. Existing dependencies in the relevant `package.json`. Read the installed version's API before using it.
7. Libraries already accepted elsewhere in the workspace.

### Rules

- Do not create a helper, hook, wrapper, component, mini-library, or abstraction unless you can state why each reuse layer above is insufficient.
- Do not reinvent platform, language, framework, or repo behavior: no duplicate `debounce`, `deepClone`, `groupBy`, event emitter, validation layer, or custom select beside existing options.
- New dependencies require explicit user confirmation. Name the built-in, in-repo, and already-installed options considered, and why each is insufficient.
- Custom code is justified only for project-specific business logic or necessary integration boundaries.
- Prefer boring, standard, tested, maintainable solutions over clever custom code.
- Avoid premature abstraction. Extract shared helpers only after a third real call site or when duplication is a correctness risk.
- Avoid gratuitous helpers when native syntax is clearer.
- Follow the conventions of the package being edited, even where another pattern would be personally preferred.
- Never silently introduce a new pattern, dependency, directory convention, or architectural boundary.

## Project Overview

`anvilkit-studio` is a monorepo of independently publishable Puck-native React component packages under the `@anvilkit/*` namespace. It is built around Puck, shared contracts, plugin packages, UI primitives, and demo/docs applications.

## Repository Map

```text
anvilkit-studio/
├── apps/                  # demo app and docs site
├── bench/                 # tinybench performance harness
└── packages/
    ├── analytics/         # submodules: analytics core/react
    ├── canvas/            # submodules: canvas core/editor
    ├── cli/               # @anvilkit/cli
    ├── components/        # component package submodule workspace
    ├── configs/           # shared Biome/Tailwind/TS/Vitest configs
    ├── contracts/         # shared type-only contracts
    ├── core/              # runtime, plugin engine, Studio shell
    ├── create-plugin/     # plugin scaffolder
    ├── ir/                # Page IR transforms
    ├── plugins/           # plugin submodules
    ├── schema/            # AI-friendly schema derivation
    ├── templates/         # template packages
    ├── ui/                # shared UI primitives
    ├── utils/             # shared helpers
    └── validator/         # Puck config validator
```

- Package manager: `pnpm 11.10.0`; orchestration: Turbo; publishable package build: Rslib.
- TypeScript: workspace TS 6.0.2; demo pins TS 5.9.2 for Next.js compatibility.

## Commands

- Root: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm madge`, `pnpm publint`, `pnpm size`, `pnpm bench`, `pnpm docs:dev`, `pnpm docs:build`.
- `packages/components/`: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm gen:component`.
- `apps/demo/`: `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm e2e`.
- `apps/docs/`: `pnpm docs:dev`, `pnpm docs:build`, `pnpm typecheck`, `pnpm test`, `pnpm e2e`.

## Architecture Contracts

- Each component is its own npm package; there is no umbrella package.
- Every Puck component package exports `componentConfig`, `defaultProps`, `fields`, and `metadata`.
- Render props must be serializable. Do not expose functions or refs at the top level.
- New components must be wired into `apps/demo/lib/puck-demo.ts` and `transpilePackages` in `apps/demo/next.config.js`.
- Tailwind CSS 4 is CSS-first. Do not add `tailwind.config.js`.
- Consumers import shared tokens with `@import "@anvilkit/tailwind-config/shadcn"`.
- Docs generated content under `content/docs/{components,api,templates}` is committed. Run generation after changing component/plugin APIs.
- Vercel docs deployment uses `apps/docs` as root. There is no root `vercel.json`.

## TypeScript, React, and Styling Standards

- Use `import type` for type-only imports; `verbatimModuleSyntax` is enforced.
- No circular dependencies. `pnpm madge` is a CI gate.
- For RSC-compatible render paths, add `'use client'` when hooks or browser-only APIs are used.
- Respect size-limit budgets for publishable packages.
- Canvas iframe styles do not inherit parent CSS. Use inline styles or explicit host-style injection where required.
- Do not duplicate bilingual strings inline. Use i18n message keys.
- Do not add language-specific demo translation overrides unless explicitly requested.

## Documentation & i18n

- When regenerating docs/i18n content, escape YAML frontmatter values (especially strings starting with `@`) so they parse, and avoid unescaped JSX-like strings in MDX tables.

## Verification / Definition of Done

- After changes, always run and report the relevant gates before claiming completion: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- For package-level work, also run `pnpm madge` and `pnpm publint` when applicable.
- For runtime/browser-facing changes, rebuild affected packages before declaring success.
- For UI behavior, prefer `/run` or `/verify` when available, not only unit tests.
- For E2E, use unique room IDs and avoid port collisions.
- If failures are pre-existing infrastructure issues, report them instead of skipping or hiding them.
- Do not regenerate snapshots blindly. Distinguish benign hash drift from real API changes.

## Git & Submodules

- Read-only git commands are allowed: `git status`, `git diff`, `git log`, `git show`, `git branch`, `git submodule status`.
- State-changing git/gh commands are forbidden unless explicitly requested in the current conversation.
- Do not commit, push, or open PRs unless explicitly asked. Default to files-only changes and leave staging/committing to the user.
- Verify submodules from `.gitmodules` with `git config -f .gitmodules --get-regexp path`.
- Submodule groups include `packages/components`, `packages/plugins/*`, `packages/canvas/{core,editor}`, and `packages/analytics/{core,react}`.
- Parent directories such as `plugins/`, `canvas/`, and `analytics/` are plain directories, not submodules.
- Submodule edits may not show clearly in the superproject status. Inspect inside the submodule working tree.
- After changes, leave everything unstaged and summarize modified files, including which ones are inside submodules.

## Adding a New Component

1. Run `pnpm gen:component` in `packages/components/`.
2. Implement render, config, exports, default props, fields, and metadata.
3. Validate with `pnpm lint && pnpm typecheck && pnpm build`.
4. Wire the component into the demo app and `transpilePackages`.
5. Changesets and publishing are user-owned steps.

See `packages/components/AGENTS.md` for full component rules.

## Working Rules

- For analysis, audit, roadmap, or review tasks, start the deliverable immediately. Do not ask for plan approval unless blocked.
- Before editing shared code, enumerate call sites first.
- Use read-only exploration or subagents when available for large call-site searches.
- For refactors, prefer a root-cause fix plus regression test over a band-aid.
- When wiring Studio props/plugins, grep all `<Studio>` mounts in demo paths.
- Before deleting files, grep inbound references and present a deletion list with reference counts.
- Verify every edit actually applied.
- Keep responses concise. Write long reports to files.
- Use portable shell commands; avoid bash-only constructs unless the script already requires bash.
- Scope `find`/`grep`/`rg` to the project and exclude `node_modules`.

## Skill Routing

When an available Claude Code skill matches the task, use it before free-form work.

- Product ideas or build-worthiness: `office-hours`
- Bugs, errors, broken behavior, 500s: `investigate` or `/debug`
- Failing CI, red checks, drift, gates: `fixgates`
- Ship, deploy, push, create PR: `ship`
- QA or test the site: `qa`
- Code review or diff review: `review` or `/code-review`
- Docs after shipping: `document-release`
- Weekly retro: `retro`
- Design system or brand: `design-consultation`
- Visual audit or design polish: `design-review`
- Architecture review: `plan-eng-review`
- Save progress, checkpoint, resume: `checkpoint`
- Code quality or health check: `health`

If a listed custom skill is not installed, say so and continue with the closest built-in workflow.
