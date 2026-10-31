"use client";

/**
 * Client workbench of `/agent/prepare` (P20 on the V4 Agent API).
 *
 * State the user must not lose lives with the platform, never here: the
 * operation identifier travels in the URL (`?operationId=`), progress is the
 * committed snapshot plus the durable event stream, and each command carries
 * a `commandId` minted once per attempt so a retry after a lost response
 * resolves to the same acceptance instead of a second task or answer. An
 * answer binds the question set id and revision the view was read at;
 * Control refuses anything superseded.
 */

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Button, buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import { Label } from "@anvilkit/ui/label";
import { Textarea } from "@anvilkit/ui/textarea";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactElement } from "react";
import { useCallback, useRef, useState } from "react";
import {
	asErrorEnvelope,
	newCommandId,
	type OperationView,
	readJson,
} from "@/lib/agent/operation-client";
import {
	acceptsAnswers,
	byteLength,
	formatAnswer,
	PROMPT_MAX_BYTES,
	parseReferences,
} from "@/lib/agent/preparation-client";
import { useOperation } from "@/lib/agent/use-operation";
import { useDemoT } from "@/lib/i18n/client";
import { GenerateAction } from "../_components/generate-action";
import { OperationPanel } from "../_components/operation-panel";
import { ProgressTimeline } from "../_components/progress-timeline";

interface Notice {
	readonly kind: "error" | "info";
	readonly title: string;
	readonly detail?: string;
}

function PromptForm({
	disabled,
	onAccepted,
	notify,
}: {
	readonly disabled: boolean;
	readonly onAccepted: (operationId: string) => void;
	readonly notify: (notice: Notice | null) => void;
}): ReactElement {
	const t = useDemoT();
	const [prompt, setPrompt] = useState("");
	const [brands, setBrands] = useState("");
	const [assets, setAssets] = useState("");
	const [submitting, setSubmitting] = useState(false);
	// One command identity per submission attempt: a retry of the same prompt
	// after a lost response replays to the same operation; a changed prompt
	// gets a fresh identity.
	const commandRef = useRef<{ id: string; fingerprint: string } | null>(null);
	const bytes = byteLength(prompt);
	const brandRefs = parseReferences(brands);
	const assetRefs = parseReferences(assets);
	const invalid =
		bytes > PROMPT_MAX_BYTES ||
		prompt.trim() === "" ||
		!brandRefs ||
		!assetRefs;

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (invalid || !brandRefs || !assetRefs) return;
		const fingerprint = JSON.stringify([prompt.trim(), brandRefs, assetRefs]);
		if (commandRef.current?.fingerprint !== fingerprint) {
			commandRef.current = { id: newCommandId("prep"), fingerprint };
		}
		setSubmitting(true);
		notify(null);
		try {
			const response = await fetch("/api/agent/preparations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					commandId: commandRef.current.id,
					prompt,
					...(brandRefs.length ? { brandReferences: brandRefs } : {}),
					...(assetRefs.length ? { assetReferences: assetRefs } : {}),
				}),
			});
			const body = await readJson(response);
			if (response.ok) {
				commandRef.current = null;
				onAccepted((body as OperationView).operationId);
				return;
			}
			const envelope = asErrorEnvelope(body);
			notify({
				kind: "error",
				title: t("prepare.notice.error"),
				detail: envelope
					? `${envelope.error.code}: ${envelope.error.message}`
					: `HTTP ${response.status}`,
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Card className="gap-4 p-6" data-testid="prepare-form">
			<form className="flex flex-col gap-4" onSubmit={submit}>
				<div className="flex flex-col gap-2">
					<Label htmlFor="prepare-prompt">{t("prepare.form.prompt")}</Label>
					<Textarea
						id="prepare-prompt"
						value={prompt}
						rows={6}
						placeholder={t("prepare.form.promptPlaceholder")}
						onChange={(event) => setPrompt(event.currentTarget.value)}
						disabled={disabled || submitting}
					/>
					<p
						className={`text-xs ${bytes > PROMPT_MAX_BYTES ? "text-destructive" : "text-muted-foreground"}`}
					>
						{bytes} / {PROMPT_MAX_BYTES} {t("prepare.form.promptBytes")}
					</p>
				</div>
				<div className="flex flex-col gap-2">
					<Label htmlFor="prepare-brands">{t("prepare.form.brand")}</Label>
					<Input
						id="prepare-brands"
						value={brands}
						placeholder="src_brand@3"
						onChange={(event) => setBrands(event.currentTarget.value)}
						disabled={disabled || submitting}
					/>
					<Label htmlFor="prepare-assets">{t("prepare.form.assets")}</Label>
					<Input
						id="prepare-assets"
						value={assets}
						placeholder="src_asset@1"
						onChange={(event) => setAssets(event.currentTarget.value)}
						disabled={disabled || submitting}
					/>
					<p className="text-xs text-muted-foreground">
						{t("prepare.form.referenceHint")}
					</p>
				</div>
				<div>
					<Button
						type="submit"
						disabled={disabled || submitting || invalid}
						data-testid="prepare-submit"
					>
						{submitting
							? t("prepare.form.submitting")
							: t("prepare.form.submit")}
					</Button>
				</div>
			</form>
		</Card>
	);
}

