"use client";

/**
 * @file Client helpers of the Studio's management views (P20): one read of
 * an Agent API resource through the Studio proxy, and tracked commands.
 *
 * A tracked command keeps its `commandId` for as long as the same action
 * with the same body is retried (a lost response replays to the original
 * outcome instead of a second effect) and releases it once the owner decided
 * — accepted, or refused with a non-retryable error. Views show the owner's
 * answer, never an optimistic one.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
	agentPath,
	asErrorEnvelope,
	type ErrorEnvelope,
	newCommandId,
	readJson,
} from "./operation-client";

export interface Resource<T> {
	readonly data: T | null;
	readonly error: ErrorEnvelope | null;
	readonly loading: boolean;
	readonly reload: () => Promise<void>;
}

export function useAgentResource<T>(path: string | null): Resource<T> {
	const [data, setData] = useState<T | null>(null);
	const [error, setError] = useState<ErrorEnvelope | null>(null);
	const [loading, setLoading] = useState(false);
	const reload = useCallback(async () => {
		if (!path) return;
		setLoading(true);
		try {
			const response = await fetch(agentPath(path), { cache: "no-store" });
			const body = await readJson(response);
			if (response.ok) {
				setData(body as T);
				setError(null);
			} else {
				setError(asErrorEnvelope(body) ?? envelope(`HTTP ${response.status}`));
			}
		} catch {
			setError(envelope("The Studio server did not answer."));
		} finally {
			setLoading(false);
		}
	}, [path]);
	useEffect(() => {
		void reload();
	}, [reload]);
	return { data, error, loading, reload };
}

function envelope(message: string): ErrorEnvelope {
	return {
		error: {
			code: "DEPENDENCY_UNAVAILABLE",
			message,
			requestId: "studio",
			retryable: true,
		},
	};
}

export type CommandResult<T> =
	| { readonly ok: true; readonly status: number; readonly body: T }
	| { readonly ok: false; readonly error: ErrorEnvelope };

/** Tracked commands keyed by action; the commandId survives retries of the same body. */
export function useTrackedCommands(): {
	readonly run: <T>(
		action: string,
		method: "POST" | "PUT" | "DELETE",
		path: string,
		body: Record<string, unknown>,
	) => Promise<CommandResult<T>>;
	readonly pending: ReadonlySet<string>;
} {
	const ids = useRef(new Map<string, { id: string; fingerprint: string }>());
	const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set());
	const run = useCallback(
		async <T>(
			action: string,
			method: "POST" | "PUT" | "DELETE",
			path: string,
			body: Record<string, unknown>,
		): Promise<CommandResult<T>> => {
			const fingerprint = `${method} ${path} ${JSON.stringify(body)}`;
			let tracked = ids.current.get(action);
			if (!tracked || tracked.fingerprint !== fingerprint) {
				tracked = { id: newCommandId("cmd"), fingerprint };
				ids.current.set(action, tracked);
			}
			setPending((p) => new Set(p).add(action));
			try {
				const response = await fetch(agentPath(path), {
					method,
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ commandId: tracked.id, ...body }),
				});
				const parsed = await readJson(response);
				if (response.ok) {
					ids.current.delete(action);
					return { ok: true, status: response.status, body: parsed as T };
				}
				const error =
					asErrorEnvelope(parsed) ?? envelope(`HTTP ${response.status}`);
				if (!error.error.retryable) ids.current.delete(action);
				return { ok: false, error };
			} catch {
				// The outcome is unknown: the identity is kept so a retry resolves it.
				return {
					ok: false,
					error: envelope(
						"The Studio server did not answer; retry to learn the outcome.",
					),
				};
			} finally {
				setPending((p) => {
					const next = new Set(p);
					next.delete(action);
					return next;
				});
			}
		},
		[],
	);
	return { run, pending };
}
