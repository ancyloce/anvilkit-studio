"use client";

/**
 * Committed progress of one operation (P20): lifecycle, phase, control,
 * cleanup and finance exactly as the snapshot and the durable event stream
 * report them, plus the tracked control commands the projection admits.
 * Acceptance of a command is not its effect: the panel shows Control's
 * receipt outcome and the projection's control state separately.
 */

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Button } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import type { ReactElement } from "react";
import { useState } from "react";
import {
	availableCommands,
	type CommandKind,
	isTerminal,
} from "@/lib/agent/operation-client";
import type { OperationState } from "@/lib/agent/use-operation";
import { useDemoLocale, useDemoT } from "@/lib/i18n/client";
import { type DemoMessageKey, formatDateTime } from "@/lib/i18n/messages";

const COMMAND_KEYS: Record<CommandKind, DemoMessageKey> = {
	cancel: "operation.command.cancel",
	hold: "operation.command.hold",
	resume: "operation.command.resume",
	change_definition: "operation.command.change_definition",
};

export function OperationPanel({
	state,
	title,
}: {
	readonly state: OperationState;
	readonly title: string;
}): ReactElement {
	const t = useDemoT();
	const { locale } = useDemoLocale();
	const [notice, setNotice] = useState<string | null>(null);
	const { view, error, stream } = state;
	if (!view) {
		return (
			<Card className="gap-2 p-6" data-testid="operation-panel">
				<h2 className="text-lg font-semibold">{title}</h2>
				{error ? (
					<Alert variant="destructive" data-testid="operation-error">
						<AlertTitle>
							{error.error.code === "UNAUTHENTICATED" ||
							error.error.code === "FORBIDDEN"
								? t("progress.error.notPermitted")
								: error.error.code === "NOT_FOUND"
									? t("progress.error.notFound")
									: t("progress.error.generic", { code: error.error.code })}
						</AlertTitle>
						<AlertDescription>
							<code className="font-mono text-xs">{error.error.code}</code>
						</AlertDescription>
					</Alert>
				) : (
					<p className="text-sm text-muted-foreground">
						{t("operation.loading")}
					</p>
				)}
			</Card>
		);
	}
	const run = async (kind: CommandKind) => {
		setNotice(null);
		const answer = await state.command(kind);
		if ("error" in answer)
			setNotice(`${answer.error.code}: ${answer.error.message}`);
		else
			setNotice(
				`${t("operation.command.receipt")}: ${answer.outcome}${answer.reasonCode ? ` (${answer.reasonCode})` : ""}`,
			);
	};
	return (
		<Card
			className="gap-4 p-6"
			data-testid="operation-panel"
			data-lifecycle={view.lifecycle}
		>
			<div className="flex flex-wrap items-center gap-2">
				<h2 className="text-lg font-semibold">{title}</h2>
				<Badge data-testid="operation-lifecycle">{view.lifecycle}</Badge>
				<Badge variant="outline">{view.phase}</Badge>
				<Badge variant="secondary" data-testid="operation-stream">
					{t(`operation.stream.${stream}` as DemoMessageKey)}
				</Badge>
			</div>
			<dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
				<dt className="text-muted-foreground">{t("operation.id")}</dt>
				<dd className="font-mono break-all">{view.operationId}</dd>
				<dt className="text-muted-foreground">{t("operation.kind")}</dt>
				<dd className="font-mono">{view.kind}</dd>
				<dt className="text-muted-foreground">{t("operation.revision")}</dt>
				<dd className="font-mono" data-testid="operation-revision">
					{view.revision}
				</dd>
				<dt className="text-muted-foreground">{t("operation.control")}</dt>
				<dd className="font-mono" data-testid="operation-control">
					{view.control}
				</dd>
				<dt className="text-muted-foreground">{t("operation.cleanup")}</dt>
				<dd className="font-mono">{view.cleanup}</dd>
				<dt className="text-muted-foreground">{t("operation.finance")}</dt>
				<dd className="font-mono">{view.finance}</dd>
				<dt className="text-muted-foreground">{t("operation.deadline")}</dt>
				<dd>{formatDateTime(locale, view.deadline)}</dd>
				{view.failureCode ? (
					<>
						<dt className="text-muted-foreground">{t("operation.failure")}</dt>
						<dd className="font-mono" data-testid="operation-failure">
							{view.failureCode}
						</dd>
					</>
				) : null}
			</dl>
			<div className="flex flex-wrap gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => void state.refresh()}
				>
					{t("operation.refresh")}
				</Button>
				{availableCommands(view).map((kind) => (
					<Button
						key={kind}
						type="button"
						variant="outline"
						size="sm"
						data-testid={`operation-command-${kind}`}
						onClick={() => void run(kind)}
					>
						{t(COMMAND_KEYS[kind])}
						{state.pendingCommand?.kind === kind
							? ` · ${t("operation.command.pending")}`
							: ""}
					</Button>
				))}
			</div>
			{notice ? (
				<p
					className="text-sm text-muted-foreground"
					data-testid="operation-notice"
				>
					{notice}
				</p>
			) : null}
			{isTerminal(view.lifecycle) ? (
				<p className="text-sm text-muted-foreground">
					{t("operation.terminal")}
				</p>
			) : null}
		</Card>
	);
}