function QuestionForm({
	view,
	onAnswered,
	notify,
}: {
	readonly view: OperationView;
	readonly onAnswered: () => void;
	readonly notify: (notice: Notice | null) => void;
}): ReactElement | null {
	const t = useDemoT();
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);
	const commandRef = useRef<{ id: string; fingerprint: string } | null>(null);
	const clarification = view.clarification;
	if (!clarification) return null;
	const text = formatAnswer(clarification, answers);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!text) return;
		const fingerprint = `${clarification.questionSetId}/${clarification.questionSetRevision}/${text}`;
		if (commandRef.current?.fingerprint !== fingerprint) {
			commandRef.current = { id: newCommandId("ans"), fingerprint };
		}
		setSubmitting(true);
		notify(null);
		try {
			const response = await fetch(
				`/api/agent/preparations/${encodeURIComponent(view.operationId)}/answers`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						commandId: commandRef.current.id,
						questionSetId: clarification.questionSetId,
						questionSetRevision: clarification.questionSetRevision,
						answer: text,
					}),
				},
			);
			const body = await readJson(response);
			if (response.ok) {
				commandRef.current = null;
				notify({ kind: "info", title: t("prepare.questions.accepted") });
				onAnswered();
				return;
			}
			const envelope = asErrorEnvelope(body);
			const conflict =
				envelope?.error.code === "REVISION_CONFLICT" ||
				envelope?.error.code === "IDEMPOTENCY_CONFLICT";
			notify({
				kind: "error",
				title: conflict
					? t("prepare.notice.conflict")
					: t("prepare.notice.error"),
				detail: envelope
					? `${envelope.error.code}: ${envelope.error.message}`
					: `HTTP ${response.status}`,
			});
			if (conflict) onAnswered();
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Card className="gap-4 p-6" data-testid="prepare-questions">
			<div>
				<h2 className="text-lg font-semibold">
					{t("prepare.questions.title")}
				</h2>
				<p className="text-sm text-muted-foreground">
					{t("prepare.questions.lede")}
				</p>
				<p className="text-xs text-muted-foreground">
					{t("prepare.questions.expires")}{" "}
					{new Date(clarification.expiresAt).toLocaleString()} ·{" "}
					{t("prepare.task.round")} {clarification.round}
				</p>
			</div>
			<form className="flex flex-col gap-5" onSubmit={submit}>
				{clarification.questions.map((question) => (
					<div key={question.questionId} className="flex flex-col gap-2">
						<Label htmlFor={`answer-${question.questionId}`}>
							{question.text}
						</Label>
						<Input
							id={`answer-${question.questionId}`}
							value={answers[question.questionId] ?? ""}
							placeholder={t("prepare.questions.answerPlaceholder")}
							onChange={(event) => {
								// currentTarget is bound only during dispatch; read it before
								// the state updater runs.
								const value = event.currentTarget.value;
								setAnswers((previous) => ({
									...previous,
									[question.questionId]: value,
								}));
							}}
							disabled={submitting}
						/>
					</div>
				))}
				<div>
					<Button
						type="submit"
						disabled={submitting || !text}
						data-testid="prepare-answers-submit"
					>
						{submitting
							? t("prepare.questions.submitting")
							: t("prepare.questions.submit")}
					</Button>
				</div>
			</form>
		</Card>
	);
}

