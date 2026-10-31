"use client";

import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Button } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { Checkbox } from "@anvilkit/ui/checkbox";
import { Input } from "@anvilkit/ui/input";
import { Label } from "@anvilkit/ui/label";
import { Textarea } from "@anvilkit/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";
import {
	type CatalogPage,
	type Descriptor,
	formatMoney,
	type Grant,
	type GrantPage,
	parseMoney,
	type RevocationProgress,
	revocationPhase,
	type ToolDeclaration,
} from "@/lib/agent/management";
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

function GrantForm({
	descriptor,
	onCreated,
}: {
	readonly descriptor: Descriptor;
	readonly onCreated: () => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const [methods, setMethods] = useState<ReadonlySet<string>>(() => new Set());
	const [subjectType, setSubjectType] = useState("project");
	const [subjectId, setSubjectId] = useState("");
	const [purpose, setPurpose] = useState("");
	const [cap, setCap] = useState("1");
	const [notice, setNotice] = useState<Notice>(null);
	const amount = parseMoney(cap);
	const ready =
		methods.size > 0 && subjectId && purpose.trim() && amount !== null;
	return (
		<div
			className="flex flex-col gap-2 rounded border p-2"
			data-testid="mcp-grant-form"
		>
			<p className="text-xs text-muted-foreground">{t("mcp.grantHint")}</p>
			<div className="flex flex-wrap gap-3">
				{descriptor.tools.map((tool) => (
					<div key={tool.method} className="flex items-center gap-1">
						<Checkbox
							id={`method-${descriptor.serverId}-${tool.method}`}
							checked={methods.has(tool.method)}
							onCheckedChange={(checked) =>
								setMethods((m) => {
									const next = new Set(m);
									if (checked === true) next.add(tool.method);
									else next.delete(tool.method);
									return next;
								})
							}
						/>
						<Label
							htmlFor={`method-${descriptor.serverId}-${tool.method}`}
							className="font-mono text-xs"
						>
							{tool.method}
						</Label>
					</div>
				))}
			</div>
			<div className="grid gap-2 sm:grid-cols-4">
				<Input
					aria-label={t("mcp.subjectType")}
					value={subjectType}
					onChange={(e) => setSubjectType(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("mcp.subjectId")}
					placeholder={t("mcp.subjectId")}
					value={subjectId}
					onChange={(e) => setSubjectId(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("mcp.purpose")}
					placeholder={t("mcp.purpose")}
					value={purpose}
					onChange={(e) => setPurpose(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("mcp.costCap")}
					value={cap}
					onChange={(e) => setCap(e.currentTarget.value)}
				/>
			</div>
			<div>
				<Button
					type="button"
					size="sm"
					disabled={!ready || pending.has("grant")}
					onClick={async () => {
						if (amount === null) return;
						const r = await run("grant", "POST", "mcp/grants", {
							subjectType,
							subjectId,
							serverId: descriptor.serverId,
							descriptorRevision: descriptor.revision,
							descriptorDigest: descriptor.descriptorDigest,
							methods: [...methods].sort(),
							purpose,
							costCap: { currency: "USD", amount },
						});
						setNotice(describe(r, t("mcp.grantCreated")));
						onCreated();
					}}
				>
					{t("mcp.createGrant")}
				</Button>
			</div>
			<NoticeLine notice={notice} />
		</div>
	);
}

function DescriptorRow({
	descriptor,
	onChanged,
}: {
	readonly descriptor: Descriptor;
	readonly onChanged: () => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const [notice, setNotice] = useState<Notice>(null);
	const [granting, setGranting] = useState(false);
	const reviewable =
		descriptor.state === "discovered" || descriptor.state === "review_pending";
	const decisions = reviewable
		? (["approve", "reject"] as const)
		: descriptor.state === "approved"
			? (["disable"] as const)
			: [];
	return (
		<li
			className="flex flex-col gap-2 border-b py-3"
			data-testid="mcp-descriptor"
			data-state={descriptor.state}
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-sm">{descriptor.serverId}</span>
				<Badge>{descriptor.state}</Badge>
				<span className="text-xs text-muted-foreground">
					{t("mcp.revision")} {descriptor.revision} · {descriptor.transport} ·{" "}
					{descriptor.protocolVersion}
				</span>
			</div>
			<p className="break-all text-xs text-muted-foreground">
				{descriptor.canonicalResource}
			</p>
			<p className="break-all font-mono text-xs text-muted-foreground">
				{descriptor.descriptorDigest}
			</p>
			<p className="font-mono text-xs">
				{descriptor.tools.map((tool) => tool.method).join(", ")}
			</p>
			<div className="flex flex-wrap gap-2">
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
								`mcp/catalog/${encodeURIComponent(descriptor.serverId)}/reviews`,
								{
									revision: descriptor.revision,
									descriptorDigest: descriptor.descriptorDigest,
									decision,
								},
							);
							setNotice(describe(r, t("mcp.reviewed")));
							onChanged();
						}}
					>
						{t(`mcp.decision.${decision}`)}
					</Button>
				))}
				{descriptor.state === "approved" ? (
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => setGranting((g) => !g)}
					>
						{t("mcp.createGrant")}
					</Button>
				) : null}
			</div>
			<NoticeLine notice={notice} />
			{granting ? (
				<GrantForm descriptor={descriptor} onCreated={onChanged} />
			) : null}
		</li>
	);
}

