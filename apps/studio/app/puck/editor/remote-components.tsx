"use client";

/**
 * Session wiring of the StudioBridge loader for the editor (P20).
 *
 * `useSessionConfig` builds the session-local Puck Config of the open page
 * from its component lock: exact releases for the locked types (reserved
 * before the built-ins), safe placeholders for anything unavailable or
 * unlocked. It is keyed on the page, the lock and the set of node types —
 * not on the document object — so a root-prop edit that leaves the lock
 * alone never rebuilds the Config (which would re-seed Puck).
 *
 * `RemoteComponentsPanel` shows what the session resolved (remote types,
 * placeholders, collisions) and offers the DEVELOPMENT_ONLY catalog: adding a
 * release pins its exact identity in the page's lock; nothing is ever
 * resolved to "latest", and a type already locked to another release is
 * refused.
 */
import { Alert, AlertDescription, AlertTitle } from "@anvilkit/ui/alert";
import { Badge } from "@anvilkit/ui/badge";
import { Button } from "@anvilkit/ui/button";
import type { Config } from "@puckeditor/core";
import type { ReactElement } from "react";
import { createElement, useEffect, useMemo, useState } from "react";
import { loadRelease } from "@/lib/host-abi/load-release";
import {
	describeLockEntryViolation,
	type RemoteComponentLockEntry,
	readRemoteComponentLock,
} from "@/lib/host-abi/remote-component-lock";
import {
	buildSessionConfig,
	collectTypes,
	type PlaceholderRender,
	type SessionConfig,
} from "@/lib/host-abi/remote-loader";
import { useDemoT } from "@/lib/i18n/client";

const renderPlaceholder: PlaceholderRender = ({ puckType, reason }) =>
	createElement(
		"div",
		{
			"data-anvilkit-placeholder": puckType,
			role: "note",
			style: {
				border: "1px dashed currentColor",
				padding: "12px",
				opacity: 0.7,
				fontFamily: "monospace",
				fontSize: "12px",
			},
		},
		`${puckType}: ${
			reason.kind === "unavailable"
				? `release ${reason.entry.releaseId} is unavailable (${reason.detail})`
				: reason.detail
		}. The node and its props are kept unchanged.`,
	);

export function useSessionConfig(
	base: Config,
	data: unknown,
	pageKey: string,
	enabled: boolean,
): SessionConfig | null {
	const lock = readRemoteComponentLock(data);
	const lockKey = JSON.stringify(
		lock.state === "absent"
			? null
			: lock.state === "valid"
				? lock.lock
				: lock.raw,
	);
	const typesKey = [...collectTypes(data)].sort().join(",");
	const key = `${pageKey}\n${lockKey}\n${typesKey}`;
	const [session, setSession] = useState<{
		key: string;
		base: Config;
		value: SessionConfig;
	} | null>(null);

	// Without locked releases to load the Config is decided synchronously, so
	// a page without remote components mounts exactly as before.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on lock and node types, see above
	const immediate = useMemo(() => {
		if (!enabled || (lock.state === "valid" && lock.lock.entries.length > 0))
			return null;
		return buildSessionConfig(base, lock, [], data, renderPlaceholder);
	}, [key, base, enabled]);

	// The inputs are read through the key; the document object itself is not a dependency.
	// biome-ignore lint/correctness/useExhaustiveDependencies: keyed on lock and node types, see above
	useEffect(() => {
		const read = readRemoteComponentLock(data);
		const entries = read.state === "valid" ? read.lock.entries : [];
		if (!enabled || entries.length === 0) return;
		let live = true;
		void Promise.all(entries.map((e) => loadRelease(e))).then((outcomes) => {
			if (!live) return;
			setSession({
				key,
				base,
				value: buildSessionConfig(
					base,
					read,
					outcomes,
					data,
					renderPlaceholder,
				),
			});
		});
		return () => {
			live = false;
		};
	}, [key, base, enabled]);

	if (immediate) return immediate;
	return session && session.key === key && session.base === base
		? session.value
		: null;
}