function TaskView({
	operationId,
	notify,
	onReset,
}: {
	readonly operationId: string;
	readonly notify: (notice: Notice | null) => void;
	readonly onReset: () => void;
}): ReactElement {
	const t = useDemoT();
	const state = useOperation(operationId);
	const view = state.view;
	return (
		<div className="flex flex-col gap-6">
			<OperationPanel state={state} title={t("prepare.task.title")} />
			<ProgressTimeline
				state={state}
				title={t("progress.group.preparation")}
				testId="preparation-timeline"
			/>
			{view && acceptsAnswers(view) && view.clarification ? (
				<QuestionForm
					key={`${view.clarification.questionSetId}/${view.clarification.questionSetRevision}`}
					view={view}
					onAnswered={() => void state.refresh()}
					notify={notify}
				/>
			) : null}
			{view?.lifecycle === "succeeded" ? (
				<p className="text-sm text-muted-foreground" data-testid="prepare-done">
					{t("prepare.task.done")}
				</p>
			) : null}
			{view?.lifecycle === "succeeded" && view.subject.briefId ? (
				// Plan 0005 §4.5: one explicit click is one generation intent; the
				// view navigates to the generation with `?from=` this preparation.
				<GenerateAction
					briefId={view.subject.briefId}
					preparationOperationId={operationId}
					onError={(title, code) =>
						notify({ kind: "error", title, detail: code })
					}
				/>
			) : null}
			<div className="flex flex-wrap gap-2">
				<Button type="button" variant="ghost" size="sm" onClick={onReset}>
					{t("prepare.form.new")}
				</Button>
				<Link
					className={buttonVariants({ variant: "ghost", size: "sm" })}
					href={`/agent/operations/${encodeURIComponent(operationId)}`}
				>
					{t("operation.open")}
				</Link>
			</div>
		</div>
	);
}

export function PreparationWorkbench({
	configured,
}: {
	readonly configured: boolean;
}): ReactElement {
	const t = useDemoT();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const operationId = searchParams.get("operationId");
	const [notice, setNotice] = useState<Notice | null>(null);
	const notify = useCallback((next: Notice | null) => setNotice(next), []);
	const open = useCallback(
		(id: string | null) => {
			const params = new URLSearchParams(searchParams.toString());
			if (id) params.set("operationId", id);
			else params.delete("operationId");
			const query = params.toString();
			router.replace(query ? `${pathname}?${query}` : pathname);
		},
		[router, pathname, searchParams],
	);

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<div>
				<h1 className="text-2xl font-semibold">{t("prepare.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("prepare.lede")}</p>
			</div>
			{!configured ? (
				<Alert variant="destructive" data-testid="prepare-unavailable">
					<AlertTitle>{t("prepare.unavailable")}</AlertTitle>
				</Alert>
			) : null}
			{notice ? (
				<Alert
					variant={notice.kind === "error" ? "destructive" : "default"}
					data-testid="prepare-notice"
				>
					<AlertTitle>{notice.title}</AlertTitle>
					{notice.detail ? (
						<AlertDescription>{notice.detail}</AlertDescription>
					) : null}
				</Alert>
			) : null}
			{operationId ? (
				<TaskView
					operationId={operationId}
					notify={notify}
					onReset={() => {
						setNotice(null);
						open(null);
					}}
				/>
			) : (
				<PromptForm
					disabled={!configured}
					notify={notify}
					onAccepted={(id) => {
						setNotice(null);
						open(id);
					}}
				/>
			)}
		</main>
	);
}
