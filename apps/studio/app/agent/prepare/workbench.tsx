"use client";

/**
 * Client workbench of `/agent/prepare` (S2-T01/T03/T06, 2026-09-13).
 *
 * State the user must not lose lives with the platform, never here: the
 * operation identifier travels in the URL (`?operationId=`), every read is a
 * fresh `PreparationDetail` from the server route, and each command carries a
 * `commandId` minted once per attempt so a retry after a lost response
 * resolves to the same acceptance instead of a second task or answer set.
 * Answers bind the exact question-set reference and operation revision the
 * detail was read at; Control refuses anything superseded.
 */

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Button } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { Checkbox } from "@anvilkit/ui/checkbox";
import { Input } from "@anvilkit/ui/input";
import { Label } from "@anvilkit/ui/label";
import { Textarea } from "@anvilkit/ui/textarea";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { FormEvent, ReactElement } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	acceptsAnswers,
	asErrorEnvelope,
	buildAnswersCommand,
	buildPreparationCommand,
	CONTROLLED_ASSET_REFS,
	CONTROLLED_BRAND_REFS,
	type ControlledReference,
	isTerminalStage,
	nextPollDelayMs,
	type OperationAccepted,
	PROMPT_MAX_BYTES,
	type PreparationDetail,
	type PreparationStage,
	promptByteLength,
} from "@/lib/agent/preparation-client";
import { useDemoT } from "@/lib/i18n/client";
import type { DemoMessageKey } from "@/lib/i18n/messages";

const STAGE_KEYS: Record<PreparationStage, DemoMessageKey> = {
	admission_pending: "prepare.stage.admission_pending",
	queued: "prepare.stage.queued",
	analyzing: "prepare.stage.analyzing",
	awaiting_input: "prepare.stage.awaiting_input",
	brief_ready: "prepare.stage.brief_ready",
	expired: "prepare.stage.expired",
	failed: "prepare.stage.failed",
	canceled: "prepare.stage.canceled",
};

interface Notice {
	readonly kind: "error" | "info";
	readonly title: string;
	readonly detail?: string;
}

