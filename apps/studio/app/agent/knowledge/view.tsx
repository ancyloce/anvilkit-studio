"use client";

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Button } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import { Label } from "@anvilkit/ui/label";
import { Textarea } from "@anvilkit/ui/textarea";
import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import {
	formatAccess,
	type MemoryFact,
	type MemoryPage,
	parseAccess,
	type RecallMemoriesResponse,
	type SearchResponse,
	type Snapshot,
	type Source,
	type SourcePage,
} from "@/lib/agent/management";
import { type ErrorEnvelope, newCommandId } from "@/lib/agent/operation-client";
import {
	type CommandResult,
	useAgentResource,
	useTrackedCommands,
} from "@/lib/agent/use-agent";
import { useDemoT } from "@/lib/i18n/client";

type Notice = { readonly kind: "error" | "info"; readonly text: string } | null;

function describe(result: CommandResult<unknown>, ok: string): Notice {
	return result.ok
		? { kind: "info", text: ok }
		: {
				kind: "error",
				text: `${result.error.error.code}: ${result.error.error.message}`,
			};
}

function ErrorLine({
	error,
}: {
	readonly error: ErrorEnvelope | null;
}): ReactElement | null {
	return error ? (
		<p className="font-mono text-xs text-destructive">{`${error.error.code}: ${error.error.message}`}</p>
	) : null;
}

function NoticeLine({
	notice,
}: {
	readonly notice: Notice;
}): ReactElement | null {
	if (!notice) return null;
	return (
		<p
			className={`text-xs ${notice.kind === "error" ? "text-destructive" : "text-muted-foreground"}`}
			data-testid="management-notice"
		>
			{notice.text}
		</p>
	);
}

function SourceRow({
	source,
	onChanged,
}: {
	readonly source: Source;
	readonly onChanged: () => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const [access, setAccess] = useState(formatAccess(source.access));
	const [notice, setNotice] = useState<Notice>(null);
	const parsed = parseAccess(access);
	const base = `knowledge/sources/${encodeURIComponent(source.sourceId)}`;
	return (
		<li
			className="flex flex-col gap-2 border-b py-3"
			data-testid="knowledge-source"
			data-source={source.sourceId}
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-sm">{source.sourceId}</span>
				<Badge variant="outline">{source.kind}</Badge>
				<Badge data-testid="knowledge-ingest">{source.ingest}</Badge>
				{source.deleted ? (
					<Badge variant="secondary">{t("knowledge.deleted")}</Badge>
				) : null}
				<span className="text-xs text-muted-foreground">
					{t("knowledge.revision")} {source.currentRevision} ·{" "}
					{t("knowledge.aclRevision")} {source.aclRevision}
				</span>
			</div>
			<p className="break-all text-xs text-muted-foreground">
				{source.locator}
			</p>
			{!source.deleted ? (
				<div className="flex flex-wrap items-center gap-2">
					<Input
						className="max-w-md"
						value={access}
						onChange={(e) => setAccess(e.currentTarget.value)}
						aria-label={t("knowledge.access")}
					/>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={!parsed || pending.has("acl")}
						onClick={async () => {
							if (!parsed) return;
							const r = await run("acl", "PUT", `${base}/access`, {
								expectedAclRevision: source.aclRevision,
								access: parsed,
							});
							setNotice(describe(r, t("knowledge.aclReplaced")));
							onChanged();
						}}
					>
						{t("knowledge.replaceAcl")}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={pending.has("delete")}
						onClick={async () => {
							const r = await run("delete", "DELETE", base, {
								expectedRevision: source.currentRevision,
							});
							setNotice(describe(r, t("knowledge.deleteAccepted")));
							onChanged();
						}}
					>
						{t("knowledge.delete")}
					</Button>
				</div>
			) : null}
			<NoticeLine notice={notice} />
		</li>
	);
}

function RegisterSource({
	onChanged,
}: {
	readonly onChanged: () => void;
}): ReactElement {
	const t = useDemoT();
	const [file, setFile] = useState<File | null>(null);
	const [mediaType, setMediaType] = useState("");
	const [accessText, setAccessText] = useState("");
	const [commandId, setCommandId] = useState(() => newCommandId("src"));
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<Notice>(null);
	const access = parseAccess(accessText);
	// P2.6: the document goes to Studio's server, which uploads it through
	// Knowledge's single-use capability and registers it; the capability
	// never reaches the browser. A retry of the same selection reuses the
	// command, so it resolves to the same upload and source.
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		if (!file || !access) return;
		const body = new FormData();
		body.set("file", file);
		body.set("commandId", commandId);
		if (mediaType) body.set("mediaType", mediaType);
		body.set("access", accessText);
		setPending(true);
		try {
			const response = await fetch("/api/agent/knowledge/uploads", {
				method: "POST",
				body,
			});
			const payload = await response.json().catch(() => null);
			if (response.ok) {
				setNotice({ kind: "info", text: t("knowledge.uploaded") });
				setFile(null);
				setCommandId(newCommandId("src"));
			} else {
				const env = payload as ErrorEnvelope | null;
				setNotice({
					kind: "error",
					text: env?.error
						? `${env.error.code}: ${env.error.message}`
						: `HTTP ${response.status}`,
				});
			}
		} finally {
			setPending(false);
			onChanged();
		}
	};
	return (
		<form className="grid gap-2 sm:grid-cols-2" onSubmit={submit}>
			<p className="text-xs text-muted-foreground sm:col-span-2">
				{t("knowledge.uploadHint")}
			</p>
			<div className="flex flex-col gap-1">
				<Label htmlFor="register-file">{t("knowledge.field.file")}</Label>
				<Input
					id="register-file"
					type="file"
					accept=".md,.txt,.html,.pdf,text/markdown,text/plain,text/html,application/pdf"
					onChange={(e) => {
						setFile(e.currentTarget.files?.[0] ?? null);
						setCommandId(newCommandId("src"));
					}}
				/>
			</div>
			<div className="flex flex-col gap-1">
				<Label htmlFor="register-mediaType">
					{t("knowledge.field.mediaType")}
				</Label>
				<Input
					id="register-mediaType"
					placeholder={file?.type || "text/markdown"}
					value={mediaType}
					onChange={(e) => setMediaType(e.currentTarget.value)}
				/>
			</div>
			<div className="flex flex-col gap-1 sm:col-span-2">
				<Label htmlFor="register-access">{t("knowledge.field.access")}</Label>
				<Input
					id="register-access"
					value={accessText}
					onChange={(e) => setAccessText(e.currentTarget.value)}
				/>
			</div>
			<div className="sm:col-span-2">
				<Button type="submit" size="sm" disabled={!file || !access || pending}>
					{t("knowledge.upload")}
				</Button>
				<NoticeLine notice={notice} />
			</div>
		</form>
	);
}

