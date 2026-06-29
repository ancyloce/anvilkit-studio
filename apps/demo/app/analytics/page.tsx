"use client";

// Per-component subpaths (not the barrel) so the dashboard pulls only these
// primitives instead of the entire @anvilkit/ui graph (carousel/marquee/…).
import { Button } from "@anvilkit/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import { Label } from "@anvilkit/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@anvilkit/ui/select";
import {
	type FormEvent,
	type ReactElement,
	useCallback,
	useState,
} from "react";

/**
 * Minimal PUBLISHED-page analytics dashboard for the demo. Reads the
 * `/api/analytics/stats` endpoint for a chosen slug + range and renders the
 * page-level metrics (views, unique visitors, sessions, top referrers, views by
 * day). It is read-only and does not require auth — published analytics is
 * anonymous. Built from `@anvilkit/ui` primitives only.
 */

interface StatsData {
	pageId?: string;
	slug?: string;
	range: string;
	views: number;
	uniqueVisitors: number;
	sessions: number;
	topReferrers: Array<{ referrer: string; count: number }>;
	viewsByDay: Array<{ date: string; views: number }>;
}

type StatsResponse =
	| { ok: true; data: StatsData }
	| { ok: false; message: string };

const RANGES = ["24h", "7d", "30d", "90d", "all"] as const;

function Metric({
	label,
	value,
}: {
	label: string;
	value: number;
}): ReactElement {
	return (
		<Card>
			<CardHeader>
				<CardDescription>{label}</CardDescription>
				<CardTitle className="text-3xl tabular-nums">{value}</CardTitle>
			</CardHeader>
		</Card>
	);
}

export default function AnalyticsDashboardPage(): ReactElement {
	const [slug, setSlug] = useState("");
	const [range, setRange] = useState<string>("7d");
	const [stats, setStats] = useState<StatsData | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(false);

	const load = useCallback(
		async (event?: FormEvent): Promise<void> => {
			event?.preventDefault();
			setLoading(true);
			setError(null);
			try {
				const params = new URLSearchParams({ range });
				if (slug.trim().length > 0) params.set("slug", slug.trim());
				const res = await fetch(`/api/analytics/stats?${params.toString()}`);
				const body = (await res.json()) as StatsResponse;
				if (body.ok) setStats(body.data);
				else setError(body.message);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Failed to load stats.");
			} finally {
				setLoading(false);
			}
		},
		[range, slug],
	);

	const maxDayViews = Math.max(
		1,
		...(stats?.viewsByDay ?? []).map((d) => d.views),
	);

	return (
		<main className="mx-auto max-w-3xl space-y-6 p-6">
			<header className="space-y-1">
				<h1 className="font-semibold text-2xl">Published page analytics</h1>
				<p className="text-muted-foreground text-sm">
					Aggregated page views for published pages. Leave the slug blank for
					site-wide totals. Preview and editor traffic are excluded.
				</p>
			</header>

			<form onSubmit={load} className="flex flex-wrap items-end gap-3">
				<div className="grid gap-1.5">
					<Label htmlFor="analytics-slug">Slug</Label>
					<Input
						id="analytics-slug"
						placeholder="e.g. about (blank = all pages)"
						value={slug}
						onChange={(e) => setSlug(e.target.value)}
						className="w-64"
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="analytics-range">Range</Label>
					<Select
						value={range}
						onValueChange={(value) => setRange(value ?? "7d")}
					>
						<SelectTrigger id="analytics-range" className="w-32">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{RANGES.map((r) => (
								<SelectItem key={r} value={r}>
									{r}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<Button type="submit" disabled={loading}>
					{loading ? "Loading…" : "Load stats"}
				</Button>
			</form>

			{error !== null && (
				<p className="text-destructive text-sm" role="alert">
					{error}
				</p>
			)}

			{stats !== null && (
				<section className="space-y-6" aria-label="Statistics">
					<div className="grid grid-cols-3 gap-4">
						<Metric label="Views" value={stats.views} />
						<Metric label="Unique visitors" value={stats.uniqueVisitors} />
						<Metric label="Sessions" value={stats.sessions} />
					</div>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Top referrers</CardTitle>
						</CardHeader>
						<CardContent>
							{stats.topReferrers.length === 0 ? (
								<p className="text-muted-foreground text-sm">
									No referrers yet.
								</p>
							) : (
								<ul className="space-y-1 text-sm">
									{stats.topReferrers.map((r) => (
										<li key={r.referrer} className="flex justify-between gap-4">
											<span className="truncate">{r.referrer}</span>
											<span className="tabular-nums text-muted-foreground">
												{r.count}
											</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Views by day</CardTitle>
						</CardHeader>
						<CardContent>
							{stats.viewsByDay.length === 0 ? (
								<p className="text-muted-foreground text-sm">No views yet.</p>
							) : (
								<ul className="space-y-1.5 text-sm">
									{stats.viewsByDay.map((d) => (
										<li key={d.date} className="flex items-center gap-3">
											<span className="w-24 shrink-0 tabular-nums text-muted-foreground">
												{d.date}
											</span>
											<span
												className="inline-block h-3 rounded bg-primary"
												style={{
													width: `${Math.round((d.views / maxDayViews) * 100)}%`,
												}}
											/>
											<span className="tabular-nums">{d.views}</span>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>
				</section>
			)}
		</main>
	);
}
