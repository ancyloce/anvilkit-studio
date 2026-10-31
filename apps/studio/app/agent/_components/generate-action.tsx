"use client";

/**
 * "Generate component" on a succeeded preparation (plan 0005 §4.5): one
 * explicit click is one intent; the intent (command id, canonical digest,
 * body) is persisted with the brief before the request and reused on a
 * retry, so a lost response never creates a second operation. An accepted
 * intent is offered as a link and "Generate again" starts a new one.
 * Nothing here posts on its own: a refresh, a locale switch or a stream
 * reconnect only re-renders.
 */

import { Button, buttonVariants } from "@anvilkit/ui/button";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import {
	type GenerationIntent,
	loadIntent,
	startGeneration,
} from "@/lib/agent/generation-client";
import type { ErrorEnvelope } from "@/lib/agent/operation-client";
import { useDemoT } from "@/lib/i18n/client";

export function generationHref(
	operationId: string,
	preparationOperationId: string,
): string {
	return `/agent/operations/${encodeURIComponent(operationId)}?from=${encodeURIComponent(preparationOperationId)}`;
}

/** The localized summary of a refused creation (the code stays as metadata). */
export function creationErrorKey(envelope: ErrorEnvelope): {
	key:
		| "progress.error.commandConflict"
		| "progress.error.notPermitted"
		| "progress.error.generic";
	code: string;
} {
	const code = envelope.error.code;
	if (code === "IDEMPOTENCY_CONFLICT")
		return { key: "progress.error.commandConflict", code };
	if (code === "UNAUTHENTICATED" || code === "FORBIDDEN")
		return { key: "progress.error.notPermitted", code };
	return { key: "progress.error.generic", code };
}

export function GenerateAction({
	briefId,
	preparationOperationId,
	onError,
}: {
	readonly briefId: string;
	readonly preparationOperationId: string;
	readonly onError: (title: string, code: string) => void;
}): ReactElement {
	const t = useDemoT();
	const router = useRouter();
	const [busy, setBusy] = useState(false);
	const [accepted, setAccepted] = useState<GenerationIntent | null>(null);
	useEffect(() => {
		const stored = loadIntent(window.sessionStorage, briefId);
		setAccepted(stored?.operationId ? stored : null);
	}, [briefId]);

	const start = async (again: boolean) => {
		setBusy(true);
		try {
			const result = await startGeneration({
				store: window.sessionStorage,
				briefId,
				preparationOperationId,
				again,
			});
			if (result.ok) {
				router.push(generationHref(result.operationId, preparationOperationId));
				return;
			}
			const { key, code } = creationErrorKey(result.error);
			onError(t(key, { code }), code);
		} finally {
			setBusy(false);
		}
	};

	return (
		<div
			className="flex flex-wrap items-center gap-2"
			data-testid="generate-action"
		>
			{accepted?.operationId ? (
				<>
					<Link
						className={buttonVariants({ variant: "default", size: "sm" })}
						href={generationHref(accepted.operationId, preparationOperationId)}
						data-testid="open-generation"
					>
						{t("progress.action.openGeneration")}
					</Link>
					<Button
						type="button"
						variant="outline"
						size="sm"
						disabled={busy}
						onClick={() => void start(true)}
						data-testid="generate-again"
					>
						{busy
							? t("progress.action.generating")
							: t("progress.action.generateAgain")}
					</Button>
				</>
			) : (
				<Button
					type="button"
					size="sm"
					disabled={busy}
					onClick={() => void start(false)}
					data-testid="generate-component"
				>
					{busy
						? t("progress.action.generating")
						: t("progress.action.generate")}
				</Button>
			)}
		</div>
	);
}