/** P2.6: freezes exact revisions of the listed sources; search then uses the snapshot. */
function SnapshotForm({
	sources,
	onCreated,
}: {
	readonly sources: readonly Source[];
	readonly onCreated: (snapshotId: string) => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const indexed = sources
		.filter((s) => s.ingest === "indexed" && !s.deleted)
		.map((s) => s.sourceId);
	const [ids, setIds] = useState("");
	const [notice, setNotice] = useState<Notice>(null);
	const sourceIds = (ids.trim() ? ids : indexed.join(","))
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);
	return (
		<form
			className="flex flex-wrap items-end gap-2"
			onSubmit={async (e) => {
				e.preventDefault();
				const r = await run<Snapshot>(
					"snapshot",
					"POST",
					"knowledge/snapshots",
					{ sourceIds },
				);
				setNotice(describe(r, t("knowledge.snapshotCreated")));
				if (r.ok) onCreated(r.body.snapshotId);
			}}
		>
			<div className="flex min-w-64 flex-1 flex-col gap-1">
				<Label htmlFor="snapshot-sources">
					{t("knowledge.snapshotSources")}
				</Label>
				<Input
					id="snapshot-sources"
					placeholder={indexed.join(",")}
					value={ids}
					onChange={(e) => setIds(e.currentTarget.value)}
				/>
			</div>
			<Button
				type="submit"
				size="sm"
				disabled={sourceIds.length === 0 || pending.has("snapshot")}
			>
				{t("knowledge.createSnapshot")}
			</Button>
			<NoticeLine notice={notice} />
		</form>
	);
}

