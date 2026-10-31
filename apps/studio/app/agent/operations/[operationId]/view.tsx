"use client";

/**
 * `/agent/operations/:operationId[?from=<preparationId>]` (P20, plan 0005
 * §4.4–§4.6): the committed progress of one operation as its panel and its
 * factual timeline. A generation reached from a preparation carries
 * `?from=`; both operations are read and the preparation's timeline is
 * shown only when both name the same `briefId` (a refresh keeps the query;
 * a direct link without it, or a mismatch, shows the generation alone with
 * "Preparation not linked"). A completed generation offers the source
 * download, verified in the browser against `Anvilkit-Source-Digest`.
 */

import { Button, buttonVariants } from "@anvilkit/ui/button";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ReactElement } from "react";
import { useState } from "react";
import { agentPath } from "@/lib/agent/operation-client";
import { isCompleted } from "@/lib/agent/timeline";
import { useOperation } from "@/lib/agent/use-operation";
import { useDemoT } from "@/lib/i18n/client";
import { GenerateAction } from "../../_components/generate-action";
import { OperationPanel } from "../../_components/operation-panel";
import { ProgressTimeline } from "../../_components/progress-timeline";
import { ReleasePanel } from "../../_components/release-panel";

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
	const hash = await crypto.subtle.digest("SHA-256", bytes);
	return `sha256:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

type DownloadState =
	| { kind: "idle" }
	| { kind: "busy" }
	| { kind: "verified"; digest: string; revision: string | null }
	| { kind: "mismatch"; expected: string | null; actual: string }
	| { kind: "error"; code: string };

function SourceDownload({
	operationId,
}: {
	readonly operationId: string;
}): ReactElement {
	const t = useDemoT();
	const [state, setState] = useState<DownloadState>({ kind: "idle" });
	const download = async () => {
		setState({ kind: "busy" });
		try {
			const response = await fetch(
				agentPath(`operations/${encodeURIComponent(operationId)}/source`),
				{ cache: "no-store" },
			);
			if (!response.ok) {
				setState({ kind: "error", code: `HTTP_${response.status}` });
				return;
			}
			const bytes = await response.arrayBuffer();
			const actual = await sha256Hex(bytes);
			const expected = response.headers.get("anvilkit-source-digest");
			if (expected !== actual) {
				setState({ kind: "mismatch", expected, actual });
				return;
			}
			const url = URL.createObjectURL(
				new Blob([bytes], {
					type: response.headers.get("content-type") ?? "application/x-tar",
				}),
			);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = `${operationId}-source.tar`;
			anchor.rel = "noopener";
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
			setState({
				kind: "verified",
				digest: actual,
				revision: response.headers.get("anvilkit-source-revision"),
			});
		} catch {
			setState({ kind: "error", code: "DEPENDENCY_UNAVAILABLE" });
		}
	};
	return (
		<div className="flex flex-col gap-2" data-testid="source-download">
			<div>
				<Button
					type="button"
					size="sm"
					disabled={state.kind === "busy"}
					onClick={() => void download()}
					data-testid="generation-download"
				>
					{t("progress.action.download")}
				</Button>
			</div>
			{state.kind === "verified" ? (
				<p
					className="text-xs text-muted-foreground"
					data-testid="generation-download-state"
					data-state="verified"
					data-digest={state.digest}
					data-revision={state.revision ?? ""}
				>
					{t("progress.download.verified", { digest: state.digest })}
				</p>
			) : null}
			{state.kind === "mismatch" ? (
				<p
					className="text-xs text-destructive"
					data-testid="generation-download-state"
					data-state="mismatch"
					data-digest={state.actual}
				>
					{t("progress.download.mismatch")}
				</p>
			) : null}
			{state.kind === "error" ? (
				<p
					className="text-xs text-destructive"
					data-testid="generation-download-state"
					data-state="error"
				>
					{t("progress.error.generic", { code: state.code })}
				</p>
			) : null}
		</div>
	);
}

export function OperationView({
	operationId,
}: {
	readonly operationId: string;
}): ReactElement {
	const t = useDemoT();
	const params = useSearchParams();
	const fromParam = params.get("from");
	const from = fromParam && ID.test(fromParam) ? fromParam : null;
	const state = useOperation(operationId);
	const preparation = useOperation(from);
	const [notice, setNotice] = useState<string | null>(null);
	const view = state.view;
	const isGeneration =
		view?.kind === "generation" || view?.kind === "refinement";
	const briefId = view?.subject.briefId;
	const linked =
		isGeneration &&
		briefId !== undefined &&
		preparation.view?.subject.briefId === briefId;
	const editable =
		view &&
		view.lifecycle === "succeeded" &&
		(view.kind === "generation" ||
			view.kind === "refinement" ||
			view.kind === "preview_build");
	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<h1 className="text-2xl font-semibold">{t("operation.title")}</h1>
			<OperationPanel state={state} title={t("operation.progress")} />
			{isGeneration ? (
				linked ? (
					<ProgressTimeline
						state={preparation}
						title={t("progress.link.preparation")}
						testId="preparation-timeline"
					/>
				) : (
					<p
						className="text-sm text-muted-foreground"
						data-testid="preparation-link-missing"
					>
						{t("progress.link.missing")}
					</p>
				)
			) : null}
			<ProgressTimeline
				state={state}
				title={t(
					view?.kind === "preparation"
						? "progress.titlePreparation"
						: "progress.title",
				)}
			/>
			{view && isGeneration && isCompleted(view) ? (
				<SourceDownload operationId={operationId} />
			) : null}
			{linked && from && briefId ? (
				<GenerateAction
					briefId={briefId}
					preparationOperationId={from}
					onError={(title, code) => setNotice(`${title} (${code})`)}
				/>
			) : null}
			{notice ? (
				<p className="text-sm text-destructive" data-testid="generation-notice">
					{notice}
				</p>
			) : null}
			{view?.kind === "release" ? (
				<ReleasePanel operationId={operationId} revision={view.revision} />
			) : null}
			{editable ? (
				<div>
					<Link
						className={buttonVariants({ variant: "outline", size: "sm" })}
						href={`/agent/workbench/${encodeURIComponent(operationId)}`}
						data-testid="operation-open-workbench"
					>
						{t("operation.openWorkbench")}
					</Link>
				</div>
			) : null}
		</main>
	);
}