async function readJson(response: Response): Promise<unknown> {
	const text = await response.text();
	if (text === "") return null;
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

function ReferencePicker({
	label,
	options,
	selected,
	onToggle,
	disabled,
}: {
	readonly label: string;
	readonly options: readonly ControlledReference[];
	readonly selected: ReadonlySet<string>;
	readonly onToggle: (id: string, checked: boolean) => void;
	readonly disabled: boolean;
}): ReactElement {
	return (
		<fieldset className="flex flex-col gap-2">
			<legend className="text-sm font-medium">{label}</legend>
			{options.map((option) => (
				<div key={option.id} className="flex items-center gap-2">
					<Checkbox
						id={`ref-${option.id}`}
						checked={selected.has(option.id)}
						onCheckedChange={(checked) => onToggle(option.id, checked === true)}
						disabled={disabled}
					/>
					<Label htmlFor={`ref-${option.id}`} className="font-normal">
						{option.label}
					</Label>
				</div>
			))}
		</fieldset>
	);
}

function PromptForm({
	disabled,
	onAccepted,
	notify,
}: {
	readonly disabled: boolean;
	readonly onAccepted: (accepted: OperationAccepted) => void;
	readonly notify: (notice: Notice | null) => void;
}): ReactElement {
	const t = useDemoT();
	const [prompt, setPrompt] = useState("");
	const [brands, setBrands] = useState<ReadonlySet<string>>(() => new Set());
	const [assets, setAssets] = useState<ReadonlySet<string>>(() => new Set());
	const [submitting, setSubmitting] = useState(false);
	// One command identity per submission attempt: a retry of the same prompt
	// after a lost response replays to the same task (Control's idempotency
	// key); a changed prompt gets a fresh identity.
	const commandRef = useRef<{ id: string; fingerprint: string } | null>(null);
	const bytes = promptByteLength(prompt);
	const tooLong = bytes > PROMPT_MAX_BYTES;

	const toggle =
		(
			set: (
				update: (previous: ReadonlySet<string>) => ReadonlySet<string>,
			) => void,
		) =>
		(id: string, checked: boolean) =>
			set((previous) => {
				const next = new Set(previous);
				if (checked) next.add(id);
				else next.delete(id);
				return next;
			});

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (disabled || submitting || prompt.trim() === "" || tooLong) return;
		const brandRefs = CONTROLLED_BRAND_REFS.filter((r) => brands.has(r.id)).map(
			(r) => r.ref,
		);
		const assetRefs = CONTROLLED_ASSET_REFS.filter((r) => assets.has(r.id)).map(
			(r) => r.ref,
		);
		const fingerprint = JSON.stringify([
			prompt.trim(),
			[...brands].sort(),
			[...assets].sort(),
		]);
		if (commandRef.current?.fingerprint !== fingerprint) {
			commandRef.current = { id: `studio-${crypto.randomUUID()}`, fingerprint };
		}
		const command = buildPreparationCommand(
			commandRef.current.id,
			prompt,
			brandRefs,
			assetRefs,
		);
		setSubmitting(true);
		notify(null);
		try {
			const response = await fetch("/api/agent/preparations", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(command),
			});
			const body = await readJson(response);
			if (response.status === 202 || response.status === 200) {
				commandRef.current = null;
				onAccepted(body as OperationAccepted);
				return;
			}
			const envelope = asErrorEnvelope(body);
			notify({
				kind: "error",
				title: t("prepare.notice.error"),
				detail: envelope
					? `${envelope.code}: ${envelope.message}`
					: `HTTP ${response.status}`,
			});
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Card className="gap-5 p-6">
			<form
				className="flex flex-col gap-5"
				onSubmit={submit}
				data-testid="prepare-form"
			>
				<div className="flex flex-col gap-2">
					<Label htmlFor="prepare-prompt">{t("prepare.form.prompt")}</Label>
					<Textarea
						id="prepare-prompt"
						name="prompt"
						rows={6}
						value={prompt}
						placeholder={t("prepare.form.promptPlaceholder")}
						onChange={(event) => setPrompt(event.currentTarget.value)}
						disabled={disabled || submitting}
						aria-invalid={tooLong}
					/>
					<p className="text-xs text-muted-foreground">
						{bytes} / {PROMPT_MAX_BYTES} {t("prepare.form.promptBytes")}
					</p>
				</div>
				<div className="grid gap-5 sm:grid-cols-2">
					<ReferencePicker
						label={t("prepare.form.brand")}
						options={CONTROLLED_BRAND_REFS}
						selected={brands}
						onToggle={toggle(setBrands)}
						disabled={disabled || submitting}
					/>
					<ReferencePicker
						label={t("prepare.form.assets")}
						options={CONTROLLED_ASSET_REFS}
						selected={assets}
						onToggle={toggle(setAssets)}
						disabled={disabled || submitting}
					/>
				</div>
				<p className="text-xs text-muted-foreground">
					{t("prepare.form.controlledHint")}
				</p>
				<div>
					<Button
						type="submit"
						disabled={disabled || submitting || prompt.trim() === "" || tooLong}
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
	detail,
	onAccepted,
	notify,
}: {
	readonly detail: PreparationDetail;
	readonly onAccepted: () => void;
	readonly notify: (notice: Notice | null) => void;
}): ReactElement | null {
	const t = useDemoT();
	const [answers, setAnswers] = useState<Record<string, string>>({});
	const [submitting, setSubmitting] = useState(false);
	const commandRef = useRef<{ id: string; fingerprint: string } | null>(null);
	const questionSet = detail.questionSet;
	if (!questionSet) return null;
	const open = acceptsAnswers(detail);
	const command = commandRef.current
		? buildAnswersCommand(commandRef.current.id, detail, answers)
		: buildAnswersCommand("pending", detail, answers);

	const submit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (!open || submitting || !command) return;
		const fingerprint = JSON.stringify([
			questionSet.questionSetRevision,
			command.answerSet.answers,
		]);
		if (commandRef.current?.fingerprint !== fingerprint) {
			commandRef.current = { id: `studio-${crypto.randomUUID()}`, fingerprint };
		}
		const bound = buildAnswersCommand(commandRef.current.id, detail, answers);
		if (!bound) return;
		setSubmitting(true);
		notify(null);
		try {
			const response = await fetch(
				`/api/agent/preparations/${encodeURIComponent(detail.operationId)}/answers`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(bound),
				},
			);
			const body = await readJson(response);
			if (response.status === 202 || response.status === 200) {
				commandRef.current = null;
				notify({ kind: "info", title: t("prepare.questions.accepted") });
				onAccepted();
				return;
			}
			const envelope = asErrorEnvelope(body);
			if (response.status === 409) {
				// A superseded question set or revision, or a set already accepted:
				// nothing was applied twice; reload and show the current state.
				notify({
					kind: "error",
					title: t("prepare.notice.conflict"),
					detail: envelope
						? `${envelope.code}: ${envelope.message}`
						: undefined,
				});
				onAccepted();
				return;
			}
			notify({
				kind: "error",
				title: t("prepare.notice.error"),
				detail: envelope
					? `${envelope.code}: ${envelope.message}`
					: `HTTP ${response.status}`,
			});
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
				{detail.preparation.questionSetExpiresAt ? (
					<p className="text-xs text-muted-foreground">
						{t("prepare.questions.expires")}{" "}
						{new Date(detail.preparation.questionSetExpiresAt).toLocaleString()}
					</p>
				) : null}
			</div>
			<form className="flex flex-col gap-5" onSubmit={submit}>
				{questionSet.questions.map((question) => (
					<div key={question.questionId} className="flex flex-col gap-2">
						<Label htmlFor={`answer-${question.questionId}`}>
							{question.text}
						</Label>
						{question.options ? (
							<div className="flex flex-wrap gap-2">
								{question.options.map((option) => (
									<Button
										key={option}
										type="button"
										size="sm"
										variant={
											answers[question.questionId] === option
												? "default"
												: "outline"
										}
										disabled={!open || submitting}
										onClick={() =>
											setAnswers((previous) => ({
												...previous,
												[question.questionId]: option,
											}))
										}
									>
										{option}
									</Button>
								))}
							</div>
						) : null}
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
							disabled={!open || submitting}
						/>
					</div>
				))}
				<div>
					<Button
						type="submit"
						disabled={!open || submitting || !command}
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

function List({
	title,
	items,
}: {
	readonly title: string;
	readonly items: readonly string[];
}): ReactElement {
	const t = useDemoT();
	return (
		<div className="flex flex-col gap-1">
			<h3 className="text-sm font-semibold">{title}</h3>
			{items.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					{t("prepare.brief.none")}
				</p>
			) : (
				<ul className="list-disc pl-5 text-sm">
					{items.map((item) => (
						<li key={item}>{item}</li>
					))}
				</ul>
			)}
		</div>
	);
}