function Discover({
	onChanged,
}: {
	readonly onChanged: () => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const [resource, setResource] = useState("");
	const [protocol, setProtocol] = useState("2025-06-18");
	const [provenance, setProvenance] = useState("");
	const [dataClass, setDataClass] = useState("internal");
	const [tools, setTools] = useState(
		'[{"method":"search_issues","sideEffecting":false,"unitPrice":{"currency":"USD","amount":"0"}}]',
	);
	const [notice, setNotice] = useState<Notice>(null);
	let parsed: ToolDeclaration[] | null = null;
	try {
		const value = JSON.parse(tools) as unknown;
		parsed =
			Array.isArray(value) && value.length > 0
				? (value as ToolDeclaration[])
				: null;
	} catch {
		parsed = null;
	}
	return (
		<div className="flex flex-col gap-2">
			<div className="grid gap-2 sm:grid-cols-2">
				<Input
					aria-label={t("mcp.resource")}
					placeholder={t("mcp.resource")}
					value={resource}
					onChange={(e) => setResource(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("mcp.protocol")}
					value={protocol}
					onChange={(e) => setProtocol(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("mcp.provenance")}
					placeholder={t("mcp.provenance")}
					value={provenance}
					onChange={(e) => setProvenance(e.currentTarget.value)}
				/>
				<Input
					aria-label={t("mcp.dataClass")}
					value={dataClass}
					onChange={(e) => setDataClass(e.currentTarget.value)}
				/>
			</div>
			<Textarea
				aria-label={t("mcp.tools")}
				value={tools}
				onChange={(e) => setTools(e.currentTarget.value)}
				className="font-mono text-xs"
			/>
			<div>
				<Button
					type="button"
					size="sm"
					disabled={
						!resource || !provenance || !parsed || pending.has("discover")
					}
					onClick={async () => {
						const r = await run("discover", "POST", "mcp/catalog/discoveries", {
							canonicalResource: resource,
							transport: "streamable-http",
							protocolVersion: protocol,
							provenance,
							dataClass,
							tools: parsed,
						});
						setNotice(describe(r, t("mcp.discovered")));
						onChanged();
					}}
				>
					{t("mcp.discover")}
				</Button>
			</div>
			<NoticeLine notice={notice} />
		</div>
	);
}

function RevocationView({
	grantId,
}: {
	readonly grantId: string;
}): ReactElement {
	const t = useDemoT();
	const progress = useAgentResource<RevocationProgress>(
		`mcp/grants/${encodeURIComponent(grantId)}/revocation`,
	);
	const p = progress.data;
	return (
		<div
			className="flex flex-wrap items-center gap-2 text-xs"
			data-testid="mcp-revocation"
		>
			{p ? (
				<>
					<Badge data-testid="mcp-revocation-phase">
						{t(`mcp.revocation.${revocationPhase(p)}`)}
					</Badge>
					<span>
						{t("mcp.admissionBlocked")}: {String(p.newAdmissionBlocked)} ·{" "}
						{t("mcp.sendersConverged")}: {String(p.sendersConverged)} ·{" "}
						{t("mcp.inFlight")} {p.inFlightCalls} · {t("mcp.unknown")}{" "}
						{p.unknownCalls} · {t("mcp.open")} {p.openCalls} · {p.controlState}
					</span>
				</>
			) : null}
			{progress.error ? (
				<span className="text-destructive">{progress.error.error.code}</span>
			) : null}
			<Button
				type="button"
				size="sm"
				variant="ghost"
				onClick={() => void progress.reload()}
			>
				{t("operation.refresh")}
			</Button>
		</div>
	);
}

function GrantRow({
	grant,
	onChanged,
}: {
	readonly grant: Grant;
	readonly onChanged: () => void;
}): ReactElement {
	const t = useDemoT();
	const { run, pending } = useTrackedCommands();
	const [notice, setNotice] = useState<Notice>(null);
	const revocable = grant.state === "active" || grant.state === "pending";
	return (
		<li
			className="flex flex-col gap-1 border-b py-2"
			data-testid="mcp-grant"
			data-state={grant.state}
		>
			<div className="flex flex-wrap items-center gap-2">
				<span className="font-mono text-sm">{grant.grantId}</span>
				<Badge>{grant.state}</Badge>
				<span className="text-xs text-muted-foreground">
					{grant.subjectType}:{grant.subjectId} · {grant.serverId}@
					{grant.descriptorRevision} · {formatMoney(grant.costCap)}
				</span>
			</div>
			<p className="font-mono text-xs">{grant.methods.join(", ")}</p>
			{revocable ? (
				<div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						disabled={pending.has("revoke")}
						onClick={async () => {
							const r = await run(
								"revoke",
								"POST",
								`mcp/grants/${encodeURIComponent(grant.grantId)}/revocations`,
								{
									expectedRevision: grant.revision,
								},
							);
							setNotice(describe(r, t("mcp.revokeAccepted")));
							onChanged();
						}}
					>
						{t("mcp.revoke")}
					</Button>
				</div>
			) : (
				<RevocationView grantId={grant.grantId} />
			)}
			<NoticeLine notice={notice} />
		</li>
	);
}

export function McpView({
	configured,
}: {
	readonly configured: boolean;
}): ReactElement {
	const t = useDemoT();
	const catalog = useAgentResource<CatalogPage>("mcp/catalog");
	const grants = useAgentResource<GrantPage>("mcp/grants");
	const reload = () => {
		void catalog.reload();
		void grants.reload();
	};
	return (
		<main
			className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-10"
			data-testid="mcp-view"
		>
			<div>
				<h1 className="text-2xl font-semibold">{t("mcp.title")}</h1>
				<p className="text-sm text-muted-foreground">{t("mcp.lede")}</p>
			</div>
			{!configured ? (
				<Alert variant="destructive">
					<AlertTitle>{t("prepare.unavailable")}</AlertTitle>
				</Alert>
			) : null}
			<Card className="gap-3 p-4">
				<div className="flex items-center gap-2">
					<h2 className="text-lg font-semibold">{t("mcp.catalog")}</h2>
					<Button type="button" size="sm" variant="ghost" onClick={reload}>
						{t("operation.refresh")}
					</Button>
				</div>
				{catalog.error ? (
					<Alert variant="destructive">
						<AlertTitle>{catalog.error.error.code}</AlertTitle>
						<AlertDescription>{catalog.error.error.message}</AlertDescription>
					</Alert>
				) : null}
				<ul>
					{catalog.data?.descriptors.map((d) => (
						<DescriptorRow
							key={`${d.serverId}/${d.revision}/${d.state}`}
							descriptor={d}
							onChanged={reload}
						/>
					))}
				</ul>
				<h3 className="text-sm font-semibold">{t("mcp.discoverTitle")}</h3>
				<Discover onChanged={reload} />
			</Card>
			<Card className="gap-3 p-4">
				<h2 className="text-lg font-semibold">{t("mcp.grants")}</h2>
				{grants.error ? (
					<p className="font-mono text-xs text-destructive">
						{grants.error.error.code}
					</p>
				) : null}
				<ul>
					{grants.data?.grants.map((g) => (
						<GrantRow
							key={`${g.grantId}/${g.revision}`}
							grant={g}
							onChanged={reload}
						/>
					))}
				</ul>
				{grants.data && grants.data.grants.length === 0 ? (
					<p className="text-sm text-muted-foreground">{t("mcp.noGrants")}</p>
				) : null}
			</Card>
		</main>
	);
}