interface CatalogRelease extends RemoteComponentLockEntry {
	readonly label?: string;
}

function parseCatalog(body: unknown): CatalogRelease[] {
	if (typeof body !== "object" || body === null) return [];
	const releases = (body as { releases?: unknown }).releases;
	if (!Array.isArray(releases)) return [];
	return releases.flatMap((r) => {
		if (typeof r !== "object" || r === null) return [];
		const { label, ...entry } = r as Record<string, unknown>;
		if (describeLockEntryViolation(entry) !== null) return [];
		return [
			{
				...(entry as unknown as RemoteComponentLockEntry),
				...(typeof label === "string" ? { label } : {}),
			},
		];
	});
}

export function RemoteComponentsPanel({
	session,
	onAdd,
	notice,
}: {
	readonly session: SessionConfig | null;
	readonly onAdd: (entry: RemoteComponentLockEntry) => void;
	readonly notice: string | null;
}): ReactElement | null {
	const t = useDemoT();
	const [catalog, setCatalog] = useState<CatalogRelease[] | null>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		if (!open || catalog !== null) return;
		void fetch("/api/host/releases/catalog", { cache: "no-store" })
			.then(async (r) => (r.ok ? parseCatalog(await r.json()) : []))
			.catch(() => [])
			.then(setCatalog);
	}, [open, catalog]);

	const locked = useMemo(() => new Set(session?.remote ?? []), [session]);
	if (!session) return null;
	const hasState =
		session.remote.length > 0 ||
		session.placeholders.length > 0 ||
		session.collisions.length > 0;

	return (
		<div
			className="mx-4 mt-2 flex flex-col gap-2 text-xs"
			data-testid="remote-components"
		>
			<div className="flex flex-wrap items-center gap-2">
				{session.remote.map((type) => (
					<Badge
						key={type}
						data-testid="remote-component-loaded"
						data-type={type}
					>
						{type}
					</Badge>
				))}
				{session.placeholders.map((p) => (
					<Badge
						key={p.puckType}
						variant="outline"
						data-testid="remote-component-placeholder"
						data-type={p.puckType}
					>
						{`${p.puckType} · ${t("remote.placeholder")}`}
					</Badge>
				))}
				{session.collisions.map((type) => (
					<Badge
						key={type}
						variant="secondary"
						data-testid="remote-component-collision"
						data-type={type}
					>
						{`${type} · ${t("remote.collision")}`}
					</Badge>
				))}
				<Button
					type="button"
					size="sm"
					variant="ghost"
					onClick={() => setOpen((o) => !o)}
					data-testid="remote-catalog-toggle"
				>
					{t("remote.catalog")}
				</Button>
				{!hasState ? (
					<span className="text-muted-foreground">{t("remote.none")}</span>
				) : null}
			</div>
			{notice ? (
				<Alert variant="destructive" data-testid="remote-component-notice">
					<AlertTitle>{t("remote.refused")}</AlertTitle>
					<AlertDescription>{notice}</AlertDescription>
				</Alert>
			) : null}
			{open ? (
				<div
					className="flex flex-col gap-1 rounded border p-2"
					data-testid="remote-catalog"
				>
					<p className="text-muted-foreground">{t("remote.catalogHint")}</p>
					{catalog === null ? <p>{t("remote.loading")}</p> : null}
					{catalog?.length === 0 ? <p>{t("remote.empty")}</p> : null}
					{catalog?.map((release) => (
						<div
							key={`${release.puckType}/${release.releaseId}`}
							className="flex items-center gap-2"
						>
							<span className="font-mono">
								{release.puckType} · {release.packageName}@
								{release.packageVersion} · {release.releaseId}
							</span>
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={locked.has(release.puckType)}
								data-testid="remote-catalog-add"
								data-type={release.puckType}
								onClick={() => {
									const { label: _label, ...entry } = release;
									onAdd(entry);
								}}
							>
								{t("remote.add")}
							</Button>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
