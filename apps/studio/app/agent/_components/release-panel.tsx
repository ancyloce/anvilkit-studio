"use client";

/**
 * Certification, approval, publication and activation of one release
 * (P21, DD-05 §1): the committed release projection exactly as the platform
 * recorded it. The maintainer sees the exact subject the decision binds;
 * each target is shown with its own receipt; npm success alone, an unknown
 * target or a pending approval is never shown as delivered, and only an
 * activated release offers the lock a page may pin.
 */

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Card } from "@anvilkit/ui/card";
import type { ReactElement } from "react";
import { useEffect } from "react";
import {
	deliveredLock,
	type Release,
	releaseStanding,
} from "@/lib/agent/release-client";
import { useAgentResource } from "@/lib/agent/use-agent";
import { useDemoT } from "@/lib/i18n/client";
import type { DemoMessageKey } from "@/lib/i18n/messages";

function Target({
	label,
	target,
	testId,
}: {
	readonly label: string;
	readonly target: Release["npm"];
	readonly testId: string;
}): ReactElement {
	const t = useDemoT();
	return (
		<div
			className="flex flex-wrap items-center gap-2"
			data-testid={testId}
			data-state={target.state}
		>
			<span className="text-sm text-muted-foreground">{label}</span>
			<Badge variant={target.state === "succeeded" ? "default" : "outline"}>
				{target.state}
			</Badge>
			{target.receiptId ? (
				<span className="font-mono text-xs">{`${t("release.receipt")} ${target.receiptId}`}</span>
			) : null}
			{target.destination ? (
				<span className="font-mono text-xs break-all">
					{target.destination}
				</span>
			) : null}
			{target.failureCode ? (
				<span className="font-mono text-xs">{target.failureCode}</span>
			) : null}
		</div>
	);
}

export function ReleasePanel({
	operationId,
	revision,
}: {
	readonly operationId: string;
	/** The operation's committed revision; the release is re-read when it moves. */
	readonly revision: string;
}): ReactElement {
	const t = useDemoT();
	const release = useAgentResource<Release>(
		`operations/${encodeURIComponent(operationId)}/release`,
	);
	const { reload } = release;
	// biome-ignore lint/correctness/useExhaustiveDependencies: re-read on every committed operation revision
	useEffect(() => {
		void reload();
	}, [revision, reload]);
	const r = release.data;
	if (!r) {
		return (
			<Card className="gap-2 p-6" data-testid="release-panel">
				<h2 className="text-lg font-semibold">{t("release.title")}</h2>
				{release.error && release.error.error.code !== "NOT_FOUND" ? (
					<Alert variant="destructive">
						<AlertTitle>{release.error.error.code}</AlertTitle>
						<AlertDescription>{release.error.error.message}</AlertDescription>
					</Alert>
				) : (
					<p className="text-sm text-muted-foreground">
						{t("release.loading")}
					</p>
				)}
			</Card>
		);
	}
	const standing = releaseStanding(r);
	const lock = deliveredLock(r);
	const s = r.subject;
	return (
		<Card
			className="gap-4 p-6"
			data-testid="release-panel"
			data-state={r.state}
			data-standing={standing}
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-lg font-semibold">{t("release.title")}</h2>
				<Badge data-testid="release-state">{r.state}</Badge>
				{r.failureCode ? (
					<Badge variant="outline" data-testid="release-failure">
						{r.failureCode}
					</Badge>
				) : null}
			</div>
			<p className="text-sm" data-testid="release-standing">
				{t(`release.standing.${standing}` as DemoMessageKey)}
			</p>
			{s ? (
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-semibold">{t("release.subject")}</h3>
					<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
						<dt className="text-muted-foreground">
							{t("release.subjectDigest")}
						</dt>
						<dd
							className="font-mono break-all"
							data-testid="release-subject-digest"
						>
							{s.subjectDigest}
						</dd>
						<dt className="text-muted-foreground">{t("release.package")}</dt>
						<dd className="font-mono">{`${s.packageName}@${s.version} · ${s.componentId} · ${s.puckType}`}</dd>
						<dt className="text-muted-foreground">
							{t("release.sourceRevision")}
						</dt>
						<dd className="font-mono">{`${s.sourceRevision} · ${s.sourceDigest}`}</dd>
						<dt className="text-muted-foreground">{t("release.profiles")}</dt>
						<dd className="font-mono break-all">{`${s.buildProfileId} / ${s.validatorProfileId} / ${s.hostAbi}`}</dd>
						<dt className="text-muted-foreground">
							{t("release.destinations")}
						</dt>
						<dd className="font-mono break-all">{`${s.destinations.npmRegistry} · ${s.destinations.browserOrigin}`}</dd>
						<dt className="text-muted-foreground">
							{t("release.certification")}
						</dt>
						<dd className="font-mono break-all">
							{s.certificationEvidenceDigest}
						</dd>
					</dl>
				</div>
			) : null}
			{r.approval ? (
				<div
					className="flex flex-col gap-1"
					data-testid="release-approval"
					data-state={r.approval.state}
				>
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-sm font-semibold">{t("release.approval")}</h3>
						<Badge variant="outline">{r.approval.state}</Badge>
						{r.approval.approverId ? (
							<span className="font-mono text-xs">{r.approval.approverId}</span>
						) : null}
					</div>
					<p className="font-mono text-xs break-all">
						{r.approval.subjectDigest}
					</p>
					{r.approvalDeadline ? (
						<p className="text-xs text-muted-foreground">{`${t("release.approvalDeadline")}: ${new Date(r.approvalDeadline).toLocaleString()}`}</p>
					) : null}
					<p className="text-xs text-muted-foreground">
						{t("release.approvalNote")}
					</p>
				</div>
			) : null}
			<Target label={t("release.npm")} target={r.npm} testId="release-npm" />
			<Target
				label={t("release.browser")}
				target={r.browser}
				testId="release-browser"
			/>
			<Target
				label={t("release.activation")}
				target={r.activation}
				testId="release-activation"
			/>
			{lock ? (
				<div className="flex flex-col gap-1" data-testid="release-lock">
					<h3 className="text-sm font-semibold">{t("release.lock")}</h3>
					<pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
						{JSON.stringify(lock, null, 2)}
					</pre>
				</div>
			) : null}
		</Card>
	);
}