/** P2.6: recall of the caller's confirmed facts (Knowledge asks Control's commercial authorization first). */
function Recall(): ReactElement {
	const t = useDemoT();
	const [profile, setProfile] = useState("hybrid-bge-m3-dev-v1");
	const [query, setQuery] = useState("");
	const [answer, setAnswer] = useState<RecallMemoriesResponse | null>(null);
	const [notice, setNotice] = useState<Notice>(null);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const response = await fetch("/api/agent/v1/memories/recalls", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ query, retrievalProfileId: profile }),
		});
		const body = await response.json().catch(() => null);
		if (response.ok) {
			setAnswer(body as RecallMemoriesResponse);
			setNotice(null);
		} else {
			setAnswer(null);
			const env = body as ErrorEnvelope | null;
			setNotice({
				kind: "error",
				text: env?.error
					? `${env.error.code}: ${env.error.message}`
					: `HTTP ${response.status}`,
			});
		}
	};
	return (
		<Card className="gap-3 p-4">
			<h2 className="text-lg font-semibold">{t("knowledge.recall")}</h2>
			<form className="grid gap-2 sm:grid-cols-3" onSubmit={submit}>
				<Input
					aria-label={t("knowledge.profile")}
					value={profile}
					onChange={(e) => setProfile(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("knowledge.query")}
					placeholder={t("knowledge.query")}
					value={query}
					onChange={(e) => setQuery(e.currentTarget.value)}
				/>
				<div>
					<Button type="submit" size="sm" disabled={!query}>
						{t("knowledge.recallSubmit")}
					</Button>
				</div>
			</form>
			<NoticeLine notice={notice} />
			{answer ? (
				<ul
					className="flex flex-col gap-1 text-sm"
					data-testid="knowledge-recall"
				>
					<li className="text-xs text-muted-foreground">
						{t("knowledge.generation")} {answer.indexGeneration}
						{answer.noAnswer ? ` · ${t("knowledge.noAnswer")}` : ""}
					</li>
					{answer.facts.map((f) => (
						<li key={f.factId} className="rounded border p-2">
							{f.content}
							<span className="ml-2 font-mono text-xs text-muted-foreground">
								{f.factId}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</Card>
	);
}

function Search({
	snapshotId,
	onSnapshotId,
}: {
	readonly snapshotId: string;
	readonly onSnapshotId: (id: string) => void;
}): ReactElement {
	const t = useDemoT();
	const setSnapshotId = onSnapshotId;
	const [profile, setProfile] = useState("hybrid-bge-m3-dev-v1");
	const [query, setQuery] = useState("");
	const [answer, setAnswer] = useState<SearchResponse | null>(null);
	const [notice, setNotice] = useState<Notice>(null);
	const submit = async (e: FormEvent) => {
		e.preventDefault();
		const response = await fetch("/api/agent/v1/knowledge/searches", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ snapshotId, query, retrievalProfileId: profile }),
		});
		const body = await response.json().catch(() => null);
		if (response.ok) {
			setAnswer(body as SearchResponse);
			setNotice(null);
		} else {
			setAnswer(null);
			const env = body as ErrorEnvelope | null;
			setNotice({
				kind: "error",
				text: env?.error
					? `${env.error.code}: ${env.error.message}`
					: `HTTP ${response.status}`,
			});
		}
	};
	return (
		<Card className="gap-3 p-4">
			<h2 className="text-lg font-semibold">{t("knowledge.search")}</h2>
			<form className="grid gap-2 sm:grid-cols-3" onSubmit={submit}>
				<Input
					aria-label={t("knowledge.snapshot")}
					placeholder={t("knowledge.snapshot")}
					value={snapshotId}
					onChange={(e) => setSnapshotId(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("knowledge.profile")}
					value={profile}
					onChange={(e) => setProfile(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("knowledge.query")}
					placeholder={t("knowledge.query")}
					value={query}
					onChange={(e) => setQuery(e.currentTarget.value)}
				/>
				<div>
					<Button type="submit" size="sm" disabled={!snapshotId || !query}>
						{t("knowledge.searchSubmit")}
					</Button>
				</div>
			</form>
			<NoticeLine notice={notice} />
			{answer ? (
				<div
					className="flex flex-col gap-2 text-sm"
					data-testid="knowledge-results"
				>
					<p className="text-xs text-muted-foreground">
						{t("knowledge.generation")} {answer.indexGeneration}
						{answer.noAnswer ? ` · ${t("knowledge.noAnswer")}` : ""}
					</p>
					{answer.items.map((item) => (
						<div
							key={`${item.citation.ordinal}`}
							className="rounded border p-2"
						>
							<p className="whitespace-pre-wrap">{item.text}</p>
							<p className="font-mono text-xs text-muted-foreground">
								[{item.citation.ordinal}] {item.citation.sourceId}@
								{item.citation.sourceRevision} · {item.citation.locator}
							</p>
						</div>
					))}
				</div>
			) : null}
		</Card>
	);
}

function FactRow({
	fact,
	onChanged,
}: {
	readonly fact: MemoryFact;
	readonly onChanged: () => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const [notice, setNotice] = useState<Notice>(null);
	const decisions =
		fact.state === "proposed"
			? (["confirm", "reject"] as const)
			: fact.state === "confirmed"
				? (["revoke"] as const)
				: [];
	return (
		<li
			className="flex flex-col gap-1 border-b py-2"
			data-testid="memory-fact"
			data-state={fact.state}
		>
			<div className="flex flex-wrap items-center gap-2">
				<Badge>{fact.state}</Badge>
				<span className="text-xs text-muted-foreground">
					{fact.subjectType}:{fact.subjectId} · {t("knowledge.revision")}{" "}
					{fact.revision} · {fact.proposer}
				</span>
			</div>
			<p className="text-sm">{fact.content}</p>
			<div className="flex gap-2">
				{decisions.map((decision) => (
					<Button
						key={decision}
						type="button"
						size="sm"
						variant="outline"
						disabled={pending.has(decision)}
						onClick={async () => {
							const r = await run(
								decision,
								"POST",
								`memories/${encodeURIComponent(fact.factId)}/decisions`,
								{
									expectedRevision: fact.revision,
									decision,
								},
							);
							setNotice(describe(r, t("knowledge.decided")));
							onChanged();
						}}
					>
						{t(`knowledge.decision.${decision}`)}
					</Button>
				))}
			</div>
			<NoticeLine notice={notice} />
		</li>
	);
}

function Memories(): ReactElement {
	const t = useDemoT();
	const [subjectType, setSubjectType] = useState("project");
	const [subjectId, setSubjectId] = useState("");
	const [content, setContent] = useState("");
	const query = subjectId
		? `memories?subjectType=${encodeURIComponent(subjectType)}&subjectId=${encodeURIComponent(subjectId)}`
		: "memories";
	const facts = useAgentResource<MemoryPage>(query);
	const { run, pending } = useTrackedCommands();
	const [notice, setNotice] = useState<Notice>(null);
	return (
		<Card className="gap-3 p-4">
			<h2 className="text-lg font-semibold">{t("knowledge.memories")}</h2>
			<div className="flex flex-wrap gap-2">
				<Input
					className="max-w-40"
					aria-label={t("knowledge.subjectType")}
					value={subjectType}
					onChange={(e) => setSubjectType(e.currentTarget.value)}
				/>
				<Input
					className="max-w-60"
					aria-label={t("knowledge.subjectId")}
					placeholder={t("knowledge.subjectId")}
					value={subjectId}
					onChange={(e) => setSubjectId(e.currentTarget.value)}
				/>
			</div>
			<ErrorLine error={facts.error} />
			<ul>
				{facts.data?.facts.map((f) => (
					<FactRow
						key={f.factId}
						fact={f}
						onChanged={() => void facts.reload()}
					/>
				))}
			</ul>
			<Textarea
				aria-label={t("knowledge.propose")}
				placeholder={t("knowledge.propose")}
				value={content}
				onChange={(e) => setContent(e.currentTarget.value)}
			/>
			<div>
				<Button
					type="button"
					size="sm"
					disabled={!content.trim() || !subjectId || pending.has("propose")}
					onClick={async () => {
						const r = await run("propose", "POST", "memories", {
							subjectType,
							subjectId,
							content,
						});
						setNotice(describe(r, t("knowledge.proposed")));
						if (r.ok) setContent("");
						void facts.reload();
					}}
				>
					{t("knowledge.proposeSubmit")}
				</Button>
			</div>
			<NoticeLine notice={notice} />
		</Card>
	);
}

export function KnowledgeView({
	configured,
}: {
	readonly configured: boolean;
}): ReactElement {
	const t = useDemoT();
	const sources = useAgentResource<SourcePage>("knowledge/sources?limit=100");
	const [snapshotId, setSnapshotId] = useState("");
	return (
		<main
			className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10"
			data-testid="knowledge-view"
		>
			<div>
				<h1 className="text-2xl font-semibold">{t("knowledge.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("knowledge.lede")}</p>
			</div>
			{!configured ? (
				<Alert variant="destructive">
					<AlertTitle>{t("prepare.unavailable")}</AlertTitle>
				</Alert>
			) : null}
			<Card className="gap-3 p-4">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold">{t("knowledge.sources")}</h2>
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => void sources.reload()}
					>
						{t("operation.refresh")}
					</Button>
				</div>
				{sources.error ? (
					<Alert variant="destructive">
						<AlertTitle>{sources.error.error.code}</AlertTitle>
						<AlertDescription>{sources.error.error.message}</AlertDescription>
					</Alert>
				) : null}
				<ul>
					{sources.data?.sources.map((s) => (
						<SourceRow
							key={`${s.sourceId}/${s.aclRevision}/${s.currentRevision}`}
							source={s}
							onChanged={() => void sources.reload()}
						/>
					))}
				</ul>
				{sources.data && sources.data.sources.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						{t("knowledge.noSources")}
					</p>
				) : null}
				<h3 className="text-sm font-semibold">
					{t("knowledge.registerTitle")}
				</h3>
				<RegisterSource onChanged={() => void sources.reload()} />
				<h3 className="text-sm font-semibold">
					{t("knowledge.snapshotTitle")}
				</h3>
				<SnapshotForm
					sources={sources.data?.sources ?? []}
					onCreated={setSnapshotId}
				/>
			</Card>
			<Search snapshotId={snapshotId} onSnapshotId={setSnapshotId} />
			<Recall />
			<Memories />
		</main>
	);
}
