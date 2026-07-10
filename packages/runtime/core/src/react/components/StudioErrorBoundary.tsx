"use client";

/**
 * @file `<StudioErrorBoundary>` — catches **render-time** errors thrown by
 * the Studio chrome (plugin providers/overlays, chrome components, the
 * Puck subtree) so a throwing plugin surfaces a recoverable error panel
 * instead of crashing the whole React tree to a blank screen.
 *
 * This is the complement to `<Studio>`'s `compileError` branch: a plugin
 * whose `register()` throws is caught at *compile* time and shown via
 * {@link StudioErrorScreen}; this boundary covers code that compiled fine
 * but throws while *rendering*. `<Studio>` mounts it **outside** the
 * provider stack, so the boundary itself stays pre-provider safe — the
 * default fallback ({@link StudioErrorScreen}) and a host `errorFallback`
 * both render without any Studio context.
 *
 * Recovery: the default panel's Retry calls the boundary's `reset()`,
 * which clears the captured error and re-renders the children. A
 * deterministic error simply re-trips the boundary; a transient one
 * recovers.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

export interface StudioErrorBoundaryProps {
	readonly children: ReactNode;
	/**
	 * Render the recoverable UI for a caught render error. Receives the
	 * thrown value and a `reset` callback that clears the error and
	 * re-renders the children.
	 */
	readonly fallback: (error: unknown, reset: () => void) => ReactNode;
	/**
	 * Invoked from `componentDidCatch` with the thrown value and React's
	 * error info (component stack). Intended for logging; the boundary
	 * guards the call so a throwing handler can never re-trip it.
	 */
	readonly onError?: (error: unknown, info: ErrorInfo) => void;
}

interface StudioErrorBoundaryState {
	/** The thrown value once the boundary has caught one. */
	readonly error: unknown;
	/**
	 * Separate flag rather than `error != null`: `throw null` / `throw
	 * undefined` are legal, so the falsy thrown value must still latch the
	 * fallback.
	 */
	readonly hasError: boolean;
}

/**
 * React error boundary for the Studio chrome. Exported from
 * `@anvilkit/core/react` so hosts can also wrap their own subtrees with
 * the same recoverable behavior.
 */
export class StudioErrorBoundary extends Component<
	StudioErrorBoundaryProps,
	StudioErrorBoundaryState
> {
	state: StudioErrorBoundaryState = { error: null, hasError: false };

	static getDerivedStateFromError(error: unknown): StudioErrorBoundaryState {
		return { error, hasError: true };
	}

	componentDidCatch(error: unknown, info: ErrorInfo): void {
		// Logging must never escalate into the boundary itself (a throwing
		// handler here would remount-loop), so swallow handler failures.
		try {
			this.props.onError?.(error, info);
		} catch {
			// Intentionally empty — error recovery takes precedence over logging.
		}
	}

	private readonly reset = (): void => {
		this.setState({ error: null, hasError: false });
	};

	render(): ReactNode {
		if (this.state.hasError) {
			return this.props.fallback(this.state.error, this.reset);
		}
		return this.props.children;
	}
}