function BriefView({
	detail,
}: {
	readonly detail: PreparationDetail;
}): ReactElement | null {
	const t = useDemoT();
	const brief = detail.brief;
	if (!brief) return null;
	const requirements = brief.requirements;
	return (
		<Card className="gap-5 p-6" data-testid="prepare-brief">
			<div>
				<h2 className="text-lg font-semibold">{t("prepare.brief.title")}</h2>
				<p className="text-sm text-muted-foreground">
					{t("prepare.brief.lede")}
				</p>
			</div>
			<div className="flex flex-col gap-1">
				<h3 className="text-sm font-semibold">{t("prepare.brief.purpose")}</h3>
				<p className="text-sm">{requirements.purpose}</p>
			</div>
			<div className="grid gap-5 sm:grid-cols-2">
				<List title={t("prepare.brief.content")} items={requirements.content} />
				<List
					title={t("prepare.brief.structure")}
					items={requirements.structure}
				/>
				<List
					title={t("prepare.brief.interactions")}
					items={requirements.interactions}
				/>
				<List
					title={t("prepare.brief.fields")}
					items={requirements.editableFields.map((field) =>
						field.description
							? `${field.name} (${field.kind}) — ${field.description}`
							: `${field.name} (${field.kind})`,
					)}
				/>
				<List
					title={t("prepare.brief.constraints")}
					items={requirements.constraints}
				/>
				<List
					title={t("prepare.brief.acceptance")}
					items={requirements.acceptancePoints}
				/>
			</div>
			{brief.resolvedAnswers.length > 0 ? (
				<List
					title={t("prepare.questions.answered")}
					items={brief.resolvedAnswers.map(
						(answer) => `${answer.key}: ${answer.answer}`,
					)}
				/>
			) : null}
			<List
				title={t("prepare.brief.references")}
				items={[...brief.brandRefs, ...brief.assetRefs].map(
					(ref) => `${ref.refId} (${ref.contentDigest})`,
				)}
			/>
			<p className="break-all font-mono text-xs text-muted-foreground">
				{t("prepare.brief.digest")}:{" "}
				{detail.preparation.briefRef?.contentDigest} · rev{" "}
				{detail.preparation.briefRevision}
			</p>
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
	const [detail, setDetail] = useState<PreparationDetail | null>(null);
	const [missing, setMissing] = useState(false);
	const [cancelling, setCancelling] = useState(false);
	const cancelRef = useRef<string | null>(null);

	const load = useCallback(async () => {
		const response = await fetch(
			`/api/agent/preparations/${encodeURIComponent(operationId)}`,
			{
				cache: "no-store",
			},
		);
		const body = await readJson(response);
		if (response.status === 200 && body && typeof body === "object") {
			setDetail(body as PreparationDetail);
			setMissing(false);
			return;
		}
		if (response.status === 403 || response.status === 404) {
			setMissing(true);
			return;
		}
		const envelope = asErrorEnvelope(body);
		notify({
			kind: "error",
			title: t("prepare.notice.error"),
			detail: envelope
				? `${envelope.code}: ${envelope.message}`
				: `HTTP ${response.status}`,
		});
	}, [operationId, notify, t]);

	// The first read follows the operation identity; every later read is
	// scheduled from the last detail at the cadence its stage warrants, and a
	// terminal stage schedules nothing.
	useEffect(() => {
		void load();
	}, [load]);

	useEffect(() => {
		const delay = nextPollDelayMs(detail);
		if (detail === null || delay === null) return;
		const timer = setTimeout(() => void load(), delay);
		return () => clearTimeout(timer);
	}, [detail, load]);

	const cancel = async () => {
		if (!detail || cancelling) return;
		cancelRef.current ??= `studio-${crypto.randomUUID()}`;
		setCancelling(true);
		try {
			const response = await fetch(
				`/api/agent/preparations/${encodeURIComponent(operationId)}/cancel`,
				{
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						commandId: cancelRef.current,
						expectedOperationRevision: detail.operationRevision,
						reasonCode: "USER_REQUESTED",
					}),
				},
			);
			const body = await readJson(response);
			if (response.status !== 202) {
				const envelope = asErrorEnvelope(body);
				notify({
					kind: "error",
					title:
						response.status === 409
							? t("prepare.notice.conflict")
							: t("prepare.notice.error"),
					detail: envelope
						? `${envelope.code}: ${envelope.message}`
						: `HTTP ${response.status}`,
				});
			}
			await load();
		} finally {
			setCancelling(false);
		}
	};

	if (missing) {
		return (
			<Alert variant="destructive" data-testid="prepare-missing">
				<AlertTitle>{t("prepare.task.notFound")}</AlertTitle>
				<AlertDescription>{operationId}</AlertDescription>
			</Alert>
		);
	}
	if (!detail) {
		return (
			<p className="text-sm text-muted-foreground">
				{t("prepare.task.loading")}
			</p>
		);
	}
	const terminal = isTerminalStage(detail.businessStage);
	const input = detail.input;
	return (
		<div className="flex flex-col gap-5">
			<Card className="gap-4 p-6" data-testid="prepare-task">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="text-lg font-semibold">{t("prepare.task.title")}</h2>
					<div className="flex flex-wrap items-center gap-2">
						<Badge
							variant={terminal ? "secondary" : "default"}
							data-testid="prepare-stage"
						>
							{t(STAGE_KEYS[detail.businessStage] ?? "prepare.stage.queued")}
						</Badge>
						<Badge variant="outline">{detail.status}</Badge>
					</div>
				</div>
				<dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
					<dt className="text-muted-foreground">
						{t("prepare.task.operation")}
					</dt>
					<dd
						className="font-mono break-all"
						data-testid="prepare-operation-id"
					>
						{detail.operationId}
					</dd>
					<dt className="text-muted-foreground">
						{t("prepare.task.revision")}
					</dt>
					<dd className="font-mono">{detail.operationRevision}</dd>
					<dt className="text-muted-foreground">{t("prepare.task.round")}</dt>
					<dd className="font-mono">{detail.preparation.round}</dd>
					<dt className="text-muted-foreground">{t("prepare.task.prompt")}</dt>
					<dd className="whitespace-pre-wrap">{input.prompt.text}</dd>
				</dl>
				{detail.acceptedAnswerSet && !detail.brief ? (
					<List
						title={t("prepare.questions.answered")}
						items={detail.acceptedAnswerSet.answers.map(
							(answer) => `${answer.questionId}: ${answer.answer}`,
						)}
					/>
				) : null}
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						size="sm"
						onClick={() => void load()}
					>
						{t("prepare.task.refresh")}
					</Button>
					{!terminal ? (
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => void cancel()}
							disabled={cancelling}
						>
							{cancelling
								? t("prepare.task.cancelling")
								: t("prepare.task.cancel")}
						</Button>
					) : null}
					<Button type="button" variant="ghost" size="sm" onClick={onReset}>
						{t("prepare.form.new")}
					</Button>
				</div>
				{terminal && !detail.brief ? (
					<p className="text-sm text-muted-foreground">
						{t("prepare.notice.terminal")}
					</p>
				) : null}
			</Card>
			{acceptsAnswers(detail) ? (
				<QuestionForm
					key={detail.questionSet?.questionSetRevision}
					detail={detail}
					onAccepted={() => void load()}
					notify={notify}
				/>
			) : null}
			<BriefView detail={detail} />
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
	const heading = useMemo(() => t("prepare.title"), [t]);

	return (
		<main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-10">
			<div>
				<h1 className="text-2xl font-semibold">{heading}</h1>
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
					onAccepted={(accepted) => {
						setNotice(null);
						open(accepted.operationId);
					}}
				/>
			)}
		</main>
	);
}
