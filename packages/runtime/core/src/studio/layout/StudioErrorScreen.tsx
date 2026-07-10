/**
 * @file `<StudioErrorScreen>` — the default recoverable panel shown when
 * the Studio plugin runtime fails to compile (a plugin's `register`
 * throws or rejects).
 *
 * Before this existed, a compile failure left `<Studio>` stuck on the
 * loading fallback forever (report 0002, finding P1). `<Studio>` now
 * renders this in place of the editor when `compileError` is set, unless
 * the host supplied its own `errorFallback`.
 *
 * **Rendered pre-provider** (same constraint as
 * {@link StudioLoadingScreen}): a failed compile means `compiled` is
 * `null`, so this returns *before* the `StudioConfigProvider` /
 * `EditorI18nProvider` / theme stack mounts. It must NOT call `useMsg()`,
 * `useTheme()`, or any Studio context hook. User-visible strings are
 * plain props (English defaults); a host that needs translations passes
 * its own via `errorFallback`.
 *
 * The shell reads the same `--ak-studio-*` tokens as `<StudioLayout>`
 * (so it themes consistently when those tokens are defined, and degrades
 * gracefully to inherited colors when they are not — e.g. the
 * `chrome="puck"` path). Because it introduces new Tailwind utility
 * strings, the package's compiled `styles.css` must be rebuilt
 * (`pnpm build`) for the classes to ship.
 */

import type { ReactNode } from "react";

import { Button } from "@/primitives/button";
import { cn } from "@/shared/cn";

/** Pull a human-readable message out of an arbitrary thrown value. */
function toMessage(error: unknown): string {
	if (error instanceof Error) {
		return error.message || error.name || "Unknown error";
	}
	if (typeof error === "string") {
		return error;
	}
	// `String()` can itself throw for pathological values (a null-prototype
	// object, or one with a throwing `toString`/`Symbol.toPrimitive`); never
	// let rendering the error screen throw.
	try {
		return String(error);
	} catch {
		return "Unknown error";
	}
}

export interface StudioErrorScreenProps {
	/** The thrown value from the failed compile. Its message is shown. */
	readonly error: unknown;
	/**
	 * Invoked by the Retry button. Wired to the controller's `retry()`,
	 * which forces a fresh compile with the same inputs. When omitted, the
	 * Retry button is hidden (the panel becomes informational only).
	 */
	readonly onRetry?: () => void;
	/** Heading text. Plain English default (renders before i18n mounts). */
	readonly title?: string;
	/** Guidance shown beneath the error message. */
	readonly description?: string;
	/** Retry button label. */
	readonly retryLabel?: string;
	/** Extra classes merged onto the outer shell. */
	readonly className?: string;
}

/**
 * Default recoverable error panel rendered when `<Studio>` fails to
 * compile its plugin runtime. Exported from `@anvilkit/core/react` so
 * hosts can also render it inside their own `errorFallback`.
 */
export function StudioErrorScreen({
	error,
	onRetry,
	title = "The editor failed to load",
	description = "A plugin failed to initialize. Retry, or reload the page if the problem persists.",
	retryLabel = "Retry",
	className,
}: StudioErrorScreenProps): ReactNode {
	return (
		<div
			data-testid="studio-error"
			role="alert"
			className={cn(
				"flex h-screen min-h-0 w-full items-center justify-center overflow-auto bg-[var(--ak-studio-bg)] p-6 text-[var(--ak-studio-fg)]",
				className,
			)}
		>
			<div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
				<h1 className="text-base font-semibold">{title}</h1>
				<p className="text-sm text-[var(--ak-studio-muted-fg)]">
					{description}
				</p>
				<pre className="max-h-40 w-full overflow-auto rounded-md border border-[var(--ak-studio-border)] bg-[var(--ak-studio-panel)] p-3 text-start text-xs whitespace-pre-wrap text-[var(--ak-studio-muted-fg)]">
					{toMessage(error)}
				</pre>
				{onRetry !== undefined ? (
					<Button type="button" onClick={onRetry}>
						{retryLabel}
					</Button>
				) : null}
			</div>
		</div>
	);
}
