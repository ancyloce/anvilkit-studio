"use client";

/**
 * Source workbench (P20): edit the source an operation names, save it
 * conditionally and preview the saved revision.
 *
 * One "save and preview" creates one `preview_build` operation bound to the
 * source lineage, the revision the edit was based on and the uploaded edit.
 * The platform saves conditionally: when the source moved on, the preview
 * answers `conflict` with the current revision and nothing is overwritten.
 * Local edits are never discarded by a conflict; the user may rebase them
 * onto the current revision explicitly and save again. A `stale` preview
 * (built for a revision that is no longer current) is diagnostic only and
 * never replaces the current preview. Rendering happens in the separate-origin
 * sandboxed frame through anvilkit-preview-v1; the Studio realm never imports
 * preview code.
 */

import { CodeMirrorSurface } from "@anvilkit/plugin-code-editor";
import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Button } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import Link from "next/link";
import type { ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	agentPath,
	asErrorEnvelope,
	newCommandId,
	type OperationView,
	type Preview,
	readJson,
} from "@/lib/agent/operation-client";
import type { SessionState } from "@/lib/agent/preview-bridge";
import { releaseRequest } from "@/lib/agent/release-client";
import { useTrackedCommands } from "@/lib/agent/use-agent";
import { useOperation } from "@/lib/agent/use-operation";
import {
	changedPaths,
	isTextFile,
	type WorkbenchFile,
	type WorkbenchSource,
} from "@/lib/agent/workbench-files";
import { useDemoT } from "@/lib/i18n/client";
import { OperationPanel } from "../../_components/operation-panel";
import {
	PreviewFrame,
	type PreviewFrameHandle,
} from "../../_components/preview-frame";

/** The session-local Puck type the preview frame renders the component as. */
const PREVIEW_TYPE = "Preview";

interface Base {
	readonly revision: string;
	readonly files: readonly WorkbenchFile[];
}

function applyEdits(
	files: readonly WorkbenchFile[],
	edits: ReadonlyMap<string, string>,
): WorkbenchFile[] {
	return files.map((f) =>
		isTextFile(f) && edits.has(f.path)
			? { path: f.path, text: edits.get(f.path) ?? f.text }
			: f,
	);
}

async function artifactText(
	operationId: string,
	digest: string,
): Promise<string> {
	const response = await fetch(
		agentPath(
			`operations/${encodeURIComponent(operationId)}/preview/artifacts/${digest}`,
		),
		{ cache: "no-store" },
	);
	if (!response.ok) throw new Error(`HTTP ${response.status}`);
	return response.text();
}

