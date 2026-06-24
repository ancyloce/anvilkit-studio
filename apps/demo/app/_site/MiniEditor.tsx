"use client";

import { Button, buttonVariants } from "@anvilkit/ui/button";
import { Card } from "@anvilkit/ui/card";
import { Input } from "@anvilkit/ui/input";
import { cn } from "@anvilkit/ui/lib/utils";
import { Textarea } from "@anvilkit/ui/textarea";
import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./marketing.module.css";

type Accent = "iris" | "ember";
type Align = "left" | "center";

const ACCENTS: Record<Accent, string> = {
	iris: "var(--huly-electric-iris)",
	ember: "var(--huly-ember-pulse)",
};

/**
 * A compact, self-contained demonstration of the editor's core loop: edit a
 * component's serializable props and see the render update instantly. The
 * controls are `@anvilkit/ui` primitives (Card / Input / Textarea / Button) so
 * the panel is theme-aware, and the generated snippet is real, runnable usage —
 * the same contract `<Studio>` drives at `/puck/editor`.
 */
export function MiniEditor() {
	const [eyebrow, setEyebrow] = useState("Puck-native");
	const [headline, setHeadline] = useState("Compose pages from real packages.");
	const [body, setBody] = useState(
		"Every block is an independently published @anvilkit/* package. Edit its props here — the preview re-renders live.",
	);
	const [ctaLabel, setCtaLabel] = useState("Get started");
	const [accent, setAccent] = useState<Accent>("iris");
	const [align, setAlign] = useState<Align>("center");

	const snippet = useMemo(() => {
		const esc = (value: string) => value.replace(/"/g, '\\"');
		return [
			'import { Hero } from "@anvilkit/hero";',
			"",
			"export function LandingHero() {",
			"  return (",
			"    <Hero",
			`      eyebrow="${esc(eyebrow)}"`,
			`      headline="${esc(headline)}"`,
			`      description="${esc(body)}"`,
			`      cta={{ label: "${esc(ctaLabel)}", variant: "${accent}" }}`,
			`      align="${align}"`,
			"    />",
			"  );",
			"}",
		].join("\n");
	}, [eyebrow, headline, body, ctaLabel, accent, align]);

	const accentColor = ACCENTS[accent];

	return (
		<div className={styles.miniEditor}>
			<Card className="gap-[1.125rem] p-6">
				<div className={styles.field}>
					<label className={styles.label} htmlFor="mini-eyebrow">
						Eyebrow
					</label>
					<Input
						id="mini-eyebrow"
						value={eyebrow}
						onChange={(event) => setEyebrow(event.currentTarget.value)}
					/>
				</div>

				<div className={styles.field}>
					<label className={styles.label} htmlFor="mini-headline">
						Headline
					</label>
					<Input
						id="mini-headline"
						value={headline}
						onChange={(event) => setHeadline(event.currentTarget.value)}
					/>
				</div>

				<div className={styles.field}>
					<label className={styles.label} htmlFor="mini-body">
						Description
					</label>
					<Textarea
						id="mini-body"
						value={body}
						onChange={(event) => setBody(event.currentTarget.value)}
					/>
				</div>

				<div className={styles.field}>
					<label className={styles.label} htmlFor="mini-cta">
						CTA label
					</label>
					<Input
						id="mini-cta"
						value={ctaLabel}
						onChange={(event) => setCtaLabel(event.currentTarget.value)}
					/>
				</div>

				<div className={styles.field}>
					<span className={styles.label}>Accent</span>
					<div className={styles.swatchRow}>
						{(Object.keys(ACCENTS) as Accent[]).map((key) => (
							<Button
								key={key}
								type="button"
								variant="outline"
								size="icon"
								aria-label={`${key} accent`}
								aria-pressed={accent === key}
								className={cn(
									"size-8 rounded-full border-2 p-0",
									accent === key ? "border-foreground" : "border-transparent",
								)}
								style={{ background: ACCENTS[key] }}
								onClick={() => setAccent(key)}
							/>
						))}
					</div>
				</div>

				<div className={styles.field}>
					<span className={styles.label}>Alignment</span>
					<div className="inline-flex gap-1 rounded-full border border-border p-1">
						{(["left", "center"] as Align[]).map((value) => (
							<Button
								key={value}
								type="button"
								size="sm"
								variant={align === value ? "default" : "ghost"}
								aria-pressed={align === value}
								className="rounded-full px-4"
								onClick={() => setAlign(value)}
							>
								{value === "left" ? "Left" : "Center"}
							</Button>
						))}
					</div>
				</div>
			</Card>

			<div className={styles.miniPreviewWrap}>
				<div className={styles.miniPreview}>
					<span
						className={styles.previewGlow}
						style={{
							background: `radial-gradient(circle, ${
								accent === "iris"
									? "rgba(86,131,218,0.55)"
									: "rgba(255,137,100,0.5)"
							} 0%, transparent 70%)`,
						}}
					/>
					<div
						className={`${styles.previewBlock} ${
							align === "center"
								? styles.previewAligncenter
								: styles.previewAlignleft
						}`}
					>
						{eyebrow ? (
							<p
								className={styles.previewEyebrow}
								style={{ color: accentColor }}
							>
								{eyebrow}
							</p>
						) : null}
						<h3 className={styles.previewHeadline}>
							{headline || "Your headline"}
						</h3>
						{body ? <p className={styles.previewBody}>{body}</p> : null}
						{ctaLabel ? (
							<span
								className={styles.previewCta}
								style={{ background: accentColor }}
							>
								{ctaLabel}
							</span>
						) : null}
					</div>
				</div>

				<pre className={styles.codeBlock}>
					<code>{snippet}</code>
				</pre>

				<div className={styles.heroActions}>
					<Link className={buttonVariants()} href="/puck/editor">
						Open the full editor →
					</Link>
					<Link
						className={buttonVariants({ variant: "outline" })}
						href="/editor"
					>
						Explore all capabilities
					</Link>
				</div>
			</div>
		</div>
	);
}