export function SourceWorkbench({
	operationId,
	configured,
	previewOrigin,
	hostProfileId,
}: {
	readonly operationId: string;
	readonly configured: boolean;
	readonly previewOrigin: string | null;
	readonly hostProfileId: string;
}): ReactElement {
	const t = useDemoT();
	const releases = useTrackedCommands();
	const [releaseVersion, setReleaseVersion] = useState("");
	const [releaseNotice, setReleaseNotice] = useState<{
		operationId?: string;
		error?: string;
	} | null>(null);
	const [source, setSource] = useState<WorkbenchSource | null>(null);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [base, setBase] = useState<Base | null>(null);
	const [edits, setEdits] = useState<ReadonlyMap<string, string>>(
		() => new Map(),
	);
	const [selected, setSelected] = useState<string | null>(null);
	const [notice, setNotice] = useState<{
		kind: "error" | "info";
		title: string;
		detail?: string;
	} | null>(null);
	const [saving, setSaving] = useState(false);
	const [previewOp, setPreviewOp] = useState<string | null>(null);
	const [preview, setPreview] = useState<Preview | null>(null);
	const [stale, setStale] = useState<readonly Preview[]>([]);
	const [current, setCurrent] = useState<{
		operationId: string;
		revision: string;
	} | null>(null);
	const [renderError, setRenderError] = useState<string | null>(null);
	const [frameKey, setFrameKey] = useState(0);
	const [session, setSession] = useState<SessionState | null>(null);
	const handle = useRef<PreviewFrameHandle | null>(null);
	const [handleReady, setHandleReady] = useState(0);
	const saveRef = useRef<{ id: string; fingerprint: string } | null>(null);
	const submitted = useRef<Map<string, readonly WorkbenchFile[]>>(new Map());
	const rendered = useRef<string | null>(null);
	const previewState = useOperation(previewOp);

	// The source the operation names.
	useEffect(() => {
		let live = true;
		void (async () => {
			const response = await fetch(
				`/api/agent/workbench/${encodeURIComponent(operationId)}/source`,
				{ cache: "no-store" },
			);
			const body = await readJson(response);
			if (!live) return;
			if (!response.ok) {
				const e = asErrorEnvelope(body);
				setLoadError(
					e ? `${e.error.code}: ${e.error.message}` : `HTTP ${response.status}`,
				);
				return;
			}
			const s = body as WorkbenchSource;
			setSource(s);
			if (s.revision) setBase({ revision: s.revision, files: s.files });
			setSelected(s.files.find(isTextFile)?.path ?? null);
		})();
		return () => {
			live = false;
		};
	}, [operationId]);

	// Every committed change of the preview operation re-reads its preview.
	const previewRevision = previewState.view?.revision;
	useEffect(() => {
		if (!previewOp || previewRevision === undefined) return;
		let live = true;
		void (async () => {
			const response = await fetch(
				agentPath(`operations/${encodeURIComponent(previewOp)}/preview`),
				{ cache: "no-store" },
			);
			if (!live || !response.ok) return;
			setPreview((await response.json()) as Preview);
		})();
		return () => {
			live = false;
		};
	}, [previewOp, previewRevision]);

	// Outcome of a save: a saved revision becomes the base; a stale one is kept as a diagnostic.
	useEffect(() => {
		if (!preview) return;
		if (
			(preview.state === "building" ||
				preview.state === "ready" ||
				preview.state === "stale") &&
			preview.sourceRevision
		) {
			const files = submitted.current.get(preview.operationId);
			if (files) {
				submitted.current.delete(preview.operationId);
				setBase({ revision: preview.sourceRevision, files });
			}
		}
		if (preview.state === "stale") {
			setStale((list) =>
				list.some((p) => p.operationId === preview.operationId)
					? list
					: [...list, preview],
			);
		}
	}, [preview]);

	// Render a ready preview once in the current frame session.
	useEffect(() => {
		const h = handle.current;
		if (
			!h ||
			!preview ||
			preview.state !== "ready" ||
			!preview.module ||
			!preview.sourceRevision
		)
			return;
		const key = `${preview.operationId}/${preview.revision}/${handleReady}`;
		if (rendered.current === key) return;
		rendered.current = key;
		const { module, styles, operationId: op, sourceRevision } = preview;
		void (async () => {
			try {
				const [moduleText, ...styleTexts] = await Promise.all([
					artifactText(op, module.digest),
					...styles.map((s) => artifactText(op, s.digest)),
				]);
				const outcome = await h.render({
					previewRevision: sourceRevision,
					puckType: PREVIEW_TYPE,
					module: { digest: module.digest, text: moduleText ?? "" },
					styles: styles.map((s, i) => ({
						digest: s.digest,
						text: styleTexts[i] ?? "",
					})),
					props: {},
				});
				if (outcome.kind === "rendered") {
					setCurrent({ operationId: op, revision: outcome.previewRevision });
					setRenderError(null);
				} else {
					setRenderError(outcome.code);
				}
			} catch (err) {
				setRenderError(err instanceof Error ? err.message : String(err));
			}
		})();
	}, [preview, handleReady]);

	const onSession = useCallback((h: PreviewFrameHandle | null) => {
		handle.current = h;
		if (h) setHandleReady((n) => n + 1);
	}, []);

	const files = useMemo(
		() => (base ? applyEdits(base.files, edits) : []),
		[base, edits],
	);
	const dirty = useMemo(
		() => (base ? changedPaths(base.files, files) : []),
		[base, files],
	);
	const selectedFile = files.find((f) => f.path === selected);

	const save = async () => {
		if (!base || !source) return;
		const fingerprint = JSON.stringify([base.revision, files]);
		if (saveRef.current?.fingerprint !== fingerprint)
			saveRef.current = { id: newCommandId("prv"), fingerprint };
		setSaving(true);
		setNotice(null);
		try {
			const response = await fetch(
				`/api/agent/workbench/${encodeURIComponent(operationId)}/previews`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						commandId: saveRef.current.id,
						lineage: source.lineage,
						baseRevision: base.revision,
						files,
					}),
				},
			);
			const body = await readJson(response);
			if (response.ok) {
				const op = body as OperationView;
				submitted.current.set(op.operationId, files);
				saveRef.current = null;
				setPreview(null);
				setPreviewOp(op.operationId);
				return;
			}
			const e = asErrorEnvelope(body);
			setNotice({
				kind: "error",
				title: t("workbench.notice.refused"),
				detail: e
					? `${e.error.code}: ${e.error.message}`
					: `HTTP ${response.status}`,
			});
		} finally {
			setSaving(false);
		}
	};

	const rebase = (revision: string) => {
		// The edits stay exactly as they are; only the revision they claim to be based on moves.
		setBase((b) => (b ? { ...b, revision } : b));
		setPreview(null);
		setPreviewOp(null);
		setNotice({
			kind: "info",
			title: t("workbench.conflict.rebased"),
			detail: revision,
		});
	};

	if (!configured) {
		return (
			<main className="mx-auto w-full max-w-5xl px-6 py-10">
				<Alert variant="destructive">
					<AlertTitle>{t("prepare.unavailable")}</AlertTitle>
				</Alert>
			</main>
		);
	}

	return (
		<main
			className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10"
			data-testid="source-workbench"
		>
			<div>
				<h1 className="text-2xl font-semibold">{t("workbench.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("workbench.lede")}</p>
			</div>
			{loadError ? (
				<Alert variant="destructive">
					<AlertTitle>{t("workbench.loadFailed")}</AlertTitle>
					<AlertDescription>{loadError}</AlertDescription>
				</Alert>
			) : null}
			{notice ? (
				<Alert
					variant={notice.kind === "error" ? "destructive" : "default"}
					data-testid="workbench-notice"
				>
					<AlertTitle>{notice.title}</AlertTitle>
					{notice.detail ? (
						<AlertDescription>{notice.detail}</AlertDescription>
					) : null}
				</Alert>
			) : null}
			{source && !base ? (
				<Alert>
					<AlertTitle>{t("workbench.noRevision")}</AlertTitle>
				</Alert>
			) : null}
			{source && base ? (
				<div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
					<Card className="gap-2 p-4">
						<p className="text-xs text-muted-foreground">
							{t("workbench.base")}{" "}
							<span className="font-mono" data-testid="workbench-base-revision">
								{base.revision}
							</span>
						</p>
						<ul className="flex flex-col gap-1 text-sm">
							{files.map((f) => (
								<li key={f.path}>
									<button
										type="button"
										className={`w-full truncate rounded px-2 py-1 text-left font-mono text-xs ${f.path === selected ? "bg-muted" : ""}`}
										disabled={!isTextFile(f)}
										onClick={() => setSelected(f.path)}
									>
										{dirty.includes(f.path) ? "● " : ""}
										{f.path}
									</button>
								</li>
							))}
						</ul>
					</Card>
					<Card className="gap-3 p-4">
						{selectedFile && isTextFile(selectedFile) ? (
							<CodeMirrorSurface
								key={selectedFile.path}
								text={selectedFile.text}
								diagnostics={[]}
								ariaLabel={selectedFile.path}
								onChange={(text) =>
									setEdits((m) => {
										const next = new Map(m);
										next.set(selectedFile.path, text);
										return next;
									})
								}
							/>
						) : (
							<p className="text-sm text-muted-foreground">
								{t("workbench.pickFile")}
							</p>
						)}
						<div className="flex flex-wrap items-center gap-2">
							<Button
								type="button"
								onClick={() => void save()}
								disabled={saving || dirty.length === 0}
								data-testid="workbench-save"
							>
								{saving ? t("workbench.saving") : t("workbench.save")}
							</Button>
							<span className="text-xs text-muted-foreground">
								{dirty.length} {t("workbench.changed")}
							</span>
						</div>
					</Card>
				</div>
			) : null}
			{previewOp ? (
				<OperationPanel
					state={previewState}
					title={t("workbench.previewOperation")}
				/>
			) : null}
			{preview ? (
				<Card
					className="gap-3 p-4"
					data-testid="workbench-preview-state"
					data-state={preview.state}
				>
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="text-lg font-semibold">{t("workbench.preview")}</h2>
						<Badge>{preview.state}</Badge>
						{preview.sourceRevision ? (
							<Badge variant="outline">{`${t("workbench.saved")} ${preview.sourceRevision}`}</Badge>
						) : null}
					</div>
					{preview.state === "conflict" ? (
						<Alert variant="destructive" data-testid="workbench-conflict">
							<AlertTitle>{t("workbench.conflict.title")}</AlertTitle>
							<AlertDescription>
								<p>
									{t("workbench.conflict.detail")}{" "}
									<span className="font-mono">
										{preview.currentRevision ?? "?"}
									</span>
								</p>
								<p>{t("workbench.conflict.kept")}</p>
								{preview.currentRevision ? (
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="mt-2"
										data-testid="workbench-rebase"
										onClick={() => rebase(preview.currentRevision as string)}
									>
										{`${t("workbench.conflict.rebase")} ${preview.currentRevision}`}
									</Button>
								) : null}
							</AlertDescription>
						</Alert>
					) : null}
					{preview.state === "ready" && preview.sourceRevision && source ? (
						<form
							className="flex flex-wrap items-end gap-2"
							data-testid="workbench-release"
							onSubmit={(e) => {
								e.preventDefault();
								let body: Record<string, unknown>;
								try {
									body = releaseRequest({
										sourceOperationId: preview.operationId,
										lineage: source.lineage,
										sourceRevision: preview.sourceRevision as string,
										packageVersion: releaseVersion.trim(),
									});
								} catch (err) {
									setReleaseNotice({ error: String((err as Error).message) });
									return;
								}
								void releases
									.run<OperationView>("release", "POST", "operations", body)
									.then((r) =>
										setReleaseNotice(
											r.ok
												? { operationId: r.body.operationId }
												: {
														error: `${r.error.error.code}: ${r.error.error.message}`,
													},
										),
									);
							}}
						>
							<label className="flex flex-col gap-1 text-xs">
								{t("release.version")}
								<input
									className="rounded border px-2 py-1 font-mono text-sm"
									data-testid="workbench-release-version"
									value={releaseVersion}
									onChange={(e) => setReleaseVersion(e.target.value)}
									placeholder="1.0.0"
								/>
							</label>
							<Button
								type="submit"
								size="sm"
								variant="outline"
								data-testid="workbench-release-request"
								disabled={releases.pending.has("release")}
							>
								{t("release.request")}
							</Button>
							{releaseNotice?.operationId ? (
								<Link
									className="text-sm underline"
									data-testid="workbench-release-open"
									href={`/agent/operations/${encodeURIComponent(releaseNotice.operationId)}`}
								>
									{`${t("release.requested")} · ${t("release.openRelease")}`}
								</Link>
							) : null}
							{releaseNotice?.error ? (
								<span
									className="font-mono text-xs"
									data-testid="workbench-release-error"
								>
									{releaseNotice.error}
								</span>
							) : null}
						</form>
					) : null}
					{preview.state === "failed" ? (
						<p className="font-mono text-sm">
							{preview.failureCode ?? "failed"}
						</p>
					) : null}
				</Card>
			) : null}
			{stale.length > 0 ? (
				<Card className="gap-2 p-4" data-testid="workbench-stale">
					<h2 className="text-sm font-semibold">
						{t("workbench.stale.title")}
					</h2>
					<p className="text-xs text-muted-foreground">
						{t("workbench.stale.detail")}
					</p>
					<ul className="font-mono text-xs">
						{stale.map((p) => (
							<li key={p.operationId}>
								{p.operationId}: {t("workbench.saved")} {p.sourceRevision} ·{" "}
								{t("workbench.current")} {p.currentRevision}
							</li>
						))}
					</ul>
				</Card>
			) : null}
			<Card className="gap-3 p-4">
				<div className="flex flex-wrap items-center gap-2">
					<h2 className="text-lg font-semibold">{t("workbench.frame")}</h2>
					<Badge variant="outline" data-testid="workbench-session">
						{session
							? session.kind === "closed"
								? `closed: ${session.reason}`
								: session.kind
							: "none"}
					</Badge>
					{current ? (
						<Badge data-testid="workbench-current">{`${t("workbench.current")} ${current.revision}`}</Badge>
					) : null}
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => {
							rendered.current = null;
							setFrameKey((k) => k + 1);
						}}
						data-testid="workbench-replace-frame"
					>
						{t("workbench.replaceFrame")}
					</Button>
				</div>
				{renderError ? (
					<p className="font-mono text-sm text-destructive">{renderError}</p>
				) : null}
				{previewOrigin ? (
					<PreviewFrame
						key={frameKey}
						previewOrigin={previewOrigin}
						hostProfileId={hostProfileId}
						title={t("workbench.frame")}
						onSession={onSession}
						onState={setSession}
					/>
				) : (
					<p className="text-sm text-muted-foreground">
						{t("workbench.noPreviewOrigin")}
					</p>
				)}
			</Card>
		</main>
	);
}
